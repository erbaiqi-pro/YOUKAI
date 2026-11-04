/* YOUKAI 1.0 | 作者：二百七 | Copyright (c) 2026 二百七 | SPDX-License-Identifier: MIT */
const fs=require('fs'),path=require('path'),assert=require('assert/strict');
const playwrightRoot=process.env.PLAYWRIGHT_MODULE || 'playwright';
const {chromium}=require(playwrightRoot);
const root=path.resolve(__dirname,'..'), ext=path.join(root,'com.youkai.toolbox');
function walk(d){return fs.readdirSync(d,{withFileTypes:true}).flatMap(e=>e.isDirectory()?walk(path.join(d,e.name)):[path.join(d,e.name)]);}
(async()=>{
 const browser=await chromium.launch({headless:true, ...(process.env.CHROME_PATH ? {executablePath:process.env.CHROME_PATH} : {})});
 try {
 const page=await browser.newPage({viewport:{width:720,height:640}}), errors=[];
 page.on('pageerror',e=>errors.push(e.message));
 const fixture={};
 for(const f of walk(ext)) fixture['/extension/'+path.relative(ext,f).replace(/\\/g,'/')]=fs.readFileSync(f,'utf8');
 fixture['/extension/install-state.json']=JSON.stringify({installId:'test-install-1'});
 await page.addInitScript(({fixture})=>{
   const norm=p=>String(p).replace(/\\/g,'/').replace(/\/$/,'');
   const files=Object.assign({},fixture), dirs=new Set(['/extension','/extension/user_scripts','/extension/assets/templates','/data','/custom','/batch']);
   window.__youkaiTestFiles=files;
   if(!localStorage.getItem('test.seeded')) {
     localStorage.setItem('youkai.path.outputFolder','/stale-output');
     localStorage.setItem('another-plugin.setting','keep');
     localStorage.setItem('test.seeded','1');
   }
   files['/custom/extra.jsx']='';
   const pathMock={join:(...p)=>p.join('/').replace(/\/+/g,'/'),normalize:norm,resolve:(...p)=>p.join('/'),dirname:p=>norm(p).replace(/\/[^/]+$/,''),basename:p=>norm(p).split('/').pop(),isAbsolute:p=>p.startsWith('/')};
   const fsMock={existsSync:p=>dirs.has(norm(p))||Object.hasOwn(files,norm(p)),statSync:p=>{p=norm(p);if(!dirs.has(p)&&!Object.hasOwn(files,p))throw Error('missing');return{isDirectory:()=>dirs.has(p),isFile:()=>Object.hasOwn(files,p)};},mkdirSync:p=>dirs.add(norm(p)),readFileSync:p=>files[norm(p)],writeFileSync:(p,t)=>files[norm(p)]=t,copyFileSync:(a,b)=>files[norm(b)]=files[norm(a)],chmodSync(){},readdirSync:p=>{p=norm(p)+'/';return Object.keys(files).filter(k=>k.startsWith(p)&&!k.slice(p.length).includes('/')).map(k=>k.slice(p.length));}};
   window.process={platform:'darwin'};
   window.externalCommands=[];
   window.updateResult={state:'current',currentVersion:'1.0.0'};window.updateChecks=[];window.updateInstallCalls=0;window.scriptRunCalls=0;window.openedUrls=[];
   window.open=link=>window.openedUrls.push(link);
   const updateMock={create(options){return{version:()=> '1.0.0',recover:()=>({recovered:false}),cached:()=>null,check(force){window.updateChecks.push(force);return window.updateCheckError?Promise.reject(Error('network unavailable')):Promise.resolve(JSON.parse(JSON.stringify(window.updateResult)));},install(){window.updateInstallCalls++;options.onProgress('downloading',{loaded:1,total:2});if(window.updateInstallError)return Promise.reject(Object.assign(Error(window.updateInstallError),{recoveryRequired:!!window.updateRecoveryRequired}));return new Promise(resolve=>{if(window.holdUpdate)window.finishUpdate=resolve;else resolve({version:'1.1.0'});});}};}};
   window.require=name=>name.endsWith('/updater.js')?updateMock:({fs:fsMock,path:pathMock,os:{tmpdir:()=>'/tmp',homedir:()=>'/home'},child_process:{execFile(command,args,callback){window.externalCommands.push({command,args});if(callback)callback({message:'Command failed: explorer.exe',code:1});}}}[name]);
   window.alerts=[];window.alert=t=>window.alerts.push(t);
   window.batchResults=[{ok:true,message:'OK'},{ok:false,message:'script error'}];
   window.pendingBatchCallbacks=[];window.batchRequests=0;window.csvOpenRequests=[];
   window.__adobe_cep__={getSystemPath:t=>t==='extension'?'file:///extension':'file:///data',getHostEnvironment:()=>JSON.stringify({appVersion:'30.0'}),evalScript:(s,cb)=>{
     if(s.includes('getAllAIFilesJSON'))cb(JSON.stringify({ok:true,files:window.batchFiles||['/batch/one.ai','/batch/two.ai']}));
     else if(s.includes('processSingleFileForBatch')){window.batchRequests++;const result=JSON.stringify(window.batchResults.shift());if(window.holdBatch)window.pendingBatchCallbacks.push(()=>cb(result));else cb(result);}
     else if(s.includes('Youkai.openCsvFile(')){window.csvOpenRequests.push(s);cb(JSON.stringify(window.csvOpenResult||{ok:true,message:'Opened'}));}
     else if(s.includes('Youkai.runScript(')){window.scriptRunCalls++;cb(JSON.stringify({ok:true,message:'done'}));}
     else if(s.includes('YOUKAI_RELOADED')){localStorage.setItem('test.hostReload',String(Number(localStorage.getItem('test.hostReload')||0)+1));cb(window.hostReloadError?'ERROR:busy':'YOUKAI_RELOADED');}
     else cb('OK');
   },resizeContent(){}};
 },{fixture});
 await page.goto('file:///'+path.join(ext,'index_full.html').replace(/\\/g,'/'));
 const scriptCount=fs.readdirSync(path.join(ext,'user_scripts')).filter(n=>n.endsWith('.jsx')).length;
 assert.equal(await page.locator('.script-item').count(),scriptCount);
 assert.equal(await page.locator('#youkaiUpdateBadge').isVisible(),false);
 assert.equal(await page.locator('#youkaiUpdateCard').isVisible(),false,'startup must never open an update panel');
 assert.equal(await page.locator('.doc-btn[data-name="集体注释.jsx"]').count(),1);
 assert.equal(await page.locator('.doc-btn[data-name="按注释批量修改.jsx"]').count(),1);
 assert.equal(await page.evaluate(()=>__youkaiTestFiles[localStorage.getItem('youkai.path.csvFolder')+'/按注释批量修改.csv']),fixture['/extension/assets/templates/按注释批量修改.csv']);
 assert.equal(await page.evaluate(()=>localStorage.getItem('another-plugin.setting')),'keep');
 assert.notEqual(await page.evaluate(()=>localStorage.getItem('youkai.path.outputFolder')),'/stale-output');
 assert.equal(await page.evaluate(()=>Object.keys(__youkaiTestFiles).filter(p=>p.includes('panel-settings-')).length),1);
 assert.equal(await page.title(),'YOUKAI');
 assert.equal(await page.locator('.logo-title').textContent(),'YOUKAI');
 assert.equal(await page.locator('.logo-tag').count(),0);
 assert.equal(await page.getByText('PDF效果图', {exact:true}).count(),0);
 assert.equal(await page.getByText('战队色修改', {exact:true}).count(),0);
 const shots=path.join(root,'项目资料/验证记录/界面截图');fs.mkdirSync(shots,{recursive:true});
 const csvNames=fs.readdirSync(path.join(ext,'assets/templates')).filter(n=>n.endsWith('.csv')).map(n=>n.replace(/csv$/,'jsx'));
 for(const name of [...new Set(['模板批量换图.jsx','分层导出.jsx','文档净化转曲.jsx','刀线尺寸标注.jsx','导出PDF.jsx','链接按文件夹命名.jsx','文本按空格拆分.jsx','文字跟随排版.jsx','集体注释.jsx',...csvNames])]) {
   await page.locator('.doc-btn').filter({hasText:'说明'}).evaluateAll((buttons,name)=>buttons.find(b=>b.dataset.name===name).click(),name);
   await page.waitForFunction(()=>document.querySelector('#docModal').classList.contains('open'));
   assert.match(await page.locator('#docContent').textContent(),/用途/);
   assert.equal(await page.locator('#docContent > br').count(),0,'no artificial empty lines in '+name);
   assert.equal(await page.locator('#docContent h2').count(),4);
   const headingGap=await page.locator('#docContent h2').first().evaluate(e=>e.nextElementSibling.getBoundingClientRect().top-e.getBoundingClientRect().bottom);
   assert(headingGap>=0&&headingGap<=8,'compact heading/body spacing in '+name+': '+headingGap);
   if(csvNames.includes(name)) {await page.locator('#openCsvBtn').click();}
   if(name==='文档净化转曲.jsx') {
     assert.equal(await page.locator('#openCsvBtn').isVisible(),false);
     assert.match(await page.locator('#docContent').textContent(),/手动保存/);
   }
   if(name==='集体注释.jsx') {
     assert.equal(await page.locator('#openCsvBtn').isVisible(),false);
     await page.screenshot({path:path.join(shots,'doc-collective.png')});
   }
   if(name==='按注释批量修改.jsx') {
     assert.equal(await page.locator('#openCsvBtn').isVisible(),true);
     await page.screenshot({path:path.join(shots,'doc-note-edit.png')});
   }
   if(name==='导出指定图层.jsx') {
     assert.equal(await page.locator('#docContent').evaluate(e=>e.scrollHeight>e.clientHeight),false,'this short guide should fit the usual dialog height');
     await page.screenshot({path:path.join(shots,'doc-compact.png')});
   }
   await page.locator('#closeDocBtn').click();
 }
 assert.equal(await page.evaluate(()=>window.csvOpenRequests.length),csvNames.length);
 assert.deepEqual(await page.evaluate(()=>window.alerts),[],'opening CSVs must not report Explorer exit-code failures');
 assert.deepEqual(await page.evaluate(()=>window.externalCommands),[],'CSV launch must not spawn Explorer');
 // Failures still need a useful message; avoid turning the fix into suppression of every error.
 await page.evaluate(()=>{window.csvOpenResult={ok:false,message:'没有默认表格软件'};});
 await page.locator('.doc-btn').evaluateAll(buttons=>buttons.find(b=>b.dataset.name==='导出指定图层.jsx').click());
 await page.locator('#openCsvBtn').click();assert.match(await page.evaluate(()=>window.alerts.pop()),/没有默认表格软件/);
 await page.evaluate(()=>{window.csvOpenResult=null;});await page.locator('#closeDocBtn').click();
 await page.locator('.script-item').first().click();
 await page.locator('#toggleUnifiedSettingsBtn').click();
 await page.locator('[data-target="sourceForm"]').click();
 await page.locator('#sourceNameInput').fill('extra');await page.locator('#folderInput').fill('/custom');await page.locator('#addSourceBtn').click();
 assert.equal(await page.locator('.source-entry').count(),2);
 await page.locator('.source-entry').last().click();await page.locator('#sourceNameInput').fill('renamed');await page.locator('#saveSourceBtn').click();
 assert.match(await page.locator('#sourceList').textContent(),/renamed/);
 await page.reload();await page.locator('#toggleUnifiedSettingsBtn').click();assert.equal(await page.locator('.source-entry').count(),2);
 await page.locator('[data-target="sourceForm"]').click();await page.locator('.source-entry').last().click();await page.locator('#removeSourceBtn').click();assert.equal(await page.locator('.source-entry').count(),1);
 await page.locator('[data-target="settingsForm"]').click();await page.locator('#saveSettingsBtn').click();assert.equal(await page.locator('#unifiedSettingsModal').evaluate(e=>e.classList.contains('open')),false);
 // Reproduce switching the main-panel selection while an old batch task still exists.
 const batchNames=()=>page.locator('#zzzBatchTaskList .zzz-task-name').allTextContents();
 await page.locator('.script-name-text').filter({hasText:'偏位补偿.jsx'}).click();await page.locator('#batchZzzBtn').click();
 assert.deepEqual(await batchNames(),['偏位补偿.jsx']);
 await page.locator('#closeBatchZzzBtn').click();
 await page.locator('.script-name-text').filter({hasText:'分层导出.jsx'}).click();await page.locator('#batchZzzBtn').click();
 assert.deepEqual(await batchNames(),['分层导出.jsx'],'a new main-panel selection must replace the previous task without manual deletion');
 await page.locator('.zzz-lib-item-name').filter({hasText:'偏位补偿.jsx'}).click();
 assert.deepEqual(await batchNames(),['分层导出.jsx','偏位补偿.jsx'],'the modal library still appends tasks');
 await page.locator('#closeBatchZzzBtn').click();await page.locator('#batchZzzBtn').click();
 assert.deepEqual(await batchNames(),['分层导出.jsx'],'reopening from the main panel starts with its selected script, as in the original workflow');
 await page.locator('#closeBatchZzzBtn').click();
 await page.locator('.script-item').first().click();await page.locator('#batchZzzBtn').click();await page.locator('#zzzBatchFolderInput').fill('/batch');await page.locator('#zzzStartBatchBtn').click();
 await page.waitForFunction(()=>document.querySelector('.zzz-status-text').textContent.includes('成功: 1；失败: 1'));
 assert.match(await page.locator('.zzz-status-text').textContent(),/错误日志/);
 await page.screenshot({path:path.join(shots,'batch.png')});
 await page.evaluate(()=>{window.batchResults=[{ok:true},{ok:true}];});await page.locator('#zzzStartBatchBtn').click();
 await page.waitForFunction(()=>document.querySelector('.zzz-status-text').textContent.includes('成功: 2；失败: 0'));
 await page.screenshot({path:path.join(shots,'batch-success.png')});
 await page.evaluate(()=>{window.batchFiles=[];});await page.locator('#zzzStartBatchBtn').click();
 await page.waitForFunction(()=>document.querySelector('.zzz-status-text').textContent.includes('未找到任何'));
 await page.screenshot({path:path.join(shots,'batch-empty.png')});
 const beforeStop=await page.evaluate(()=>window.batchRequests);
 await page.evaluate(()=>{window.batchFiles=null;window.batchResults=[{ok:true},{ok:true}];window.holdBatch=true;});await page.locator('#zzzStartBatchBtn').click();
 await page.waitForFunction(()=>window.pendingBatchCallbacks.length===1);
 const runningTasks=await batchNames();
 await page.locator('#closeBatchZzzBtn').click();await page.locator('.script-name-text').filter({hasText:'文档净化转曲.jsx'}).click();await page.locator('#batchZzzBtn').click();
 assert.deepEqual(await batchNames(),runningTasks,'reopening while running must keep the active workflow');
 assert.match(await page.locator('.zzz-status-text').textContent(),/处理中/);
 await page.screenshot({path:path.join(shots,'batch-running.png')});
 await page.locator('#zzzStopBatchBtn').click();assert.equal(await page.locator('#zzzStopBatchBtn').isDisabled(),true);
 await page.evaluate(()=>window.pendingBatchCallbacks.shift()());
 await page.waitForFunction(()=>document.querySelector('.zzz-status-text').textContent.includes('已停止'));
 assert.equal(await page.evaluate(()=>window.batchRequests),beforeStop+1);
 await page.screenshot({path:path.join(shots,'batch-stopped.png')});
 await page.locator('#closeBatchZzzBtn').click();await page.setViewportSize({width:320,height:560});await page.screenshot({path:path.join(shots,'panel.png')});
 await page.locator('#searchInput').fill('没有这个脚本');assert.equal(await page.locator('.script-item').count(),0);
 await page.screenshot({path:path.join(shots,'panel-empty.png')});await page.locator('#searchInput').fill('');
 await page.evaluate(()=>{for(let i=0;i<15;i++)window.__youkaiTestFiles['/extension/user_scripts/'+('特别长的中文脚本名称用于检查面板布局'.repeat(3))+i+'.jsx']='';});
 await page.locator('#refreshBtn').click();assert.equal(await page.locator('.script-item').count(),scriptCount+15);
 assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth),false);
 await page.screenshot({path:path.join(shots,'panel-many.png')});
 await page.evaluate(()=>{for(const key of Object.keys(window.__youkaiTestFiles))if(key.includes('特别长的中文脚本名称'))delete window.__youkaiTestFiles[key];});await page.locator('#refreshBtn').click();
 await page.locator('#toggleUnifiedSettingsBtn').click();await page.screenshot({path:path.join(shots,'settings-narrow.png')});
 await page.locator('#closeUnifiedSettingsBtn').click();
 const previousAlerts=await page.evaluate(()=>window.alerts.length);
 async function showAvailableUpdate(){
   await page.evaluate(()=>{window.updateResult={state:'available',version:'1.1.0',currentVersion:'1.0.0',url:'https://github.com/erbaiqi-pro/YOUKAI/releases/tag/v1.1.0'};window.updateCheckError=false;});
   await page.locator('#toggleUnifiedSettingsBtn').click();await page.locator('[data-target="settingsForm"]').click();await page.locator('#youkaiCheckUpdateBtn').click();
   await page.waitForFunction(()=>!document.querySelector('#youkaiUpdateBadge').hidden);
 }
 await showAvailableUpdate();
 assert.equal(await page.locator('#unifiedSettingsModal').evaluate(e=>e.classList.contains('open')),false);
 await page.locator('#youkaiCloseUpdateBtn').click();assert.equal(await page.locator('#youkaiUpdateCard').isVisible(),false);
 assert.equal(await page.locator('#youkaiUpdateBadge').isVisible(),true);
 await page.locator('#youkaiUpdateBadge').click();assert.equal(await page.locator('#youkaiUpdateCard').isVisible(),true);assert.deepEqual(await page.evaluate(()=>window.openedUrls),[]);
 await page.locator('#youkaiLogoBtn').click();assert.deepEqual(await page.evaluate(()=>window.openedUrls),['https://erbaiqi.pages.dev/']);
 await page.locator('#youkaiReleaseBtn').click();assert.match(await page.evaluate(()=>window.openedUrls[1]),/erbaiqi-pro\/YOUKAI\/releases/);
 for(const width of [300,320,720]){
   await page.setViewportSize({width,height:300});
   assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth),false,'update card overflow at '+width);
   assert.equal(await page.locator('#batchZzzBtn').evaluate(el=>el.getBoundingClientRect().bottom<=innerHeight),true,'footer remains reachable with update card at '+width);
 }
 await page.setViewportSize({width:320,height:560});await page.screenshot({path:path.join(shots,'update-available.png')});
 await page.evaluate(()=>{window.batchFiles=null;window.batchResults=[{ok:true},{ok:true}];window.holdBatch=true;});
 await page.locator('#batchZzzBtn').click();await page.locator('#zzzStartBatchBtn').click();await page.waitForFunction(()=>window.pendingBatchCallbacks.length===1);await page.locator('#closeBatchZzzBtn').click();
 await page.locator('#youkaiApplyUpdateBtn').click();assert.equal(await page.evaluate(()=>window.updateInstallCalls),0);assert.match(await page.locator('#youkaiUpdateStatus').textContent(),/先完成或停止/);
 await page.locator('#batchZzzBtn').click();await page.locator('#zzzStopBatchBtn').click();await page.evaluate(()=>window.pendingBatchCallbacks.shift()());await page.waitForFunction(()=>document.querySelector('.zzz-status-text').textContent.includes('已停止'));await page.locator('#closeBatchZzzBtn').click();
 await page.evaluate(()=>{window.updateCheckError=true;});await page.locator('#toggleUnifiedSettingsBtn').click();await page.locator('[data-target="settingsForm"]').click();await page.locator('#youkaiCheckUpdateBtn').click();
 await page.waitForFunction(()=>document.querySelector('#youkaiUpdateStatus').textContent.includes('暂时无法联网'));assert.equal(await page.locator('#youkaiUpdateBadge').isVisible(),true);
 await page.evaluate(()=>{window.holdUpdate=true;});await page.locator('#youkaiApplyUpdateBtn').click();await page.waitForFunction(()=>window.finishUpdate);
 assert.equal(await page.locator('#batchZzzBtn').isDisabled(),true);assert.equal(await page.locator('#toggleUnifiedSettingsBtn').isDisabled(),true);assert.equal(await page.evaluate(()=>window.YOUKAI_UPDATE_BUSY),true);
 const beforeRun=await page.evaluate(()=>window.scriptRunCalls);await page.locator('.script-item').first().evaluate(el=>el.dispatchEvent(new MouseEvent('dblclick',{bubbles:true})));assert.equal(await page.evaluate(()=>window.scriptRunCalls),beforeRun);
 await page.screenshot({path:path.join(shots,'update-running.png')});await page.evaluate(()=>window.finishUpdate({version:'1.1.0'}));await page.waitForFunction(()=>!document.querySelector('#youkaiReloadUpdateBtn').hidden);
 assert.equal(await page.locator('#youkaiUpdateBadge').isVisible(),false);assert.equal(await page.locator('#youkaiApplyUpdateBtn').isVisible(),false);assert.equal(await page.locator('#youkaiReleaseBtn').isVisible(),false);assert.equal(await page.locator('#youkaiReloadUpdateBtn').isVisible(),true);assert.match(await page.locator('#youkaiUpdateStatus').textContent(),/更新完成/);await page.locator('#youkaiReloadUpdateBtn').scrollIntoViewIfNeeded();await page.screenshot({path:path.join(shots,'update-done.png')});
 assert.equal(await page.evaluate(()=>window.alerts.length),previousAlerts,'update lifecycle must never open alerts');
 await page.evaluate(()=>{window.hostReloadError=true;});await page.locator('#youkaiReloadUpdateBtn').click();await page.waitForFunction(()=>document.querySelector('#youkaiUpdateStatus').textContent.includes('关闭后重新打开'));
 await page.evaluate(()=>{window.hostReloadError=false;});await Promise.all([page.waitForNavigation(),page.locator('#youkaiReloadUpdateBtn').click()]);assert.equal(await page.evaluate(()=>localStorage.getItem('test.hostReload')),'2');
 await showAvailableUpdate();await page.evaluate(()=>{window.updateInstallError='simulated write failure';});await page.locator('#youkaiApplyUpdateBtn').click();await page.waitForFunction(()=>document.querySelector('#youkaiUpdateStatus').textContent.includes('更新未完成'));
 assert.equal(await page.locator('#batchZzzBtn').isDisabled(),false);assert.equal(await page.evaluate(()=>window.YOUKAI_UPDATE_BUSY),false);await page.screenshot({path:path.join(shots,'update-error.png')});
 for(const width of [300,320,720]){
   await page.setViewportSize({width,height:560});
   assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth),false,'horizontal overflow at '+width);
 }
 assert.deepEqual(errors,[]);
 await page.evaluate(()=>{window.updateRecoveryRequired=true;});await page.locator('#youkaiApplyUpdateBtn').click();await page.waitForFunction(()=>document.querySelector('#youkaiUpdateTitle').textContent.includes('需要恢复旧版'));
 assert.equal(await page.locator('#batchZzzBtn').isDisabled(),true);assert.equal(await page.evaluate(()=>window.YOUKAI_UPDATE_BUSY),true);assert.equal(await page.locator('#youkaiApplyUpdateBtn').isVisible(),false);
 await page.goto('file:///'+path.join(ext,'index_2023_safe.html').replace(/\\/g,'/'));assert.equal(await page.locator('#list button').count(),scriptCount);
 await page.evaluate(()=>{window.updateResult={state:'available',version:'1.1.0',currentVersion:'1.0.0'};});await page.locator('#youkaiCheckUpdateBtn').click();await page.waitForFunction(()=>!document.querySelector('#youkaiUpdateBadge').hidden);assert.equal(await page.locator('#youkaiUpdateCard').isVisible(),true);
 console.log(`PASS UI: CSV launch, compact docs, ${scriptCount} scripts, settings backup/reset, source CRUD, batch tasks/states/stop, silent NEW badge, manual checks/offline, opt-in update/success/failure/reload, busy task protection, independent website logo, full/safe panels, 300/320/720px layout; CEP and updater service are mocked.`);
 }finally{await browser.close();}
})().catch(e=>{console.error(e);process.exitCode=1;});
