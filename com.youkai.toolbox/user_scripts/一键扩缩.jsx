#target illustrator
#targetengine "youkai-offset-v2"
/* YOUKAI 1.0 | 作者：二百七 | Copyright (c) 2026 二百七 | SPDX-License-Identifier: MIT */
/**
 * YOUKAI 一键扩缩 v2.5：灰度透明链接图副本扩缩、自动重新链接、验证临时动作清理。
 * 弹窗只有一个 mm 输入：正数扩黑，负数缩黑；默认 +0.05 mm。
 * 合成可见图层及样式 -> 临时PS动作载入透明区域并扩缩 -> 临时PS动作填黑。
 * 自动命名副本，成功保存后只重新链接本次选中的对象；不碰矢量和专色。
 * 自动创建、执行、删除自己的临时动作集；不打开、合并或保存源文件。
 */
(function () {
    if (!app.documents.length) { alert("请先打开AI文档并选中链接图。"); return; }
    if (parseFloat(app.version) < 24) { alert("需要Illustrator 2020或以上版本。"); return; }
    if ($.global.YOUKAI_BATCH) { alert("请单独运行一键扩缩，不要放入无人值守批处理。"); return; }
    if ($.global.YK_OFFSET_V2_TASK) {
        // 超时后再次运行只接续原任务，绝不把已完成的副本再次扩缩。
        if (typeof $.global.YK_OFFSET_V2_TASK.resume === "function") $.global.YK_OFFSET_V2_TASK.resume();
        else alert("上一轮PS任务尚未结束，请等待结果。");
        return;
    }
    var doc = app.activeDocument, jobs = [], skipped = [], seen = [], scriptFilePath = $.fileName;
    var windows = $.os.toLowerCase().indexOf("windows") >= 0;
    function key(file) { return windows ? file.fsName.toLowerCase() : file.fsName; }
    function quote(text) {
        return '"' + String(text).replace(/\\/g,"\\\\").replace(/"/g,'\\"')
            .replace(/[\x00-\x1f\u2028\u2029]/g,function (ch) {
                return "\\u" + ("0000" + ch.charCodeAt(0).toString(16)).slice(-4);
            }) + '"';
    }
    function linkSize(item) {
        var b = item.boundingBox, m = item.matrix;
        var x = Math.sqrt(m.mValueA*m.mValueA + m.mValueB*m.mValueB);
        var y = Math.sqrt(m.mValueC*m.mValueC + m.mValueD*m.mValueD);
        var dot = Math.abs(m.mValueA*m.mValueC + m.mValueB*m.mValueD);
        if (!x || !y || Math.abs(x/y-1)>0.001 || dot/(x*y)>0.001)
            throw new Error("非等比缩放或倾斜，无法使用统一毫米扩缩");
        var w = Math.abs(b[2]-b[0])*x, h = Math.abs(b[1]-b[3])*y;
        if (!isFinite(w) || !isFinite(h) || w<=0 || h<=0) throw new Error("图片尺寸无效");
        return {widthPt:w,heightPt:h};
    }
    function collect(item) {
        var i;
        for (i=0;i<seen.length;i++) if (seen[i]===item) return;
        seen.push(item);
        if (item.typename === "GroupItem") {
            for (i=0;i<item.pageItems.length;i++) if (item.pageItems[i].parent===item) collect(item.pageItems[i]);
        } else if (item.typename === "PlacedItem") {
            try {
                var f = item.file, size = linkSize(item);
                if (!f.exists) throw new Error("链接丢失：" + f.fsName);
                if (!/\.(psd|psb|tiff?|png)$/i.test(f.name)) throw new Error("需要支持透明度的PSD、PSB、TIFF或PNG");
                for (i=0;i<jobs.length;i++) if (jobs[i].fileKey===key(f) &&
                    Math.abs(size.widthPt/jobs[i].widthPt-1)<=0.001 && Math.abs(size.heightPt/jobs[i].heightPt-1)<=0.001) {
                    jobs[i].items.push(item); return;
                }
                // 同一源文件在不同放置比例下分别生成副本，保证毫米扩缩与各自有效PPI匹配。
                jobs.push({path:f.fsName,fileKey:key(f),widthPt:size.widthPt,heightPt:size.heightPt,items:[item]});
            } catch (e) { skipped.push((item.name || "链接图") + "：" + e.message); }
        }
        // 矢量、嵌入图和其他对象均忽略，不创建任何新AI图层或专色。
    }
    try {
        var selection = doc.selection;
        if (!selection || !selection.length) { alert("请选择本地链接图，或包含链接图的编组。"); return; }
        for (var s=0;s<selection.length;s++) collect(selection[s]);
        var j;
        if (!jobs.length) { alert("没有可处理的链接图。\n" + skipped.join("\n")); return; }

        var dialog = new Window("dialog", "YOUKAI // 一键扩缩 v2.5");
        dialog.orientation = "column"; dialog.alignChildren = "fill"; dialog.margins = 16;
        var label = dialog.add("statictext",undefined,"单边扩缩量（mm）");
        var input = dialog.add("edittext",undefined,"0.05"); input.characters = 20;
        dialog.add("statictext",undefined,"正数扩黑，负数缩黑；同目录生成副本并重新链接。\n源文件保留。处理期间请勿编辑所选对象。",{multiline:true});
        try {
            dialog.graphics.backgroundColor = dialog.graphics.newBrush(dialog.graphics.BrushType.SOLID_COLOR,[0.102,0.106,0.122,1]);
            label.graphics.foregroundColor = label.graphics.newPen(label.graphics.PenType.SOLID_COLOR,[0.976,1,0,1],1);
        } catch (appearance) {}
        var buttons = dialog.add("group"); buttons.alignment = "right";
        buttons.add("button",undefined,"取消",{name:"cancel"});
        var run = buttons.add("button",undefined,"执行",{name:"ok"}), mm;
        run.onClick = function () {
            mm = Number(input.text.replace(/^\s+|\s+$/g,""));
            if (!isFinite(mm) || mm===0 || Math.abs(mm)>10) { alert("请输入非零数字，绝对值不超过10mm。"); return; }
            dialog.close(1);
        };
        input.active = true;
        if (dialog.show()!==1) return;
        if (typeof BridgeTalk === "undefined") throw new Error("BridgeTalk不可用");
        var target = BridgeTalk.getSpecifier("photoshop");
        if (!target) throw new Error("未找到支持ExtendScript的Photoshop桌面版");
        var rows = [];
        for (j=0;j<jobs.length;j++) rows.push("{path:" + quote(jobs[j].path) + ",widthPt:" + jobs[j].widthPt + ",heightPt:" + jobs[j].heightPt + "}");
        // 单行ASCII协议避免Windows换行、BOM和中文编码影响回执。
        // 再写一份临时回执；即使BridgeTalk只返回空串，AI仍可读取PS完成结果。
        var token = new Date().getTime() + "_" + Math.floor(Math.random()*1000000000);
        var receipt = new File(Folder.temp.fsName + "/YOUKAI_offset_" + token + ".txt");
        receipt.encoding = "UTF-8";
        if (receipt.exists || !receipt.open("w")) throw new Error("无法创建临时处理回执");
        var receiptWritten = receipt.write("RUNNING|" + token); receipt.close();
        if (!receiptWritten) throw new Error("无法写入临时处理回执");
        var bt = new BridgeTalk(); bt.target = target; bt.timeout = 120;
        // 从当前JSX读取原文，写入一个UTF-8临时处理文件，由PS本地读取执行。
        // BridgeTalk只传一个不含反斜杠的启动指令，处理代码不再经过消息转义。
        var scriptFile = new File(scriptFilePath); scriptFile.encoding = "UTF-8";
        if (!scriptFile.exists || !scriptFile.open("r")) throw new Error("无法读取当前JSX原文，请从完整脚本文件运行");
        var scriptText = scriptFile.read(); scriptFile.close(); scriptText = scriptText.replace(/\r\n?/g,"\n");
        var workerStart = scriptText.indexOf("\n    function processInPhotoshop(");
        var workerEnd = scriptText.lastIndexOf("\n})();");
        if (workerStart<0 || workerEnd<=workerStart) throw new Error("当前JSX不完整，无法发送PS处理代码");
        var workerCode = scriptText.substring(workerStart+1,workerEnd);
        if (workerCode.indexOf("// YOUKAI_WORKER_COPY_V25")<0) throw new Error("读取到了旧版处理函数，已停止");
        var workerFile = new File(Folder.temp.fsName + "/YOUKAI_offset_" + token + ".jsx");
        workerFile.encoding = "UTF-8";
        if (workerFile.exists || !workerFile.open("w")) throw new Error("无法创建临时PS处理脚本");
        var workerWritten = workerFile.write("var __youkaiOffsetResult = (" + workerCode + ")(" +
            mm + ",[" + rows.join(",") + "]," + quote(token) + "," + quote(receipt.fsName) + ");\n__youkaiOffsetResult;");
        workerFile.close();
        if (!workerWritten || !workerFile.exists || workerFile.length<=0) throw new Error("临时PS处理脚本写入失败");
        bt.body = '$.evalFile(new File(decodeURIComponent("' + encodeURIComponent(workerFile.fsName) + '")));';
        var receivedReply = null, deliveryTimedOut = false, waiting = true;
        function readResult(reply, quiet) {
            var prefix = "YK_OFFSET_5|" + token + "|";
            function unpack(value) {
                var text = String(value || "").replace(/^[\s\uFEFF]+|[\s\uFEFF]+$/g,"");
                if (text.indexOf(prefix)!==0) return null;
                try { return decodeURIComponent(text.substr(prefix.length)); }
                catch (badEncoding) { return null; }
            }
            var result = unpack(reply.body);
            if (result!==null) return result;
            if (receipt.exists) {
                receipt.encoding = "UTF-8";
                if (receipt.open("r")) {
                    var stored = receipt.read(); receipt.close();
                    result = unpack(stored);
                    if (result!==null) return result;
                }
            }
            if (quiet) return null;
            throw new Error("无法确认PS是否完成。回传内容：" + String(reply.body || "（空）").substr(0,300) +
                "\n诊断回执：" + receipt.fsName);
        }
        function reportResult(reply) {
            var messages = [], success = 0, linked = 0, validated = false;
            try {
                var newline = String.fromCharCode(10), tab = String.fromCharCode(9);
                var lines = readResult(reply).split(newline), parsed = [], returned = {};
                if (lines[0].indexOf("FATAL" + tab)===0) { validated = true; throw new Error(decodeURIComponent(lines[0].substr(6))); }
                // 先验证整份回执，再刷新链接，避免半份或旧任务的结果被当作成功。
                for (var r=0;r<lines.length;r++) if (lines[r]) {
                    // 末尾附加哨兵再拆分，兼容旧ExtendScript丢弃末尾空字段的行为。
                    var fields = (lines[r] + tab + "END").split(tab); fields.pop();
                    var index = Number(fields[1]);
                    if (fields.length!==7 || !/^\d+$/.test(fields[1]) || !jobs[index] ||
                        returned[index] || (fields[0]!=="OK" && fields[0]!=="ERROR"))
                        throw new Error("PS回执格式或序号无效，条目" + r + "：" + lines[r].substr(0,250) +
                            newline + "诊断回执：" + receipt.fsName);
                    if (fields[0]==="OK" && (!isFinite(Number(fields[2])) || Number(fields[2])<=0 ||
                        !/^\d+$/.test(fields[3]) || Number(fields[3])<1 || Number(fields[3])>100 ||
                        !isFinite(Number(fields[4])) || Number(fields[4])<=0))
                        throw new Error("PS回执扩缩数值无效");
                    if (fields[0]==="OK") {
                        var output = new File(decodeURIComponent(fields[5])), source = new File(jobs[index].path);
                        if (!output.exists || key(output)===jobs[index].fileKey || key(output.parent)!==key(source.parent))
                            throw new Error("PS输出不是有效的同目录副本，已停止重新链接");
                    }
                    returned[index] = true; parsed.push(fields);
                }
                if (parsed.length!==jobs.length) throw new Error("PS回执不完整");
                validated = true;
                var hasOutput = false;
                for (r=0;r<parsed.length;r++) if (parsed[r][0]==="OK") hasOutput = true;
                if (hasOutput) {
                    // 此处在原AI脚本主流程中执行，不能移到BridgeTalk的onResult回调里。
                    // 回调里即使documents.length>0，AI仍可能抛出“there is no document”。
                    var documentOpen = false;
                    for (var di=0;di<app.documents.length;di++) if (app.documents[di]===doc) documentOpen = true;
                    if (!documentOpen) throw new Error("原AI文档已关闭，扩缩副本保留，未替换其他文档");
                    try { BridgeTalk.bringToFront(BridgeTalk.appSpecifier || "illustrator"); } catch (frontAI) {}
                    doc.activate(); app.redraw();
                }
                for (r=0;r<parsed.length;r++) {
                    fields = parsed[r]; var job = jobs[Number(fields[1])];
                    if (fields[0] === "OK") {
                        success++;
                        output = new File(decodeURIComponent(fields[5]));
                        // 只替换本次选中的引用；未选中对象及其他AI文档继续使用原稿。
                        for (var p=0;p<job.items.length;p++) {
                            var placed = job.items[p], matrix = null, relinked = false;
                            try {
                                if (key(placed.file)!==job.fileKey) throw new Error("对象已改链接或删除");
                                var currentSize = linkSize(placed);
                                if (Math.abs(currentSize.widthPt/job.widthPt-1)>0.001 || Math.abs(currentSize.heightPt/job.heightPt-1)>0.001)
                                    throw new Error("对象放置比例已变化");
                                matrix = placed.matrix; placed.relink(output); relinked = true; placed.matrix = matrix; linked++;
                            } catch (refresh) {
                                if (relinked) { try { placed.relink(new File(job.path)); placed.matrix = matrix; } catch (restoreLink) {} }
                                messages.push("此对象自动重新链接失败，副本已保留：" + output.fsName + "；" + refresh.message);
                            }
                        }
                        messages.push(output.fsName + "：" + (mm>0?"扩黑":"缩黑") + fields[3] + "px，实际单边约" + Number(fields[4]).toFixed(6) + "mm");
                    } else messages.push(job.path + "：" + decodeURIComponent(fields[2]));
                    if (fields[6]) messages.push("清理提示：" + decodeURIComponent(fields[6]));
                }
                try { app.redraw(); } catch (closedAI) {}
                alert("已生成 " + success + "/" + jobs.length + " 份扩缩副本，重新链接 " + linked + " 个选中对象。\n" +
                    "源素材保留，AI文档未自动保存。\n" + messages.concat(skipped).join("\n"));
            } catch (reportError) { alert("一键扩缩：" + reportError.message + "\n请核对PS素材和AI链接，确认前勿重复扩缩。"); }
            finally {
                if (validated) {
                    try { receipt.remove(); } catch (removeReceipt) {}
                    try { workerFile.remove(); } catch (removeWorker) {}
                }
                $.global.YK_OFFSET_V2_TASK = null;
            }
        }
        // 回调只接收普通字符串，不读取或修改任何AI文档、图层、选中物件。
        bt.onResult = bt.onError = function (reply) { receivedReply = {body:String(reply.body || "")}; };
        bt.onTimeout = function () { deliveryTimedOut = true; };
        function finishInIllustrator() {
            if (waiting) { alert("PS正在处理，请等待完成后自动重新链接。"); return; }
            if (readResult(receivedReply || {body:""},true)===null) {
                if (deliveryTimedOut) {
                    $.global.YK_OFFSET_V2_TASK = null;
                    alert("PS未能及时接收任务。请检查PS启动或权限提示后重新运行。");
                } else alert("尚未收到完整结果，暂不重复扩缩。PS完成后再次运行本脚本，将自动接续重新链接。\n诊断回执：" + receipt.fsName);
                return;
            }
            reportResult(receivedReply || {body:""});
        }
        $.global.YK_OFFSET_V2_TASK = {message:bt,resume:finishInIllustrator};
        // 同步等待使原AI执行上下文保持有效；链接替换发生在send返回以后。
        // PS首次启动可能使send返回false，继续泵送消息/读取回执，但不重复发送。
        var waitUntil = new Date().getTime() + 600000;
        bt.send(600);
        while (!receivedReply && !deliveryTimedOut && new Date().getTime()<waitUntil) {
            if (readResult({body:""},true)!==null) break;
            BridgeTalk.pump();
            if (!receivedReply) $.sleep(100);
        }
        waiting = false;
        if (receivedReply && readResult(receivedReply,true)===null) reportResult(receivedReply);
        else finishInIllustrator();
    } catch (error) { $.global.YK_OFFSET_V2_TASK = null; alert("一键扩缩：" + error.message); }

    // 整个函数写入临时JSX，由PS本地读取执行；不依赖AI变量、JSON或外部库。
    function processInPhotoshop(mm, jobs, token, receiptPath) {
        // YOUKAI_WORKER_COPY_V25
        var answers = [], oldDialogs, oldUnits, previousDocument = null, preferencesRead = false;
        var tab = String.fromCharCode(9), newline = String.fromCharCode(10);
        function samePath(a,b) { return $.os.toLowerCase().indexOf("windows")>=0 ? a.toLowerCase()===b.toLowerCase() : a===b; }
        function pixelPlan(w,h,widthPt,heightPt,value) {
            var x = w*72/widthPt, y = h*72/heightPt;
            if (!isFinite(x) || !isFinite(y) || x<=0 || y<=0 || Math.abs(x/y-1)>0.001) throw new Error("X/Y有效PPI不一致");
            var ppi = (x+y)/2, raw = Math.abs(value)*ppi/25.4, pixels = Math.round(raw);
            if (pixels<1 || pixels>100) throw new Error("换算为" + raw.toFixed(4) + "px；PS选区扩缩需1–100个整数像素，已跳过");
            return {ppi:ppi,pixels:pixels,actualMM:pixels*25.4/ppi};
        }
        // 自动命名到原文件同目录；已有副本或已打开的同名文档都避开，不覆盖。
        function copyName(source,value) {
            var name = source.name; try { name = decodeURI(name); } catch (encodedName) {}
            var dot = name.lastIndexOf(".");
            if (dot<=0 || dot===name.length-1) throw new Error("源文件没有可识别的格式后缀：" + name);
            var extension = name.substr(dot);
            var stem = name.substr(0,dot) + (value>0?"_扩黑_":"_缩黑_") + Math.abs(value) + "mm";
            for (var k=0;k<10000;k++) {
                var suffix = k ? "_" + ("000" + k).slice(-Math.max(3,String(k).length)) : "";
                var candidate = new File(source.parent.fsName + "/" + stem + suffix + extension), opened = false;
                for (var q=0;q<app.documents.length;q++) {
                    try { if (samePath(app.documents[q].fullName.fsName,candidate.fsName)) { opened = true; break; } } catch (unsaved) {}
                }
                if (!candidate.exists && !opened && !samePath(source.fsName,candidate.fsName)) return candidate;
            }
            throw new Error("同目录副本重名过多，无法分配新文件名");
        }
        // Photoshop ATN按Adobe文件格式规范写入大端整数和带终止符的UTF-16名称。
        // 描述符由PS原生toStream生成；仅去掉流的4字节版本头，不手工猜测参数格式。
        function numberBytes(value,count) {
            var text = ""; for (var b=count-1;b>=0;b--) text += String.fromCharCode((value >>> (b*8)) & 255);
            return text;
        }
        function unicode(text) {
            var out = numberBytes(text.length+1,4);
            for (var u=0;u<text.length;u++) out += numberBytes(text.charCodeAt(u),2);
            return out + numberBytes(0,2);
        }
        function atnAction(name,steps) {
            var out = numberBytes(0,4) + numberBytes(0,2) + unicode(name) + numberBytes(0,1) + numberBytes(steps.length,4);
            for (var a=0;a<steps.length;a++) {
                var step = steps[a], stream = step.descriptor.toStream();
                if (stream.substr(0,4)!==numberBytes(16,4)) throw new Error("PS动作描述符版本不兼容");
                out += numberBytes(0,1) + numberBytes(1,1) + numberBytes(0,2) + "long" +
                    step.event + numberBytes(step.label.length,4) + step.label + numberBytes(4294967295,4) + stream.substr(4);
            }
            return out;
        }
        function writeActions(file,setName,pixels,outward) {
            var c = charIDToTypeID, s = stringIDToTypeID, select = new ActionDescriptor();
            var targetSelection = new ActionReference(); targetSelection.putProperty(c("Chnl"),c("fsel"));
            select.putReference(c("null"),targetSelection);
            var transparency = new ActionReference(); transparency.putEnumerated(c("Chnl"),c("Chnl"),c("Trsp"));
            select.putReference(c("T   "),transparency);
            var offset = new ActionDescriptor(); offset.putUnitDouble(c("By  "),c("#Pxl"),pixels);
            offset.putBoolean(s("selectionModifyEffectAtCanvasBounds"),false);
            var fill = new ActionDescriptor();
            fill.putEnumerated(c("Usng"),c("FlCn"),c("Blck")); // 明确填黑，不改用户前景色。
            fill.putUnitDouble(c("Opct"),c("#Prc"),100); fill.putEnumerated(c("Md  "),c("BlnM"),c("Nrml"));
            fill.putBoolean(c("PrsT"),false); // 允许扩展到透明像素。
            var deselect = new ActionDescriptor(); deselect.putReference(c("null"),targetSelection);
            deselect.putEnumerated(c("T   "),c("Ordn"),c("None"));
            var data = numberBytes(16,4) + unicode(setName) + numberBytes(0,1) + numberBytes(2,4) +
                atnAction("选区扩缩",[
                    {event:"setd",label:"Set Selection",descriptor:select},
                    {event:outward?"Expn":"Cntc",label:outward?"Expand":"Contract",descriptor:offset}]) +
                atnAction("填黑并取消选区",[
                    {event:"Fl  ",label:"Fill",descriptor:fill},
                    {event:"setd",label:"Set Selection",descriptor:deselect}]);
            file.encoding = "BINARY";
            if (file.exists || !file.open("w")) throw new Error("无法创建临时PS动作文件");
            var written = file.write(data); file.close();
            if (!written) throw new Error("无法写入临时PS动作文件");
            // 用BINARY重新读取并逐字节核对，拦住写入截断和编码转换。
            if (file.length!==data.length || !file.open("r")) throw new Error("临时PS动作文件长度不符或无法读取");
            var readBack = file.read(); file.close();
            if (readBack!==data || readBack.substr(0,4)!==numberBytes(16,4))
                throw new Error("临时PS动作文件校验失败");
        }
        function hasActionSet(name) {
            var ref = new ActionReference(), level = $.level;
            ref.putName(charIDToTypeID("ASet"),name);
            try {
                $.level = 0;
                try { if (executeActionGet(ref).getString(charIDToTypeID("Nm  "))===name) return true; } catch (nameLookup) {}
                // 名称查询不可用时，以面板实际枚举兜底，不能直接当作已删除。
                for (var si=1;si<=10000;si++) {
                    var indexed = new ActionReference(); indexed.putIndex(charIDToTypeID("ASet"),si);
                    var info; try { info = executeActionGet(indexed); } catch (endOfSets) { break; }
                    if (info.getString(charIDToTypeID("Nm  "))===name) return true;
                }
                return false;
            }
            finally { $.level = level; }
        }
        function removeActionSet(name) {
            var lastError = "", level = $.level;
            try {
                $.level = 0;
                for (var attempt=0;attempt<3;attempt++) {
                    if (!hasActionSet(name)) return; // 已清理也算完成，不误报删除失败。
                    try {
                        var desc = new ActionDescriptor(), ref = new ActionReference(), index = 0;
                        // 优先按面板实际索引定位，删除前再次核对名称；名称方式作为备用。
                        if (attempt!==1) for (var si=1;si<=10000;si++) {
                            var probe = new ActionReference(); probe.putIndex(charIDToTypeID("ASet"),si);
                            var info; try { info = executeActionGet(probe); } catch (endOfSets) { break; }
                            if (info.getString(charIDToTypeID("Nm  "))===name) { index = si; break; }
                        }
                        if (index) ref.putIndex(charIDToTypeID("ASet"),index);
                        else ref.putName(charIDToTypeID("ASet"),name);
                        desc.putReference(charIDToTypeID("null"),ref);
                        executeAction(charIDToTypeID("Dlt "),desc,DialogModes.NO);
                    } catch (deleteError) { lastError = deleteError.message; }
                    // executeAction没抛错也可能没有删除，必须重新查询确认。
                    if (!hasActionSet(name)) return;
                    if (attempt<2) { try { app.refresh(); } catch (refreshPanel) {} $.sleep(100); }
                }
                throw new Error("动作集仍存在" + (lastError?"；" + lastError:""));
            } finally { $.level = level; }
        }
        function cleanPreviousActionSets(warnings) {
            var candidates = [], level = $.level;
            try {
                $.level = 0;
                // 先收集、后倒序删除，避免动作面板索引移动造成漏删或删错。
                for (var si=1;si<=10000;si++) {
                    var ref = new ActionReference(); ref.putIndex(charIDToTypeID("ASet"),si);
                    var info; try { info = executeActionGet(ref); } catch (endOfSets) { break; }
                    var name = info.getString(charIDToTypeID("Nm  "));
                    // 只识别旧版自动生成的完整名称，不能按YOUKAI前缀直接批量删除。
                    if (!/^__YOUKAI_offset_\d{13}_\d{1,9}_\d+$/.test(name) ||
                        name.indexOf("__YOUKAI_offset_" + token + "_")===0) continue;
                    try {
                        if (info.getInteger(charIDToTypeID("NmbC"))!==2) continue;
                        var expected = ["选区扩缩","填黑并取消选区"], owned = true;
                        for (var ai=1;ai<=2;ai++) {
                            var actionRef = new ActionReference(); actionRef.putIndex(charIDToTypeID("Actn"),ai);
                            actionRef.putIndex(charIDToTypeID("ASet"),si);
                            var action = executeActionGet(actionRef);
                            if (action.getString(charIDToTypeID("Nm  "))!==expected[ai-1] ||
                                action.getInteger(charIDToTypeID("NmbC"))!==2) owned = false;
                        }
                        if (owned) candidates.push(name);
                    } catch (unknownAction) {} // 无法确认归属的动作集保留。
                }
                for (var ci=candidates.length-1;ci>=0;ci--) {
                    try { removeActionSet(candidates[ci]); }
                    catch (oldCleanup) { warnings.push("旧临时动作集未能删除：" + candidates[ci] + "；" + oldCleanup.message); }
                }
            } catch (scanError) { warnings.push("旧临时动作检查失败：" + scanError.message); }
            finally { $.level = level; }
        }
        try {
            oldDialogs = app.displayDialogs; oldUnits = app.preferences.rulerUnits; preferencesRead = true;
            previousDocument = app.documents.length ? app.activeDocument : null;
            app.displayDialogs = DialogModes.NO; app.preferences.rulerUnits = Units.PIXELS;
            var previousCleanup = []; cleanPreviousActionSets(previousCleanup);
            for (var i=0;i<jobs.length;i++) {
                var file = new File(jobs[i].path), outputFile = null, d = null, copyReserved = false, copyOpen = false, temp = null, saved = false;
                var setName = "__YOUKAI_offset_" + token + "_" + i, atn = null, setReserved = false, setLoaded = false;
                var row, cleanup = i===0 ? previousCleanup.slice(0) : [], phase = "复制素材";
                try {
                    if (!file.exists) throw new Error("链接文件不存在");
                    if (file.length<=0) throw new Error("源素材为空文件");
                    outputFile = copyName(file,mm);
                    if (outputFile.exists || samePath(outputFile.fsName,file.fsName)) throw new Error("副本路径冲突，未覆盖任何文件");
                    copyReserved = true;
                    if (!file.copy(outputFile.fsName) || !outputFile.exists || outputFile.length!==file.length)
                        throw new Error("同目录素材复制失败或文件不完整");
                    phase = "打开副本"; d = app.open(outputFile);
                    if (!samePath(d.fullName.fsName,outputFile.fsName)) { d = null; throw new Error("PS没有打开指定副本，已停止"); }
                    copyOpen = true; app.activeDocument = d;
                    phase = "检查副本";
                    if (d.mode !== DocumentMode.GRAYSCALE) throw new Error("素材必须为灰度模式，不自动转换或处理专色");
                    if (d.bitsPerChannel !== BitsPerChannelType.EIGHT && d.bitsPerChannel !== BitsPerChannelType.SIXTEEN)
                        throw new Error("需要8或16位灰度，不处理1位位图或32位素材");
                    for (var n=0;n<d.channels.length;n++) if (d.channels[n].kind===ChannelType.SPOTCOLOR) throw new Error("素材包含PS专色通道，请人工处理");
                    var w = Number(d.width.as("px")), h = Number(d.height.as("px")), resolution = d.resolution, depth = d.bitsPerChannel;
                    var plan = pixelPlan(w,h,jobs[i].widthPt,jobs[i].heightPt,mm);
                    function checkDocument() {
                        if (!samePath(d.fullName.fsName,outputFile.fsName) || samePath(d.fullName.fsName,file.fsName) ||
                            app.activeDocument!==d || Number(d.width.as("px"))!==w || Number(d.height.as("px"))!==h ||
                            d.resolution!==resolution || d.mode!==DocumentMode.GRAYSCALE || d.bitsPerChannel!==depth)
                            throw new Error("PS当前文档不是指定副本，或画布/灰度模式变化，已停止保存");
                    }
                    phase = "合成副本";
                    d.selection.deselect(); d.activeChannels = [d.componentChannels[0]];
                    // 加一个空像素层再合成可见：单层素材也能烘焙样式，透明底不变白。
                    // 隐藏图层不参与合成且保留；可见图层的文字、样式等成为像素效果。
                    var blank = d.artLayers.add(); blank.name = "YOUKAI 合成可见";
                    blank.visible = true; d.activeLayer = blank; d.mergeVisibleLayers(); checkDocument();
                    if (d.activeLayer.kind!==LayerKind.NORMAL || d.activeLayer.isBackgroundLayer)
                        throw new Error("合成结果必须为透明底普通像素层，不能是白底背景层");
                    d.activeLayer.allLocked = false; d.activeLayer.transparentPixelsLocked = false;
                    if (hasActionSet(setName)) throw new Error("临时动作名称冲突，未修改已有动作");
                    setReserved = true; atn = new File(Folder.temp.fsName + "/" + setName + ".atn");
                    if (atn.exists) { atn = null; throw new Error("临时动作文件名称冲突，未覆盖已有文件"); }
                    phase = "生成临时动作";
                    writeActions(atn,setName,plan.pixels,mm>0);
                    phase = "载入临时动作";
                    app.load(atn); // 真正载入PS动作面板，不永久安装到Presets目录。
                    setLoaded = hasActionSet(setName);
                    if (!setLoaded) throw new Error("临时PS动作未成功载入，已停止处理副本");
                    phase = "选区扩缩";
                    app.doAction("选区扩缩",setName); checkDocument();
                    try { d.selection.bounds; } catch (empty) { throw new Error("透明区域为空或收缩后消失，本次副本不保存"); }
                    if (mm<0) {
                        // 收缩时先清除旧像素，才能缩掉原来的大轮廓；清成透明，绝不填白。
                        temp = d.channels.add(); temp.name = "YOUKAI 临时选区"; d.selection.store(temp);
                        d.activeChannels = [d.componentChannels[0]]; d.selection.selectAll(); d.selection.clear();
                        d.selection.load(temp,SelectionType.REPLACE); temp.remove(); temp = null;
                    }
                    d.activeChannels = [d.componentChannels[0]];
                    phase = "填充副本";
                    app.doAction("填黑并取消选区",setName); checkDocument();
                    phase = "保存副本"; checkDocument(); d.save();
                    if (!outputFile.exists || outputFile.length<=0) throw new Error("副本保存后文件缺失或为空");
                    saved = true; // 此处只保存复制出的文件；源文件从未交给PS打开。
                    row = ["OK",i,plan.ppi,plan.pixels,plan.actualMM,encodeURIComponent(outputFile.fsName)];
                } catch (e) {
                    row = ["ERROR",i,encodeURIComponent("[" + phase + "] " + e.message),"","",""];
                } finally {
                    if (temp) { try { temp.remove(); } catch (removed) {} }
                    if (atn && atn.exists) {
                        try { if (!atn.remove()) cleanup.push("临时动作文件未能删除：" + atn.fsName); }
                        catch (deleteATN) { cleanup.push("临时动作文件：" + deleteATN.message); }
                    }
                    if (copyOpen && d) {
                        try { d.close(SaveOptions.DONOTSAVECHANGES); copyOpen = false; }
                        catch (closeFailed) { cleanup.push("副本文档未能关闭：" + outputFile.fsName); }
                    }
                    // 保存、关闭之后再清理本轮动作；成功和失败均执行，部分载入也不遗漏。
                    if (setReserved) {
                        try { removeActionSet(setName); }
                        catch (deleteSet) { cleanup.push("临时动作集未能删除：" + setName + "；" + deleteSet.message); }
                    }
                    // 失败时仅删除本次新复制且已关闭的输出；原稿路径绝不进入删除分支。
                    if (copyReserved && !saved && outputFile && outputFile.exists && !samePath(outputFile.fsName,file.fsName)) {
                        if (copyOpen) cleanup.push("失败副本仍在PS中打开，已保留：" + outputFile.fsName);
                        else {
                            try { if (!outputFile.remove()) cleanup.push("失败副本未能删除：" + outputFile.fsName); }
                            catch (deleteCopy) { cleanup.push("失败副本：" + deleteCopy.message); }
                        }
                    }
                }
                row.push(encodeURIComponent(cleanup.join(newline))); answers.push(row.join(tab));
            }
        } catch (startupError) {
            answers = ["FATAL" + tab + encodeURIComponent(startupError.message)];
        } finally {
            if (preferencesRead) {
                try { app.displayDialogs = oldDialogs; app.preferences.rulerUnits = oldUnits; } catch (restorePreferences) {}
            }
            if (previousDocument) { try { app.activeDocument = previousDocument; } catch (closed) {} }
        }
        var result = "YK_OFFSET_5|" + token + "|" + encodeURIComponent(answers.join(newline));
        var receipt = new File(receiptPath); receipt.encoding = "UTF-8";
        try { if (receipt.open("w")) { receipt.write(result); receipt.close(); } } catch (writeReceipt) {}
        return result; // 完整回执写盘后，才把同一内容交回BridgeTalk。
    }
})();
