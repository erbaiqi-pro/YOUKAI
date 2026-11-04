# YOUKAI 1.0 | 作者：二百七 | Copyright (c) 2026 二百七 | SPDX-License-Identifier: MIT
[CmdletBinding()]
param(
    [string]$UserExtensionsRoot,
    [string]$CommonExtensionsRoot32,
    [string]$CommonExtensionsRoot64,
    [string]$BackupRoot,
    [string]$ResultPath,
    [string]$Language = 'chinesesimplified',
    [switch]$LibraryOnly
)

Set-StrictMode -Version 2
$ErrorActionPreference = 'Stop'

function Get-YoukaiCleanupError([string]$Message) {
    if ($Language -ne 'english') { return $Message }
    # 只翻译展示文字，不改变备份、校验及删除的判断。
    $translations = [ordered]@{
        '路径为空，已停止清理。' = 'The path is empty. Cleanup has stopped.'
        '路径含链接或联接点，未作清理：' = 'A path contains a link or junction and was not cleaned: '
        '旧目录含链接，未作清理：' = 'The previous installation contains a link and was not cleaned: '
        '请先保存工作并完全退出 Illustrator、Photoshop、InDesign，再安装。安装程序不会强制关闭软件。' = 'Save your work and fully exit Illustrator, Photoshop and InDesign, then retry. Setup will not force these applications to close.'
        '不是允许的 CEP 扩展目录：' = 'Not an allowed CEP extensions folder: '
        '备份目录不能放在扩展目录中。' = 'The backup folder cannot be inside a CEP extensions folder.'
        '旧版安装是链接目录，请先人工确认：' = 'The previous installation is a linked folder. Check it manually first: '
        '安装目录缺少可识别的 YOUKAI 清单，未删除：' = 'No recognized YOUKAI manifest was found. The folder was not removed: '
        '旧版目录超出允许范围。' = 'The previous installation is outside the allowed cleanup folders.'
        '旧版备份校验未通过，未删除旧版。' = 'Backup verification failed. The previous installation was not removed.'
        '旧目录身份发生变化，已停止。' = 'The previous installation manifest changed. Cleanup has stopped.'
        '旧目录在备份后发生变化，已停止。' = 'The previous installation changed after backup. Cleanup has stopped.'
        '删除路径不在允许的扩展目录中。' = 'The removal path is outside the allowed CEP extensions folders.'
    }
    foreach ($prefix in $translations.Keys) {
        if ($Message.StartsWith($prefix, [StringComparison]::Ordinal)) { return $translations[$prefix] + $Message.Substring($prefix.Length) }
    }
    return $Message
}

function Get-YoukaiFullPath([string]$Path) {
    if ([string]::IsNullOrWhiteSpace($Path)) { throw '路径为空，已停止清理。' }
    return [IO.Path]::GetFullPath($Path).TrimEnd('\')
}

function Assert-YoukaiPlainPath([string]$Path) {
    $current = Get-YoukaiFullPath $Path
    while ($current) {
        if (Test-Path -LiteralPath $current) {
            $entry = Get-Item -LiteralPath $current -Force
            if (($entry.Attributes -band [IO.FileAttributes]::ReparsePoint) -ne 0) {
                throw ('路径含链接或联接点，未作清理：' + $current)
            }
        }
        $parent = Split-Path -LiteralPath $current
        if ($parent -eq $current) { break }
        $current = $parent
    }
}

function Get-YoukaiInventory([string]$Directory) {
    $root = Get-YoukaiFullPath $Directory
    Assert-YoukaiPlainPath $root
    $records = @()
    $pending = New-Object 'System.Collections.Generic.Stack[string]'
    $pending.Push($root)
    while ($pending.Count -gt 0) {
        $folder = $pending.Pop()
        foreach ($entry in @(Get-ChildItem -LiteralPath $folder -Force)) {
            if (($entry.Attributes -band [IO.FileAttributes]::ReparsePoint) -ne 0) { throw ('旧目录含链接，未作清理：' + $entry.FullName) }
            if ($entry.PSIsContainer) { $pending.Push($entry.FullName) }
            else {
                $records += [pscustomobject]@{
                    path = $entry.FullName.Substring($root.Length + 1)
                    sha256 = (Get-FileHash -LiteralPath $entry.FullName -Algorithm SHA256).Hash
                }
            }
        }
    }
    return @($records | Sort-Object path)
}

function Test-YoukaiManifest([string]$Directory) {
    $manifest = Join-Path $Directory 'CSXS\manifest.xml'
    if (!(Test-Path -LiteralPath $manifest -PathType Leaf)) { return $false }
    Assert-YoukaiPlainPath $manifest
    $settings = New-Object System.Xml.XmlReaderSettings
    $settings.DtdProcessing = [System.Xml.DtdProcessing]::Prohibit
    $reader = [System.Xml.XmlReader]::Create($manifest, $settings)
    try {
        $xml = New-Object System.Xml.XmlDocument
        $xml.XmlResolver = $null
        $xml.Load($reader)
        return @('com.youkai.extension', 'com.youkai.toolbox') -contains $xml.DocumentElement.GetAttribute('ExtensionBundleId')
    } finally { $reader.Dispose() }
}

function Invoke-YoukaiCleanInstall {
    param([string[]]$ExtensionRoots, [string]$BackupDirectory, [bool]$CheckHosts = $true)
    if ($CheckHosts) {
        $hosts = @(Get-Process -Name Illustrator,Photoshop,InDesign -ErrorAction SilentlyContinue)
        if ($hosts.Count) { throw '请先保存工作并完全退出 Illustrator、Photoshop、InDesign，再安装。安装程序不会强制关闭软件。' }
    }
    $backupBase = Get-YoukaiFullPath $BackupDirectory
    Assert-YoukaiPlainPath $backupBase
    $roots = @($ExtensionRoots | Where-Object { ![string]::IsNullOrWhiteSpace($_) } | ForEach-Object { Get-YoukaiFullPath $_ } | Select-Object -Unique)
    $candidates = @()
    foreach ($root in $roots) {
        if ($root -notmatch '(?i)\\Adobe\\CEP\\extensions$') { throw ('不是允许的 CEP 扩展目录：' + $root) }
        Assert-YoukaiPlainPath $root
        if ($backupBase.StartsWith($root + '\', [StringComparison]::OrdinalIgnoreCase) -or $backupBase -eq $root) { throw '备份目录不能放在扩展目录中。' }
        if (!(Test-Path -LiteralPath $root -PathType Container)) { continue }
        foreach ($entry in @(Get-ChildItem -LiteralPath $root -Directory -Force)) {
            # 不识别、不删除其他插件。规范目录如果被其他内容占用，则停止安装。
            $knownName = @('com.youkai.toolbox','com.youkai.extension') -contains $entry.Name
            if (($entry.Attributes -band [IO.FileAttributes]::ReparsePoint) -ne 0) {
                if ($knownName) { throw ('旧版安装是链接目录，请先人工确认：' + $entry.FullName) }
                continue
            }
            $owned = Test-YoukaiManifest $entry.FullName
            if ($knownName -and !$owned) { throw ('安装目录缺少可识别的 YOUKAI 清单，未删除：' + $entry.FullName) }
            if (!$owned) { continue }
            $resolved = Get-YoukaiFullPath $entry.FullName
            if ((Split-Path -LiteralPath $resolved) -ne $root) { throw '旧版目录超出允许范围。' }
            $candidates += [pscustomobject]@{source=$resolved; inventory=@(Get-YoukaiInventory $resolved); backup=''}
        }
    }
    $session = Join-Path $backupBase ((Get-Date -Format 'yyyyMMdd-HHmmss-fff') + '-' + [guid]::NewGuid().ToString('N').Substring(0,8))
    if ($candidates.Count) {
        New-Item -ItemType Directory -Path $session -Force | Out-Null
        # 所有旧版完整备份并逐文件核对通过后，才允许删除任何一个旧目录。
        for ($i=0; $i -lt $candidates.Count; $i++) {
            $candidate = $candidates[$i]
            $candidate.backup = Join-Path $session ('extension-' + ($i+1))
            Copy-Item -LiteralPath $candidate.source -Destination $candidate.backup -Recurse -Force
            $copy = @(Get-YoukaiInventory $candidate.backup)
            if (($copy | ConvertTo-Json -Compress -Depth 5) -ne ($candidate.inventory | ConvertTo-Json -Compress -Depth 5)) { throw '旧版备份校验未通过，未删除旧版。' }
        }
        $candidates | ConvertTo-Json -Depth 8 | Set-Content -LiteralPath (Join-Path $session 'BACKUP_MANIFEST.json') -Encoding UTF8
        foreach ($candidate in $candidates) {
            Assert-YoukaiPlainPath $candidate.source
            if (!(Test-YoukaiManifest $candidate.source)) { throw '旧目录身份发生变化，已停止。' }
            $now = @(Get-YoukaiInventory $candidate.source)
            if (($now | ConvertTo-Json -Compress -Depth 5) -ne ($candidate.inventory | ConvertTo-Json -Compress -Depth 5)) { throw '旧目录在备份后发生变化，已停止。' }
            $parent = Get-YoukaiFullPath (Split-Path -LiteralPath $candidate.source)
            if ($roots -notcontains $parent) { throw '删除路径不在允许的扩展目录中。' }
            Remove-Item -LiteralPath $candidate.source -Recurse -Force
        }
    }
    return [pscustomobject]@{ok=$true; removed=$candidates.Count; backup=$(if($candidates.Count){$session}else{''}); note='外部 CSV 与项目文件未清理。旧目录内自定义脚本保留在备份中。'}
}

if (!$LibraryOnly) {
    try {
        $result = Invoke-YoukaiCleanInstall -ExtensionRoots @($UserExtensionsRoot,$CommonExtensionsRoot32,$CommonExtensionsRoot64) -BackupDirectory $BackupRoot
        $result | ConvertTo-Json -Depth 6 | Set-Content -LiteralPath $ResultPath -Encoding UTF8
        exit 0
    } catch {
        if ($ResultPath) { [IO.File]::WriteAllText($ResultPath, (Get-YoukaiCleanupError $_.Exception.Message), (New-Object Text.UTF8Encoding($true))) }
        exit 1
    }
}
