#target illustrator
/* YOUKAI 1.0 | 作者：二百七 | Copyright (c) 2026 二百七 | SPDX-License-Identifier: MIT */

function main() {
    if (app.documents.length == 0) {
        alert("请先打开一个文档。");
        return;
    }

    var doc = app.activeDocument;

    if (!doc.path) {
        alert("请先保存文档，脚本需要读取同目录下的文件夹来统计数量。");
        return;
    }
    var rootFolder = doc.path;
    var maxCount = 0;
    var subFolders = rootFolder.getFiles();

    for (var i = 0; i < subFolders.length; i++) {
        if (subFolders[i] instanceof Folder) {
            var filesInFolder = subFolders[i].getFiles();
            var currentCount = 0;
            for (var j = 0; j < filesInFolder.length; j++) {
                if (filesInFolder[j] instanceof File) currentCount++;
            }
            if (currentCount > maxCount) maxCount = currentCount;
        }
    }

    if (maxCount <= 0) {
        alert("未检测到有效文件数量。");
        return;
    }

    var win = new Window("dialog", "设置");
    win.orientation = "column";
    win.alignChildren = ["fill", "top"];

    win.add("statictext", undefined, "检测到的最大数量为: " + maxCount);

    var row = win.add("group");
    row.add("statictext", undefined, "每行最多放置数量:");
    var inputField = row.add("edittext", undefined, "5");
    inputField.characters = 6;
    inputField.active = true;

    var btnGroup = win.add("group");
    btnGroup.alignment = ["center", "top"];
    btnGroup.add("button", undefined, "确定", { name: "ok" });
    btnGroup.add("button", undefined, "取消", { name: "cancel" });

    if (win.show() !== 1) return;

    var itemsPerRow = parseInt(inputField.text);
    if (isNaN(itemsPerRow) || itemsPerRow <= 0) {
        alert("输入无效，默认按每行5个处理。");
        itemsPerRow = 5;
    }

    var sourceItems = [];
    if (doc.selection.length > 0) {
        for (var k = 0; k < doc.selection.length; k++) {
            sourceItems.push(doc.selection[k]);
        }
    } else if (doc.activeLayer.pageItems.length > 0) {
        for (var k = 0; k < doc.activeLayer.pageItems.length; k++) {
            sourceItems.push(doc.activeLayer.pageItems[k]);
        }
    }

    if (sourceItems.length == 0) {
        alert("当前图层没有内容，也没有选中任何对象。");
        return;
    }

    // 先把原始内容编成一个临时组，方便后续逐个复制子项
    var tempGroup = doc.activeLayer.groupItems.add();
    tempGroup.name = "原始内容";
    for (var m = 0; m < sourceItems.length; m++) {
        sourceItems[m].move(tempGroup, ElementPlacement.PLACEATEND);
    }

    // 记录原始内容组的尺寸，用于后续对齐
    var tempBounds = tempGroup.geometricBounds;
    var tempWidth = tempBounds[2] - tempBounds[0];
    var tempHeight = tempBounds[1] - tempBounds[3];

    // 创建文件框（画板大小）
    var artboard = doc.artboards[0];
    var abBounds = artboard.artboardRect;
    var boxWidth = abBounds[2] - abBounds[0];
    var boxHeight = abBounds[1] - abBounds[3];

    var firstBox = doc.activeLayer.pathItems.rectangle(
        abBounds[1],
        abBounds[0],
        boxWidth,
        boxHeight
    );
    firstBox.filled = false;
    firstBox.stroked = false;
    firstBox.name = "文件框";

    var gap = 10 * 2.83465;

    // 平铺文件框
    var allBoxes = [firstBox];

    for (var n = 1; n < maxCount; n++) {
        var newBox = firstBox.duplicate();
        allBoxes.push(newBox);

        var colIndex = n % itemsPerRow;
        var rowIndex = Math.floor(n / itemsPerRow);

        var targetX = abBounds[0] + (colIndex * (boxWidth + gap));
        var targetY = abBounds[1] - (rowIndex * (boxHeight + gap));

        var moveX = targetX - abBounds[0];
        var moveY = targetY - abBounds[1];

        newBox.translate(moveX, moveY);
    }

    // 用文件框创建画板
    for (var b = 0; b < allBoxes.length; b++) {
        var boxBounds = allBoxes[b].geometricBounds;
        doc.artboards.add([boxBounds[0], boxBounds[1], boxBounds[2], boxBounds[3]]);
    }

    // 删除原来的第一个画板
    doc.artboards.remove(0);

    // 逐个复制原始内容到每个画板位置
    for (var c = 0; c < allBoxes.length; c++) {
        var boxBounds = allBoxes[c].geometricBounds;
        var boxCenterX = (boxBounds[0] + boxBounds[2]) / 2;
        var boxCenterY = (boxBounds[1] + boxBounds[3]) / 2;

        // 创建一个新的组来存放当前画板的内容
        var newContentGroup = doc.activeLayer.groupItems.add();

        // 逐个复制原始内容组的子项到新组
        for (var s = 0; s < tempGroup.pageItems.length; s++) {
            var newItem = tempGroup.pageItems[s].duplicate(newContentGroup, ElementPlacement.PLACEATEND);
        }

        // 计算新组的中心点并平移到画板中心
        var newBounds = newContentGroup.geometricBounds;
        var newCenterX = (newBounds[0] + newBounds[2]) / 2;
        var newCenterY = (newBounds[1] + newBounds[3]) / 2;

        newContentGroup.translate(boxCenterX - newCenterX, boxCenterY - newCenterY);
    }

    // 删除临时原始内容组
    tempGroup.remove();

    // 提取所有同名对象为一组
    var nameMap = {};

    function collectAllNamedItems(container) {
        for (var i = 0; i < container.pageItems.length; i++) {
            var item = container.pageItems[i];
            var itemName = item.name;

            if (item.typename == "GroupItem") {
                collectAllNamedItems(item);
            }

            if (itemName && itemName != "" && itemName != "文件框" && itemName != "原始内容") {
                if (!nameMap[itemName]) nameMap[itemName] = [];
                nameMap[itemName].push(item);
            }
        }
    }

    for (var l = 0; l < doc.layers.length; l++) {
        collectAllNamedItems(doc.layers[l]);
    }

    for (var name in nameMap) {
        var items = nameMap[name];
        if (items.length > 1) {
            var newGroup = doc.activeLayer.groupItems.add();
            newGroup.name = name;
            for (var i = 0; i < items.length; i++) {
                items[i].move(newGroup, ElementPlacement.PLACEATEND);
            }
        }
    }

    // 删除所有文件框
    function removeFileBox(container) {
        for (var i = container.pageItems.length - 1; i >= 0; i--) {
            var item = container.pageItems[i];
            if (item.name == "文件框") {
                item.remove();
            } else if (item.typename == "GroupItem") {
                removeFileBox(item);
            }
        }
    }

    for (var l = 0; l < doc.layers.length; l++) {
        removeFileBox(doc.layers[l]);
    }

    // 重新链接图片（逆向替换）
    var relinkCount = 0;

    function relinkImages(container) {
        for (var i = 0; i < container.pageItems.length; i++) {
            var item = container.pageItems[i];

            if (item.typename == "GroupItem") {
                var groupName = item.name;
                if (groupName && groupName != "" && groupName != "文件框" && groupName != "原始内容") {
                    var folderPath = new Folder(rootFolder + "/" + groupName);
                    if (folderPath.exists) {
                        var imageFiles = [];
                        var files = folderPath.getFiles();
                        for (var f = 0; f < files.length; f++) {
                            if (files[f] instanceof File) {
                                var ext = files[f].name.substring(files[f].name.lastIndexOf(".")).toLowerCase();
                                if (ext == ".jpg" || ext == ".jpeg" || ext == ".png" || ext == ".gif" || ext == ".tif" || ext == ".tiff" || ext == ".psd" || ext == ".ai" || ext == ".eps" || ext == ".pdf") {
                                    imageFiles.push(files[f]);
                                }
                            }
                        }

                        if (imageFiles.length > 0) {
                            var placedItems = [];
                            findPlacedItems(item, placedItems);

                            if (placedItems.length > 0) {
                                // 计算每个画板中该同名对象的副本数量（例如同一模板中复制了 3 个同名衣服链接）
                                var copiesPerArtboard = placedItems.length / maxCount;
                                if (copiesPerArtboard < 1 || isNaN(copiesPerArtboard)) {
                                    copiesPerArtboard = 1;
                                }

                                for (var p = 0; p < placedItems.length; p++) {
                                    try {
                                        // 计算当前置入对象属于第几个画板 (0 ~ maxCount-1)
                                        var artboardIdx = Math.floor(p / copiesPerArtboard);
                                        // 逆向替换：将最后一个图片文件分配给第一个画板，以此类推
                                        var fileIdx = (imageFiles.length - 1) - artboardIdx;
                                        if (fileIdx >= 0 && fileIdx < imageFiles.length) {
                                            placedItems[p].file = imageFiles[fileIdx];
                                            relinkCount++;
                                        }
                                    } catch (e) {}
                                }
                            }
                        }
                    }
                }
                relinkImages(item);
            }
        }
    }

    function findPlacedItems(container, result) {
        for (var i = 0; i < container.pageItems.length; i++) {
            var item = container.pageItems[i];
            if (item.typename == "PlacedItem") {
                result.push(item);
            } else if (item.typename == "GroupItem") {
                findPlacedItems(item, result);
            }
        }
    }

    for (var l = 0; l < doc.layers.length; l++) {
        relinkImages(doc.layers[l]);
    }

    // 重命名画板
    var totalArtboards = doc.artboards.length;
    var padLength = String(totalArtboards).length;
    if (padLength < 3) padLength = 3;

    for (var a = 0; a < totalArtboards; a++) {
        var num = a + 1;
        var numStr = String(num);
        while (numStr.length < padLength) {
            numStr = "0" + numStr;
        }
        doc.artboards[a].name = "画板" + numStr;
    }

}

main();