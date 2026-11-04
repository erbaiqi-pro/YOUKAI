function trimString(str) {
    return str.replace(/^\s+|\s+$/g, "");
}

function removeCarriageReturn(str) {
    return str.replace(/\r/g, "");
}

function getCsvFile() {
    var folderPath = ($.global && $.global.YOUKAI_CSV_FOLDER) 
        ? $.global.YOUKAI_CSV_FOLDER 
        : Folder.desktop.fsName;

    // 1. 动态获取当前运行脚本的 basename (例如 "战队色修改")
    var scriptFile = new File($.fileName);
    var baseName = scriptFile.name.replace(/\.jsx?$/i, "");
    if (!baseName) baseName = "战队色修改";

    // 优先尝试与脚本同名的 CSV (例如 "战队色修改.csv")
    var targetFile = new File(folderPath + "/" + baseName + ".csv");
    if (targetFile.exists) {
        return targetFile;
    }

    // 2. 智能兼容兜底：支持无“修改”后缀的名字 (例如 "战队色.csv")
    var fallbackName = baseName.replace(/修改$/g, "").replace(/^修改/, "") + ".csv";
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
    var csvFile = getCsvFile();
    var csvData = readCsvFile(csvFile);
    if (!csvData) {
        errorLog.push("错误：无法读取 CSV 配置文件（路径：" + (csvFile ? csvFile.fsName : "未知") + "）。请确保文件存在且格式正确。");
        writeErrorLog(errorLog);
        return;
    }
    
    var parseResult = parseCsvData(csvData, errorLog);
    if (!parseResult.success) {
        writeErrorLog(errorLog);
        return;
    }
    
    var parsedData = parseResult.data;
    var teamName = extractTeamNameFromDocument(doc, errorLog);
    if (!teamName) {
        writeErrorLog(errorLog);
        return;
    }
    
    var teamData = findTeamData(teamName, parsedData.teams, errorLog);
    if (!teamData) {
        writeErrorLog(errorLog);
        return;
    }
    
    hasErrors = modifySwatchColors(doc, teamData, parsedData.headers, errorLog);
    if (hasErrors && errorLog.length > 0) {
        writeErrorLog(errorLog);
    } else if (!hasErrors) {
  //静音
    }
}

function readCsvFile(csvFile) {
    try {
        if (!csvFile) csvFile = getCsvFile();
        if (!csvFile || !csvFile.exists) return null;

        var content = null;
        var encodings = ["UTF-8", "GBK", "GB2312", "ASCII", null];
        for (var i = 0; i < encodings.length; i += 1) {
            try {
                csvFile.open("r");
                if (encodings[i]) {
                    csvFile.encoding = encodings[i];
                }
                content = csvFile.read();
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
    if (lines.length < 2) {
        errorLog.push("错误：CSV文件格式错误或为空。");
        return {
            success: false,
            data: null
        };
    }
    var headerLine = lines[0].split(",");
    var headers = [];
    for (var i = 0; i < headerLine.length; i += 1) {
        var header = removeCarriageReturn(headerLine[i]);
        header = trimString(header);
        headers.push(header);
    }
    if (headers[0] != "战队") {
        errorLog.push("错误：CSV文件第一列必须是'战队'。当前内容：" + headers[0]);
        return {
            success: false,
            data: null
        };
    }
    var teams = [];
    for (var i = 1; i < lines.length; i += 1) {
        var line = trimString(lines[i]);
        if (line != "") {
            var cells = line.split(",");
            var teamData = {};
            for (var j = 0; j < cells.length && j < headers.length; j++) {
                var cellValue = removeCarriageReturn(cells[j]);
                cellValue = trimString(cellValue);
                teamData[headers[j]] = cellValue;
            }
            if (teamData["战队"] && teamData["战队"] != "") {
                teams.push(teamData);
            }
        }
    }
    var result = {};
    result.headers = headers;
    result.teams = teams;
    return {
        success: true,
        data: result
    };
}

function extractTeamNameFromDocument(doc, errorLog) {
    try {
        if (doc.layers.length == 0) {
            errorLog.push("错误：文档中没有图层。");
            return null;
        }
        var firstLayer = doc.layers[0];
        var textObjects = [];
        for (var i = 0; i < firstLayer.pageItems.length; i += 1) {
            var item = firstLayer.pageItems[i];
            if (item.typename == "TextFrame") {
                textObjects.push(item);
            }
        }
        if (textObjects.length == 0) {
            errorLog.push("错误：第一个图层中没有文字对象。");
            return null;
        }
        var checkCount = Math.min(2, textObjects.length);
        for (var i = 0; i < checkCount; i += 1) {
            var textFrame = textObjects[i];
            var textContent = textFrame.contents;
            if (textContent == undefined) {
                textContent = "";
            }
            textContent = String(textContent);
            if (textContent && textContent.length > 0) {
                var teamIndex = textContent.indexOf("战队@");
                if (teamIndex != -1) {
                    var teamName = textContent.substr(teamIndex + 3);
                    teamName = trimString(teamName);
                    if (teamName != "") {
                        return teamName;
                    }
                }
            }
        }
        errorLog.push("错误：在前两个文字对象中未找到包含'战队@'的内容。");
        return null;
    } catch (e) {
        errorLog.push("提取战队名称时出错：" + e.toString());
        return null;
    }
}

function findTeamData(teamName, teams, errorLog) {
    for (var i = 0; i < teams.length; i += 1) {
        var team = teams[i];
        if (team["战队"] == teamName) {
            return team;
        }
    }
    errorLog.push("错误：在CSV文件中未找到战队：" + teamName);
    return null;
}

function modifySwatchColors(doc, teamData, headers, errorLog) {
    var hasErrors = false;
    for (var j = 1; j < headers.length; j += 1) {
        var swatchName = headers[j];
        var colorValue = teamData[swatchName];
        if (colorValue && colorValue != "") {
            var result = modifySingleSwatchColor(doc, swatchName, colorValue, errorLog);
            if (!result) {
                hasErrors = true;
            }
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
        if (cmykValues.length != 4) {
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
        var docName = "未知文档";
        try {
            if (app.documents.length > 0) {
                docName = app.activeDocument.name;
            }
        } catch (e) {}
        logFile.writeln("\n[" + now.toLocaleString() + "] 文档: " + docName);
        for (var i = 0; i < errorLog.length; i += 1) {
            logFile.writeln("  - " + errorLog[i]);
        }
        logFile.writeln("-------------------------------------");
        logFile.close();
        alert("运行中出现错误，请查看桌面'色板修改错误日志.txt'。");
    } catch (e) {
        // 忽略写入日志错误
    }
}

main();