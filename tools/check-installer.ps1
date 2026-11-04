# YOUKAI 1.0 | 作者：二百七 | Copyright (c) 2026 二百七 | SPDX-License-Identifier: MIT
$ErrorActionPreference='Stop'
. "$PSScriptRoot\..\installers\windows\clean-install.ps1" -LibraryOnly
$fixtureBase = [IO.Path]::GetFullPath((Join-Path $PSScriptRoot ('..\项目资料\验证记录\1.0\installer-' + [guid]::NewGuid().ToString('N'))))
$workspace = [IO.Path]::GetFullPath((Join-Path $PSScriptRoot '..')).TrimEnd('\')
if (!$fixtureBase.StartsWith($workspace + '\', [StringComparison]::OrdinalIgnoreCase)) { throw '测试目录越界。' }
New-Item -ItemType Directory -Path $fixtureBase -Force | Out-Null
$script:checks=0
function Assert-Installer($condition,[string]$name) { if(!$condition){throw ('FAIL installer: '+$name)}; $script:checks++; Write-Output ('PASS installer: '+$name) }
function New-TestExtension([string]$root,[string]$name,[string]$id='com.youkai.extension') {
    $target=Join-Path $root $name
    New-Item -ItemType Directory -Path (Join-Path $target 'CSXS') -Force | Out-Null
    [IO.File]::WriteAllText((Join-Path $target 'CSXS\manifest.xml'),('<ExtensionManifest ExtensionBundleId="'+$id+'" />'))
    [IO.File]::WriteAllText((Join-Path $target 'custom.jsx'),'user-custom-script')
    return $target
}
$roots=@((Join-Path $fixtureBase 'user\Adobe\CEP\extensions'),(Join-Path $fixtureBase 'public32\Adobe\CEP\extensions'),(Join-Path $fixtureBase 'public64\Adobe\CEP\extensions'))
$backups=Join-Path $fixtureBase 'backups'
$old=@((New-TestExtension $roots[0] 'com.youkai.toolbox'),(New-TestExtension $roots[1] 'legacy-name'),(New-TestExtension $roots[2] 'com.youkai.extension'))
$other=New-TestExtension $roots[0] 'other-plugin' 'com.other.vendor'
$external=Join-Path $fixtureBase 'csv'
New-Item -ItemType Directory -Path $external | Out-Null
[IO.File]::WriteAllText((Join-Path $external '色板方案切换.csv'),'user-config')
$result=Invoke-YoukaiCleanInstall -ExtensionRoots $roots -BackupDirectory $backups -CheckHosts $false
Assert-Installer ($result.removed -eq 3) 'removes verified user/public and renamed legacy copies'
Assert-Installer (@($old | Where-Object {Test-Path -LiteralPath $_}).Count -eq 0) 'old program directories are removed'
Assert-Installer (Test-Path -LiteralPath $other) 'unrelated extension remains'
Assert-Installer ((Get-Content -LiteralPath (Join-Path $external '色板方案切换.csv') -Raw) -eq 'user-config') 'external CSV remains'
Assert-Installer ((Get-Content -LiteralPath (Join-Path $result.backup 'extension-1\custom.jsx') -Raw) -eq 'user-custom-script') 'custom scripts are backed up before removal'
Assert-Installer (Test-Path -LiteralPath (Join-Path $result.backup 'BACKUP_MANIFEST.json')) 'SHA256 backup manifest exists'
$second=Invoke-YoukaiCleanInstall -ExtensionRoots $roots -BackupDirectory $backups -CheckHosts $false
Assert-Installer ($second.removed -eq 0) 'clean first install is supported'
$wrongRoot=Join-Path $fixtureBase 'wrong\Adobe\CEP\extensions'
$wrong=New-TestExtension $wrongRoot 'com.youkai.toolbox' 'com.other.vendor'
$failed=$false
try{Invoke-YoukaiCleanInstall -ExtensionRoots @($wrongRoot) -BackupDirectory $backups -CheckHosts $false | Out-Null}catch{$failed=$true}
Assert-Installer ($failed -and (Test-Path -LiteralPath $wrong)) 'unrecognized target is not deleted'
$lockedRoot=Join-Path $fixtureBase 'locked\Adobe\CEP\extensions'
$locked=New-TestExtension $lockedRoot 'com.youkai.toolbox'
$lock=[IO.File]::Open((Join-Path $locked 'custom.jsx'),[IO.FileMode]::Open,[IO.FileAccess]::ReadWrite,[IO.FileShare]::None)
try{
    $failed=$false
    try{Invoke-YoukaiCleanInstall -ExtensionRoots @($lockedRoot) -BackupDirectory $backups -CheckHosts $false | Out-Null}catch{$failed=$true}
    Assert-Installer ($failed -and (Test-Path -LiteralPath $locked)) 'locked files prevent deletion'
}finally{$lock.Dispose()}
$linkRoot=Join-Path $fixtureBase 'linked\Adobe\CEP\extensions'
$linked=New-TestExtension $linkRoot 'com.youkai.toolbox'
New-Item -ItemType Junction -Path (Join-Path $linked 'external-link') -Target $external | Out-Null
$failed=$false
try{Invoke-YoukaiCleanInstall -ExtensionRoots @($linkRoot) -BackupDirectory $backups -CheckHosts $false | Out-Null}catch{$failed=$true}
Assert-Installer ($failed -and (Test-Path -LiteralPath $linked) -and (Test-Path -LiteralPath $external)) 'junction traversal is rejected'
$failed=$false
try{Invoke-YoukaiCleanInstall -ExtensionRoots @($fixtureBase) -BackupDirectory $backups -CheckHosts $false | Out-Null}catch{$failed=$true}
Assert-Installer $failed 'arbitrary cleanup roots are rejected'
$failed=$false
try{Invoke-YoukaiCleanInstall -ExtensionRoots @($roots[0]) -BackupDirectory (Join-Path $roots[0] 'backup') -CheckHosts $false | Out-Null}catch{$failed=$true}
Assert-Installer $failed 'backup cannot live inside CEP extensions'
Write-Output ("$script:checks installer checks passed; only isolated workspace fixtures were modified.")
