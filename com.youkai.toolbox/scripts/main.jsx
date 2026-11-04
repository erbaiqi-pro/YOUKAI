/* YOUKAI 1.0 | 作者：二百七 | Copyright (c) 2026 二百七 | SPDX-License-Identifier: MIT */
var Youkai = (typeof $.global !== "undefined" && $.global.Youkai) ? $.global.Youkai : (typeof Youkai !== "undefined" ? Youkai : {});
if (typeof $.global !== "undefined") {
    $.global.Youkai = Youkai;
}
if (typeof window !== "undefined") {
    window.Youkai = Youkai;
}

Youkai.ping = function () {
    return "PONG";
};

Youkai.getSafeDesktop = function () {
    try {
        if (Folder.desktop && Folder.desktop.exists) return Folder.desktop;
    } catch(e) {}
    try {
        if (Folder.myDocuments && Folder.myDocuments.exists) return Folder.myDocuments;
    } catch(e) {}
    return Folder.userData;
};

Youkai.getSafeDocuments = function () {
    try {
        if (Folder.myDocuments && Folder.myDocuments.exists) return Folder.myDocuments;
    } catch(e) {}
    try {
        if (Folder.desktop && Folder.desktop.exists) return Folder.desktop;
    } catch(e) {}
    return Folder.userData;
};

Youkai.getHostName = function () {
    try {
        if (app && app.name) {
            return String(app.name);
        }
    } catch (err) {}
    return "";
};

Youkai.getHostKey = function () {
    var name = Youkai.getHostName().toLowerCase();
    if (name.indexOf("photoshop") >= 0) {
        return "photoshop";
    }
    if (name.indexOf("indesign") >= 0) {
        return "indesign";
    }
    return "illustrator";
};

Youkai.readContext = function (scriptPath, lineNumber, radius) {
    var line = parseInt(lineNumber, 10);
    if (!scriptPath || !line || line < 1) {
        return [];
    }
    var file = new File(scriptPath);
    if (!file.exists || !file.open("r")) {
        return [];
    }
    var start = Math.max(1, line - (radius || 2));
    var end = line + (radius || 2);
    var rows = [];
    var current = 0;
    try {
        while (!file.eof) {
            current++;
            var text = file.readln();
            if (current >= start && current <= end) {
                rows.push({
                    line: current,
                    text: text,
                    error: current === line
                });
            }
            if (current > end) {
                break;
            }
        }
    } catch (err) {
    } finally {
        file.close();
    }
    return rows;
};

Youkai.result = function (ok, message, file, line, number, context) {
    var payload = {
        ok: ok,
        message: message || "",
        file: file || "",
        line: line || "",
        number: number || "",
        context: context || []
    };
    if (typeof JSON !== "undefined" && JSON.stringify) {
        return JSON.stringify(payload);
    }
    function esc(value) {
        return String(value).replace(/\\/g, "\\\\").replace(/"/g, "\\\"").replace(/\r/g, "\\r").replace(/\n/g, "\\n");
    }
    var contextJson = [];
    for (var i = 0; i < payload.context.length; i++) {
        contextJson.push("{\"line\":" + payload.context[i].line + ",\"text\":\"" + esc(payload.context[i].text) + "\",\"error\":" + (payload.context[i].error ? "true" : "false") + "}");
    }
    return "{\"ok\":" + (ok ? "true" : "false") + ",\"message\":\"" + esc(payload.message) + "\",\"file\":\"" + esc(payload.file) + "\",\"line\":\"" + esc(payload.line) + "\",\"number\":\"" + esc(payload.number) + "\",\"context\":[" + contextJson.join(",") + "]}";
};

// 交给系统默认应用打开表格；Explorer 的退出码不能代表关联程序是否打开成功。
Youkai.openCsvFile = function (filePath) {
    try {
        var file = new File(filePath);
        if (!/\.csv$/i.test(file.name)) return Youkai.result(false, "请选择 CSV 配置文件。");
        if (!file.exists) return Youkai.result(false, "CSV 文件不存在：" + file.fsName);
        if (!file.execute()) return Youkai.result(false, file.error || "系统未能打开表格，请检查 CSV 的默认打开方式。");
        return Youkai.result(true, "已交给默认表格软件打开。");
    } catch (error) {
        return Youkai.result(false, error.message || String(error));
    }
};

Youkai.writeRunJson = function (filePath, payload) {
    try {
        if (!filePath) return;
        var file = new File(filePath);
        var folder = file.parent;
        if (folder && !folder.exists) {
            folder.create();
        }
        file.encoding = "UTF-8";
        if (!file.open("w")) return;
        var json = "";
        if (typeof JSON !== "undefined" && JSON.stringify) {
            json = JSON.stringify(payload);
        } else {
            function esc(value) {
                return String(value || "").replace(/\\/g, "\\\\").replace(/"/g, "\\\"").replace(/\r/g, "\\r").replace(/\n/g, "\\n");
            }
            json = "{\"runId\":\"" + esc(payload.runId) + "\",\"state\":\"" + esc(payload.state) + "\",\"command\":\"" + esc(payload.command) + "\",\"scriptName\":\"" + esc(payload.scriptName) + "\",\"scriptPath\":\"" + esc(payload.scriptPath) + "\",\"source\":\"" + esc(payload.source) + "\",\"message\":\"" + esc(payload.message) + "\",\"updatedAt\":" + String(payload.updatedAt || 0) + "}";
        }
        file.write(json);
        file.close();
    } catch (err) {}
};

Youkai.safeDecodeName = function (name) {
    try {
        return decodeURI(name);
    } catch (err) {
        return String(name || "");
    }
};

Youkai.stringifyJson = function (value) {
    if (typeof JSON !== "undefined" && JSON.stringify) {
        return JSON.stringify(value);
    }
    function esc(text) {
        return String(text || "").replace(/\\/g, "\\\\").replace(/"/g, "\\\"").replace(/\r/g, "\\r").replace(/\n/g, "\\n");
    }
    function write(item) {
        var i, rows, key;
        if (item === null || item === undefined) return "null";
        if (typeof item === "number" || typeof item === "boolean") return String(item);
        if (typeof item === "string") return "\"" + esc(item) + "\"";
        if (Object.prototype.toString.call(item) === "[object Array]") {
            rows = [];
            for (i = 0; i < item.length; i++) rows.push(write(item[i]));
            return "[" + rows.join(",") + "]";
        }
        rows = [];
        for (key in item) {
            if (item.hasOwnProperty(key)) rows.push("\"" + esc(key) + "\":" + write(item[key]));
        }
        return "{" + rows.join(",") + "}";
    }
    return write(value);
};

Youkai.parseJson = function (text) {
    if (typeof JSON !== "undefined" && JSON.parse) {
        return JSON.parse(text);
    }
    return eval("(" + text + ")");
};

Youkai.writeJsonFile = function (filePath, payload) {
    try {
        if (!filePath) return;
        var file = new File(filePath);
        var folder = file.parent;
        if (folder && !folder.exists) folder.create();
        file.encoding = "UTF-8";
        if (!file.open("w")) return;
        file.write(Youkai.stringifyJson(payload));
        file.close();
    } catch (err) {}
};

Youkai.appendTextFile = function (filePath, text) {
    try {
        if (!filePath) return;
        var file = new File(filePath);
        var folder = file.parent;
        if (folder && !folder.exists) folder.create();
        file.encoding = "UTF-8";
        if (!file.open("a")) return;
        file.write(String(text || ""));
        file.close();
    } catch (err) {}
};

Youkai.runScript = function (scriptPath, cppMode, runId, statusPath, requestPath) {
    try {
        if (!scriptPath) return Youkai.result(false, "脚本路径为空");
        var file = new File(scriptPath);
        if (!file.exists) return Youkai.result(false, "找不到脚本: " + scriptPath, scriptPath);

        $.global.YOUKAI_CPP_MODE = Youkai.normalizeCppMode(cppMode);
        $.global.YOUKAI_RUN_ID = runId || "";
        
        var sName = Youkai.safeDecodeName(file.name);
        var initPayload = { runId: runId || "", state: "running", command: "", scriptName: sName, scriptPath: file.fsName, source: "jsx", message: "running", updatedAt: new Date().getTime() };
        if(statusPath) Youkai.writeRunJson(statusPath, initPayload);
        if(requestPath) Youkai.writeRunJson(requestPath, initPayload);

        $.evalFile(file.fsName);

        var donePayload = { runId: runId || "", state: "done", command: "", scriptName: sName, scriptPath: file.fsName, source: "jsx", message: "已执行 " + sName, updatedAt: new Date().getTime() };
        if(statusPath) Youkai.writeRunJson(statusPath, donePayload);
        return Youkai.result(true, "已执行 " + sName, file.fsName);
    } catch (err) {
        var message = err && err.message ? err.message : String(err);
        var line = err && err.line ? err.line : "";
        var number = err && err.number ? err.number : "";
        var errorFile = err && err.fileName ? err.fileName : scriptPath;
        var context = Youkai.readContext(scriptPath, line, 2);
        if(statusPath) {
            Youkai.writeRunJson(statusPath, { runId: runId || "", state: "error", command: "", scriptName: scriptPath ? Youkai.safeDecodeName(new File(scriptPath).name) : "", scriptPath: scriptPath || "", source: "jsx", message: message, errorCode: number, updatedAt: new Date().getTime() });
        }
        return Youkai.result(false, message, errorFile, line, number, context);
    }
};

Youkai.getActiveDocumentFolder = function () {
    try {
        if (!app.documents.length) return "ERROR: 当前没有打开的文档";
        var doc = app.activeDocument;
        var fullName = null;
        try { fullName = doc.fullName; } catch (errFullName) {}
        if (!fullName) return "ERROR: 当前文档尚未保存，无法获取所在文件夹";
        return fullName.parent.fsName;
    } catch (err) {
        return "ERROR: " + (err && err.message ? err.message : String(err));
    }
};

Youkai.selectFolder = function (promptText) {
    try {
        var folder = Folder.selectDialog(promptText || "选择文件夹");
        if (!folder || !folder.exists) {
            return Youkai.result(false, "未选择文件夹");
        }
        return Youkai.result(true, folder.fsName);
    } catch (err) {
        return Youkai.result(false, err && err.message ? err.message : String(err));
    }
};

Youkai.isSkipBatchPath = function (value) {
    return /(^|[\\/])links?([\\/]|$)/i.test(String(value || ""));
};

Youkai.isSkipBatchFolder = function (folder) {
    return Youkai.isSkipBatchPath(folder && (folder.fsName || folder.name));
};

Youkai.getAllAIFiles = function (folderPath) {
    var list = [];
    var folder = new Folder(folderPath);
    if (!folder.exists || Youkai.isSkipBatchFolder(folder)) return list;
    var items = folder.getFiles();
    for (var i = 0; i < items.length; i++) {
        var item = items[i];
        if (item instanceof Folder) {
            if (!Youkai.isSkipBatchFolder(item)) {
                list = list.concat(Youkai.getAllAIFiles(item.fsName));
            }
        } else if (item instanceof File) {
            var lower = String(item.name || "").toLowerCase();
            if (/\.ai$/i.test(lower)) list.push(item);
        }
    }
    return list;
};

Youkai.shouldStopBatch = function (stopPath) {
    if (!stopPath) return false;
    return !(new File(stopPath)).exists;
};

Youkai.confirmPackageDialog = function () {
    try {
        if (typeof ActiveXObject !== "undefined") {
            var shell = new ActiveXObject("WScript.Shell");
            var titles = ["打包", "Package"];
            for (var i = 0; i < titles.length; i++) {
                try {
                    shell.AppActivate(titles[i]);
                    $.sleep(200);
                    shell.SendKeys("{TAB}");
                    $.sleep(100);
                    shell.SendKeys("{ENTER}");
                    $.sleep(500);
                    return true;
                } catch (innerErr) {}
            }
        } else if ($.os && $.os.indexOf("Mac") >= 0) {
            try {
                app.doScript('tell application "System Events" to key code 36', ScriptLanguage.APPLESCRIPT_LANGUAGE);
                return true;
            } catch (macErr) {}
        }
    } catch (err) {
        try {
            if (typeof ActiveXObject !== "undefined") {
                var ws = new ActiveXObject("WScript.Shell");
                ws.SendKeys("{ENTER}");
                return true;
            }
        } catch (fallbackErr) {}
    }
    return false;
};

Youkai.closeActiveDocumentWithoutSaving = function () {
    try {
        if (app.documents.length > 0) {
            app.activeDocument.close(SaveOptions.DONOTSAVECHANGES);
        }
    } catch (err) {}
};

Youkai.runBatch = function (configJson) {
    var cfg = null;
    var statusPath = "";
    var stopPath = "";
    var errorPath = "";
    try {
        cfg = typeof configJson === "string" ? Youkai.parseJson(configJson) : configJson;
        statusPath = cfg.statusPath || "";
        stopPath = cfg.stopPath || "";
        errorPath = cfg.errorPath || "";

        if (Youkai.getHostKey() !== "illustrator") {
            return Youkai.result(false, "批处理目前只支持 Illustrator");
        }

        var scripts = cfg.scriptPaths || [];
        if (!scripts.length) return Youkai.result(false, "没有可执行的脚本");

        var scriptFiles = [];
        for (var s = 0; s < scripts.length; s++) {
            var scriptFile = new File(scripts[s]);
            if (!scriptFile.exists) {
                return Youkai.result(false, "找不到脚本: " + scripts[s], scripts[s]);
            }
            scriptFiles.push(scriptFile);
        }

        var sourceFolder = new Folder(cfg.sourceFolder || "");
        if (!sourceFolder.exists) {
            return Youkai.result(false, "找不到 AI 根目录: " + (cfg.sourceFolder || ""));
        }

        var stopFile = new File(stopPath);
        if (stopPath && !stopFile.exists) {
            stopFile.encoding = "UTF-8";
            if (stopFile.open("w")) {
                stopFile.write("running");
                stopFile.close();
            }
        }
        var oldErrorFile = new File(errorPath);
        if (errorPath && oldErrorFile.exists) oldErrorFile.remove();

        $.global.YOUKAI_CPP_MODE = Youkai.normalizeCppMode(cfg.cppMode);
        $.global.YOUKAI_BATCH = true;

        var files = Youkai.getAllAIFiles(sourceFolder.fsName);
        var total = files.length;
        var done = 0;
        var success = 0;
        var fail = 0;

        if (total === 0) {
            Youkai.writeJsonFile(statusPath, { state: "done", total: 0, done: 0, success: 0, fail: 0, current: "", message: "未找到任何 .ai 文件", updatedAt: new Date().getTime() });
            return Youkai.result(false, "未找到任何 .ai 文件");
        }

        Youkai.writeJsonFile(statusPath, { state: "running", total: total, done: 0, success: 0, fail: 0, current: "", message: "开始批处理", updatedAt: new Date().getTime() });

        for (var i = 0; i < files.length; i++) {
            if (Youkai.shouldStopBatch(stopPath)) {
                Youkai.writeJsonFile(statusPath, { state: "stopped", total: total, done: done, success: success, fail: fail, current: "", message: "已停止", updatedAt: new Date().getTime() });
                return Youkai.result(false, "批处理已停止。完成: " + done + "/" + total + "，成功: " + success + "，失败: " + fail);
            }

            var currentFile = files[i];
            done++;
            Youkai.writeJsonFile(statusPath, { state: "running", total: total, done: done, success: success, fail: fail, current: Youkai.safeDecodeName(currentFile.name), message: "正在处理", updatedAt: new Date().getTime() });

            try {
                if (Youkai.isSkipBatchPath(currentFile.fsName)) throw new Error("保护跳过：文件位于 link / links 文件夹内，本文件不执行、不保存。");
                app.open(currentFile);
                var doc = app.activeDocument;

                $.global.YOUKAI_BATCH_SOURCE_FILE = currentFile.fsName;
                $.global.YOUKAI_BATCH_INDEX = done;
                $.global.YOUKAI_BATCH_TOTAL = total;

                for (var runIndex = 0; runIndex < scriptFiles.length; runIndex++) {
                    $.global.YOUKAI_BATCH_SCRIPT_INDEX = runIndex + 1;
                    $.evalFile(scriptFiles[runIndex].fsName);
                    $.sleep(300);
                }

                if (cfg.autoConfirmPackage) {
                    $.sleep(500);
                    Youkai.confirmPackageDialog();
                }

                if (cfg.saveSource) {
                    try { doc.save(); } catch (saveErr) {}
                }

                try { doc.close(SaveOptions.DONOTSAVECHANGES); } catch (closeErr) {}
                success++;

                Youkai.writeJsonFile(statusPath, { state: "running", total: total, done: done, success: success, fail: fail, current: Youkai.safeDecodeName(currentFile.name), message: "处理完成", updatedAt: new Date().getTime() });
            } catch (errFile) {
                fail++;
                var errMsg = errFile && errFile.message ? errFile.message : String(errFile);
                Youkai.appendTextFile(errorPath, "[" + new Date().toLocaleString() + "]\n文件: " + currentFile.fsName + "\n错误: " + errMsg + "\n----------------------------------------\n");
                Youkai.closeActiveDocumentWithoutSaving();
                Youkai.writeJsonFile(statusPath, { state: "running", total: total, done: done, success: success, fail: fail, current: Youkai.safeDecodeName(currentFile.name), message: "处理出错", updatedAt: new Date().getTime() });
            }
        }

        if (stopPath && (new File(stopPath)).exists) {
            try { (new File(stopPath)).remove(); } catch (removeErr) {}
        }
        var finalMessage = "批处理完成。总计: " + total + "，成功: " + success + "，失败: " + fail;
        if (fail > 0 && errorPath) finalMessage += "。错误日志: " + errorPath;
        Youkai.writeJsonFile(statusPath, { state: "done", total: total, done: done, success: success, fail: fail, current: "", message: finalMessage, updatedAt: new Date().getTime() });
        return Youkai.result(fail === 0, finalMessage);
    } catch (err) {
        var message = err && err.message ? err.message : String(err);
        Youkai.writeJsonFile(statusPath, { state: "error", message: message, updatedAt: new Date().getTime() });
        return Youkai.result(false, message);
    }
};

Youkai.normalizeCppMode = function (mode) {
    mode = String(mode || "auto").toLowerCase();
    if (mode === "cpp" || mode === "jsx") return mode;
    return "auto";
};

Youkai.getAllAIFilesJSON = function(folderPath) {
    try {
        if (Youkai.getHostKey() !== "illustrator") return Youkai.result(false, "批处理目前只支持 Illustrator");
        var files = Youkai.getAllAIFiles(folderPath);
        var paths = [];
        for (var i = 0; i < files.length; i++) {
            paths.push(files[i].fsName);
        }
        return Youkai.stringifyJson({ ok: true, files: paths });
    } catch(e) {
        return Youkai.stringifyJson({ ok: false, message: e.message || String(e) });
    }
};

Youkai.processSingleFileForBatch = function(configStr) {
    var doc = null;
    var oldBatch = $.global.YOUKAI_BATCH;
    var oldSource = $.global.YOUKAI_BATCH_SOURCE_FILE;
    var oldOutput = $.global.YOUKAI_OUTPUT_FOLDER;
    try {
        if (Youkai.getHostKey() !== "illustrator") return Youkai.result(false, "批处理目前只支持 Illustrator");
        var cfg = typeof configStr === "string" ? Youkai.parseJson(configStr) : configStr;
        if (!cfg || !cfg.targetFile || !cfg.scriptPaths || !cfg.scriptPaths.length) return Youkai.result(false, "批处理参数不完整");
        var file = new File(cfg.targetFile);
        if (!file.exists) return Youkai.result(false, "文件不存在: " + cfg.targetFile);
        if (Youkai.isSkipBatchPath(file.fsName)) return Youkai.result(false, "保护跳过：文件位于 link / links 文件夹内，本文件不执行、不保存。");
        for (var s = 0; s < cfg.scriptPaths.length; s++) {
            if (!(new File(cfg.scriptPaths[s])).exists) return Youkai.result(false, "找不到脚本: " + cfg.scriptPaths[s]);
        }
        doc = app.open(file);
        
        $.global.YOUKAI_BATCH = true;
        $.global.YOUKAI_BATCH_SOURCE_FILE = file.fsName;
        $.global.YOUKAI_OUTPUT_FOLDER = cfg.outputFolder || "";

        for (var i = 0; i < cfg.scriptPaths.length; i++) {
            var scriptFile = new File(cfg.scriptPaths[i]);
            if (!scriptFile.exists) throw new Error("找不到脚本: " + cfg.scriptPaths[i]);
            app.activeDocument = doc;
            $.evalFile(scriptFile.fsName);
        }
        
        if (cfg.saveSource) {
                var saveOptions = new IllustratorSaveOptions();
                saveOptions.pdfCompatible = cfg.pdfCompat !== undefined ? cfg.pdfCompat : false;
                saveOptions.compressed = cfg.useCompression !== undefined ? cfg.useCompression : true;
                saveOptions.embedICCProfile = cfg.embedIcc !== undefined ? cfg.embedIcc : true;
                saveOptions.fontSubsetThreshold = 100.0;
                // 打包脚本会另存为；保存源文件仍应指向本轮输入文件。
                doc.saveAs(file, saveOptions);
        }
        
        doc.close(SaveOptions.DONOTSAVECHANGES);
        return Youkai.result(true, "处理成功");
    } catch(e) {
        if (doc) { try { doc.close(SaveOptions.DONOTSAVECHANGES); } catch(err) {} }
        return Youkai.result(false, e.message || String(e));
    } finally {
        $.global.YOUKAI_BATCH = oldBatch;
        $.global.YOUKAI_BATCH_SOURCE_FILE = oldSource;
        $.global.YOUKAI_OUTPUT_FOLDER = oldOutput;
    }
};
