/* YOUKAI 1.0 | 作者：二百七 | Copyright (c) 2026 二百七 | SPDX-License-Identifier: MIT */
// 静态及模拟检查：不启动Adobe，不处理真实图片。ATN参数由模拟描述符编码，真实PS载入另行验收。
const fs=require('fs'),path=require('path'),vm=require('vm'),assert=require('assert/strict');
const file=path.resolve(__dirname,'../com.youkai.toolbox/user_scripts/一键扩缩.jsx');
const source=fs.readFileSync(file,'utf8').replace(/^#.*$/gm,'');
new vm.Script(source,{filename:file});
// 2026-10-15实际故障回执：先发生后缀识别错误，随后字面量\t又遮住原错误。
const capturedReceipt='YK_OFFSET_4|1792046446262_659484863|ERROR%5Ct0%5Ct%255B%25E5%25A4%258D%25E5%2588%25B6%25E7%25B4%25A0%25E6%259D%2590%255D%2520%25E6%25BA%2590%25E6%2596%2587%25E4%25BB%25B6%25E6%25B2%25A1%25E6%259C%2589%25E5%258F%25AF%25E8%25AF%2586%25E5%2588%25AB%25E7%259A%2584%25E6%25A0%25BC%25E5%25BC%258F%25E5%2590%258E%25E7%25BC%2580%5Ct%5Ct%5Ct%5Ct';
const capturedPayload=decodeURIComponent(capturedReceipt.split('|')[2]);
assert.equal(capturedPayload.split(String.fromCharCode(9)).length,1);
const capturedReason=decodeURIComponent(capturedPayload.split(String.raw`\t`)[2]);
assert.equal(capturedReason,'[复制素材] 源文件没有可识别的格式后缀');
// 复现旧发送方式的故障；BridgeTalk额外转义反斜杠后，正则与分隔符同时失真。
const oldRawMessage=String.raw`(function(){var name="mask.psd",extension=name.match(/\.[^.]+$/);if(!extension)return ["ERROR",0,encodeURIComponent("[复制素材] 源文件没有可识别的格式后缀"),"","","",""].join("\t");return "OK";})()`;
assert.equal(vm.runInNewContext(oldRawMessage),'OK');
assert.equal(vm.runInNewContext(oldRawMessage.replace(/\\/g,'\\\\')),capturedPayload);
assert.equal((source.match(/add\("edittext"/g)||[]).length,1);
assert.ok(!/Folder\.selectDialog|SpotColor|\.applyEffect\(|\.flatten\(/.test(source));
assert.ok(!/\.native\b|\bnative\s*:/.test(source));
const worker=source.slice(source.indexOf('\n    function processInPhotoshop(')+1,source.lastIndexOf('\n})();'));
const math=worker.slice(worker.indexOf('        function pixelPlan('),worker.indexOf('        // Photoshop ATN'));
const mathContext=vm.createContext({});vm.runInContext(math,mathContext);
for(const [ppi,pixels] of [[300,1],[600,1],[1200,2],[2400,5]]){
 const p=mathContext.pixelPlan(600,400,600*72/ppi,400*72/ppi,0.05);
 assert.equal(p.pixels,pixels);assert.ok(Math.abs(p.ppi-ppi)<1e-8);
}
assert.throws(()=>mathContext.pixelPlan(600,400,72,72,0.05),/PPI/);
assert.throws(()=>mathContext.pixelPlan(600,400,600*72/150,400*72/150,0.05),/1–100/);

// 描述符模拟器使用Adobe公开的二进制结构；ATN读取器独立校验头、名称、引用、参数与结束位置。
function u32(v){const b=Buffer.alloc(4);b.writeUInt32BE(v>>>0);return b;}
function text16(s){const b=Buffer.from(s,'utf16le');b.swap16();return Buffer.concat([u32(s.length),b]);}
function id(s){return Buffer.concat([u32(s.length===4?0:Buffer.byteLength(s)),Buffer.from(s)]);}
function reference(items){return Buffer.concat([u32(items.length),...items.map(item=>{
 const base=[Buffer.from(item.type),text16(''),id(item.class)];
 if(item.type==='prop')base.push(id(item.property));
 if(item.type==='Enmr')base.push(id(item.enumType),id(item.enumValue));
 if(item.type==='name')base.push(text16(item.name));
 return Buffer.concat(base);
})]);}
function descriptor(data){return Buffer.concat([text16(''),id('null'),u32(Object.keys(data).length),...Object.entries(data).map(([key,v])=>{
 const parts=[id(key),Buffer.from(v.type)];
 if(v.type==='obj ')parts.push(reference(v.value));
 if(v.type==='UntF'){const b=Buffer.alloc(8);b.writeDoubleBE(v.value);parts.push(id(v.unit).subarray(4),b);}
 if(v.type==='enum')parts.push(id(v.enumType),id(v.value));
 if(v.type==='bool')parts.push(Buffer.from([v.value?1:0]));
 return Buffer.concat(parts);
})]);}
class ActionReference{
 constructor(){this.items=[];}
 putProperty(c,p){this.items.push({type:'prop',class:c,property:p});}
 putEnumerated(c,t,v){this.items.push({type:'Enmr',class:c,enumType:t,enumValue:v});}
 putName(c,n){this.items.push({type:'name',class:c,name:n});}
 putIndex(c,i){this.items.push({type:'index',class:c,index:i});}
}
class ActionDescriptor{
 constructor(){this.data={};}
 putReference(k,r){this.data[k]={type:'obj ',value:r.items};}
 putUnitDouble(k,u,v){this.data[k]={type:'UntF',unit:u,value:v};}
 putBoolean(k,v){this.data[k]={type:'bool',value:v};}
 putEnumerated(k,t,v){this.data[k]={type:'enum',enumType:t,value:v};}
 toStream(){return Buffer.concat([u32(16),descriptor(this.data)]).toString('latin1');}
}
function parseATN(binary){
 const b=Buffer.from(binary,'latin1');let pos=0;
 function take(n){assert.ok(pos+n<=b.length,'truncated ATN');const r=b.subarray(pos,pos+n);pos+=n;return r;}
 function num(){return take(4).readUInt32BE();}
 function uni(){const n=num(),r=Buffer.from(take(n*2));r.swap16();return r.toString('utf16le');}
 function name(){const s=uni();assert.ok(s.endsWith('\0'),'ATN name needs a terminator');return s.slice(0,-1);}
 function typeid(){const n=num();return take(n||4).toString();}
 function ref(){
  const out=[];for(let n=num();n;n--){const t=take(4).toString();uni();const c=typeid(),item={type:t,class:c};
   if(t==='prop')item.property=typeid();else if(t==='Enmr'){item.enumType=typeid();item.enumValue=typeid();}
   else if(t==='name')item.name=uni();else assert.fail('unsupported reference '+t);out.push(item);
  }return out;
 }
 function desc(){
  uni();typeid();const data={};for(let n=num();n;n--){const k=typeid(),t=take(4).toString(),v={type:t};
   if(t==='obj ')v.value=ref();else if(t==='UntF'){v.unit=take(4).toString();v.value=take(8).readDoubleBE();}
   else if(t==='enum'){v.enumType=typeid();v.value=typeid();}else if(t==='bool')v.value=take(1)[0]!==0;
   else assert.fail('unsupported descriptor '+t);data[k]=v;
  }return data;
 }
 assert.equal(num(),16);const setName=name();take(1);const actions={};
 for(let a=num();a;a--){take(6);const actionName=name();take(1);const steps=[];
  for(let n=num();n;n--){const flags=take(4);assert.equal(flags[1],1);assert.equal(flags[2],0);
   const kind=take(4).toString(),event=kind==='long'?take(4).toString():take(num()).toString();
   take(num());const marker=num();steps.push({event,data:marker===0xffffffff?desc():{}});
  }actions[actionName]=steps;
 }
 assert.equal(pos,b.length,'ATN has trailing or unread bytes');return {setName,actions};
}
function fileSystem(storage,options={}){
 function File(name){this.fsName=path.posix.normalize(String(name));this.name=path.posix.basename(this.fsName);this.parent={fsName:path.posix.dirname(this.fsName)};
  Object.defineProperty(this,'exists',{get:()=>storage.has(this.fsName)});
  Object.defineProperty(this,'length',{get:()=>String(storage.get(this.fsName)||'').length});
  this.copy=dest=>{
   assert.notEqual(dest,this.fsName,'never overwrite the source');assert.equal(path.posix.dirname(dest),this.parent.fsName);
   assert.equal(storage.has(dest),false,'never overwrite an existing output');
   if(options.copyFail)return false;
   storage.set(dest,options.shortCopy?'bad':storage.get(this.fsName));options.copies=(options.copies||0)+1;return true;
  };
  this.open=mode=>{if(options.atnWriteFail&&this.fsName.endsWith('.atn'))return false;this.mode=mode;return mode==='r'?storage.has(this.fsName):true;};
  this.write=value=>{let text=String(value);if(options.corruptATN&&this.fsName.endsWith('.atn'))text=text.replace(/\0/g,'\\x00');storage.set(this.fsName,text);return true;};
  this.read=()=>storage.get(this.fsName);this.close=()=>true;
  this.remove=()=>{assert.notEqual(this.fsName,'/mask.tif','never delete the source');storage.delete(this.fsName);return true;};
 }
 function Folder(name){this.fsName=String(name);this.exists=false;this.create=()=>true;}
 Folder.temp={fsName:'/tmp'};return {File,Folder};
}
function simulate(mm,options={}){
 const token=options.token||'test',receiptPath=options.receiptPath||'/tmp/result.txt';
 const storage=options.storage||new Map([['/mask.tif','original-file']]),sourceBytes=storage.get('/mask.tif'),{File,Folder}=fileSystem(storage,options);
 const original=Array.from({length:16},(_,i)=>i>=5&&i<=10?80:null);
 const makeLayer=(pixels,visible=true,style=false)=>({kind:'normal',pixels:pixels.slice(),visible,style,isBackgroundLayer:false});
 const originalLayers=[makeLayer(original,true,!!options.style),makeLayer(original.map(()=>0),false)];
 const originalDoc={fullName:{fsName:'/mask.tif'},saved:!options.dirty,layers:originalLayers,save(){assert.fail('saving original PS doc');},close(){assert.fail('closing original PS doc');}};
 const originalState=JSON.stringify(originalDoc),sets=new Map([['用户原有动作',{unchanged:true}]]),calls=[],copyDocs=[],savedDocs=[];
 const oldSetName='__YOUKAI_offset_1792046446262_659484863_0',oldSetName2='__YOUKAI_offset_1792046417855_113739013_0';
 if(options.staleSets){
  sets.set(oldSetName,{'选区扩缩':[{},{}],'填黑并取消选区':[{},{}]});
  sets.set('__YOUKAI_offset_1792046446262_659484863_1',{'用户自己的动作':[{},{}],'保留':[{},{}]});
  sets.set('__YOUKAI_offset_1792046446262_659484863_2',{'选区扩缩':[{},{}],'填黑并取消选区':[{},{}],'用户新增步骤':[]});
  sets.set('__YOUKAI_offset_1792046446262_659484863_3',{'选区扩缩':[{}],'填黑并取消选区':[{},{}]});
  sets.set('__YOUKAI_offset_custom',{'选区扩缩':[{},{}],'填黑并取消选区':[{},{}]});
  sets.set(oldSetName2,{'选区扩缩':[{},{}],'填黑并取消选区':[{},{}]});
 }
 const tempName='__YOUKAI_offset_'+token+'_0';
 if(options.collision)sets.set(tempName,{user:true});
 if(options.fileCollision)storage.set('/tmp/'+tempName+'.atn','external-file');
 if(options.outputCollision)storage.set('/mask_扩黑_0.05mm.tif','EXISTING');
 let closed=0,saves=0,deleteAttempts=0,refreshes=0;const deletedNames=[];
 const jobs=options.jobs||[{path:'/mask.tif',widthPt:16*72/600,heightPt:72/600}];
 function createCopy(file){
  let layers=[makeLayer(original,true,!!options.style)],selection=null;
  if(options.multi)layers.push(makeLayer(original.map((_,i)=>i===11?90:null)));
  const hidden=makeLayer(original.map(()=>0),false),component={kind:'component'};layers.push(hidden);
  const d={fullName:{fsName:file.fsName},mode:options.mode||'gray',bitsPerChannel:options.depth||'8',resolution:600,channels:[component],componentChannels:[component],
   width:{as:()=>16},height:{as:()=>1},layers,activeLayer:layers[0],hidden,
   save(){
    assert.notEqual(this.fullName.fsName,'/mask.tif','only save the copy');
    if(options.saveFail){storage.set(this.fullName.fsName,'partial-save');throw Error('disk full');}
    saves++;this.savedPixels=this.activeLayer.pixels.slice();savedDocs.push(this);
    storage.set(this.fullName.fsName,JSON.stringify(this.savedPixels));
   },
   close(){if(options.closeFail)throw Error('close failed');closed++;app.documents.splice(app.documents.indexOf(d),1);},
   mergeVisibleLayers(){
    if(options.mergeFail)throw Error('cannot merge');
    const visible=this.layers.filter(l=>l.visible),pixels=original.map(()=>null);
    for(const layer of visible){const source=layer.pixels.slice();
     if(layer.style){for(let i=0;i<16;i++)if(source[i]!==null){if(i>0)pixels[i-1]=50;if(i<15)pixels[i+1]=50;}}
     source.forEach((v,i)=>{if(v!==null)pixels[i]=v;});
    }
    const merged=makeLayer(pixels);if(options.background)merged.isBackgroundLayer=true;
    this.layers=[merged,...this.layers.filter(l=>!l.visible)];this.activeLayer=merged;
   }
  };
  d.artLayers={add(){const layer=makeLayer(original.map(()=>null));d.layers.unshift(layer);return layer;}};
  function addChannel(){const c={mask:null,remove(){const n=d.channels.indexOf(c);if(n>=0)d.channels.splice(n,1);}};d.channels.push(c);return c;}
  d.channels.add=addChannel;
  d.selection={deselect(){selection=null;},selectAll(){selection=original.map(()=>true);},
   store(c){c.mask=selection.slice();},load(c){selection=c.mask.slice();},
   clear(){assert.equal(d.activeLayer.isBackgroundLayer,false);d.activeLayer.pixels=original.map(()=>null);}};
  Object.defineProperty(d.selection,'bounds',{get:()=>{if(!selection||!selection.some(Boolean))throw Error('empty');return [0,0,16,1];}});
  d.runSteps=(steps,setName)=>{
   for(const {event,data} of steps){
    if(event==='setd'){
     if(data['T   '].type==='enum'){assert.equal(data['T   '].value,'None');selection=null;}
     else {assert.equal(data['T   '].value[0].enumValue,'Trsp');selection=d.activeLayer.pixels.map(p=>p!==null);}
    } else if(event==='Expn'||event==='Cntc'){
     assert.equal(data['By  '].unit,'#Pxl');const r=data['By  '].value,index=Number(setName.split('_').pop()),ppi=16*72/jobs[index].widthPt;
     assert.equal(r,Math.round(Math.abs(mm)*ppi/25.4));
     assert.equal(data.selectionModifyEffectAtCanvasBounds.value,false);d.selection.bounds;const before=selection.slice();
     selection=before.map((v,i)=>event==='Expn'?before.some((q,j)=>q&&Math.abs(i-j)<=r):v&&Array.from({length:r*2+1},(_,j)=>before[i-r+j]||false).every(Boolean));
    } else if(event==='Fl  '){
     if(options.fillFail)throw Error('fill failed');d.selection.bounds;
     assert.equal(data.Usng.value,'Blck');assert.equal(data.Opct.value,100);assert.equal(data['Md  '].value,'Nrml');assert.equal(data.PrsT.value,false);
     d.activeLayer.pixels=d.activeLayer.pixels.map((p,i)=>selection[i]?0:p);
     if(options.modeChange)d.mode='rgb';if(options.saveTargetChange)d.fullName.fsName='/mask.tif';
    } else assert.fail('unexpected step '+event);
   }
  };
  return d;
 }
 const app={documents:options.borrowed?[originalDoc]:[],activeDocument:options.borrowed?originalDoc:null,displayDialogs:'ask',preferences:{rulerUnits:'mm'},foregroundColor:{user:'red'},refresh(){refreshes++;},
  open(file){assert.notEqual(file.fsName,'/mask.tif','never open the source');
   if(options.openFail)throw Error('cannot open copy');if(options.wrongOpen)return originalDoc;
   const d=createCopy(file);copyDocs.push(d);this.documents.push(d);this.activeDocument=d;return d;
  },
  load(file){
   assert.equal(file.encoding,'BINARY');const bytes=storage.get(file.fsName);assert.equal(bytes.charCodeAt(0),0);assert.ok(!bytes.startsWith('\\x00'));
   const parsed=parseATN(bytes);assert.equal(sets.has(parsed.setName),false);calls.push('load');
   if(options.silentLoadFail)return;
   sets.set(parsed.setName,parsed.actions);if(options.loadFail)throw Error('partial load failure');
  },
  doAction(name,setName){
   assert.ok(setName.startsWith('__YOUKAI_offset_'+token+'_'));calls.push(name);const steps=sets.get(setName)[name];assert.ok(steps);
   this.activeDocument.runSteps(steps,setName);
  }
 };
 const ctx=vm.createContext({app,File,Folder,Date,encodeURIComponent,decodeURI,Error,ActionDescriptor,ActionReference,charIDToTypeID:s=>s,stringIDToTypeID:s=>s,
  executeActionGet(ref){
   const setRef=ref.items.find(r=>r.class==='ASet');assert.ok(setRef);
   if(options.nameQueryFail&&setRef.type==='name')throw Error('name lookup unavailable');
   const name=setRef.type==='index'?[...sets.keys()][setRef.index-1]:setRef.name;
   if(!sets.has(name))throw Error('no action set');
   const actions=sets.get(name),actionRef=ref.items.find(r=>r.class==='Actn');
   const actionName=actionRef?Object.keys(actions)[actionRef.index-1]:null;
   if(actionRef&&!actionName)throw Error('no action');
   return {getString(k){assert.equal(k,'Nm  ');return actionRef?actionName:name;},getInteger(k){assert.equal(k,'NmbC');return actionRef?actions[actionName].length:Object.keys(actions).length;}};
  },
  executeAction(event,desc){
   assert.equal(event,'Dlt ');const ref=desc.data.null.value;assert.equal(ref[0].class,'ASet');
   const name=ref[0].type==='index'?[...sets.keys()][ref[0].index-1]:ref[0].name;
   assert.ok(name&&name.startsWith('__YOUKAI_offset_'));assert.notEqual(name,'用户原有动作');deleteAttempts++;
   if(options.cleanupFail)throw Error('delete failed');
   if(options.nameDeleteFail&&ref[0].type==='name')throw Error('cannot delete by name');
   if(options.indexDeleteFail&&ref[0].type==='index')throw Error('cannot delete by index');
   if(options.transientCleanupOnce&&deleteAttempts===1)throw Error('action still busy');
   if(options.silentCleanupAlways||(options.silentCleanupOnce&&deleteAttempts===1))return;
   if(options.cleanupNeedsClose&&copyDocs.some(d=>app.documents.includes(d)))throw Error('document still open');
   sets.delete(name);calls.push('delete');deletedNames.push(name);
  },
  $:{os:'Windows',level:7,sleep(){}},DialogModes:{NO:'no'},Units:{PIXELS:'px'},DocumentMode:{GRAYSCALE:'gray'},BitsPerChannelType:{EIGHT:'8',SIXTEEN:'16'},
  LayerKind:{NORMAL:'normal'},ChannelType:{SPOTCOLOR:'spot'},SelectionType:{REPLACE:'replace'},SaveOptions:{DONOTSAVECHANGES:'discard'}});
 ctx.$.evalFile=file=>{
  assert.ok(file.fsName.endsWith('.jsx'));assert.ok(storage.has(file.fsName),'PS must read the locally written worker');
  return vm.runInContext(storage.get(file.fsName),ctx,{filename:file.fsName});
 };
 if(options.body){
  assert.match(options.body,/^\$\.evalFile\(new File\(decodeURIComponent\("[^"]+"\)\)\);$/);
  assert.equal(options.body.includes('\\'),false,'BridgeTalk bootstrap must contain no backslashes');
  assert.equal(options.body.includes('processInPhotoshop'),false,'worker source must not pass through BridgeTalk');
 }
 // 对实际启动消息施加与现场故障相同的额外反斜杠转义；本地JSX内容保持原样。
 const result=options.body?vm.runInContext(options.body.replace(/\\/g,'\\\\'),ctx):vm.runInContext('('+worker+')',ctx)(mm,jobs,token,receiptPath);
 assert.equal(app.displayDialogs,'ask');assert.equal(app.preferences.rulerUnits,'mm');assert.equal(ctx.$.level,7);
 assert.deepEqual(app.foregroundColor,{user:'red'});assert.equal(storage.get(receiptPath),result);assert.ok(sets.has('用户原有动作'));
 assert.equal(storage.get('/mask.tif'),sourceBytes,'source bytes must remain identical');
 assert.equal(JSON.stringify(originalDoc),originalState,'original open PS document must be untouched');
 if(options.borrowed)assert.equal(app.activeDocument,originalDoc);
 return {result,rows:decodeURIComponent(result.split('|').slice(2).join('|')).split('\n'),disk:savedDocs[0]?.savedPixels,saves,closed,sets,calls,storage,copyDocs,savedDocs,copies:options.copies||0,deleteAttempts,deletedNames,refreshes};
}
let p=simulate(0.05);assert.match(p.rows[0],/^OK\t/);assert.equal(p.disk.filter(v=>v===0).length,8);assert.equal(p.disk.filter(v=>v===null).length,8);
assert.equal(decodeURIComponent(p.rows[0].split('\t')[5]),'/mask_扩黑_0.05mm.tif');
assert.equal(p.saves,1);assert.equal(p.closed,1);assert.equal(p.copies,1);assert.equal(p.sets.size,1);assert.deepEqual(p.calls,['load','选区扩缩','填黑并取消选区','delete']);
assert.ok(![...p.storage.keys()].some(k=>k.endsWith('.atn')));
p=simulate(-0.05);assert.equal(p.disk.filter(v=>v===0).length,4);assert.equal(p.disk.filter(v=>v===null).length,12);
p=simulate(0.05,{multi:true,style:true,depth:'16'});assert.equal(p.disk.filter(v=>v===0).length,10);assert.equal(p.savedDocs[0].layers.length,2);assert.equal(p.savedDocs[0].layers[1],p.savedDocs[0].hidden);
p=simulate(0.05,{borrowed:true,dirty:true});assert.equal(p.saves,1);assert.equal(p.closed,1,'close only the new copy even when original is open and dirty');
for(const failure of ['fillFail','saveFail','copyFail','shortCopy','modeChange','mergeFail','loadFail','silentLoadFail','atnWriteFail','corruptATN','background','openFail','wrongOpen','saveTargetChange']){
 p=simulate(0.05,{[failure]:true});assert.match(p.rows[0],/^ERROR\t/);assert.equal(p.saves,0);assert.equal(p.sets.size,1);
 assert.ok(![...p.storage.keys()].some(k=>k.endsWith('.atn')));
 assert.ok(![...p.storage.keys()].some(k=>k.startsWith('/mask_')),'failed run must remove only its new output');
}
p=simulate(0.05,{silentLoadFail:true});assert.match(decodeURIComponent(p.rows[0].split('\t')[2]),/载入临时动作.*未成功载入/);assert.deepEqual(p.calls,['load']);
p=simulate(0.05,{corruptATN:true});assert.match(decodeURIComponent(p.rows[0].split('\t')[2]),/临时PS动作文件/);assert.equal(p.calls.length,0);
p=simulate(0.05,{collision:true});assert.equal(p.sets.size,2);assert.equal(p.sets.get('__YOUKAI_offset_test_0').user,true);assert.equal(p.saves,0);
p=simulate(0.05,{fileCollision:true});assert.equal(p.storage.get('/tmp/__YOUKAI_offset_test_0.atn'),'external-file');assert.equal(p.saves,0);
p=simulate(0.05,{outputCollision:true});assert.equal(p.storage.get('/mask_扩黑_0.05mm.tif'),'EXISTING');assert.equal(decodeURIComponent(p.rows[0].split('\t')[5]),'/mask_扩黑_0.05mm_001.tif');
p=simulate(0.05,{cleanupFail:true});assert.match(p.rows[0],/^OK\t/);assert.match(decodeURIComponent(p.rows[0].split('\t')[6]),/未能删除/);assert.equal(p.saves,1);
assert.equal(p.deleteAttempts,3);assert.equal(p.sets.size,2);
for(const retry of ['nameDeleteFail','indexDeleteFail','nameQueryFail','transientCleanupOnce','silentCleanupOnce','cleanupNeedsClose']){
 p=simulate(0.05,{[retry]:true});assert.equal(p.saves,1);assert.equal(p.sets.size,1);assert.equal(p.rows[0].split('\t')[6],'');
 if(['indexDeleteFail','transientCleanupOnce','silentCleanupOnce'].includes(retry)){assert.equal(p.deleteAttempts,2);assert.equal(p.refreshes,1);}
}
p=simulate(0.05,{silentCleanupAlways:true});assert.equal(p.sets.size,2);assert.equal(p.deleteAttempts,3);
assert.match(decodeURIComponent(p.rows[0].split('\t')[6]),/动作集仍存在/,'silent deletion failure must be reported');
p=simulate(0.05,{staleSets:true});
assert.deepEqual(p.deletedNames.slice(0,2),['__YOUKAI_offset_1792046417855_113739013_0','__YOUKAI_offset_1792046446262_659484863_0']);
assert.equal(p.sets.size,5,'preserve user sets, similar names, extra actions and modified step counts');
for(const name of ['__YOUKAI_offset_custom','__YOUKAI_offset_1792046446262_659484863_1','__YOUKAI_offset_1792046446262_659484863_2','__YOUKAI_offset_1792046446262_659484863_3'])assert.ok(p.sets.has(name));
p=simulate(0.05,{staleSets:true,cleanupFail:true});assert.equal(p.sets.size,8);assert.match(decodeURIComponent(p.rows[0].split('\t')[6]),/旧临时动作集未能删除/);
p=simulate(0.05,{mode:'rgb'});assert.equal(p.saves,0);assert.ok(!p.storage.has('/mask_扩黑_0.05mm.tif'));
p=simulate(-1);assert.match(p.rows[0],/^ERROR\t/);assert.equal(p.saves,0);
p=simulate(0.1,{jobs:[{path:'/mask.tif',widthPt:16*72/600,heightPt:72/600},{path:'/mask.tif',widthPt:16*72/300,heightPt:72/300}]});
assert.equal(p.saves,2);assert.equal(p.rows[0].split('\t')[3],'2');assert.equal(p.rows[1].split('\t')[3],'1');

// 临时JSX本地执行：覆盖消息额外转义和反编译异常，确保不传源代码、不依赖Function.toString。
// 回执测试也覆盖空/BOM/CRLF、原稿路径拒绝、只重链接选中引用和用户运行中改链接。
function aiFixture(items,options={}){
 const sent=[],alerts=[],storage=new Map([['/mask.tif','original-file'],['/script.jsx',source]]),{File,Folder}=fileSystem(storage);
 if(options.tempPath)Folder.temp.fsName=options.tempPath;
 let inCallback=false,active=null,queued=null,clock=1792046446262,activations=0,callbackAccesses=0,fronts=0;
 function guard(){if(inCallback){callbackAccesses++;throw Error('there is no document');}if(active!==doc)throw Error('original document is not active');}
 const doc={selection:items,placedItems:options.allItems||items.filter(i=>i.typename==='PlacedItem'),activate(){
  if(inCallback){callbackAccesses++;throw Error('there is no document');}
  if(!app.documents.includes(doc))throw Error('document closed');activations++;active=doc;
 }};
 active=doc;
 // 模拟AI回调没有文档上下文，并要求先激活原文档才能读取/替换其对象。
 for(const item of new Set([...items,...doc.placedItems]))if(item.typename==='PlacedItem')for(const prop of ['file','matrix','boundingBox']){
  let value=item[prop];Object.defineProperty(item,prop,{get(){guard();return value;},set(v){guard();value=v;},configurable:true});
 }
 const app={documents:[doc],version:'30',get activeDocument(){guard();return active;},redraw(){if(inCallback){callbackAccesses++;throw Error('there is no document');}}};
 const api={sent,alerts,storage,doc,app};
 function taskInfo(){
  api.receiptPath=[...storage.keys()].find(k=>k.includes('YOUKAI_offset_')&&k.endsWith('.txt'));
  api.workerPath=[...storage.keys()].find(k=>k.includes('YOUKAI_offset_')&&k.endsWith('.jsx'));
  api.token=api.receiptPath?storage.get(api.receiptPath).split('|')[1]:null;
  api.workerSource=storage.get(api.workerPath);
 }
 function callCallback(message,name,body){inCallback=true;try{message[name]({body});}finally{inCallback=false;}}
 function runPS(){api.ps=simulate(options.mm===undefined?0.05:options.mm,{body:sent[0].body,storage,receiptPath:api.receiptPath,token:api.token,jobs:options.jobs});return api.ps.result;}
 function deliver(message){
  const result=options.respond?options.respond(api):runPS();
  if(options.beforeReply)options.beforeReply(api);
  active=options.otherDocument||null;
  if(options.otherDocument)app.documents.push(options.otherDocument);
  if(options.closeOriginal)app.documents=app.documents.filter(d=>d!==doc);
  callCallback(message,options.errorCallback?'onError':'onResult',options.replyBody===undefined?result:options.replyBody);
 }
 function ui(type,text){return {type,text,children:[],add(t,unused,txt){const e=ui(t,txt);this.children.push(e);return e;},close(){},
  show(){const all=[];function walk(e){all.push(e);e.children.forEach(walk);}walk(this);if(options.mm!==undefined)all.find(e=>e.type==='edittext').text=String(options.mm);
   all.find(e=>e.type==='button'&&e.text==='执行').onClick();return 1;}};}
 function Window(){return ui('dialog');}
 function BridgeTalk(){sent.push(this);this.send=seconds=>{
  this.dispatched=true;this.waitSeconds=seconds;taskInfo();
  if(options.noReply){clock+=600001;return false;}
  if(options.timeout){callCallback(this,'onTimeout','');return false;}
  if(options.queued){queued=()=>deliver(this);return false;}
  deliver(this);return true;
 };}
 BridgeTalk.getSpecifier=()=> 'photoshop-27';BridgeTalk.appSpecifier='illustrator-30';
 BridgeTalk.bringToFront=name=>{assert.equal(inCallback,false);assert.equal(name,'illustrator-30');fronts++;};
 BridgeTalk.pump=()=>{if(queued){const f=queued;queued=null;f();}};
 function FakeDate(){this.getTime=()=>clock;}
 const ctx=vm.createContext({app,$:{os:'Windows',global:{},fileName:'/script.jsx',sleep:ms=>{clock+=ms;}},Date:FakeDate,File,Folder,Window,BridgeTalk,alert:t=>alerts.push(t)});
 vm.runInContext('Function.prototype.toString = function(){throw Error("broken ExtendScript decompiler");};',ctx);
 if(options.legacySplit)vm.runInContext('var originalSplit=String.prototype.split;String.prototype.split=function(s){var parts=originalSplit.call(this,s);while(parts.length&&parts[parts.length-1]==="")parts.pop();return parts;};',ctx);
 vm.runInContext(source,ctx);
 api.ctx=ctx;api.sent=sent.filter(b=>b.dispatched);
 api.counts=()=>({activations,callbackAccesses,fronts});
 api.deliverLate=()=>callCallback(sent[0],'onResult',runPS());
 api.resume=()=>vm.runInContext(source,ctx);
 return api;
}
function placed(scale=1){return {typename:'PlacedItem',file:{fsName:'/mask.tif',name:'mask.tif',exists:true},boundingBox:[0,72/600,16*72/600,0],
 matrix:{mValueA:scale,mValueB:0,mValueC:0,mValueD:scale},relinks:0,relink(file){if(this.failRelink)throw Error('item locked');this.relinks++;this.file=file;}};}
function frame(ai,text){return 'YK_OFFSET_5|'+ai.token+'|'+encodeURIComponent(text);}
function successRow(file='/mask_扩黑_0.05mm.tif'){return 'OK\t0\t600\t1\t0.042333333\t'+encodeURIComponent(file)+'\t';}
function prepared(ai){ai.storage.set('/mask_扩黑_0.05mm.tif','PROCESSED');}
let a=placed(),b=placed(),unselected=placed(),ai=aiFixture([a,b],{allItems:[a,b,unselected],replyBody:''});
assert.equal(ai.sent.length,1);assert.equal(ai.sent[0].waitSeconds,600);assert.equal(ai.ctx.$.global.YK_OFFSET_V2_TASK,null);
assert.equal((ai.workerSource.match(/path:\"\/mask.tif\"/g)||[]).length,1);
p=ai.ps;assert.ok(p.result.startsWith('YK_OFFSET_5|'));
assert.ok(!decodeURIComponent(p.result.split('|')[2]).includes('\\t'),'local worker must produce real delimiters');
assert.equal(a.relinks,1);assert.equal(b.relinks,1);assert.equal(unselected.relinks,0);assert.equal(a.file.fsName,'/mask_扩黑_0.05mm.tif');
assert.deepEqual(ai.counts(),{activations:1,callbackAccesses:0,fronts:1});
assert.match(ai.alerts[0],/已生成 1\/1/);assert.equal(ai.storage.has(ai.receiptPath),false);assert.equal(ai.storage.has(ai.workerPath),false);
a=placed();ai=aiFixture([a],{respond(ai){prepared(ai);return '\uFEFF\r\n'+frame(ai,successRow())+'\r\n';}});assert.equal(a.relinks,1);
a=placed();ai=aiFixture([a],{errorCallback:true,replyBody:'undefined'});assert.equal(a.relinks,1);assert.equal(ai.counts().callbackAccesses,0);
a=placed();ai=aiFixture([a],{respond(){return 'undefined';}});assert.equal(a.relinks,0);assert.match(ai.alerts[0],/回传内容：undefined/);
assert.ok(ai.storage.has(ai.receiptPath));assert.ok(ai.storage.has(ai.workerPath),'retain diagnostics when result cannot be validated');
a=placed();ai=aiFixture([a],{legacySplit:true});assert.equal(a.relinks,1);
a=placed();ai=aiFixture([a],{legacySplit:true,respond:ai=>frame(ai,['ERROR',0,encodeURIComponent(capturedReason),'','','',''].join('\t'))});
assert.equal(a.relinks,0);assert.ok(ai.alerts[0].includes(capturedReason));assert.ok(!ai.alerts[0].includes('回执格式'));assert.equal(ai.storage.has(ai.workerPath),false);
a=placed();ai=aiFixture([a],{respond:ai=>frame(ai,capturedPayload)});assert.equal(a.relinks,0);assert.ok(ai.alerts[0].includes('诊断回执：'));assert.ok(ai.storage.has(ai.workerPath));
a=placed();ai=aiFixture([a],{respond:ai=>frame(ai,successRow('/mask.tif'))});assert.equal(a.relinks,0);assert.match(ai.alerts[0],/不是有效的同目录副本/);
a=placed();ai=aiFixture([a],{beforeReply(){a.file={fsName:'/manually-changed.tif'};}});assert.equal(a.relinks,0);assert.match(ai.alerts[0],/对象已改链接/);
a=placed();a.failRelink=true;ai=aiFixture([a]);assert.equal(a.relinks,0);assert.ok(ai.storage.has('/mask_扩黑_0.05mm.tif'));
a=placed();ai=aiFixture([a],{respond(ai){prepared(ai);return frame(ai,successRow()+'\n'+successRow());}});assert.equal(a.relinks,0);assert.match(ai.alerts[0],/格式或序号/);
ai=aiFixture([placed(1),placed(2)],{mm:0.1,jobs:[{path:'/mask.tif',widthPt:16*72/600,heightPt:72/600},{path:'/mask.tif',widthPt:16*72/300,heightPt:72/300}]});
assert.equal(ai.sent.length,1);assert.equal((ai.workerSource.match(/path:\"\/mask.tif\"/g)||[]).length,2);
assert.equal(ai.doc.selection[0].file.fsName,'/mask_扩黑_0.1mm.tif');assert.equal(ai.doc.selection[1].file.fsName,'/mask_扩黑_0.1mm_001.tif');
// 包含空格、中文及Windows反斜杠的临时目录也仅经URI传送，避免路径转义失真。
a=placed();ai=aiFixture([a],{tempPath:'C:\\Users\\设计 师\\Temp'});
assert.ok(ai.sent[0].body.includes('%5C'));assert.ok(!ai.sent[0].body.includes('\\'));
assert.equal(a.relinks,1);
// 冷启动排队、切到另一个同链接文档、原文档关闭和迟到结果均不得改错对象或重跑PS。
a=placed();ai=aiFixture([a],{queued:true});assert.equal(a.relinks,1);assert.equal(ai.sent.length,1);assert.equal(ai.counts().callbackAccesses,0);
const otherItem=placed(),otherDoc={placedItems:[otherItem]};a=placed();ai=aiFixture([a],{otherDocument:otherDoc});
assert.equal(a.relinks,1);assert.equal(otherItem.relinks,0);assert.equal(ai.counts().activations,1);
a=placed();ai=aiFixture([a],{closeOriginal:true,otherDocument:otherDoc});assert.equal(a.relinks,0);assert.equal(otherItem.relinks,0);
assert.match(ai.alerts[0],/原AI文档已关闭/);assert.ok(ai.storage.has('/mask_扩黑_0.05mm.tif'));
a=placed();ai=aiFixture([a],{noReply:true});assert.equal(a.relinks,0);assert.ok(ai.ctx.$.global.YK_OFFSET_V2_TASK);assert.match(ai.alerts[0],/接续重新链接/);
ai.deliverLate();assert.equal(a.relinks,0,'late callback only receives text');ai.resume();assert.equal(a.relinks,1);assert.equal(ai.sent.length,1);
assert.equal(ai.ps.copies,1);assert.equal(ai.ctx.$.global.YK_OFFSET_V2_TASK,null);assert.equal(ai.counts().callbackAccesses,0);
a=placed();ai=aiFixture([a],{timeout:true});assert.equal(a.relinks,0);assert.equal(ai.ctx.$.global.YK_OFFSET_V2_TASK,null);assert.match(ai.alerts[0],/未能及时接收任务/);
ai=aiFixture([{typename:'PathItem'}]);assert.equal(ai.sent.length,0);assert.match(ai.alerts[0],/没有可处理/);
console.log('PASS: action deletion verified after document close; index/name fallback and transient/silent-failure retry; strict old-set recognition preserves user/modified sets; success/partial-load/failure cleanup; original files untouched; callback-safe selected-only AI relink; cold-start/late-result resume; native escaping fixture; local JSX/Unicode/PPI/ATN; receipt fallback. Adobe NOT launched.');
