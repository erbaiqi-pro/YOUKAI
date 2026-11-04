/* YOUKAI 1.0 | 作者：二百七 | Copyright (c) 2026 二百七 | SPDX-License-Identifier: MIT */
/**
 * 查找与替换 (外部CSV读取版)
 * 功能：根据 CSV 文件进行全文档的文字批量查找与替换。
 * CSV 格式要求：每一行两列 -> 查找内容,替换内容
 * 例如：旧名字,新名字
 */
#target illustrator

var errorLogFile = Folder.desktop + "/查找与替换错误日志.txt";

function writeErrorLog(message) {
    try {
        var logFile = new File(errorLogFile);
        logFile.open("a");
        logFile.write(new Date().toLocaleString() + " - " + message + "\n");
        logFile.close();
    } catch (e) {}
}

function escapeRegExp(string) {
    return string.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function batchReplaceCSV() {
    if (app.documents.length === 0) return;

    var doc = app.activeDocument;

    // 1. 获取 CSV 文件
    var scriptFile = new File($.fileName);
    var baseName = decodeURI(scriptFile.name).replace(/\.jsx?$/i, "");
    if (!baseName) baseName = "查找与替换";

    var candidateFolders = [];
    if ($.global && $.global.YOUKAI_CSV_FOLDER) {
        candidateFolders.push($.global.YOUKAI_CSV_FOLDER);
    }
    candidateFolders.push(Folder.userData + "/com.youkai.toolbox/csv");
    candidateFolders.push(Folder.myDocuments + "/Youkai/csv");

    var csvFile = null;
    for (var i = 0; i < candidateFolders.length; i++) {
        var folderPath = candidateFolders[i];
        var testFile = new File(folderPath + "/" + baseName + ".csv");
        if (testFile.exists) { csvFile = testFile; break; }
    }

    if (!csvFile || !csvFile.exists) {
        var defaultFolder = ($.global && $.global.YOUKAI_CSV_FOLDER) ? $.global.YOUKAI_CSV_FOLDER : (Folder.userData + "/com.youkai.toolbox/csv");
        writeErrorLog("找不到CSV文件：" + defaultFolder + "/" + baseName + ".csv");
        return;
    }

    // 2. 解析 CSV 数据
    var replacePairs = [];
    var parseError = [];
    try {
        csvFile.encoding = "UTF-8";
        if (!csvFile.open("r")) throw new Error("无法读取 CSV。");
        var content = csvFile.read().replace(/^\uFEFF/, "");
        csvFile.close();
        
        var lines = content.split("\n");
        for (var i = 0; i < lines.length; i++) {
            var line = lines[i];
            line = line.replace(/\r/g, "");
            
            // 忽略空行
            if (line && line.replace(/^\s+|\s+$/g, "") !== "") {
                var parts = line.split(",");
                // 清理由于 Excel 多余列产生的尾部空元素
                while (parts.length > 2 && parts[parts.length - 1].replace(/^\s+|\s+$/g, "") === "") {
                    parts.pop();
                }

                if (parts.length >= 2) { 
                    // 处理引号和首尾空格
                    var findStr = parts[0].replace(/^"|"$/g, "").replace(/(^"|"$)/g, "");
                    var replaceStr = parts[1].replace(/^"|"$/g, "").replace(/(^"|"$)/g, "");
                    
                    if (findStr !== "") {
                        replacePairs.push({
                            find: findStr,
                            replace: replaceStr
                        });
                    }
                } else {
                    parseError.push("第 " + (i + 1) + " 行格式不完整(需要两列：查找,替换)，跳过。");
                }
            }
        }
    } catch (e) {
        writeErrorLog("读取CSV出错：" + e.toString());
        return;
    }

    if (parseError.length > 0) {
        writeErrorLog("CSV解析警告：\n" + parseError.join("\n"));
    }

    if (replacePairs.length === 0) {
        writeErrorLog("CSV表格为空或没读到有效的查找替换数据。");
        return;
    }

    // 3. 遍历全文档文本并替换
    var modifiedCount = 0;
    var frames = doc.textFrames;
    function editable(item) {
        while (item && item !== doc) {
            if (item.locked || item.hidden || (item.typename === "Layer" && !item.visible)) return false;
            item = item.parent;
        }
        return true;
    }
    
    for (var i = 0; i < frames.length; i++) {
        var frame = frames[i];
        try {
            if (editable(frame)) {
                var oldText = frame.contents;
                if (typeof oldText !== "string") continue;
                
                var newText = oldText;
                for (var j = 0; j < replacePairs.length; j++) {
                    var pair = replacePairs[j];
                    // 全局替换
                    var regex = new RegExp(escapeRegExp(pair.find), 'g');
                    newText = newText.replace(regex, function () { return pair.replace; });
                }
                
                if (oldText !== newText) {
                    frame.contents = newText;
                    modifiedCount++;
                }
            }
        } catch(e) {
            // 如果遇到嵌套锁定的编组导致无法修改，则忽略并跳过
        }
    }

    // 4. 反馈
    if (modifiedCount === 0) {
        writeErrorLog("执行完毕。没有找到任何可替换的文本（被锁定/隐藏的文本会被跳过）。");
    } else {
        // 静默执行，只写日志
        writeErrorLog("执行完毕。共修改了 " + modifiedCount + " 处文本对象。");
    }
}

try {
    batchReplaceCSV();
} catch (e) {
    writeErrorLog("致命错误中断：" + e.toString());
}
