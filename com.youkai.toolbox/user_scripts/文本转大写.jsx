/* YOUKAI 1.0 | 作者：二百七 | Copyright (c) 2026 二百七 | SPDX-License-Identifier: MIT */
/**
 * 文本转大写 (外部CSV读取版)
 * 支持同一大图层下，批量将指定的子图层或编组对象内的文本转为大写。
 * CSV 格式要求：每一行代表一个大类 -> 大图层名,目标1,目标2...
 * 例如：正面逆向,大 ID,logo
 */
#target illustrator

var errorLogFile = Folder.desktop + "/文本转大写错误日志.txt";

function writeErrorLog(message) {
    try {
        var logFile = new File(errorLogFile);
        logFile.open("a");
        logFile.write(new Date().toLocaleString() + " - " + message + "\n");
        logFile.close();
    } catch (e) {}
}

/**
 * 递归深度查找并转大写
 */
function findTargetsAndUppercase(container, targetName, modifiedCount) {
    var foundCount = 0;
    if (container.typename === "Layer" && (!container.visible || container.locked)) return 0;
    if (container.hidden || container.locked) return 0;

    if (container.layers && container.layers.length > 0) {
        for (var i = 0; i < container.layers.length; i++) {
            var subL = container.layers[i];
            if (subL.name === targetName) {
                // 如果图层名匹配，就遍历它里面所有的内容
                foundCount += processAllTextInContainer(subL, modifiedCount);
            } else {
                foundCount += findTargetsAndUppercase(subL, targetName, modifiedCount);
            }
        }
    }

    if (container.pageItems && container.pageItems.length > 0) {
        for (var i = 0; i < container.pageItems.length; i++) {
            var item = container.pageItems[i];
            if (item.parent !== container) continue;
            
            if (item.name === targetName) {
                foundCount += processAllTextInContainer(item, modifiedCount);
            } 
            else if (item.typename === "GroupItem") {
                foundCount += findTargetsAndUppercase(item, targetName, modifiedCount);
            }
        }
    }

    return foundCount;
}

/**
 * 把一个容器（图层/编组）内所有的文本全部转大写
 */
function processAllTextInContainer(container, modifiedCount) {
    var processed = 0;
    if (container.typename === "Layer" && (!container.visible || container.locked)) return 0;
    if (container.typename !== "Layer" && (container.hidden || container.locked)) return 0;
    
    // 如果它自己本身就是文本
    if (container.typename === "TextFrame") {
        if (!container.hidden && !container.locked) {
            var oldText = container.contents;
            var newText = oldText.toUpperCase();
            if (oldText !== newText) {
                container.contents = newText;
                modifiedCount.count++;
            }
        }
        processed++;
        return processed;
    }

    // 遍历子项
    if (container.pageItems && container.pageItems.length > 0) {
        for (var i = 0; i < container.pageItems.length; i++) {
            var item = container.pageItems[i];
            if (item.parent !== container) continue;
            processed += processAllTextInContainer(item, modifiedCount);
        }
    }
    
    // 遍历子图层
    if (container.layers && container.layers.length > 0) {
        for (var j = 0; j < container.layers.length; j++) {
            processed += processAllTextInContainer(container.layers[j], modifiedCount);
        }
    }
    
    return processed;
}

function uppercaseCSV() {
    if (app.documents.length === 0) return;

    var doc = app.activeDocument;

    // 1. 获取 CSV 文件
    var scriptFile = new File($.fileName);
    var baseName = decodeURI(scriptFile.name).replace(/\.jsx?$/i, "");
    if (!baseName) baseName = "文本转大写";

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
    var configTable = [];
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
            if (line && line.replace(/^\s+|\s+$/g, "") !== "") {
                var parts = line.split(",");
                while (parts.length > 0 && parts[parts.length - 1].replace(/^\s+|\s+$/g, "") === "") {
                    parts.pop();
                }

                if (parts.length >= 2) { 
                    var mLayer = parts[0].replace(/"/g, "").replace(/^\s+|\s+$/g, "");
                    var targets = [];
                    for(var j = 1; j < parts.length; j++) {
                        var tName = parts[j].replace(/"/g, "").replace(/^\s+|\s+$/g, "");
                        if(tName !== "") targets.push(tName);
                    }
                    
                    if (mLayer !== "" && targets.length > 0) {
                        configTable.push({
                            mainLayer: mLayer,
                            subLayers: targets
                        });
                    }
                } else {
                    parseError.push("第 " + (i + 1) + " 行格式不完整(至少需要大图层和一个目标)，跳过。");
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

    if (configTable.length === 0) {
        writeErrorLog("CSV表格为空或没读到有效数据。");
        return;
    }

    // 3. 执行转大写逻辑
    var modifiedCount = { count: 0 };
    var errorDetails = [];
    var totalFound = 0;

    for (var i = 0; i < configTable.length; i++) {
        var cfg = configTable[i];
        var mLayerName = cfg.mainLayer;
        var sLayers = cfg.subLayers;

        try {
            var mainLayer = doc.layers.getByName(mLayerName);
            
            for (var k = 0; k < sLayers.length; k++) {
                var targetName = sLayers[k];
                var found = findTargetsAndUppercase(mainLayer, targetName, modifiedCount);
                
                if (found === 0) {
                    errorDetails.push("图层 [" + mLayerName + "] 下未找到目标 [" + targetName + "]");
                } else {
                    totalFound += found;
                }
            }
        } catch (e) {
            errorDetails.push("找不到大图层 [" + mLayerName + "]");
        }
    }

    // 4. 反馈
    if (totalFound === 0) {
        writeErrorLog("脚本执行完毕，未找到任何匹配的对象。\n错误详情：\n" + errorDetails.join("\n"));
    } else if (errorDetails.length > 0) {
        writeErrorLog("执行完毕。共转换了 " + modifiedCount.count + " 处文本。但有部分目标未找到：\n" + errorDetails.join("\n"));
    }
}

try {
    uppercaseCSV();
} catch (e) {
    writeErrorLog("致命错误中断：" + e.toString());
}
