# YOUKAI | 作者：二百七 | Copyright (c) 2026 二百七 | SPDX-License-Identifier: MIT
[CmdletBinding()]
param([string]$ReportPath)
$ErrorActionPreference='Stop'
$root=[IO.Path]::GetFullPath((Join-Path $PSScriptRoot '..'))
$mainUri=([Uri](Join-Path $root 'com.youkai.toolbox/scripts/main.jsx')).AbsoluteUri | ConvertTo-Json -Compress
$scriptsUri=([Uri](Join-Path $root 'com.youkai.toolbox/user_scripts')).AbsoluteUri | ConvertTo-Json -Compress
$code=@'
(function () {
    if($.global && $.global.YOUKAI_BATCH===true)throw Error("Wait for the current batch before testing the host.");
    var before=app.documents.length, entries=[], failures=[];
    function esc(s){return String(s).replace(/\\/g,"\\\\").replace(/"/g,'\\"').replace(/\r/g,"\\r").replace(/\n/g,"\\n");}
    function read(file){file.encoding="UTF-8";if(!file.open("r"))throw Error("Cannot read source");var s=file.read();file.close();return s;}
    function compile(name,body){try{new Function(body.replace(/^#.*$/gm,""));entries.push(name);}catch(e){failures.push(name+":"+e.line+":"+e.toString());}}
    var main=new File(__MAIN_URI__);
    compile("main.jsx",read(main));
    var files=new Folder(__SCRIPTS_URI__).getFiles("*.jsx");
    for(var i=0;i<files.length;i++)compile(decodeURI(files[i].name),read(files[i]));
    var ping="";
    if(!failures.length){try{$.evalFile(main.fsName);ping=Youkai.ping();if(ping!=="PONG")failures.push("bridge ping failed");if(!Youkai.isSkipBatchPath("E:/project/LINK/ref.ai")||Youkai.isSkipBatchPath("E:/project/linker/main.ai")||!Youkai.isSkipBatchPath("E:"+String.fromCharCode(92)+"links"+String.fromCharCode(92)+"ref.ai"))failures.push("link directory protection failed");}catch(e2){failures.push("main.jsx:"+e2.line+":"+e2.toString());}}
    if(app.documents.length!==before)failures.push("document count changed");
    var list=[];for(i=0;i<failures.length;i++)list.push('"'+esc(failures[i])+'"');
    return '{"hostVersion":"'+esc(app.version)+'","compiledFiles":'+entries.length+',"ping":"'+ping+'","documentsBefore":'+before+',"documentsAfter":'+app.documents.length+',"failures":['+list.join(',')+']}';
}())
'@
$code=$code.Replace('__MAIN_URI__',$mainUri).Replace('__SCRIPTS_URI__',$scriptsUri)
$ai=New-Object -ComObject Illustrator.Application
$result=[string]$ai.DoJavaScript($code)
if($ReportPath){$parent=Split-Path -Parent $ReportPath;if($parent){New-Item -ItemType Directory -Force -Path $parent | Out-Null};[IO.File]::WriteAllText($ReportPath,$result,[Text.UTF8Encoding]::new($false))}
$report=$result | ConvertFrom-Json
if($report.failures.Count -or $report.ping -ne 'PONG'){Write-Output $result;throw 'Illustrator host compilation/load failed.'}
Write-Output ('PASS Illustrator '+$report.hostVersion+': '+$report.compiledFiles+' source files compiled; bridge PONG; document count unchanged.')
