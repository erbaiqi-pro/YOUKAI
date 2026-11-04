/* YOUKAI 1.0 | 作者：二百七 | Copyright (c) 2026 二百七 | SPDX-License-Identifier: MIT */
const fs = require('fs');
const path = require('path');
const vm = require('vm');
const assert = require('assert/strict');
const root = path.resolve(__dirname, '..');
const extension = path.join(root, 'com.youkai.toolbox');
let checks = 0;
function check(name, fn) { fn(); checks++; console.log('PASS ' + name); }
function walk(dir) { return fs.readdirSync(dir, {withFileTypes:true}).flatMap(e => e.isDirectory() ? walk(path.join(dir,e.name)) : [path.join(dir,e.name)]); }
for (const file of walk(extension).filter(f => /\.(js|jsx)$/.test(f))) {
  check('syntax: ' + path.relative(extension,file), () => new vm.Script(fs.readFileSync(file,'utf8').replace(/^\uFEFF/,'').replace(/^#.*$/gm,''), {filename:file}));
}
const hostSource = fs.readFileSync(path.join(extension,'scripts/main.jsx'),'utf8');
function host(options = {}) {
  const existing = new Set(['input.ai','task.jsx']);
  let closed = 0, saved = [], evaluated = 0;
  const doc = {fullName: {fsName:'input.ai'}, saveAs(file) { if(options.saveError) throw Error('disk full'); saved.push(file.fsName); }, close() {closed++;}};
  function File(name) { this.fsName = String(name); this.name = this.fsName.split('/').pop(); this.exists = existing.has(this.fsName); }
  const app = {name:options.host || 'Adobe Illustrator', documents:options.preopen ? [doc] : [{fullName:{fsName:'unrelated.ai'},close(){throw Error('wrong document closed');}}], open() { if(options.openError) throw Error('cannot open'); return doc; }};
  const globals = {YOUKAI_BATCH:false, YOUKAI_BATCH_SOURCE_FILE:'before', YOUKAI_OUTPUT_FOLDER:'before-output'};
  const ctx = vm.createContext({app, File, Folder:function(){}, JSON, Date, Error, IllustratorSaveOptions:function(){}, SaveOptions:{DONOTSAVECHANGES:0}, $:{global:globals,os:'Windows',evalFile(scriptPath){assert.equal(typeof scriptPath,'string');evaluated++; if(options.scriptError) throw Error('script failed'); doc.fullName = {fsName:'package/copy.ai'};},sleep(){}}});
  vm.runInContext(hostSource,ctx);
  const result = JSON.parse(ctx.Youkai.processSingleFileForBatch(JSON.stringify({targetFile:'input.ai',scriptPaths:[options.missingScript?'missing.jsx':'task.jsx'],saveSource:!!options.saveSource})));
  return {result, closed, saved, evaluated, globals};
}
check('open failure preserves unrelated document', () => {const t=host({openError:true});assert.equal(t.result.ok,false);assert.equal(t.closed,0);});
check('already-open target runs and closes with source saving disabled', () => {const t=host({preopen:true});assert.equal(t.result.ok,true);assert.equal(t.evaluated,1);assert.equal(t.closed,1);assert.deepEqual(t.saved,[]);});
check('already-open target saves to the input path when requested', () => {const t=host({preopen:true,saveSource:true});assert.equal(t.result.ok,true);assert.equal(t.evaluated,1);assert.equal(t.closed,1);assert.deepEqual(t.saved,['input.ai']);});
check('a missing script leaves an already-open target untouched', () => {const t=host({preopen:true,missingScript:true});assert.equal(t.result.ok,false);assert.equal(t.evaluated,0);assert.equal(t.closed,0);assert.deepEqual(t.saved,[]);});
check('missing script fails before opening', () => {const t=host({missingScript:true});assert.equal(t.result.ok,false);assert.equal(t.closed,0);});
check('failed script closes owned document and resets batch globals', () => {const t=host({scriptError:true});assert.equal(t.result.ok,false);assert.equal(t.closed,1);assert.equal(t.globals.YOUKAI_BATCH,false);assert.equal(t.globals.YOUKAI_BATCH_SOURCE_FILE,'before');});
check('save failure is reported', () => {const t=host({saveSource:true,saveError:true});assert.equal(t.result.ok,false);assert.equal(t.closed,1);});
check('save targets original input after package save-as', () => {const t=host({saveSource:true});assert.equal(t.result.ok,true);assert.deepEqual(t.saved,['input.ai']);});
check('save disabled leaves source untouched', () => {const t=host();assert.equal(t.result.ok,true);assert.equal(t.saved.length,0);});
check('unsupported host is rejected', () => assert.equal(host({host:'Adobe Photoshop'}).result.ok,false));

function batchScanFixture() {
  const tree=new Map([
    ['/package',['normal.ai','links','LINK','linker','one']],
    ['/package/links',['reference.ai']],['/package/LINK',['reference.ai']],
    ['/package/linker',['allowed.ai']],['/package/one',['nested.ai','LiNkS']],
    ['/package/one/LiNkS',['reference.ai','inside']],['/package/one/LiNkS/inside',['reference.ai']]
  ]),reads=[],runs=[];
  function File(p) {this.fsName=String(p);this.name=this.fsName.split('/').pop();this.exists=true;}
  function Folder(p) {this.fsName=String(p);this.name=this.fsName.split('/').pop();this.exists=tree.has(this.fsName);this.getFiles=()=>{reads.push(this.fsName);return tree.get(this.fsName).map(name=>{const child=this.fsName+'/'+name;return tree.has(child)?new Folder(child):new File(child);});};}
  const ctx=vm.createContext({File,Folder,JSON,Error,app:{name:'Adobe Illustrator',open(){throw Error('protected input must not be opened');}},$:{global:{},evalFile:p=>runs.push(p)}});
  vm.runInContext(hostSource,ctx);
  return{ctx,reads,runs};
}
check('batch scanner skips link folders but retains similar names',()=>{
  const t=batchScanFixture(),files=t.ctx.Youkai.getAllAIFiles('/package');
  assert.deepEqual(Array.from(files,f=>f.fsName),['/package/normal.ai','/package/linker/allowed.ai','/package/one/nested.ai']);
  assert(!t.reads.some(p=>/(^|\/)links?(\/|$)/i.test(p)));
});
check('batch scanner rejects a link root or a root below links before reading files',()=>{
  for(const folder of ['/package/links','/package/LINK','/package/one/LiNkS/inside']){const t=batchScanFixture();assert.equal(t.ctx.Youkai.getAllAIFiles(folder).length,0);assert.deepEqual(t.reads,[]);}
});
check('batch protection covers Windows and Unix ancestor segments without partial-name matches',()=>{
  const t=batchScanFixture(),skip=t.ctx.Youkai.isSkipBatchPath;
  for(const p of ['E:\\package\\LINK\\inside\\a.ai','/package/links/a.ai','link','/links/'])assert.equal(skip(p),true,p);
  for(const p of ['E:\\package\\linker\\a.ai','/package/mylinks/a.ai','/package/link.ai'])assert.equal(skip(p),false,p);
});
check('both annotation tools are blocked before protected batch files open',()=>{
  for(const name of ['集体注释.jsx','按注释批量修改.jsx'])for(const targetFile of ['/package/links/reference.ai','E:\\package\\LiNk\\inside\\reference.ai']){
    const t=batchScanFixture(),result=JSON.parse(t.ctx.Youkai.processSingleFileForBatch(JSON.stringify({targetFile,scriptPaths:['/scripts/'+name],saveSource:true})));
    assert.equal(result.ok,false);assert.match(result.message,/保护跳过/);assert.deepEqual(t.runs,[]);
  }
});

function openCsv(options={}) {
  const calls=[];
  function File(value) {this.fsName=String(value);this.name=this.fsName.split(/[\\/]/).pop();this.exists=!options.missing;this.error=options.error||'';this.execute=()=>{calls.push(this.fsName);if(options.throw)throw Error('association failed');return !options.denied;};}
  const ctx=vm.createContext({File,$:{global:{}},JSON,Error});
  vm.runInContext(hostSource,ctx);
  const filePath=options.path||'C:\\设计 文件\\100% & 测试\\导出指定图层.csv';
  return{result:JSON.parse(ctx.Youkai.openCsvFile(filePath)),calls,filePath};
}
check('CSV launch uses native file association with the original Unicode path and no open document',()=>{const t=openCsv();assert.equal(t.result.ok,true);assert.deepEqual(t.calls,[t.filePath]);});
check('missing CSV fails before invoking the default application',()=>{const t=openCsv({missing:true});assert.equal(t.result.ok,false);assert.equal(t.calls.length,0);});
check('a real file-association failure is reported',()=>{const t=openCsv({denied:true,error:'No application associated'});assert.equal(t.result.ok,false);assert.match(t.result.message,/No application associated/);});
check('CSV association exceptions produce a structured failure',()=>{assert.equal(openCsv({throw:true}).result.ok,false);});
check('CSV launcher does not execute other file types',()=>{const t=openCsv({path:'C:\\data\\task.jsx'});assert.equal(t.result.ok,false);assert.equal(t.calls.length,0);});

// Verify the package script with source files of equal size and identical names.
check('package preserves source and distinct same-size links', () => {
  const files = new Set(['/source/a/photo.png','/source/b/photo.png']);
  const directories = new Set(['/','/output']);
  let sourceSaves=0;
  function Folder(name) {this.fsName=String(name);this.exists=directories.has(this.fsName);this.create=()=>{directories.add(this.fsName);this.exists=true;return true;};Object.defineProperty(this,'parent',{get:()=>new Folder(path.posix.dirname(this.fsName))});}
  function File(name) {this.fsName=String(name);this.name=path.posix.basename(this.fsName);this.length=100;Object.defineProperty(this,'exists',{get:()=>files.has(this.fsName)});this.copy=target=>{files.add(target.fsName);return true;};this.open=()=>false;}
  const doc={name:'sample.ai',layers:[],selection:[],placedItems:[{file:new File('/source/a/photo.png')},{file:new File('/source/b/photo.png')},{file:new File('/source/a/photo.png')}],rasterItems:[],save(){sourceSaves++;},saveAs(){}};
  const ctx=vm.createContext({app:{activeDocument:doc,redraw(){},executeMenuCommand(){}},File,Folder,IllustratorSaveOptions:function(){},Date,Error,$:{global:{YOUKAI_OUTPUT_FOLDER:'/output'},sleep(){}}});
  vm.runInContext(fs.readFileSync(path.join(extension,'user_scripts/打包.jsx'),'utf8'),ctx);
  assert.equal(sourceSaves,0);assert.notEqual(doc.placedItems[0].file.fsName,doc.placedItems[1].file.fsName);assert.equal(doc.placedItems[0].file.fsName,doc.placedItems[2].file.fsName);
});
console.log(`${checks} checks passed.`);
require('./align-check.cjs');
require('./artboard-delete-check.cjs');
require('./check-offset.cjs');
require('./release-check.cjs');
require('./note-edit-check.cjs');
require('./update-check.cjs');
