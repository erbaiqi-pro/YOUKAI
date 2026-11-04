var 完成图存放地址 = ($.global && $.global.YOUKAI_EXPORT_FOLDER) ? $.global.YOUKAI_EXPORT_FOLDER : "~/Desktop/outjpg/";
var exportGroups = [];
var errorLogFile = Folder.desktop + "/CSV多图层导出错误日志.txt";

function getCsvFile() {
    var scriptFile = new File($.fileName);
    var baseName = scriptFile.name.replace(/\.jsx?$/i, "");
    if (!baseName) baseName = "导出指定图层";

    var candidateFolders = [];
    if ($.global && $.global.YOUKAI_CSV_FOLDER) {
        candidateFolders.push($.global.YOUKAI_CSV_FOLDER);
    }
    candidateFolders.push(Folder.userData + "/com.youkai.toolbox/csv");
    candidateFolders.push(Folder.myDocuments + "/Youkai/csv");

    for (var i = 0; i < candidateFolders.length; i++) {
        var folderPath = candidateFolders[i];
        var targetFile = new File(folderPath + "/" + baseName + ".csv");
        if (targetFile.exists) return targetFile;

        var fallbackName = baseName.replace(/指定/g, "").replace(/^修改/, "") + ".csv";
        var fallbackFile = new File(folderPath + "/" + fallbackName);
        if (fallbackFile.exists) return fallbackFile;
    }

    var defaultFolder = ($.global && $.global.YOUKAI_CSV_FOLDER) ? $.global.YOUKAI_CSV_FOLDER : (Folder.userData + "/com.youkai.toolbox/csv");
    return new File(defaultFolder + "/" + baseName + ".csv");
}

function silentExport() {
    try {
        if (!loadCSV()) {
            return false;
        }
        if (app.documents.length === 0) {
            writeErrorLog("没有打开的AI文档");
            return false;
        }
        return performExport();
    } catch (e) {
        writeErrorLog("导出过程中出现严重错误: " + e.toString());
        return false;
    }
}

function loadCSV() {
    exportGroups = [];
    var csvFile = getCsvFile();
    if (!csvFile || !csvFile.exists) {
        writeErrorLog("CSV文件不存在: " + (csvFile ? csvFile.fsName : "未知路径"));
        return false;
    }
    try {
        csvFile.open("r");
        var content = csvFile.read();
        csvFile.close();
        var lines = content.split("\n");
        for (var i = 0; i < lines.length; i += 1) {
            var line = lines[i];
            if (line && line.replace(/^\s+|\s+$/g, "") !== "") {
                var parts = line.split(",");
                var currentGroup = [];
                for (var j = 0; j < parts.length; j += 1) {
                    var layerName = parts[j].replace(/"/g, "").replace(/^\s+|\s+$/g, "");
                    if (layerName !== "") {
                        currentGroup.push(layerName);
                    }
                }
                if (currentGroup.length > 0) {
                    exportGroups.push(currentGroup);
                }
            }
        }
        if (exportGroups.length === 0) {
            return false;
        }
        return true;
    } catch (e) {
        writeErrorLog("读取CSV文件时出错: " + e.toString());
        return false;
    }
}

// 递归搜索图层（包含子图层）
function findLayerByName(layerContainer, name) {
    for (var i = 0; i < layerContainer.layers.length; i++) {
        var layer = layerContainer.layers[i];
        if (layer.name === name) return layer;
        try {
            if (layer.layers && layer.layers.length > 0) {
                var found = findLayerByName(layer, name);
                if (found) return found;
            }
        } catch(e) {}
    }
    return null;
}

function performExport() {
    try {
        var outputFolder = new Folder(完成图存放地址);
        if (!outputFolder.exists) {
            outputFolder.create();
        }
        exportJPGAction();
        var doc = app.activeDocument;
        var originalInteractionLevel = app.userInteractionLevel;
        app.userInteractionLevel = UserInteractionLevel.DONTDISPLAYALERTS;
        var missingLinks = checkMissingLinks(doc);
        if (missingLinks.length > 0) {
            writeErrorLog("文档缺少链接，导出可能不完整: " + missingLinks.join(", "));
        }
        var originalArtboardNames = [];
        for (var j = 0; j < doc.artboards.length; j += 1) {
            originalArtboardNames.push(doc.artboards[j].name);
        }
        var exportedGroups = [];
        var failedGroups = [];
        for (var groupIndex = 0; groupIndex < exportGroups.length; groupIndex += 1) {
            var currentGroup = exportGroups[groupIndex];
            var groupLayers = [];
            var groupSuccess = true;
            for (var i = 0; i < currentGroup.length; i += 1) {
                var targetLayerName = currentGroup[i];
                var targetLayer = null;
                for (var j = 0; j < doc.layers.length; j += 1) {
                    if (doc.layers[j].name === targetLayerName) {
                        targetLayer = doc.layers[j];
                        break;
                    }
                }
                if (targetLayer) {
                    groupLayers.push(targetLayer);
                } else {
                    writeErrorLog("未找到图层: " + targetLayerName + " (在第 " + (groupIndex + 1) + " 行)，文档现有图层: " + (function(d){ var names=[]; for(var x=0;x<d.layers.length;x++) names.push(d.layers[x].name); return names.join(","); })(doc));
                    groupSuccess = false;
                    break;
                }
            }
            if (groupLayers.length > 0 && groupSuccess) {
                try {
                    for (var k = 0; k < doc.layers.length; k += 1) {
                        doc.layers[k].visible = false;
                    }
                    for (var k = 0; k < groupLayers.length; k += 1) {
                        groupLayers[k].visible = true;
                    }
                    var groupDisplayName = currentGroup.join("+");
                    for (var j = 0; j < doc.artboards.length; j += 1) {
                        var originalName = originalArtboardNames[j];
                        doc.artboards[j].name = originalName + "@ " + groupDisplayName;
                    }
                    app.redraw();
                    app.doScript("jpg", "LY用导出JPG");
                    for (var j = 0; j < doc.artboards.length; j += 1) {
                        doc.artboards[j].name = originalArtboardNames[j];
                    }
                    exportedGroups.push(groupDisplayName);
                } catch (groupError) {
                    writeErrorLog("导出图层组 " + groupDisplayName + " 时出错: " + groupError.toString());
                    failedGroups.push(groupDisplayName);
                }
            } else {
                failedGroups.push(currentGroup.join("+"));
            }
        }
        for (var k = 0; k < doc.layers.length; k += 1) {
            doc.layers[k].visible = true;
        }
        app.userInteractionLevel = originalInteractionLevel;
        app.unloadAction("LY用导出JPG", "");
        
        if (failedGroups.length > 0) {
            var errorMessage = "导出完成，但有部分图层组失败:\n";
            errorMessage += "成功导出: " + exportedGroups.length + " 个图层组\n";
            errorMessage += "失败: " + failedGroups.length + " 个图层组\n";
            errorMessage += "文档名称: " + doc.name + "\n";
            errorMessage += "导出时间: " + new Date().toString() + "\n";
            if (exportedGroups.length > 0) {
                errorMessage += "\n成功导出的图层组:\n";
                for (var i = 0; i < exportedGroups.length; i += 1) {
                    errorMessage += "  - " + exportedGroups[i] + "\n";
                }
            }
            errorMessage += "\n失败的图层组:\n";
            for (var i = 0; i < failedGroups.length; i += 1) {
                errorMessage += "  - " + failedGroups[i] + "\n";
            }
            writeErrorLog(errorMessage);
            alert("导出结束，但部分组失败，请查看桌面“CSV多图层导出错误日志.txt”！");
        } else {
            // 已静音
        }
        try {
            if ($.global.YOUKAI_AUTO_CLASSIFY === true || $.global.YOUKAI_AUTO_CLASSIFY === 'true') {
                var delims = $.global.YOUKAI_CLASSIFY_DELIMS || "@,_";
                classifyFiles(完成图存放地址, delims);
            }
        } catch(clsErr) {
            writeErrorLog("分类失败: " + clsErr.toString());
        }
        return exportedGroups.length > 0;
    } catch (e) {
        writeErrorLog("执行导出操作时出错: " + e.toString());
        return false;
    }
}

function exportJPGAction() {
    try {
        app.unloadAction("LY用导出JPG", "");
    } catch (err) {}
    var 动作存放地址 = 完成图存放地址; // 已修正：使用插件设置的导出路径
    var Code = "/version 3\n/name [ 14\n\t4c59e794a8e5afbce587ba4a5047\n]\n/isOpen 1\n/actionCount 1\n/action-1 {\n\t/name [ 3\n\t\t6a7067\n\t]\n\t/keyIndex 0\n\t/colorIndex 0\n\t/isOpen 1\n\t/eventCount 1\n\t/event-1 {\n\t\t/useRulersIn1stQuadrant 0\n\t\t/internalName (adobe_exportDocument)\n\t\t/localizedName [ 9\n\t\t\te5afbce587bae4b8ba\n\t\t]\n\t\t/isOpen 0\n\t\t/isOn 1\n\t\t/hasDialog 1\n\t\t/showDialog 0\n\t\t/parameterCount 6\n\t\t/parameter-1 {\n\t\t\t/key 1851878757\n\t\t\t/showInPalette -1\n\t\t\t/type (ustring)\n\t\t\t/value [ " + 动作存放地址.length + "\n\t\t\t\t" + 转十六进制 (动作存放地址) + "\n\t\t\t]\n\t\t}\n\t\t/parameter-2 {\n\t\t\t/key 1718775156\n\t\t\t/showInPalette -1\n\t\t\t/type (ustring)\n\t\t\t/value [ 16\n\t\t\t\t41646f626520504e4720466f726d6174\n\t\t\t]\n\t\t}\n\t\t/parameter-3 {\n\t\t\t/key 1702392942\n\t\t\t/showInPalette -1\n\t\t\t/type (ustring)\n\t\t\t/value [ 3\n\t\t\t\t706e67\n\t\t\t]\n\t\t}\n\t\t/parameter-4 {\n\t\t\t/key 1936548194\n\t\t\t/showInPalette -1\n\t\t\t/type (boolean)\n\t\t\t/value 1\n\t\t}\n\t\t/parameter-5 {\n\t\t\t/key 1935764588\n\t\t\t/showInPalette -1\n\t\t\t/type (boolean)\n\t\t\t/value 1\n\t\t}\n\t\t/parameter-6 {\n\t\t\t/key 1936875886\n\t\t\t/showInPalette -1\n\t\t\t/type (ustring)\n\t\t\t/value [ 1\n\t\t\t\t31\n\t\t\t]\n\t\t}\n\t}\n}\n";
    var f = new File("" + 动作存放地址 + "/" + "暂存动作一会就删不要担心" + ".aia");
    f.open("w");
    f.write(Code);
    f.close();
    app.loadAction(f);
    f.remove();

    function 转十六进制 (字符) {
        var result = "";
        for (var i = 0; i < 字符.length; i += 1) {
            result += 字符.charCodeAt(i).toString(16);
        }
        return result;
    }
}

function checkMissingLinks(doc) {
    var missingLinks = [];
    if (doc.placedItems && doc.placedItems.length > 0) {
        for (var i = 0; i < doc.placedItems.length; i += 1) {
            var item = doc.placedItems[i];
            try {
                var filePath = item.file.fsName;
                if (!item.embedded && !new File(filePath).exists) {
                    missingLinks.push(filePath);
                }
            } catch (e) {
                missingLinks.push("未知链接 #" + (i + 1));
            }
        }
    }
    return missingLinks;
}

function writeErrorLog(message) {
    try {
        var logFile = new File(errorLogFile);
        logFile.open("a");
        logFile.write(new Date().toLocaleString() + " - " + message + "\n");
        logFile.close();
    } catch (e) {
        $.writeln("无法写入日志文件: " + e.toString());
        $.writeln("原始消息: " + message);
    }
}

function classifyFiles(folderPath, delimiters) {
    try {
        var sepChars = [];
        var parts = delimiters.split(',');
        for (var i = 0; i < parts.length; i++) {
            var s = parts[i].replace(/^\s+|\s+$/g, "");
            if (s) sepChars.push(s);
        }
        if (sepChars.length === 0) return;

        var folder = new Folder(folderPath);
        if (!folder.exists) return;

        var files = folder.getFiles();

        for (var i = 0; i < files.length; i++) {
            var file = files[i];
            if (file instanceof File) {
                var filename = decodeURI(file.name);
                var categories = [];
                var remaining_name = filename;
                var valid = true;

                for (var j = 0; j < sepChars.length; j++) {
                    var sep = sepChars[j];
                    var sep_index = remaining_name.lastIndexOf(sep);
                    if (sep_index === -1) {
                        valid = false;
                        break;
                    }

                    var after_sep = remaining_name.substring(sep_index + sep.length);
                    var cat_content;
                    var last_dot = after_sep.lastIndexOf('.');
                    
                    if (last_dot !== -1) {
                        var ext = after_sep.substring(last_dot + 1);
                        if (ext.length <= 4 && /^[A-Za-z]+$/.test(ext)) {
                            cat_content = after_sep.substring(0, last_dot);
                        } else {
                            cat_content = after_sep;
                        }
                    } else {
                        cat_content = after_sep;
                    }

                    remaining_name = remaining_name.substring(0, sep_index);
                    cat_content = cat_content.replace(/^\s+|\s+$/g, "");

                    if (!cat_content) {
                        valid = false;
                        break;
                    }

                    var badChars = ["\\", "/", ":", "*", "?", "\"", "<", ">", "|"];
                    for (var b = 0; b < badChars.length; b++) {
                        cat_content = cat_content.split(badChars[b]).join("_");
                    }
                    cat_content = cat_content.replace(/^\s+|\s+$/g, "");
                    categories.push(cat_content);
                }

                if (valid && categories.length > 0) {
                    var combined_folder = categories.join("-");
                    var targetDir = new Folder(folderPath + "/" + combined_folder);
                    if (!targetDir.exists) {
                        targetDir.create();
                    }
                    var targetFile = new File(targetDir.fsName + "/" + file.name);
                    if (file.fsName !== targetFile.fsName && !targetFile.exists) {
                        if (file.copy(targetFile)) {
                            file.remove();
                        }
                    }
                }
            }
        }
    } catch(e) {
        writeErrorLog("分类过程出错: " + e.toString());
    }
}

silentExport();
