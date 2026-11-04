/* YOUKAI 1.0 | 作者：二百七 | Copyright (c) 2026 二百七 | SPDX-License-Identifier: MIT */
/**
 * 跨文件自动提取并替换 (Youkai 批处理 - 极致清场版)
 */
#target illustrator

var folderPath = ($.global && $.global.YOUKAI_CSV_FOLDER) ? $.global.YOUKAI_CSV_FOLDER : (Folder.myDocuments + "/Youkai/csv");
var errorLogFile = folderPath + "/跨文件提取替换日志.txt";

function writeErrorLog(message) {
    try {
        var logFile = new File(errorLogFile);
        logFile.open("a");
        logFile.write(new Date().toLocaleString() + " - " + message + "\n");
        logFile.close();
    } catch (e) {}
}

function normalizeName(name) {
    if (!name) return "";
    var s = name.toLowerCase();
    var result = "";
    for (var i = 0; i < s.length; i++) {
        var code = s.charCodeAt(i);
        if (code >= 0xFF01 && code <= 0xFF5E) {
            result += String.fromCharCode(code - 0xFEE0);
        } else {
            result += s.charAt(i);
        }
    }
    return result.replace(/[\x00-\x20\s\uFEFF\xA0\u200B-\u200F\u2028\u2029\u3000]/g, "");
}

function forceUnlockAndShow(item) {
    try {
        if (item.locked) item.locked = false;
        if (item.hidden) item.hidden = false;
        if (item.typename === "GroupItem" || item.typename === "Layer") {
            if (item.pageItems) {
                for (var i = 0; i < item.pageItems.length; i++) {
                    forceUnlockAndShow(item.pageItems[i]);
                }
            }
        }
        var parent = item.parent;
        while (parent && parent.typename === "Layer") {
            if (parent.locked) parent.locked = false;
            if (parent.visible === false) parent.visible = true;
            parent = parent.parent;
        }
    } catch(e) {}
}

function obliterate(doc, items) {
    doc.selection = null;
    var count = 0;
    for (var i = 0; i < items.length; i++) {
        try {
            forceUnlockAndShow(items[i]);
            items[i].selected = true;
            count++;
        } catch(e) {}
    }
    if (count > 0) {
        try { app.executeMenuCommand('clear'); } catch(e) {}
        for (var i = 0; i < items.length; i++) {
            try { items[i].remove(); } catch(e) {}
        }
    }
    doc.selection = null;
    return count > 0;
}

function findItemsRecursively(container, targetName, findAll) {
    var results = [];
    var targetStr = normalizeName(targetName);
    if (!targetStr) return results;

    var matchUnnamedType = "";
    if (targetName === "<编组>") matchUnnamedType = "GroupItem";
    else if (targetName === "<路径>") matchUnnamedType = "PathItem";
    else if (targetName === "<复合路径>") matchUnnamedType = "CompoundPathItem";
    else if (targetName === "<文本>") matchUnnamedType = "TextFrame";

    function search(node) {
        if (!findAll && results.length > 0) return;
        if (node.pageItems) {
            for (var i = 0; i < node.pageItems.length; i++) {
                var item = node.pageItems[i];
                if (item.parent !== node) continue;
                var itemName = normalizeName(item.name);
                
                var isMatch = false;
                if (itemName === targetStr) isMatch = true;
                else if (itemName === "" && item.typename === matchUnnamedType) isMatch = true;

                if (isMatch) {
                    results.push(item);
                    if (!findAll) return;
                }
                if (item.typename === "GroupItem") search(item);
            }
        }
        if (node.layers) {
            for (var i = 0; i < node.layers.length; i++) {
                var subL = node.layers[i];
                var subName = normalizeName(subL.name);
                
                var isMatch = false;
                if (subName === targetStr) isMatch = true;
                
                if (isMatch) {
                    results.push(subL);
                    if (!findAll) return;
                }
                search(subL);
            }
        }
    }
    search(container);
    return results;
}

function getTargetByPath(rootDoc, pathArray, findAllAtEnd) {
    if (!pathArray || pathArray.length === 0) return [];
    var topLayerName = pathArray[0];
    var currentContainer = null;
    try {
        currentContainer = rootDoc.layers.getByName(topLayerName);
    } catch (e) {
        var normTop = normalizeName(topLayerName);
        for (var i = 0; i < rootDoc.layers.length; i++) {
            var lName = normalizeName(rootDoc.layers[i].name);
            if (lName === normTop) {
                currentContainer = rootDoc.layers[i];
                break;
            }
        }
    }
    if (!currentContainer) return [];
    if (pathArray.length === 1) return [currentContainer];
    
    var finalResults = [];
    var context = currentContainer;
    for (var i = 1; i < pathArray.length; i++) {
        var isLast = (i === pathArray.length - 1);
        var foundItems = findItemsRecursively(context, pathArray[i], isLast ? findAllAtEnd : false);
        if (foundItems.length === 0) return [];
        if (isLast) finalResults = foundItems;
        else context = foundItems[0];
    }
    return finalResults;
}

function getArtboardIndexByNameOrNumber(doc, val) {
    for (var a = 0; a < doc.artboards.length; a++) {
        if (doc.artboards[a].name === val) return a;
    }
    var cleanVal = val.replace(/[^0-9]/g, "");
    if (cleanVal !== "") {
        var parsedIdx = parseInt(cleanVal) - 1;
        if (parsedIdx >= 0 && parsedIdx < doc.artboards.length) {
            return parsedIdx;
        }
    }
    return -1;
}

function getArtboardOfItem(doc, item) {
    try {
        var bounds = item.geometricBounds;
        var cx = (bounds[0] + bounds[2]) / 2, cy = (bounds[1] + bounds[3]) / 2;
        for (var i = 0; i < doc.artboards.length; i++) {
            var ab = doc.artboards[i].artboardRect;
            if (cx >= ab[0] && cx <= ab[2] && cy <= ab[1] && cy >= ab[3]) return i;
        }
    } catch(e) {}
    return 0;
}

function copyAndPasteMathematically(sourceDoc, targetDoc, targetAbIdx, itemsToSelect, destLayerNode) {
    if (itemsToSelect.length === 0) return false;
    
    var sourceAbIdx = getArtboardOfItem(sourceDoc, itemsToSelect[0]);
    
    var sLeft = Infinity, sTop = -Infinity;
    for (var i = 0; i < itemsToSelect.length; i++) {
        var pos = itemsToSelect[i].position;
        if (pos[0] < sLeft) sLeft = pos[0];
        if (pos[1] > sTop) sTop = pos[1];
    }
    
    var sAb = sourceDoc.artboards[sourceAbIdx].artboardRect;
    var relLeft = sLeft - sAb[0];
    var relTop = sAb[1] - sTop; 

    sourceDoc.selection = null;
    for (var i = 0; i < itemsToSelect.length; i++) {
        itemsToSelect[i].selected = true;
    }
    app.copy();
    sourceDoc.selection = null;

    app.activeDocument = targetDoc;
    if (destLayerNode) targetDoc.activeLayer = destLayerNode;
    
    targetDoc.selection = null;
    app.executeMenuCommand('paste');
    
    var pastedItems = targetDoc.selection;
    if (!pastedItems || pastedItems.length === 0) return false;

    var ghostLayers = [];
    for (var i = 0; i < pastedItems.length; i++) {
        var p = pastedItems[i].parent;
        while (p && p.typename === "Layer") {
            if (!destLayerNode || p.name !== destLayerNode.name) {
                var alreadyIn = false;
                for (var j = 0; j < ghostLayers.length; j++) { if (ghostLayers[j] === p) alreadyIn = true; }
                if (!alreadyIn) ghostLayers.push(p);
            }
            p = p.parent;
        }
    }

    var pLeft = Infinity, pTop = -Infinity;
    for (var i = 0; i < pastedItems.length; i++) {
        var pos = pastedItems[i].position;
        if (pos[0] < pLeft) pLeft = pos[0];
        if (pos[1] > pTop) pTop = pos[1];
    }

    var tAb = targetDoc.artboards[targetAbIdx].artboardRect;
    var destLeft = tAb[0] + relLeft;
    var destTop = tAb[1] - relTop;

    var deltaX = destLeft - pLeft;
    var deltaY = destTop - pTop;

    for (var i = 0; i < pastedItems.length; i++) {
        var item = pastedItems[i];
        item.position = [item.position[0] + deltaX, item.position[1] + deltaY];
        if (destLayerNode) {
            try { item.move(destLayerNode, ElementPlacement.PLACEATBEGINNING); } catch(e) {}
        }
    }
    
    for (var k = 0; k < 2; k++) {
        for (var i = 0; i < ghostLayers.length; i++) {
            try {
                if (ghostLayers[i].pageItems.length === 0 && ghostLayers[i].layers.length === 0) {
                    ghostLayers[i].remove();
                }
            } catch(e) {}
        }
    }

    targetDoc.selection = null;
    return true;
}

function crossFileBatchExecute() {
    if (app.documents.length === 0) return;
    var targetDoc = app.activeDocument;
    var originalTargetArtboardIndex = targetDoc.artboards.getActiveArtboardIndex();

    var scriptFile = new File($.fileName);
    var baseName = decodeURI(scriptFile.name).replace(/\.jsx?$/i, "");
    if (!baseName) baseName = "跨文件提取并替换";

    var candidateFolders = [];
    if ($.global && $.global.YOUKAI_CSV_FOLDER) {
        candidateFolders.push($.global.YOUKAI_CSV_FOLDER);
    }
    candidateFolders.push(Folder.userData + "/com.youkai.toolbox/csv");
    candidateFolders.push(Folder.myDocuments + "/Youkai/csv");

    var csvFile = null;
    for (var i = 0; i < candidateFolders.length; i++) {
        var testFile = new File(candidateFolders[i] + "/" + baseName + ".csv");
        if (testFile.exists) { csvFile = testFile; break; }
    }

    if (!csvFile || !csvFile.exists) {
        var defaultFolder = ($.global && $.global.YOUKAI_CSV_FOLDER) ? $.global.YOUKAI_CSV_FOLDER : (Folder.userData + "/com.youkai.toolbox/csv");
        writeErrorLog("找不到CSV文件：" + defaultFolder + "/" + baseName + ".csv");
        return;
    }

    var templatePath = "";
    var dataRows = [];
    try {
        csvFile.encoding = "UTF-8";
        if (!csvFile.open("r")) throw new Error("无法读取 CSV。");
        var content = csvFile.read().replace(/^\uFEFF/, "");
        csvFile.close();
        
        var lines = content.split("\n");
        for (var i = 0; i < lines.length; i++) {
            var line = lines[i].replace(/\r/g, "");
            if (line.replace(/^\s+|\s+$/g, "") === "") continue;
            var parts = line.split(",");
            for (var p = 0; p < parts.length; p++) {
                parts[p] = parts[p].replace(/"/g, "").replace(/^\s+|\s+$/g, "");
            }
            if (templatePath === "") {
                templatePath = (parts[0].indexOf("模板") !== -1 || parts[0].indexOf("路径") !== -1) ? (parts.length > 1 ? parts[1] : "") : parts[0];
                continue;
            }
            var isHeader = false;
            for (var p = 0; p < parts.length; p++) {
                if (parts[p].indexOf("复制") === 0 || parts[p].indexOf("替换") === 0 || parts[p].indexOf("删除") === 0) {
                    isHeader = true; break;
                }
            }
            if (isHeader) continue;
            dataRows.push(parts);
        }
    } catch (e) { writeErrorLog("读取CSV出错：" + e.toString()); return; }

    if (templatePath === "") { writeErrorLog("CSV 第一行未提供模板文件路径！"); return; }
    var templateFile = new File(templatePath);
    if (!templateFile.exists) { writeErrorLog("找不到模板文件：" + templatePath); return; }

    var taskColumns = [];
    var numCols = dataRows.length > 0 ? dataRows[0].length : 0;
    
    for (var c = 0; c < numCols; c += 3) {
        var copyPath = [];
        var destLayer = "";
        var destArtboard = "";
        var delPath = [];
        for (var r = 0; r < dataRows.length; r++) {
            var cellA = c < dataRows[r].length ? dataRows[r][c] : "";
            var cellB = (c + 1) < dataRows[r].length ? dataRows[r][c+1] : "";
            var cellC = (c + 2) < dataRows[r].length ? dataRows[r][c+2] : "";
            if (cellA !== "") copyPath.push(cellA);
            if (r === 0 && cellB !== "") destLayer = cellB;
            if (r === 1 && cellB !== "") destArtboard = cellB;
            if (cellC !== "") delPath.push(cellC);
        }
        if (copyPath.length > 0 && destLayer !== "" && destArtboard !== "") {
            taskColumns.push({ copyPath: copyPath, destLayer: destLayer, destArtboard: destArtboard, delPath: delPath });
        }
    }

    if (taskColumns.length === 0) return;
    var actionCount = 0;
    var errorDetails = [];

    // 模板打开和全部复制路径检查通过后，才允许删除目标。
    for (var d = 0; d < app.documents.length; d++) {
        try {
            if (app.documents[d].fullName.fsName.toLowerCase() === templateFile.fsName.toLowerCase())
                throw new Error("请先关闭模板文件，再运行；避免影响正在编辑的模板。");
        } catch (e) { if (e.message.indexOf("请先关闭") >= 0) throw e; }
    }
    var originalPastePref = app.preferences.getBooleanPreference("pasteRemembersLayers");
    var sourceDoc = app.open(templateFile);
    try {
    for (var check = 0; check < taskColumns.length; check++) {
        var task = taskColumns[check];
        if (!getTargetByPath(sourceDoc, task.copyPath, false).length)
            throw new Error("模板中未找到复制路径：" + task.copyPath.join(">"));
        if (getArtboardIndexByNameOrNumber(targetDoc, task.destArtboard) < 0)
            throw new Error("目标画板不存在：" + task.destArtboard);
        try { targetDoc.layers.getByName(task.destLayer); }
        catch (missing) { throw new Error("目标图层不存在：" + task.destLayer); }
    }

    // === 模块一：只删除已匹配的目标；打开模板后先切回目标文档。 ===
    app.activeDocument = targetDoc;
    for (var colIdx = 0; colIdx < taskColumns.length; colIdx++) {
        var col = taskColumns[colIdx];
        if (col.delPath.length > 0) {
            var delTargets = getTargetByPath(targetDoc, col.delPath, true);
            
            if (delTargets.length > 0) {
                obliterate(targetDoc, delTargets);
            } else {
                errorDetails.push("未找到删除目标: " + col.delPath.join(">"));
            }
        }
    }

    app.preferences.setBooleanPreference("pasteRemembersLayers", false);

    for (var colIdx = 0; colIdx < taskColumns.length; colIdx++) {
        var col = taskColumns[colIdx];
        
        var targetIdx = getArtboardIndexByNameOrNumber(targetDoc, col.destArtboard);
        if (targetIdx === -1) continue;

        // === 模块二：精准抓取 ===
        app.activeDocument = sourceDoc;
        sourceDoc.selection = null;

        var copyTargets = getTargetByPath(sourceDoc, col.copyPath, false);
        if (copyTargets.length === 0) continue;

        var cTarget = copyTargets[0];
        var itemsToSelect = [];
        
        if (cTarget.typename === "Layer") {
            for (var i = 0; i < cTarget.pageItems.length; i++) {
                var itemAbIdx = getArtboardOfItem(sourceDoc, cTarget.pageItems[i]);
                if (itemAbIdx === targetIdx || cTarget.pageItems.length === 1) {
                    itemsToSelect.push(cTarget.pageItems[i]);
                }
            }
            if (itemsToSelect.length === 0 && cTarget.pageItems.length > 0) {
                itemsToSelect.push(cTarget.pageItems[0]); 
            }
        } else {
            itemsToSelect.push(cTarget);
        }

        for (var i = 0; i < itemsToSelect.length; i++) {
            try { forceUnlockAndShow(itemsToSelect[i]); } catch(e) {}
        }

        // === 模块三：数学级别坐标粘贴 ===
        var destLayerNode = null;
        try { destLayerNode = targetDoc.layers.getByName(col.destLayer); } catch(e) {}

        var success = copyAndPasteMathematically(sourceDoc, targetDoc, targetIdx, itemsToSelect, destLayerNode);
        if (success) actionCount++;
    }


    if (actionCount === 0 || errorDetails.length > 0) {
        throw new Error("跨文件处理未全部完成：" + errorDetails.join("；"));
    }
    } finally {
        try { app.preferences.setBooleanPreference("pasteRemembersLayers", originalPastePref); } catch (preferenceError) {}
        try { sourceDoc.close(SaveOptions.DONOTSAVECHANGES); } catch (closeError) {}
        app.activeDocument = targetDoc;
        try { targetDoc.artboards.setActiveArtboardIndex(originalTargetArtboardIndex); } catch (restoreError) {}
    }
}

var youkaiOriginalInteraction = app.userInteractionLevel;
try {
    app.userInteractionLevel = UserInteractionLevel.DONTDISPLAYALERTS;
    crossFileBatchExecute();
} catch (e) {
    writeErrorLog("执行发生错误：" + e.toString());
    throw e;
} finally {
    app.userInteractionLevel = youkaiOriginalInteraction;
}
