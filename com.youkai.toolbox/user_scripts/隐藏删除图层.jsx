function trimString(str) {
    return str.replace(/^\s+|\s+$/g, "");
}

function removeCarriageReturn(str) {
    return str.replace(/\r/g, "");
}

function unlockAndShowAllLayers(doc) {
    processAllLayersRecursive(doc.layers);
}

function processAllLayersRecursive(layerContainer) {
    for (var i = 0; i < layerContainer.length; i += 1) {
        var layer = layerContainer[i];
        layer.locked = false;
        layer.visible = true;
        if (layer.typename == "LayerSet" && layer.layers) {
            processAllLayersRecursive(layer.layers);
        }
    }
}

function getCsvFile() {
    var folderPath = ($.global && $.global.YOUKAI_CSV_FOLDER) 
        ? $.global.YOUKAI_CSV_FOLDER 
        : (Folder.myDocuments + "/LY_AI_Scripts/csv");

    // 1. 动态获取当前运行脚本的 basename (例如 "隐藏删除图层")
    var scriptFile = new File($.fileName);
    var baseName = scriptFile.name.replace(/\.jsx?$/i, "");
    if (!baseName) baseName = "隐藏删除图层";

    // 优先尝试与脚本同名的 CSV (例如 "隐藏删除图层.csv")
    var targetFile = new File(folderPath + "/" + baseName + ".csv");
    if (targetFile.exists) {
        return targetFile;
    }

    // 2. 智能兼容兜底：匹配 "隐藏或删除.csv"
    var fallbackName = baseName.replace("删除", "或删除") + ".csv";
    var fallbackFile = new File(folderPath + "/" + fallbackName);
    if (fallbackFile.exists) {
        return fallbackFile;
    }

    return targetFile;
}

function main() {
    var errorLog = [];
    var hasErrors = false;
    if (app.documents.length == 0) {
        errorLog.push("错误：请先打开一个Illustrator文档。");
        writeErrorLog(errorLog);
        return;
    }
    var doc = app.activeDocument;
    unlockAndShowAllLayers(doc);
    var csvFile = getCsvFile();
    if (!csvFile || !csvFile.exists) {
        errorLog.push("错误：未找到 CSV 配置文件（路径：" + (csvFile ? csvFile.fsName : "未知") + "）。");
        writeErrorLog(errorLog);
        return;
    }
    var csvData = readCsvFile(csvFile);
    if (!csvData) {
        errorLog.push("错误：无法读取CSV文件内容。");
        writeErrorLog(errorLog);
        return;
    }
    var parseResult = parseCsvData(csvData, errorLog);
    if (!parseResult.success) {
        writeErrorLog(errorLog);
        return;
    }
    var parsedData = parseResult.data;
    hasErrors = processLayers(doc, parsedData, errorLog);
    if (hasErrors && errorLog.length > 0) {
        writeErrorLog(errorLog);
    } else if (!hasErrors) {
     // 已静音
    }
}

function readCsvFile(file) {
    try {
        if (!file) file = getCsvFile();
        file.open("r");
        var content = file.read();
        file.close();
        return content;
    } catch (e) {
        return null;
    }
}

function parseCsvData(csvContent, errorLog) {
    var lines = csvContent.split("\n");
    if (lines.length < 2) {
        errorLog.push("错误：CSV文件格式错误或为空。");
        return {
            success: false,
            data: null
        };
    }
    var firstLine = lines[0].split(",");
    var operation = removeCarriageReturn(firstLine[0]);
    operation = trimString(operation);
    if (operation != "隐藏" && operation != "删除") {
        errorLog.push("错误：CSV文件第一行必须是隐藏或删除。当前内容：" + operation);
        return {
            success: false,
            data: null
        };
    }
    var layerNames = [];
    for (var i = 1; i < lines.length; i += 1) {
        var line = trimString(lines[i]);
        if (line != "") {
            var layerName = line.split(",")[0];
            layerName = removeCarriageReturn(layerName);
            layerName = trimString(layerName);
            if (layerName != "") {
                layerNames.push(layerName);
            }
        }
    }
    var result = {};
    result.operation = operation;
    result.layerNames = layerNames;
    return {
        success: true,
        data: result
    };
}

function writeErrorLog(errorLog) {
    try {
        var logFolder = Folder(Folder.desktop + "/LY_AI_Scripts");
        if (!logFolder.exists) {
            logFolder.create();
        }
        var logFile = File(logFolder.fullName + "/图层操作错误日志.txt");
        logFile.open("w");
        logFile.encoding = "UTF-8";
        var now = new Date();
        logFile.writeln("图层操作错误日志 - " + now.toString());
        logFile.writeln("=====================================");
        for (var i = 0; i < errorLog.length; i += 1) {
            logFile.writeln(errorLog[i]);
        }
        logFile.close();
        alert("运行中出现错误，请前往桌面 LY_AI_Scripts 文件夹查看'图层操作错误日志.txt'。");
    } catch (e) {
        // 忽略写入日志错误
    }
}

function processLayers(doc, data, errorLog) {
    var operation = data.operation;
    var layerNames = data.layerNames;
    var processedCount = 0;
    var hasErrors = false;
    for (var i = 0; i < layerNames.length; i += 1) {
        var layerName = layerNames[i];
        var foundLayers = findAllLayersByName(doc, layerName);
        if (foundLayers.length > 0) {
            for (var j = 0; j < foundLayers.length; j += 1) {
                var layer = foundLayers[j];
                if (operation == "隐藏") {
                    layer.visible = false;
                    processedCount++;
                } else {
                    if (operation == "删除") {
                        try {
                            layer.locked = false;
                            layer.visible = true;
                            layer.remove();
                            processedCount++;
                        } catch (e) {
                            errorLog.push("删除图层失败：" + layerName + " - " + e.toString());
                            hasErrors = true;
                        }
                    }
                }
            }
        } else {
            errorLog.push("未找到图层：" + layerName);
            hasErrors = true;
        }
    }
    return hasErrors;
}

function findAllLayersByName(doc, layerName) {
    var foundLayers = [];
    searchAllLayersInContainer(doc.layers, layerName, foundLayers);
    return foundLayers;
}

function searchAllLayersInContainer(layerContainer, layerName, foundLayers) {
    for (var i = 0; i < layerContainer.length; i += 1) {
        var layer = layerContainer[i];
        if (layer.name == layerName) {
            foundLayers.push(layer);
        }
        if (layer.typename == "LayerSet" && layer.layers) {
            searchAllLayersInContainer(layer.layers, layerName, foundLayers);
        }
    }
}

main();