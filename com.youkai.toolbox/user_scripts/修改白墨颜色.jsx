/* YOUKAI 1.0 | 作者：二百七 | Copyright (c) 2026 二百七 | SPDX-License-Identifier: MIT */
function trimString(str) {
    return str.replace(/^\s+|\s+$/g, "");
}

function removeCarriageReturn(str) {
    return str.replace(/\r/g, "");
}

function getCsvFile() {
    var scriptFile = new File($.fileName);
    var baseName = decodeURI(scriptFile.name).replace(/\.jsx?$/i, "");
    if (!baseName) baseName = "修改白墨颜色";

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

        var fallbackName = baseName.replace(/^修改/, "") + ".csv";
        var fallbackFile = new File(folderPath + "/" + fallbackName);
        if (fallbackFile.exists) return fallbackFile;
    }

    var defaultFolder = ($.global && $.global.YOUKAI_CSV_FOLDER) ? $.global.YOUKAI_CSV_FOLDER : (Folder.userData + "/com.youkai.toolbox/csv");
    return new File(defaultFolder + "/" + baseName + ".csv");
}

function main() {
    var errorLog = [];
    var hasErrors = false;

    if (app.documents.length === 0) {
        errorLog.push("错误：请先打开一个Illustrator文档。");
        writeErrorLog(errorLog);
        alert("错误：请先打开一个Illustrator文档！");
        return;
    }

    var doc = app.activeDocument;
    var csvFile = getCsvFile();
    var csvData = readCsvFile(csvFile);
    if (!csvData) {
        errorLog.push("错误：无法读取 CSV 文件（路径：" + csvFile.fsName + "）。请确保文件存在且格式正确。");
        writeErrorLog(errorLog);
        alert("错误：无法读取 CSV 文件！详情已记录至日志。");
        return;
    }

    var parseResult = parseCsvData(csvData, errorLog);
    if (!parseResult.success) {
        writeErrorLog(errorLog);
        alert("错误：CSV 文件解析失败！详情已记录至日志。");
        return;
    }

    var swatchNames = parseResult.swatchNames;
    var colorValues = parseResult.colorValues;

    hasErrors = modifySwatchColors(doc, swatchNames, colorValues, errorLog);

    if (hasErrors && errorLog.length > 0) {
        writeErrorLog(errorLog);
        alert("完成，但有部分色板修改失败，详情请查看桌面错误日志。");
    } else {
        // 已静音
    }
}

function readCsvFile(csvFile) {
    try {
        if (!csvFile) csvFile = getCsvFile();
        if (!csvFile || !csvFile.exists) {
            return null;
        }

        var content = null;
        var encodings = ["UTF-8", "GBK", "GB2312", "ASCII", null];

        for (var i = 0; i < encodings.length; i += 1) {
            try {
                if (encodings[i]) {
                    csvFile.encoding = encodings[i];
                }
                if (!csvFile.open("r")) throw new Error("无法读取 CSV。");
                content = csvFile.read().replace(/^\uFEFF/, "");
                csvFile.close();

                if (content && content.length > 0) {
                    var hasValidChars = /[\u4e00-\u9fa5]|[a-zA-Z0-9,\r\n]/.test(content);
                    if (hasValidChars) {
                        return content;
                    }
                }
            } catch (e) {
                try {
                    csvFile.close();
                } catch (closeError) {}
            }
        }
        return content;
    } catch (e) {
        return null;
    }
}

function parseCsvData(csvContent, errorLog) {
    var lines = csvContent.split("\n");
    var validLines = [];

    for (var i = 0; i < lines.length; i += 1) {
        var line = trimString(lines[i]);
        if (line !== "") {
            validLines.push(line);
        }
    }

    if (validLines.length < 2) {
        errorLog.push("错误：CSV文件格式错误或为空。需要至少2行数据。");
        return { success: false, swatchNames: null, colorValues: null };
    }

    var nameLine = validLines[0].split(",");
    var swatchNames = [];
    for (var i = 0; i < nameLine.length; i += 1) {
        var swatchName = removeCarriageReturn(nameLine[i]);
        swatchName = trimString(swatchName);
        if (swatchName !== "") {
            swatchNames.push(swatchName);
        }
    }

    var colorLine = validLines[1].split(",");
    var colorValues = [];
    for (var i = 0; i < colorLine.length; i += 1) {
        var colorValue = removeCarriageReturn(colorLine[i]);
        colorValue = trimString(colorValue);
        if (colorValue !== "") {
            colorValues.push(colorValue);
        }
    }

    if (swatchNames.length !== colorValues.length) {
        errorLog.push("错误：色板名称数量(" + swatchNames.length + ")与颜色值数量(" + colorValues.length + ")不匹配。");
        return { success: false, swatchNames: null, colorValues: null };
    }

    if (swatchNames.length === 0) {
        errorLog.push("错误：CSV文件中没有找到有效的色板名称和颜色值。");
        return { success: false, swatchNames: null, colorValues: null };
    }

    return {
        success: true,
        swatchNames: swatchNames,
        colorValues: colorValues
    };
}

function modifySwatchColors(doc, swatchNames, colorValues, errorLog) {
    var hasErrors = false;
    var successCount = 0;

    for (var i = 0; i < swatchNames.length; i += 1) {
        var swatchName = swatchNames[i];
        var colorValue = colorValues[i];
        var result = modifySingleSwatchColor(doc, swatchName, colorValue, errorLog);
        if (result) {
            successCount++;
        } else {
            hasErrors = true;
        }
    }

    return hasErrors;
}

function modifySingleSwatchColor(doc, swatchName, colorValue, errorLog) {
    try {
        var foundSwatch = null;
        for (var i = 0; i < doc.swatches.length; i += 1) {
            if (doc.swatches[i].name === swatchName) {
                foundSwatch = doc.swatches[i];
                break;
            }
        }

        if (!foundSwatch) {
            errorLog.push("未找到色板：" + swatchName);
            return false;
        }

        var cmykValues = colorValue.split("/");
        if (cmykValues.length !== 4) {
            errorLog.push("色板 " + swatchName + " 的颜色值格式错误：" + colorValue + "（应为C/M/Y/K格式）");
            return false;
        }

        var c = parseFloat(cmykValues[0]);
        var m = parseFloat(cmykValues[1]);
        var y = parseFloat(cmykValues[2]);
        var k = parseFloat(cmykValues[3]);

        if (isNaN(c) || isNaN(m) || isNaN(y) || isNaN(k)) {
            errorLog.push("色板 " + swatchName + " 的颜色值包含无效数字：" + colorValue);
            return false;
        }

        if (c < 0 || c > 100 || m < 0 || m > 100 || y < 0 || y > 100 || k < 0 || k > 100) {
            errorLog.push("色板 " + swatchName + " 的颜色值超出范围(0-100)：" + colorValue);
            return false;
        }

        if (foundSwatch.color && foundSwatch.color.spot && foundSwatch.color.spot.color) {
            foundSwatch.color.spot.color.cyan = c;
            foundSwatch.color.spot.color.magenta = m;
            foundSwatch.color.spot.color.yellow = y;
            foundSwatch.color.spot.color.black = k;
        } else {
            errorLog.push("色板 " + swatchName + " 不是专色色板，无法修改");
            return false;
        }

        return true;
    } catch (e) {
        errorLog.push("修改色板 " + swatchName + " 时出错：" + e.toString());
        return false;
    }
}

function writeErrorLog(errorLog) {
    try {
        var logFile = new File("~/Desktop/色板修改错误日志.txt");
        var needsHeader = !logFile.exists;
        logFile.open("a");
        logFile.encoding = "UTF-8";

        if (needsHeader) {
            logFile.writeln("色板修改错误日志");
            logFile.writeln("=====================================");
        }

        var now = new Date();
        var docName = (app.documents.length > 0 && app.activeDocument) ? app.activeDocument.name : "未知文档";
        logFile.writeln("\n[" + now.toLocaleString() + "] 文档: " + docName);

        for (var i = 0; i < errorLog.length; i += 1) {
            logFile.writeln("  - " + errorLog[i]);
        }
        logFile.writeln("-------------------------------------");
        logFile.close();
    } catch (e) {}
}

main();
