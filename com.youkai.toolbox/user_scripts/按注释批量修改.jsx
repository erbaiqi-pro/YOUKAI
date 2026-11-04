#target illustrator
/* YOUKAI-PROVENANCE-BEGIN
 * YOUKAI 1.0 | 按注释批量修改 | 作者：二百七
 * Copyright (c) 2026 二百七 | SPDX-License-Identifier: MIT
 * 来源标识：YOUKAI-NOTE-EDIT-INTEGRATION-20261104-V06
 * 来源：作者确认版本；仅增加本水印，运行代码保持原样。
 * 原始脚本 SHA256（移除本注释后还原的完整原文件字节）：
 * 69f34e8cdce26cecd8cb5a9fb2f6f7553ae4f4963a373e3f60fad2c38f1df4a2
 * 此标识用于署名与版本溯源；发行文件以随附校验记录为准。
 * YOUKAI-PROVENANCE-END */
/*
 * YOUKAI 按注释批量修改 v0.6 测试版 | 作者：二百七
 * Copyright (c) 2026 二百七 | SPDX-License-Identifier: MIT
 * 来源标识：YOUKAI-NOTE-EDITOR-20261104-V06
 * 按原始完整 note 精确匹配，不改写“集体注释”及其生成的内容。
 */
var YOUKAI_NOTE_EDIT_V06 = (function () {
    var VERSION = "0.6", MM = 72 / 25.4;
    var HEADERS = ["完整注释", "操作", "X毫米", "Y毫米", "T值", "C", "M", "Y", "K", "着色位置"];
    var BASE_HEADERS = ["完整注释", "操作", "X毫米", "Y毫米", "T值", "着色位置"];
    function text(v) { return v === null || typeof v === "undefined" ? "" : String(v); }
    function trim(v) { return text(v).replace(/^\s+|\s+$/g, ""); }
    function message(e) { return e && e.message ? e.message : text(e); }
    function same(a, b) {
        if (a === b) return true;
        try { if (a == b) return true; } catch (e) {}
        try { return !!a.uuid && a.uuid === b.uuid; } catch (e2) { return false; }
    }
    function has(list, item) { for (var i = 0; i < list.length; i++) if (same(list[i], item)) return true; return false; }
    function below(item, parent) {
        var p = item.parent;
        while (p && p.typename !== "Document") { if (same(p, parent)) return true; p = p.parent; }
        return false;
    }
    function roots(items) {
        var result = [];
        for (var i = 0; i < items.length; i++) {
            var nested = false;
            for (var j = 0; j < items.length; j++) if (i !== j && below(items[i], items[j])) { nested = true; break; }
            if (!nested && !has(result, items[i])) result.push(items[i]);
        }
        return result;
    }
    function prepareAccess(plan, states) {
        var visited=[],stack=[],i,j;
        for(i=0;i<plan.length;i++)for(j=0;j<plan[i].targets.length;j++)stack.push(plan[i].targets[j]);
        while(stack.length){
            var item=stack.pop();if(has(visited,item))continue;visited.push(item);
            var chain=[],node=item;
            while(node&&node.typename!=="Document"){chain.push(node);node=node.parent;}
            // 先处理最外层图层，再处理内层组和对象，避免父级阻止状态写入。
            for(i=chain.length-1;i>=0;i--){
                node=chain[i];
                var layer=node.typename==="Layer",locked=node.locked===true;
                var hidden=layer ? node.visible===false : node.hidden===true;
                if(!locked&&!hidden)continue;
                // 写属性前入账；即使只解锁成功、显示失败，finally 也可恢复。
                var state={node:node,layer:layer,locked:locked,hidden:hidden,deleting:false,deleted:false};
                states.push(state);
                if(locked)node.locked=false;
                if(hidden){if(layer)node.visible=true;else node.hidden=false;}
            }
            var children=null;
            if(item.typename==="GroupItem")children=item.pageItems;
            else if(item.typename==="CompoundPathItem")children=item.pathItems;
            if(children)for(i=children.length-1;i>=0;i--)stack.push(children[i]);
        }
    }
    function deletingStates(target, states) {
        var indexes=[];
        // 删除前确定范围，删除成功后不能再读取失效对象的 parent 或 typename。
        for(var i=0;i<states.length;i++){
            var state=states[i];if(state.deleted)continue;
            if(same(state.node,target)||below(state.node,target)){state.deleting=true;indexes.push(i);}
        }
        return indexes;
    }
    function restoreAccess(states) {
        var errors=[];
        // 后代先恢复，祖先最后恢复，确保写入时父级仍可编辑。
        for(var i=states.length-1;i>=0;i--){
            var state=states[i];if(state.deleted)continue;
            try{var type=state.node.typename;}
            catch(invalid){if(state.deleting)continue;errors.push("对象状态读取失败："+message(invalid));continue;}
            if(state.hidden){
                try{if(state.layer)state.node.visible=false;else state.node.hidden=true;}
                catch(hideError){errors.push("隐藏状态恢复失败："+message(hideError));}
            }
            if(state.locked){
                try{state.node.locked=true;}
                catch(lockError){errors.push("锁定状态恢复失败："+message(lockError));}
            }
        }
        return errors;
    }
    function skippedPath(value) {
        // 只检查目录段，不因文件名或 sublink 之类名称误跳过。
        var p = text(value).replace(/\\/g, "/");
        var parts = p.split("/"); parts.pop();
        for (var i = 0; i < parts.length; i++) if (/^links?$/i.test(parts[i])) return true;
        return false;
    }
    function documentPath(doc) {
        try { return doc.fullName.fsName; } catch (e) { return ""; }
    }
    function inventory(doc) {
        var result = [], ids = {}, stack = [], i;
        for (i = doc.pageItems.length - 1; i >= 0; i--) stack.push(doc.pageItems[i]);
        while (stack.length) {
            var item = stack.pop(), id = "";
            try { id = text(item.uuid); } catch (noID) {}
            if (id ? ids["$" + id] : has(result, item)) continue;
            if (id) ids["$" + id] = true;
            result.push(item);
            var children = null;
            if (item.typename === "GroupItem") children = item.pageItems;
            else if (item.typename === "CompoundPathItem") children = item.pathItems;
            if (children) for (i = children.length - 1; i >= 0; i--) stack.push(children[i]);
        }
        return result;
    }
    function parseCsv(input) {
        var s = text(input).replace(/^\uFEFF/, ""), first = s.split(/\r\n|\n|\r/)[0];
        var delimiter = first.indexOf("\t") >= 0 ? "\t" : ",";
        var rows = [], row = [], field = "", quoted = false, closed = false;
        function cell() { row.push(field); field = ""; closed = false; }
        function line() { cell(); rows.push(row); row = []; }
        for (var i = 0; i < s.length; i++) {
            var c = s.charAt(i);
            if (quoted) {
                if (c === '"') {
                    if (s.charAt(i + 1) === '"') { field += '"'; i++; } else { quoted = false; closed = true; }
                } else field += c;
            } else if (c === delimiter) cell();
            else if (c === "\r" || c === "\n") { line(); if (c === "\r" && s.charAt(i + 1) === "\n") i++; }
            else if (c === '"') {
                if (field !== "" || closed) throw new Error("CSV 引号格式错误，请另存为 CSV UTF-8。");
                quoted = true;
            } else { if (closed && !/\s/.test(c)) throw new Error("CSV 引号结束后有多余字符。"); if (!closed) field += c; }
        }
        if (quoted) throw new Error("CSV 有未闭合的双引号。");
        if (field !== "" || row.length || closed) line();
        return rows;
    }
    function number(v, label, required) {
        var s = trim(v);
        if (!s && !required) return 0;
        if (!/^[+-]?(?:\d+(?:\.\d*)?|\.\d+)(?:e[+-]?\d+)?$/i.test(s) || !isFinite(Number(s))) throw new Error(label + "必须是数字。");
        return Number(s);
    }
    function rulesFromCsv(input) {
        var rows = parseCsv(input), rules = [], cols = {}, i, j;
        if (!rows.length) throw new Error("表格为空。");
        for (i = 0; i < rows[0].length; i++) {
            var title = trim(rows[0][i]);
            if (title && typeof cols["$" + title] !== "undefined") throw new Error("表头重复：" + title);
            if (title) cols["$" + title] = i;
        }
        if (typeof cols["$目标专色名"] !== "undefined" || typeof cols["$改色范围"] !== "undefined") throw new Error("这是 v0.1 的专色定义规则表。请使用新版模板；改色值只支持非全局的普通 CMYK 四色对象。");
        for (i = 0; i < BASE_HEADERS.length; i++) if (typeof cols["$" + BASE_HEADERS[i]] === "undefined") throw new Error("缺少表头：" + BASE_HEADERS[i] + "。请使用配套 CSV UTF-8 模板。");
        function get(row, title) { return text(row[cols["$" + title]]); }
        for (i = 1; i < rows.length; i++) {
            var row = rows[i], any = false;
            for (j = 0; j < row.length; j++) if (trim(row[j])) any = true;
            if (!any) continue;
            // 只看当前有效字段；旧表多出来的列不影响执行，空白规则行直接跳过。
            any = false;
            for (j = 0; j < HEADERS.length; j++) if (trim(get(row, HEADERS[j]))) any = true;
            if (!any) continue;
            var r = {line:i + 1, note:get(row,"完整注释"), op:trim(get(row,"操作"))};
            try {
                if (!trim(r.note)) throw new Error("完整注释不能为空。");
                if (r.op !== "移动" && r.op !== "删除" && r.op !== "改T值" && r.op !== "改色值") throw new Error("操作只能是移动、改T值、改色值、删除。");
                if (r.op === "移动") { r.x = number(get(row,"X毫米"),"X毫米",false); r.y = number(get(row,"Y毫米"),"Y毫米",false); }
                if (r.op === "改T值") {
                    r.tint = number(trim(get(row,"T值")).replace(/[%％]$/, ""), "T值", true);
                    if (r.tint < 0 || r.tint > 100) throw new Error("T值须为 0 至 100，表示百分比。");
                }
                if (r.op === "改色值") {
                    r.cmyk=[];
                    for(j=0;j<4;j++){
                        var channel=["C","M","Y","K"][j];
                        if(typeof cols["$"+channel]==="undefined")throw new Error("改色值需要 C、M、Y、K 四列，请使用新版填写模板。");
                        var value=number(get(row,channel),channel,true);
                        if(value<0||value>100)throw new Error(channel+"须为 0 至 100。");
                        r.cmyk.push(value);
                    }
                }
                if(r.op==="改T值"||r.op==="改色值"){
                    r.paint=trim(get(row,"着色位置"))||"填充和描边";
                    if(r.paint!=="填充"&&r.paint!=="描边"&&r.paint!=="填充和描边")throw new Error("着色位置填填充、描边或填充和描边。");
                }
            } catch (bad) { throw new Error("第 " + r.line + " 行：" + message(bad)); }
            rules.push(r);
        }
        if (!rules.length) throw new Error("表格没有可执行的规则。请手填目标对象的完整注释、操作和相应参数。");
        return rules;
    }
    function isSpot(color) { return color && color.typename === "SpotColor" && color.spot && color.spot.colorType === ColorModel.SPOT; }
    function colorSlots(items, rule) {
        var slots = [], seen = [], compounds = [], stack = roots(items).slice(0), i;
        function add(owner, prop, anchor) {
            var color = owner[prop];
            if(rule.op==="改色值"){
                if(!color||color.typename==="NoColor")return;
                slots.push({owner:owner,prop:prop,anchor:anchor,color:color});
            }else{
                if(!isSpot(color))return;
                slots.push({owner:owner,prop:prop,anchor:anchor,color:color,spot:color.spot,tint:color.tint});
            }
        }
        while (stack.length) {
            var item = stack.pop();
            if (has(seen,item)) continue;
            seen.push(item);
            var type = item.typename;
            if (type === "GroupItem") { for (i = item.pageItems.length - 1; i >= 0; i--) stack.push(item.pageItems[i]); }
            else if (type === "CompoundPathItem") { if (item.pathItems.length) stack.push(item.pathItems[0]); }
            else if (type === "PathItem") {
                // 复合路径的属性由内部路径共享，一次规则中只处理一个代表路径。
                if (item.parent && item.parent.typename === "CompoundPathItem") {
                    var compound = item.parent;
                    if (has(compounds,compound)) continue;
                    compounds.push(compound); item = compound.pathItems[0];
                }
                if (rule.paint !== "描边" && item.filled) add(item,"fillColor",item);
                if (rule.paint !== "填充" && item.stroked) add(item,"strokeColor",item);
            } else if (type === "TextFrame") {
                var chars = item.characters;
                for (i = 0; i < chars.length; i++) {
                    var attr = chars[i].characterAttributes;
                    if(rule.paint!=="描边")add(attr,"fillColor",item);
                    if(rule.paint!=="填充")add(attr,"strokeColor",item);
                }
            }
        }
        return slots;
    }
    function tintDetail(slots, target) {
        if (!slots.length) return "未找到符合条件的直接专色填充或描边。";
        var min = Number(slots[0].tint), max = min;
        for (var i = 1; i < slots.length; i++) { min = Math.min(min, Number(slots[i].tint)); max = Math.max(max, Number(slots[i].tint)); }
        return "当前 T " + min + "%" + (min === max ? "" : "～" + max + "%") + "，设为 " + target + "%（" + slots.length + " 处填充/描边）。";
    }
    function checkCmykSlots(slots, rule) {
        for(var i=0;i<slots.length;i++){
            var slot=slots[i],color=slot.color;
            var position=slot.prop==="fillColor" ? "填充" : "描边";
            if(color.typename==="SpotColor"){
                var kind=color.spot&&color.spot.colorType===ColorModel.PROCESS ? "全局色" : "专色";
                var name=color.spot ? text(color.spot.name) : "";
                var error=new Error("第 "+rule.line+" 行：匹配对象的"+position+"使用"+kind+(name ? "“"+name+"”" : "")+"。改色值只允许非全局的普通 CMYK 四色颜色，当前文件已停止。\n注释："+rule.note);
                error.showColorAlert=true;throw error;
            }
            if(color.typename!=="CMYKColor")throw new Error("第 "+rule.line+" 行：匹配对象的"+position+"为 "+color.typename+"，改色值只支持普通 CMYK 四色颜色。\n注释："+rule.note);
        }
    }
    function makeCmyk(values) {
        var color=new CMYKColor();color.cyan=values[0];color.magenta=values[1];color.yellow=values[2];color.black=values[3];return color;
    }
    function cmykEqual(color,values) {
        if(!color||color.typename!=="CMYKColor")return false;
        var actual=[color.cyan,color.magenta,color.yellow,color.black];
        for(var i=0;i<4;i++)if(!isFinite(Number(actual[i]))||Math.abs(Number(actual[i])-values[i])>0.000001)return false;
        return true;
    }
    function preflight(doc, rules) {
        var items = inventory(doc), index = {}, plan = [], deleted = [];
        for (var i = 0; i < items.length; i++) {
            var note = text(items[i].note), key = "$" + note;
            if (!note) continue;
            if (!index[key]) index[key] = [];
            index[key].push(items[i]);
        }
        for (i = 0; i < rules.length; i++) {
            var rule = rules[i], matches = index["$" + rule.note] || [], targets = roots(matches), p = {rule:rule,targets:targets,count:matches.length,slots:0,status:targets.length ? "可执行" : "未匹配",detail:""};
            try {
                for (var j = 0; j < targets.length; j++) {
                    var item = targets[j];
                    for (var d = 0; d < deleted.length; d++) if (same(item,deleted[d]) || below(item,deleted[d])) throw new Error("此对象已被前面的删除规则覆盖，请调整规则顺序。");
                    if (rule.op === "移动" && typeof item.translate !== "function") throw new Error("此对象不支持移动。");
                    if (rule.op === "删除" && typeof item.remove !== "function") throw new Error("此对象不支持删除。");
                }
                if (rule.op === "删除") deleted = deleted.concat(targets);
                // 专色属性等实际内容在临时显示、解锁后读取。
            } catch (bad) { throw new Error("第 " + rule.line + " 行：" + message(bad)); }
            plan.push(p);
        }
        return plan;
    }
    function apply(doc, plan, result) {
        var oldCoordinates = app.coordinateSystem, factor,states=[],failure=null,restoreErrors=[];
        try {
            app.coordinateSystem = CoordinateSystem.DOCUMENTCOORDINATESYSTEM;
            var rect = doc.artboards[0].artboardRect;
            if (!rect || rect.length < 4 || !isFinite(Number(rect[1])) || !isFinite(Number(rect[3])) || Number(rect[1]) === Number(rect[3])) throw new Error("无法确定文档的上下方向。");
            factor = Number(rect[1]) > Number(rect[3]) ? 1 : -1;
            // 所有目标先完成准备；准备失败时不执行移动、删除或颜色修改。
            prepareAccess(plan,states);
            // 全文件预查所有改色值规则；专色/全局色必须在任何实际规则执行前拦截。
            for(var checkIndex=0;checkIndex<plan.length;checkIndex++){
                var colorPlan=plan[checkIndex];if(colorPlan.rule.op!=="改色值"||!colorPlan.targets.length)continue;
                var checkedSlots=colorSlots(colorPlan.targets,colorPlan.rule);
                checkCmykSlots(checkedSlots,colorPlan.rule);
                if(checkedSlots.length&&doc.documentColorSpace!==DocumentColorSpace.CMYK)throw new Error("第 "+colorPlan.rule.line+" 行：改色值只支持 CMYK 文档，避免宿主把输入值转换为 RGB。");
            }
            for (var i = 0; i < plan.length; i++) {
                var p = plan[i], r = p.rule, entry = {line:r.line,note:r.note,op:r.op,matched:p.count,changed:0,status:"未匹配",detail:p.detail};
                result.push(entry);
                if (!p.targets.length) continue;
                try {
                    if (r.op === "移动" || r.op === "删除") {
                        for (var j = 0; j < p.targets.length; j++) {
                            if (r.op === "移动") p.targets[j].translate(r.x * MM, r.y * MM * factor);
                            else {
                                var deleting=deletingStates(p.targets[j],states);
                                p.targets[j].remove();
                                for(var k=0;k<deleting.length;k++)states[deleting[k]].deleted=true;
                            }
                            entry.changed++;
                        }
                    } else {
                        var slots = colorSlots(p.targets,r);
                        if(r.op==="改色值"){
                            checkCmykSlots(slots,r);
                            entry.detail=slots.length ? "CMYK 设为 "+r.cmyk.join("/")+"（"+slots.length+" 处填充/描边）。" : "未找到可修改的普通 CMYK 填充或描边。";
                        }else entry.detail = tintDetail(slots, r.tint);
                        for (j = 0; j < slots.length; j++) {
                            var slot = slots[j];
                            if(r.op==="改色值"){
                                if(cmykEqual(slot.color,r.cmyk))continue;
                                // 每处重新赋予普通 CMYKColor，不写色板或共享颜色定义。
                                slot.owner[slot.prop]=makeCmyk(r.cmyk);
                            }else{
                                if (Math.abs(Number(slot.tint) - r.tint) < 0.000001) continue;
                                var c = new SpotColor(); c.spot = slot.spot; c.tint = r.tint;
                                slot.owner[slot.prop] = c;
                            }
                            entry.changed++;
                        }
                    }
                    entry.status = entry.changed ? "完成" : "无变化";
                } catch (bad) { entry.status = "失败"; entry.detail = message(bad); var wrapped=new Error("第 " + r.line + " 行执行失败：" + message(bad));if(bad.showColorAlert)wrapped.showColorAlert=true;throw wrapped; }
            }
        }catch(error){failure=error;}
        finally{
            restoreErrors=restoreAccess(states);
            try{app.coordinateSystem=oldCoordinates;}
            catch(coordinateError){restoreErrors.push("坐标系恢复失败："+message(coordinateError));}
        }
        if(failure||restoreErrors.length){var finalError=new Error((failure ? message(failure) : "")+(failure&&restoreErrors.length ? "；" : "")+restoreErrors.join("；"));if(failure&&failure.showColorAlert)finalError.showColorAlert=true;throw finalError;}
    }
    function csvCell(v) { var s=text(v); return /[",\r\n\t]/.test(s) ? '"'+s.replace(/"/g,'""')+'"' : s; }
    function toCsv(rows) {
        var result=[];
        for(var i=0;i<rows.length;i++){var row=[];for(var j=0;j<rows[i].length;j++)row.push(csvCell(rows[i][j]));result.push(row.join(","));}
        return result.join("\r\n")+"\r\n";
    }
    function read(file) {
        if (!file || !file.exists) throw new Error("找不到规则表格。");
        if (/\.xlsx?$/i.test(file.name)) throw new Error("请把 Excel 表格另存为 CSV UTF-8，再选择 CSV 文件。");
        file.encoding="UTF-8";
        if(!file.open("r"))throw new Error("无法读取表格："+file.fsName);
        try{return file.read();}finally{file.close();}
    }
    function write(file, content) {
        file.encoding="UTF-8";
        if(!file.open("w"))throw new Error("无法写入："+file.fsName);
        try{if(!file.write("\uFEFF"+content))throw new Error("文件写入失败："+file.fsName);}finally{file.close();}
    }
    function reports(scriptFile, doc, csvFile, rows, error) {
        var folder=new Folder(scriptFile.parent.fsName+"/执行报告");
        if(!folder.exists&&!folder.create())throw new Error("无法建立报告目录："+folder.fsName);
        var stamp=new Date().getTime()+"-"+Math.floor(Math.random()*1000000);
        var target=new File(folder.fsName+"/按注释批量修改-"+stamp+".csv");
        var data=[["文档","规则表格","表格行号","完整注释","操作","匹配对象数","处理数","状态","详情"]];
        var label=doc ? (documentPath(doc)||doc.name) : "";
        for(var i=0;i<rows.length;i++){var r=rows[i];data.push([label,csvFile ? csvFile.fsName : "",r.line,r.note,r.op,r.matched,r.changed||0,r.status,r.detail||""]);}
        if(error)data.push([label,csvFile ? csvFile.fsName : "","","","","","运行失败",error]);
        write(target,toCsv(data));return target.fsName;
    }
    function defaultCsv(scriptFile) {
        var local=new File(scriptFile.parent.fsName+"/按注释批量修改.csv");
        if($.global&&$.global.YOUKAI_CSV_FOLDER){var configured=new File($.global.YOUKAI_CSV_FOLDER+"/按注释批量修改.csv");if(configured.exists)return configured;}
        return local;
    }
    function run() {
        var batch=typeof $!=="undefined"&&$.global&&$.global.YOUKAI_BATCH===true;
        var doc=null,csvFile=null,result=[],scriptFile=new File($.fileName),failure=null;
        var outcome={version:VERSION,ok:false,state:"error",message:"",csvPath:"",reportPath:"",rows:result};
        try{
            csvFile=defaultCsv(scriptFile);outcome.csvPath=csvFile.fsName;
            if(typeof app==="undefined"||String(app.name).toLowerCase().indexOf("illustrator")<0)throw new Error("请在 Illustrator 中运行。");
            if(!app.documents.length)throw new Error("请先打开 AI 文档。");
            doc=app.activeDocument;
            var source=batch&&$.global.YOUKAI_BATCH_SOURCE_FILE ? $.global.YOUKAI_BATCH_SOURCE_FILE : documentPath(doc);
            if(skippedPath(source)||skippedPath(documentPath(doc))){
                outcome.state="skipped";
                throw new Error("保护跳过：文件位于 link / links 文件夹内，本文件不执行、不保存。");
            }
            var plan=preflight(doc,rulesFromCsv(read(csvFile)));
            apply(doc,plan,result);
            outcome.ok=true;outcome.state="done";outcome.message="执行结束，保存由调用方负责。";
        }catch(e){failure=e;outcome.message=message(e);}
        try{outcome.reportPath=reports(scriptFile,doc,csvFile,result,outcome.ok ? "" : outcome.message);}
        catch(logError){
            outcome.ok=false;outcome.state="error";
            outcome.message+=(outcome.message ? "；" : "")+"报告失败："+message(logError);
            if(!failure)failure=logError;
        }
        // 单独运行也静默返回；YOUKAI 批处理捕获异常后可阻止失败文档保存。
        if($.global)$.global.YOUKAI_NOTE_EDIT_LAST_RESULT=outcome;
        // 仅“改色值”遇到专色/全局色时，按作者要求弹一次错误；参数和成功过程仍无窗口。
        if(failure&&failure.showColorAlert)alert(outcome.message+(outcome.reportPath ? "\n报告："+outcome.reportPath : ""));
        if(failure&&batch)throw new Error(outcome.message);
        return outcome;
    }
    return {run:run,headers:HEADERS,parseCsv:parseCsv,rulesFromCsv:rulesFromCsv,inventory:inventory,preflight:preflight,apply:apply,toCsv:toCsv,skippedPath:skippedPath};
})();
YOUKAI_NOTE_EDIT_V06.run();
