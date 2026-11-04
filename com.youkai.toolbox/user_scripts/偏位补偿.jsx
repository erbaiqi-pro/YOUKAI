/* YOUKAI 1.0 | 作者：二百七 | Copyright (c) 2026 二百七 | SPDX-License-Identifier: MIT */
/**
 * 偏位补偿 (外部CSV读取版 - 深度查找支持)
 * 支持同一大图层下，批量移动多个指定的子图层或编组对象。
 * CSV 格式要求：每一行最少四个字段 -> 大图层名,目标1,目标2...,X轴偏移量,Y轴偏移量
 * 例如：正面逆向,大 ID,logo,5,-2
 */
#target illustrator

var errorLogFile = Folder.desktop + "/偏位补偿错误日志.txt";

function writeErrorLog(message) {
    try {
        var logFile = new File(errorLogFile);
        logFile.open("a");
        logFile.write(new Date().toLocaleString() + " - " + message + "\n");
        logFile.close();
    } catch (e) {}
}

/**
 * 递归深度查找并移动对象
 */
function findTargetsAndMove(container, targetName, offX, offY) {
    var movedCount = 0;
    if (container.typename === "Layer" && (!container.visible || container.locked)) return 0;
    if (container.hidden || container.locked) return 0;

    function moveLayerContents(layer) {
        var count = 0;
        if (!layer.visible || layer.locked) return 0;
        for (var x = 0; x < layer.pageItems.length; x++) {
            var obj = layer.pageItems[x];
            if (obj.parent === layer && !obj.hidden && !obj.locked) {
                obj.position = [obj.position[0] + offX, obj.position[1] + offY];
                count++;
            }
        }
        for (var y = 0; y < layer.layers.length; y++) count += moveLayerContents(layer.layers[y]);
        return count;
    }

    if (container.layers && container.layers.length > 0) {
        for (var i = 0; i < container.layers.length; i++) {
            var subL = container.layers[i];
            if (subL.name === targetName) {
                movedCount += moveLayerContents(subL);
            } else {
                movedCount += findTargetsAndMove(subL, targetName, offX, offY);
            }
        }
    }

    if (container.pageItems && container.pageItems.length > 0) {
        for (var i = 0; i < container.pageItems.length; i++) {
            var item = container.pageItems[i];
            if (item.parent !== container) continue;
            
            if (item.name === targetName) {
                if (!item.hidden && !item.locked) {
                    item.position = [item.position[0] + offX, item.position[1] + offY];
                    movedCount++;
                }
            } 
            else if (item.typename === "GroupItem") {
                movedCount += findTargetsAndMove(item, targetName, offX, offY);
            }
        }
    }

    return movedCount;
}

function offsetCompensationCSV() {
    if (app.documents.length === 0) {
        return;
    }

    var doc = app.activeDocument;
    var useMillimeters = true;
    var mmToPt = 2.834645;

    // 1. 获取 CSV 文件
    var scriptFile = new File($.fileName);
    var baseName = decodeURI(scriptFile.name).replace(/\.jsx?$/i, "");
    if (!baseName) baseName = "偏位补偿";

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
        testFile = new File(folderPath + "/偏位补偿.csv");
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
                // 清理由于 Excel 多余列产生的尾部空元素，哪怕是空格也清理掉
                while (parts.length > 0 && parts[parts.length - 1].replace(/^\s+|\s+$/g, "") === "") {
                    parts.pop();
                }

                if (parts.length >= 4) { // 至少：大图层,目标1,X,Y
                    var mLayer = parts[0].replace(/"/g, "").replace(/^\s+|\s+$/g, "");
                    
                    var strY = parts[parts.length - 1].replace(/"/g, "").replace(/\s/g, ""); 
                    var strX = parts[parts.length - 2].replace(/"/g, "").replace(/\s/g, "");
                    
                    strY = strY.replace(/－|—|−/g, "-");
                    strX = strX.replace(/－|—|−/g, "-");
                    
                    var oy = parseFloat(strY);
                    var ox = parseFloat(strX);
                    
                    if (isNaN(ox) || isNaN(oy)) {
                        parseError.push("第 " + (i + 1) + " 行数字格式错误。提取到的X: " + strX + ", Y: " + strY);
                        continue;
                    }
                    
                    var targets = [];
                    for(var j = 1; j < parts.length - 2; j++) {
                        var tName = parts[j].replace(/"/g, "").replace(/^\s+|\s+$/g, "");
                        if(tName !== "") targets.push(tName);
                    }
                    
                    if (mLayer !== "" && targets.length > 0) {
                        configTable.push({
                            mainLayer: mLayer,
                            subLayers: targets,
                            offsetX: ox,
                            offsetY: oy
                        });
                    }
                } else {
                    parseError.push("第 " + (i + 1) + " 行格式不完整，跳过。");
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

    // 3. 执行偏移逻辑
    var totalMoved = 0;
    var errorDetails = [];

    for (var i = 0; i < configTable.length; i++) {
        var cfg = configTable[i];
        var mLayerName = cfg.mainLayer;
        var sLayers = cfg.subLayers;
        var offX = cfg.offsetX;
        var offY = cfg.offsetY;

        if (useMillimeters) {
            offX = offX * mmToPt;
            offY = offY * mmToPt;
        }

        try {
            var mainLayer = doc.layers.getByName(mLayerName);
            
            for (var k = 0; k < sLayers.length; k++) {
                var targetName = sLayers[k];
                var moved = findTargetsAndMove(mainLayer, targetName, offX, offY);
                
                if (moved === 0) {
                    errorDetails.push("图层 [" + mLayerName + "] 下未找到目标 [" + targetName + "]");
                } else {
                    totalMoved += moved;
                }
            }
        } catch (e) {
            errorDetails.push("找不到大图层 [" + mLayerName + "]");
        }
    }

    // 4. 批处理静默反馈：如果有错只写日志，全程无弹窗
    if (totalMoved === 0) {
        writeErrorLog("脚本执行完毕，未移动任何对象。\n错误详情：\n" + errorDetails.join("\n"));
    } else if (errorDetails.length > 0) {
        writeErrorLog("部分成功，移动了 " + totalMoved + " 个对象。错误详情：\n" + errorDetails.join("\n"));
    }
}

// ============================================
// 批处理主入口，捕获致命异常防止流水线崩溃
// ============================================
try {
    offsetCompensationCSV();
} catch (e) {
    writeErrorLog("致命错误中断：" + e.toString());
}
