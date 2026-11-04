/* YOUKAI 1.0 | 作者：二百七 | Copyright (c) 2026 二百七 | SPDX-License-Identifier: MIT */
const fs=require('fs'),path=require('path'),vm=require('vm'),assert=require('assert/strict');
const root=path.resolve(__dirname,'..'), scripts=path.join(root,'com.youkai.toolbox/user_scripts');
let checks=0;
function check(name,fn){fn();checks++;console.log('PASS release: '+name);}
function run(name,ctx){return vm.runInNewContext(fs.readFileSync(path.join(scripts,name+'.jsx'),'utf8').replace(/^#.*$/gm,''),ctx,{filename:name+'.jsx'});}
function csvContext(name,csv,doc,more={}){
 const files=new Map([['/csv/'+name+'.csv',csv]]), writes=new Map();
 function File(p){if(!(this instanceof File))return new File(p);this.fsName=String(p);this.name=path.posix.basename(this.fsName);Object.defineProperty(this,'exists',{get:()=>files.has(this.fsName)});this.open=()=>true;this.read=()=>files.get(this.fsName);this.close=()=>{};this.write=t=>{writes.set(this.fsName,t);files.set(this.fsName,t);return true;};this.writeln=()=>true;}
 function Folder(p){if(!(this instanceof Folder))return new Folder(p);this.fsName=String(p);this.exists=true;this.toString=()=>this.fsName;this.create=()=>true;}
 Folder.desktop='/desktop';Folder.userData='/data';Folder.myDocuments='/documents';
 const ctx={app:{documents:[doc],activeDocument:doc},File,Folder,Error,alert(){},$:{fileName:'/scripts/'+name+'.jsx',global:{YOUKAI_CSV_FOLDER:'/csv'}},...more};
 return {ctx,files,writes};
}
// Preserve the five restored implementations and the five newly approved test scripts.
// Byte checks ensure packaging does not alter their contents or encoding.
const crypto=require('crypto');
const approved=JSON.parse(fs.readFileSync(path.join(root,'docs/maintenance/VERIFIED-SCRIPTS.json'),'utf8'));
const approvedNames=new Set(approved.files.map(item=>path.basename(item.target)));
check('the ten author-approved scripts remain byte-for-byte unchanged',()=>{
 assert.equal(approved.files.length,10);
 for(const item of approved.files){
  const bytes=fs.readFileSync(path.join(root,item.target));
  assert.equal(bytes.length,item.bytes,item.target);
  assert.equal(crypto.createHash('sha256').update(bytes).digest('hex'),item.sha256,item.target);
  const original=path.join(root,item.source);
  if(fs.existsSync(original))assert.deepEqual(bytes,fs.readFileSync(original),item.target);
 }
 assert.equal(fs.existsSync(path.join(scripts,'战队色修改.jsx')),false);
});
check('renamed color script uses the unchanged team header and swatch-name template',()=>{
 const csv=fs.readFileSync(path.join(root,'com.youkai.toolbox/assets/templates/色板方案切换.csv'),'utf8').replace(/^\uFEFF/,'');
 assert.deepEqual(csv.split(/\r?\n/)[0].split(','),['战队','战队色']);
 const color={cyan:9,magenta:9,yellow:9,black:9};
 const doc={layers:[{pageItems:[{typename:'TextFrame',contents:'战队@KPL'}]}],swatches:[{name:'战队色',color:{spot:{color}}}]};
 const t=csvContext('色板方案切换',csv,doc);
 run('色板方案切换',t.ctx);
 assert.deepEqual(color,{cyan:0,magenta:0,yellow:0,black:100});
 assert.equal(t.writes.size,0,'valid default table must not produce an error log');
});
function layer(name,parent,locked=false,visible=true){const l={typename:'Layer',name,parent,locked,visible,layers:[],pageItems:[]};l.remove=()=>{const i=parent.layers.indexOf(l);assert(i>=0);parent.layers.splice(i,1);};parent.layers.push(l);return l;}
function uiFixture(){
 const all=[],draws=[],fonts=[];
 function control(type,text){const c={type,text:text||'',children:[],items:[],preferredSize:{},size:{width:180,height:34},enabled:true,events:[],graphics:{PenType:{SOLID_COLOR:0},BrushType:{SOLID_COLOR:0},newPen:(t,color)=>({color}),newBrush:(t,color)=>{assert(Array.isArray(color),'color initialized before UI creation');return{color};},newPath(){},rectPath(){},moveTo(){},lineTo(){},closePath(){},fillPath(brush){draws.push({control:c,color:brush.color});},strokePath(){},measureString(){return{width:70,height:12};},drawString(){}}};let selection=null;Object.defineProperty(c,'selection',{get:()=>selection,set:value=>{selection=typeof value==='number'?{index:value}:value;}});c.add=(kind,bounds,label)=>{const child=control(kind,label===undefined?bounds:label);child.parent=c;c.children.push(child);if(kind==='item')c.items.push(child);return child;};c.addEventListener=(event,fn)=>c.events.push({event,fn});c.center=()=>{};c.show=()=>1;c.close=()=>{c.closed=true;};c.notify=event=>{if(c[event])c[event]();};c.update=()=>{};all.push(c);return c;}
 const doc={name:'test.ai',saved:true,path:{fsName:'/source'},fullName:{exists:true},layers:[]};const top=layer('top',doc);top.pageItems=[{name:'超长对象名'.repeat(30),typename:'GroupItem',parent:top}];doc.activeLayer=top;
 const t=csvContext('unused','',doc,{Window:function(){return control('dialog','');},ScriptUI:{FontStyle:{REGULAR:0,BOLD:1},newFont:(name,style,size)=>{assert([0,1].includes(style),'use ScriptUI FontStyle enums');const font={name,style,size};fonts.push(font);return font;}}});run('分层导出',t.ctx);return{all,draws,fonts,doc};
}
check('layer export initializes dark palette and custom primary/close buttons before showing',()=>{
 const t=uiFixture(),win=t.all.find(c=>c.type==='dialog'),start=t.all.find(c=>c.text==='开始一键导出'),close=t.all.find(c=>c.text==='✕');assert.deepEqual(Array.from(win.graphics.backgroundColor.color),[.102,.106,.122,1]);assert.equal(typeof start.onDraw,'function');start.onDraw();close.onDraw();assert.deepEqual(Array.from(t.draws[0].color),[.976,1,0,1]);assert.deepEqual(Array.from(t.draws[1].color),[1,.2,.267,1]);assert.equal(win.events.some(e=>e.event==='mousedown'),false);assert.equal(win.defaultElement,start);assert.equal(typeof win.cancelElement.onClick,'function');start.enabled=false;start.onDraw();assert.deepEqual(Array.from(t.draws[2].color),[.141,.153,.173,1]);
});
check('layer export containers retain native drawing for labels, dropdown and checkboxes',()=>{
 const t=uiFixture();for(const c of t.all.filter(c=>['dialog','group','panel'].includes(c.type)))assert.equal(c.onDraw,undefined,'container must not paint over child controls');
 assert.equal(t.all.filter(c=>c.type==='checkbox').length,3);assert.equal(t.all.filter(c=>c.type==='dropdownlist').length,1);
 for(const text of ['01. 目标图层与文件命名规则','02. 保存路径与工艺选项','选择图层：','导出路径：'])assert(t.all.some(c=>c.text===text));
 assert(t.fonts.every(f=>f.name==='Microsoft YaHei UI'));
 const close=t.all.find(c=>c.text==='✕');assert.deepEqual(Array.from(close.minimumSize),[28,24]);assert.deepEqual(Array.from(close.maximumSize),[28,24]);assert.deepEqual(Array.from(close.parent.alignment),['right','center']);assert.deepEqual(Array.from(close.parent.parent.alignChildren),['left','center']);for(const c of t.all.filter(c=>c.type==='button')){assert.deepEqual(Array.from(c.caption.alignment),['center','center']);assert.equal(c.parent.orientation,'stack');}const cancel=t.all.find(c=>c.type==='button'&&c.text==='取消'),win=t.all.find(c=>c.type==='dialog'),click=cancel.caption.events.find(e=>e.event==='click').fn;click();assert.equal(win.closed,true);win.closed=false;cancel.enabled=false;click();assert.equal(win.closed,false);
});
check('cross-file template/open preflight errors do not delete target artwork',()=>{
 for(const openError of [false,true]){
  const doc={layers:[],artboards:[{name:'board'}],fullName:{fsName:'/target.ai'}};doc.artboards.getActiveArtboardIndex=()=>0;doc.artboards.setActiveArtboardIndex=()=>{};const dest=layer('Dest',doc),old=layer('Old',doc);let removed=0,closed=0;old.pageItems=[{name:'oldItem',parent:old,remove(){removed++;}}];
  const t=csvContext('跨文件提取并替换','模板,/template.ai,\n复制,替换,删除\nSource,Dest,Old\nsourceItem,1,oldItem',doc,{UserInteractionLevel:{DONTDISPLAYALERTS:'quiet'},SaveOptions:{DONOTSAVECHANGES:0}});t.files.set('/template.ai','template');t.ctx.app.userInteractionLevel='original';t.ctx.app.open=()=>{if(openError)throw Error('cannot open template');return{layers:[],close(){closed++;}};};t.ctx.app.preferences={getBooleanPreference:()=>true,setBooleanPreference(){}};
  assert.throws(()=>run('跨文件提取并替换',t.ctx));assert.equal(removed,0);assert.equal(closed,openError?0:1);assert.equal(t.ctx.app.userInteractionLevel,'original');
 }
});
check('cross-file lookup cannot fall back to similar names elsewhere',()=>{const t=csvContext('跨文件提取并替换','',{} ,{UserInteractionLevel:{DONTDISPLAYALERTS:'quiet'}});t.ctx.app.documents=[];run('跨文件提取并替换',t.ctx);const doc={layers:[]},a=layer('Artwork',doc);a.pageItems=[{name:'Logo-OLD',parent:a,typename:'GroupItem'}];assert.equal(t.ctx.getTargetByPath(doc,['Art','Logo'],true).length,0);assert.equal(t.ctx.getTargetByPath(doc,['Artwork','Logo'],true).length,0);});
check('cross-file clear always operates on the target after the template is opened',()=>{
 const doc={layers:[],artboards:[{name:'board'}],fullName:{fsName:'/target.ai'}},source={layers:[],fullName:{fsName:'/template.ai'},close(){}};doc.artboards.getActiveArtboardIndex=()=>0;doc.artboards.setActiveArtboardIndex=()=>{};
 const dest=layer('Dest',doc),old=layer('Old',doc),src=layer('Source',source);src.pageItems=[{name:'sourceItem',parent:src,typename:'PathItem'}];let removed=0,cleared=0;old.pageItems=[{name:'oldItem',parent:old,typename:'PathItem',remove(){removed++;}}];
 for(const d of [doc,source])d.layers.getByName=n=>{const found=d.layers.find(l=>l.name===n);if(!found)throw Error('missing');return found;};
 const t=csvContext('跨文件提取并替换','模板,/template.ai,\n复制,替换,删除\nSource,Dest,Old\nsourceItem,1,oldItem',doc,{UserInteractionLevel:{DONTDISPLAYALERTS:'quiet'},SaveOptions:{DONOTSAVECHANGES:0}});t.files.set('/template.ai','template');t.ctx.app.documents=[];vm.createContext(t.ctx);vm.runInContext(fs.readFileSync(path.join(scripts,'跨文件提取并替换.jsx'),'utf8').replace(/^#.*$/gm,''),t.ctx);t.ctx.app.documents=[doc];t.ctx.app.open=()=>{t.ctx.app.activeDocument=source;return source;};t.ctx.app.preferences={getBooleanPreference:()=>true,setBooleanPreference(){}};t.ctx.app.executeMenuCommand=command=>{assert.equal(command,'clear');assert.equal(t.ctx.app.activeDocument,doc);cleared++;};t.ctx.copyAndPasteMathematically=()=>true;t.ctx.crossFileBatchExecute();assert.equal(cleared,1);assert.equal(removed,1);assert.equal(t.ctx.app.activeDocument,doc);
});
check('layer export chooses duplicate names by index and surfaces failed cleanup',()=>{
 const source=fs.readFileSync(path.join(scripts,'分层导出.jsx'),'utf8').replace(/^#.*$/gm,'').replace('    showExportDialog(doc, layersData);','    __replica = processExportReplica;');
 const master={layers:[],fullName:{exists:true},path:{}};const ml=layer('master',master);ml.pageItems=[{parent:ml}];const ctx={app:{documents:[master],activeDocument:master},alert(){}};vm.runInNewContext(source,ctx);
 const replica={layers:[]},first=layer('same',replica),last=layer('same',replica);const firstItem={name:'same',parent:first},one={name:'same',parent:last,locked:true,hidden:true},two={name:'same',parent:last,locked:true,hidden:true};first.pageItems=[firstItem];last.pageItems=[one,two];one.remove=()=>last.pageItems.splice(last.pageItems.indexOf(one),1);two.remove=()=>{throw Error('should retain selected index');};ctx.__replica(replica,{layerIndex:1,index:1,kind:'pageItem'},{cleanMode:true,isolateLayer:true});assert.equal(replica.layers.length,1);assert.equal(replica.layers[0],last);assert.equal(last.pageItems.length,1);assert.equal(last.pageItems[0],two);assert.equal(two.hidden,false);
 const bad={layers:[]},badLayer=layer('target',bad);const keep={parent:badLayer},refused={parent:badLayer,remove(){throw Error('host locked');}};badLayer.pageItems=[keep,refused];assert.throws(()=>ctx.__replica(bad,{layerIndex:0,index:0,kind:'pageItem'},{cleanMode:true,isolateLayer:true}),/无法删除/);
});
function cleanupFixture(options={}){
 const art={name:'selected art',kind:'art',hidden:false,locked:false,file:{fsName:'/original/photo.psd'}},text={name:'visible text',kind:'text',hidden:false,locked:true},hiddenArt={name:'hidden art',kind:'art',hidden:true,locked:true},hiddenText={name:'hidden text',kind:'text',hidden:true,locked:false};
 const doc={layers:[{visible:false,locked:true},{visible:true,locked:false}],items:options.noText?[art,hiddenArt]:[art,text,hiddenArt,hiddenText],selection:[art]};
 const commands=[],writes=[];
 for(const method of ['save','saveAs','close'])doc[method]=()=>{writes.push(method);throw Error('unexpected document write or close');};
 const ctx={app:{name:options.host||'Adobe Illustrator',documents:options.noDoc?[]:[doc],activeDocument:doc,redraw(){},executeMenuCommand(command){
  commands.push(command);if(command===options.fail)throw Error('host command refused');
  if(command==='unlockAll'){assert.equal(doc.selection,null);for(const item of doc.items)item.locked=false;}
  else if(command==='showAll'){assert.equal(doc.selection,null);doc.selection=doc.items.filter(item=>item.hidden);for(const item of doc.selection)item.hidden=false;}
  else if(command==='clear'){const removed=doc.selection||[];doc.items=doc.items.filter(item=>!removed.includes(item));doc.selection=null;}
  else if(command==='Text Objects menu item'){assert.equal(doc.selection,null);doc.selection=doc.items.filter(item=>item.kind==='text');}
  else if(command==='outline'){for(const item of doc.selection)item.kind='outlined';}
  else throw Error('unexpected command '+command);
 }},$:{sleep(){}},File(){throw Error('unexpected file access');},Folder(){throw Error('unexpected folder access');}};
 return{ctx,doc,art,text,hiddenArt,hiddenText,commands,writes};
}
check('document cleanup retains selected visible artwork, clears hidden items and outlines retained text without saving',()=>{
 const t=cleanupFixture();run('文档净化转曲',t.ctx);
 assert(t.doc.items.includes(t.art));assert(t.doc.items.includes(t.text));assert(!t.doc.items.includes(t.hiddenArt));assert(!t.doc.items.includes(t.hiddenText));assert.equal(t.text.kind,'outlined');assert.equal(t.art.file.fsName,'/original/photo.psd');assert(t.doc.layers.every(l=>l.visible&&!l.locked));assert.deepEqual(t.writes,[]);assert.equal(t.doc.layers.length,2,'existing empty layers are retained');
});
check('document cleanup supports documents without text and never outlines the visible art selection',()=>{
 const t=cleanupFixture({noText:true});run('文档净化转曲',t.ctx);assert.deepEqual(t.doc.items,[t.art]);assert(!t.commands.includes('outline'));assert.deepEqual(t.writes,[]);
});
check('document cleanup rejects an unsupported host or missing document before changing anything',()=>{
 for(const options of [{noDoc:true},{host:'Adobe Photoshop'}]){const t=cleanupFixture(options);assert.throws(()=>run('文档净化转曲',t.ctx),/Illustrator|请先打开/);assert.deepEqual(t.commands,[]);assert.equal(t.doc.layers[0].locked,true);assert.deepEqual(t.writes,[]);}
});
check('document cleanup stops on cleanup failure and reports partial changes without outlining or saving',()=>{
 for(const fail of ['showAll','clear']){const t=cleanupFixture({fail});assert.throws(()=>run('文档净化转曲',t.ctx),/清理隐藏对象.*host command refused[\s\S]*部分修改/);assert(!t.commands.includes('outline'));assert.equal(t.text.kind,'text');assert.deepEqual(t.writes,[]);}
});
check('document cleanup surfaces outline failures and leaves the document open without saving',()=>{
 const t=cleanupFixture({fail:'outline'});assert.throws(()=>run('文档净化转曲',t.ctx),/文字转曲.*host command refused/);assert.deepEqual(t.writes,[]);assert(t.doc.items.includes(t.art));
});
check('all bundled scripts have concise docs and match release metadata; approved scripts retain their original comments',()=>{const files=fs.readdirSync(scripts).filter(n=>n.endsWith('.jsx')),release=JSON.parse(fs.readFileSync(path.join(root,'com.youkai.toolbox/release.json'),'utf8'));assert.equal(files.length,release.scriptCount);assert(files.includes('集体注释.jsx'));assert(files.includes('按注释批量修改.jsx'));for(const name of files){const body=fs.readFileSync(path.join(scripts,name.replace(/jsx$/,'md')),'utf8').replace(/\r\n/g,'\n');assert(body.startsWith('# '+name.slice(0,-4)+'\n'));assert.deepEqual(body.match(/^## .+$/gm),['## 用途','## 准备','## 操作','## 注意']);assert(body.length<1300,name+' usage should stay concise');if(!approvedNames.has(name))assert.match(fs.readFileSync(path.join(scripts,name),'utf8'),/作者：二百七/);}});
console.log(`${checks} release checks passed; Adobe and ScriptUI rendering are mocked.`);
