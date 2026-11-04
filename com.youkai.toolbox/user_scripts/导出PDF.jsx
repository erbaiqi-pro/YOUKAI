#target illustrator
/* 作者：二百七 | Copyright (c) 2026 二百七 | SPDX-License-Identifier: MIT */
/* 导出PDF v0.1 测试版：首份显示 Illustrator 原生保存设置，同批后续沿用最近一次 PDF 设置。 */
(function () {
    var STATE_KEY = "YOUKAI_PDF_EXPORT_V01";
    var ACTION_NAME = "ExportPDF";
    var globals = $.global;
    var batch = globals.YOUKAI_BATCH === true;
    var doc = null, state = null;
    var oldInteraction, target = null;
    var actionFile = null, actionSet = "";
    var first = true, actionStarted = false, completed = false;

    function errorText(error) { return error && error.message ? error.message : String(error); }
    function decodeName(name) {
        try { return decodeURIComponent(String(name)); }
        catch (notEncoded) { return String(name); }
    }
    function resetSession() {
        var current = globals[STATE_KEY];
        if (current) { current.ready = false; current.blocked = ""; current.seen = {}; }
    }
    function installBatchReset() {
        // 当前面板没有传入批次编号。只在运行时监听原有的扫描入口，不改工具箱文件。
        // 新一轮扫描会清除本脚本的状态；递归扫描子文件夹不重复清除。
        var host = globals.Youkai;
        if (!host && typeof Youkai !== "undefined") host = Youkai;
        if (!host || typeof host.getAllAIFiles !== "function") return false;
        if (host.getAllAIFiles._youkaiPDFResetV01) return true;
        var original = host.getAllAIFiles, depth = 0;
        var wrapped = function () {
            if (depth === 0) resetSession();
            depth += 1;
            try { return original.apply(this, arguments); }
            finally { depth -= 1; }
        };
        wrapped._youkaiPDFResetV01 = true;
        resetSession();
        host.getAllAIFiles = wrapped;
        return true;
    }
    function ensureFolder(folder) {
        if (folder.exists) return;
        if (folder.parent && !folder.parent.exists && folder.parent.fsName !== folder.fsName) ensureFolder(folder.parent);
        if (!folder.create() || !folder.exists) throw new Error("无法创建 PDF 输出目录：" + folder.fsName);
    }
    function inputFile() {
        if (batch && globals.YOUKAI_BATCH_SOURCE_FILE) return new File(globals.YOUKAI_BATCH_SOURCE_FILE);
        try { return new File(doc.fullName); }
        catch (unsaved) { throw new Error("请先保存 AI 文档，再导出 PDF。"); }
    }
    function outputFile(source) {
        var baseFolder = globals.YOUKAI_OUTPUT_FOLDER ? new Folder(globals.YOUKAI_OUTPUT_FOLDER) : source.parent;
        var folder = new Folder(baseFolder.fsName + "/PDF");
        ensureFolder(folder);
        var stem = decodeName(source.name).replace(/\.[^.]+$/, "");
        if (!stem) throw new Error("无法取得文件名称。");
        var file = new File(folder.fsName + "/" + stem + ".pdf"), suffix = 2;
        while (file.exists) {
            if (suffix > 99999) throw new Error("同名 PDF 过多，请整理输出目录后重试。");
            file = new File(folder.fsName + "/" + stem + "_" + suffix + ".pdf");
            suffix += 1;
        }
        return file;
    }
    function fileIdentity(document) {
        try { return String(document.fullName.fsName); }
        catch (noFile) { return ""; }
    }
    function utf8Hex(value) {
        // AIA 的字符串长度是 UTF-8 字节数，不能使用中文路径的字符数。
        var encoded = encodeURIComponent(String(value)), hex = "";
        for (var i = 0; i < encoded.length; i += 1) {
            if (encoded.charAt(i) === "%") { hex += encoded.substr(i + 1, 2); i += 2; }
            else { hex += ("0" + encoded.charCodeAt(i).toString(16)).slice(-2); }
        }
        return hex.toLowerCase();
    }
    function stringValue(value) {
        var hex = utf8Hex(value);
        return "[ " + hex.length / 2 + "\n" + hex + "\n]";
    }
    function actionKey(name) {
        var value = 0;
        for (var i = 0; i < 4; i += 1) value = value * 256 + name.charCodeAt(i);
        return value;
    }
    function makeAction(file, showSettings) {
        // optn=2 使用原生 PDF 保存器的最近一次设置；不创建 PDFSaveOptions 来覆盖它。
        // 使用 Save a Copy，保持当前 AI 文档的名称、路径和编辑状态。
        var parameters = [
            ["name", "ustring", file.fsName],
            ["frmt", "ustring", "PDF File Format"],
            ["extn", "ustring", "pdf"],
            ["optn", "integer", 2],
            ["getp", "integer", showSettings ? 1 : 0],
            ["vpdf", "boolean", 0],
            ["smab", "boolean", 0],
            ["sall", "boolean", 1],
            ["sran", "ustring", ""]
        ];
        var result = "/version 3\n/name " + stringValue(actionSet) + "\n/isOpen 0\n/actionCount 1\n/action-1 {\n" +
            "/name " + stringValue(ACTION_NAME) + "\n/keyIndex 0\n/colorIndex 0\n/isOpen 0\n/eventCount 1\n/event-1 {\n" +
            "/useRulersIn1stQuadrant 0\n/internalName (adobe_saveACopyAs)\n/localizedName " + stringValue("Save a Copy") +
            "\n/isOpen 0\n/isOn 1\n/hasDialog 1\n/showDialog " + (showSettings ? 1 : 0) + "\n/parameterCount " + parameters.length + "\n";
        for (var i = 0; i < parameters.length; i += 1) {
            var p = parameters[i];
            result += "/parameter-" + (i + 1) + " {\n/key " + actionKey(p[0]) + "\n/showInPalette -1\n/type (" + p[1] + ")\n/value " +
                (p[1] === "ustring" ? stringValue(p[2]) : p[2]) + "\n}\n";
        }
        return result + "}\n}\n";
    }
    function validatePDF(file) {
        var check = new File(file.fsName);
        if (!check.exists || check.length < 8) throw new Error("未生成 PDF，可能已取消保存。首份请保持脚本给出的目录和文件名。");
        check.encoding = "BINARY";
        if (!check.open("r")) throw new Error("无法检查 PDF：" + check.fsName);
        var signature = "";
        try { signature = check.read(5); }
        finally { check.close(); }
        if (signature !== "%PDF-") throw new Error("输出文件不是有效的 PDF：" + check.fsName);
    }

    try {
        if (typeof app === "undefined" || String(app.name).toLowerCase().indexOf("illustrator") < 0) {
            throw new Error("请在 Illustrator 中运行“导出PDF”。");
        }
        if (!app.documents.length) throw new Error("请先打开 AI 文档。");
        doc = app.activeDocument;
        var source = inputFile();
        if (!source.exists) throw new Error("找不到来源文件，请先保存 AI 文档。");
        var sourceKey = "$" + String(source.fsName).toLowerCase();
        var originalIdentity = fileIdentity(doc), originalName = String(doc.name);
        var originalDocumentCount = app.documents.length;

        if (batch) {
            if (!globals[STATE_KEY]) globals[STATE_KEY] = { ready: false, blocked: "", seen: {} };
            state = globals[STATE_KEY];
            var hasReset = installBatchReset();
            // 兼容旧版入口或没有扫描入口的测试调用：重新遇到同一来源就视为新一轮。
            if (!hasReset && state.seen[sourceKey]) resetSession();
            if (state.blocked) throw new Error(state.blocked);
            first = !state.ready;
            state.seen[sourceKey] = true;
        }
        target = outputFile(source);
        var token = new Date().getTime() + "_" + Math.floor(Math.random() * 1000000);
        actionSet = "YOUKAI_PDF_" + token;
        actionFile = new File(Folder.temp.fsName + "/" + actionSet + ".aia");
        actionFile.encoding = "ASCII";
        if (!actionFile.open("w")) throw new Error("无法创建 PDF 临时动作。");
        try { if (!actionFile.write(makeAction(target, first))) throw new Error("无法写入 PDF 临时动作。"); }
        finally { actionFile.close(); }
        app.loadAction(actionFile);
        oldInteraction = app.userInteractionLevel;
        app.userInteractionLevel = first ? UserInteractionLevel.DISPLAYALERTS : UserInteractionLevel.DONTDISPLAYALERTS;
        actionStarted = true;
        app.doScript(ACTION_NAME, actionSet, first);
        if (app.activeDocument !== doc || app.documents.length !== originalDocumentCount ||
                fileIdentity(doc) !== originalIdentity || String(doc.name) !== originalName) {
            throw new Error("当前 Illustrator 的保存副本行为发生变化。已停止 PDF 导出，请检查当前文档。");
        }
        validatePDF(target);
        completed = true;
        if (state) state.ready = true;
        if (!batch) alert("PDF 已导出：\n" + target.fsName);
    } catch (error) {
        var message = "导出PDF：" + errorText(error);
        if (state && first && actionStarted && !completed) {
            state.ready = false;
            state.blocked = "本批首份 PDF 未确认完成，后续 PDF 已暂停。请停止批处理，重新开始后设置。";
        }
        if (batch) throw new Error(message);
        alert(message);
    } finally {
        if (typeof oldInteraction !== "undefined") {
            try { app.userInteractionLevel = oldInteraction; } catch (restoreInteraction) {}
        }
        if (actionSet) { try { app.unloadAction(actionSet, ""); } catch (unloadError) {} }
        if (actionFile && actionFile.exists) { try { actionFile.remove(); } catch (removeError) {} }
        // 目标名在运行前已避开现有文件，只清理本次失败留下的 PDF。
        if (actionStarted && !completed && target && target.exists) { try { target.remove(); } catch (removePartialPDF) {} }
        // 不保存、不关闭来源 AI；是否保存源文件仍由批处理自己的选项决定。
    }
})();
