; YOUKAI 1.0 | 作者：二百七 | Copyright (c) 2026 二百七 | SPDX-License-Identifier: MIT
#ifndef YoukaiPayloadRoot
  #define YoukaiPayloadRoot "..\..\com.youkai.toolbox"
#endif
[Setup]
AppId=com.youkai.toolbox
AppName=YOUKAI
AppVersion=1.0.0
AppVerName=YOUKAI 1.0.0
AppPublisher=二百七
VersionInfoVersion=1.0.0.0
VersionInfoDescription=YOUKAI 1.0.0 安装程序
DefaultDirName={userappdata}\Adobe\CEP\extensions\com.youkai.toolbox
DisableDirPage=yes
DisableProgramGroupPage=yes
UsePreviousAppDir=no
PrivilegesRequired=lowest
OutputDir=..\..\项目资料\构建缓存
OutputBaseFilename=YOUKAI_1.0_Setup
SetupIconFile=icon.ico
ShowLanguageDialog=yes
Compression=lzma2
SolidCompression=yes
DirExistsWarning=no
CloseApplications=no
RestartApplications=no
UninstallDisplayName=YOUKAI 1.0.0
UninstallDisplayIcon={app}\assets\icon.ico
WizardStyle=modern

[Languages]
Name: "chinesesimplified"; MessagesFile: "ChineseSimplified.isl"; LicenseFile: "..\..\licenses\MIT-zh-CN.txt"; InfoBeforeFile: "INSTALL-NOTE.txt"
Name: "english"; MessagesFile: "compiler:Default.isl"; LicenseFile: "..\..\LICENSE.txt"; InfoBeforeFile: "INSTALL-NOTE.en.txt"

[CustomMessages]
chinesesimplified.CleanPreparing=正在备份并清理旧版 YOUKAI…
english.CleanPreparing=Backing up and removing previous YOUKAI installations...
chinesesimplified.CleanStartFailed=无法启动旧版备份程序，安装已停止。请允许管理员授权后重试。
english.CleanStartFailed=Could not start the backup tool. Setup has stopped. Allow the administrator permission request and try again.
chinesesimplified.CleanFailed=旧版清理未完成，安装已停止。请检查下方原因后重试。
english.CleanFailed=Cleanup could not be completed. Setup has stopped. Check the details below and try again.
chinesesimplified.InstallMarkerFailed=无法写入安装标记，面板设置可能保留旧值。
english.InstallMarkerFailed=Could not write the installation marker. The panel may retain previous settings.
chinesesimplified.InstallComplete=YOUKAI 1.0 已安装。%n重启 Illustrator，在“窗口 > 扩展”中打开 YOUKAI。%n旧版及自定义脚本备份位置：%1%n外部 CSV 会保留，旧版面板设置恢复默认。
english.InstallComplete=YOUKAI 1.0 is installed.%nRestart Illustrator and open YOUKAI from Window > Extensions.%nPrevious versions and custom scripts are backed up at: %1%nExternal CSV files are kept. Previous panel settings will be reset.

[Files]
Source: "clean-install.ps1"; Flags: dontcopy
Source: "{#YoukaiPayloadRoot}\*"; DestDir: "{app}"; Flags: ignoreversion recursesubdirs createallsubdirs

[Registry]
Root: HKCU; Subkey: "Software\Adobe\CSXS.5"; ValueType: string; ValueName: "PlayerDebugMode"; ValueData: "1"
Root: HKCU; Subkey: "Software\Adobe\CSXS.6"; ValueType: string; ValueName: "PlayerDebugMode"; ValueData: "1"
Root: HKCU; Subkey: "Software\Adobe\CSXS.7"; ValueType: string; ValueName: "PlayerDebugMode"; ValueData: "1"
Root: HKCU; Subkey: "Software\Adobe\CSXS.8"; ValueType: string; ValueName: "PlayerDebugMode"; ValueData: "1"
Root: HKCU; Subkey: "Software\Adobe\CSXS.9"; ValueType: string; ValueName: "PlayerDebugMode"; ValueData: "1"
Root: HKCU; Subkey: "Software\Adobe\CSXS.10"; ValueType: string; ValueName: "PlayerDebugMode"; ValueData: "1"
Root: HKCU; Subkey: "Software\Adobe\CSXS.11"; ValueType: string; ValueName: "PlayerDebugMode"; ValueData: "1"
Root: HKCU; Subkey: "Software\Adobe\CSXS.12"; ValueType: string; ValueName: "PlayerDebugMode"; ValueData: "1"
Root: HKCU; Subkey: "Software\Adobe\CSXS.13"; ValueType: string; ValueName: "PlayerDebugMode"; ValueData: "1"
Root: HKCU; Subkey: "Software\Adobe\CSXS.14"; ValueType: string; ValueName: "PlayerDebugMode"; ValueData: "1"
Root: HKCU; Subkey: "Software\Adobe\CSXS.15"; ValueType: string; ValueName: "PlayerDebugMode"; ValueData: "1"
Root: HKCU; Subkey: "Software\Adobe\CSXS.16"; ValueType: string; ValueName: "PlayerDebugMode"; ValueData: "1"
Root: HKCU; Subkey: "Software\Adobe\CSXS.17"; ValueType: string; ValueName: "PlayerDebugMode"; ValueData: "1"
Root: HKCU; Subkey: "Software\Adobe\CSXS.18"; ValueType: string; ValueName: "PlayerDebugMode"; ValueData: "1"
Root: HKCU; Subkey: "Software\Adobe\CSXS.19"; ValueType: string; ValueName: "PlayerDebugMode"; ValueData: "1"
Root: HKCU; Subkey: "Software\Adobe\CSXS.20"; ValueType: string; ValueName: "PlayerDebugMode"; ValueData: "1"
Root: HKCU; Subkey: "Software\Adobe\CSXS.21"; ValueType: string; ValueName: "PlayerDebugMode"; ValueData: "1"
Root: HKCU; Subkey: "Software\Adobe\CSXS.22"; ValueType: string; ValueName: "PlayerDebugMode"; ValueData: "1"
; CEP 调试设置为 Adobe 共用项，卸载时保留。

[Code]
var
  CleanFinished: Boolean;

function PrepareToInstall(var NeedsRestart: Boolean): String;
var
  ScriptPath, ResultPath, Params, Common64: String;
  ExitCode: Integer;
  ErrorText: AnsiString;
begin
  Result := '';
  if CleanFinished then exit;
  WizardForm.StatusLabel.Caption := CustomMessage('CleanPreparing');
  ExtractTemporaryFile('clean-install.ps1');
  ScriptPath := ExpandConstant('{tmp}\clean-install.ps1');
  ResultPath := ExpandConstant('{tmp}\youkai-clean-result.txt');
  Common64 := '';
  if IsWin64 then Common64 := ExpandConstant('{commoncf64}\Adobe\CEP\extensions');
  Params := '-NoLogo -NoProfile -NonInteractive -ExecutionPolicy Bypass -File "' + ScriptPath + '"' +
    ' -UserExtensionsRoot "' + ExpandConstant('{userappdata}\Adobe\CEP\extensions') + '"' +
    ' -CommonExtensionsRoot32 "' + ExpandConstant('{commoncf32}\Adobe\CEP\extensions') + '"' +
    ' -CommonExtensionsRoot64 "' + Common64 + '"' +
    ' -BackupRoot "' + ExpandConstant('{localappdata}\YOUKAI\backups') + '"' +
    ' -ResultPath "' + ResultPath + '"' +
    ' -Language "' + ActiveLanguage + '"';
  { 只让清理程序提权；主安装始终属于当前用户，避免管理员账户代输密码时装错用户。 }
  if not ShellExec('runas', ExpandConstant('{sys}\WindowsPowerShell\v1.0\powershell.exe'), Params,
    '', SW_HIDE, ewWaitUntilTerminated, ExitCode) then
  begin
    Result := CustomMessage('CleanStartFailed');
    exit;
  end;
  if ExitCode <> 0 then
  begin
    Result := CustomMessage('CleanFailed');
    if LoadStringFromFile(ResultPath, ErrorText) then Result := Result + #13#10 + UTF8Decode(ErrorText);
    exit;
  end;
  CleanFinished := True;
end;

procedure CurStepChanged(CurStep: TSetupStep);
begin
  if CurStep = ssPostInstall then
    if not SaveStringToFile(ExpandConstant('{app}\install-state.json'),
      '{"installId":"' + GetDateTimeString('yyyymmddhhnnss', '-', ':') + '"}', False) then
      MsgBox(CustomMessage('InstallMarkerFailed'), mbError, MB_OK);
  if (CurStep = ssPostInstall) and (not WizardSilent) then
    MsgBox(FmtMessage(CustomMessage('InstallComplete'), [ExpandConstant('{localappdata}\YOUKAI\backups')]), mbInformation, MB_OK);
end;

[UninstallDelete]
Type: files; Name: "{app}\install-state.json"
