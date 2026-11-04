#target illustrator
/* YOUKAI 1.0 | 作者：二百七 | Copyright (c) 2026 二百七 | SPDX-License-Identifier: MIT */

function main() {
    if (app.documents.length === 0) {
        alert("请先打开一个 Illustrator 文档！");
        return;
    }
    var doc = app.activeDocument;

    // ==========================================
    // YOUKAI 色彩定义
    // ==========================================
    var C_MODAL_BG      = [0.102, 0.106, 0.122, 1]; // #1a1b1f 模态底色
    var C_HEADER_BG     = [0.141, 0.153, 0.173, 1]; // #24272c 顶栏背景
    var C_CARD_BG       = [0.078, 0.086, 0.098, 1]; // #141619 原生圆角卡片底色
    var C_YELLOW        = [0.976, 1.000, 0.000, 1]; // #F9FF00 品牌黄
    var C_RED           = [1.000, 0.200, 0.267, 1]; // #FF3344 YOUKAI红色
    var C_TEXT_WHITE    = [0.950, 0.950, 0.950, 1]; // #F2F2F2 亮白文字
    var C_TEXT_DIM      = [0.550, 0.580, 0.620, 1]; // #8C949E 暗灰辅助文字
    var C_BLACK         = [0.000, 0.000, 0.000, 1];

    function applyColor(element, textColor, bgColor) {
        if (!element || !element.graphics) return;
        try {
            var g = element.graphics;
            if (textColor) {
                g.foregroundColor = g.newPen(g.PenType.SOLID_COLOR, textColor, 1);
            }
            if (bgColor) {
                g.backgroundColor = g.newBrush(g.BrushType.SOLID_COLOR, bgColor);
            }
        } catch (e) {}
    }

    function setFont(element, fontName, style, size) {
        if (!element || !element.graphics) return;
        try {
            element.graphics.font = ScriptUI.newFont(fontName, style, size);
        } catch (e) {
            try {
                element.graphics.font = ScriptUI.newFont("dialog", style, size);
            } catch (err) {}
        }
    }

    // ==========================================
    // 1. 创建 UI 窗口 (无系统白边框的纯暗黑面板)
    // ==========================================
    var win = new Window("dialog", undefined, undefined, { borderless: true });
    win.orientation = "column";
    win.alignChildren = ["fill", "top"];
    win.spacing = 10;
    win.margins = 14;
    applyColor(win, C_TEXT_WHITE, C_MODAL_BG);

    // --- 顶部 Header 栏（仅保留右上角红色关闭按钮，整行支持拖拽） ---
    var headerGroup = win.add("group");
    headerGroup.orientation = "row";
    headerGroup.alignChildren = ["right", "center"];
    headerGroup.alignment = ["fill", "top"];
    headerGroup.margins = [0, 0, 0, 0];

    var btnClose = headerGroup.add("button", undefined, "✕");
    btnClose.preferredSize = [28, 24];
    setFont(btnClose, "Microsoft YaHei UI", "Bold", 12);
    applyColor(btnClose, C_TEXT_WHITE, C_RED);
    btnClose.onClick = function () {
        win.close();
    };

    // 允许通过拖动顶部区域丝滑移动无边框窗口
    try {
        var isDragging = false;
        var mouseStartX = 0, mouseStartY = 0;
        var winStartX = 0, winStartY = 0;

        function startDrag(e) {
            if (e.target === btnClose || e.target === btnDynamic || e.target === btnVis) return;
            isDragging = true;
            mouseStartX = e.screenX;
            mouseStartY = e.screenY;
            winStartX = win.location[0];
            winStartY = win.location[1];
        }

        headerGroup.addEventListener("mousedown", startDrag);
        win.addEventListener("mousedown", startDrag);

        win.addEventListener("mousemove", function (e) {
            if (isDragging) {
                var dx = e.screenX - mouseStartX;
                var dy = e.screenY - mouseStartY;
                win.location = [winStartX + dx, winStartY + dy];
            }
        });

        win.addEventListener("mouseup", function () {
            isDragging = false;
        });
        headerGroup.addEventListener("mouseup", function () {
            isDragging = false;
        });
    } catch (errDrag) {}

    // --- 规则展示圆角面板 (AI 原生圆角 Panel) ---
    var infoPanel = win.add("panel", undefined, "");
    infoPanel.orientation = "column";
    infoPanel.alignChildren = ["fill", "top"];
    infoPanel.spacing = 6;
    infoPanel.margins = 12;
    applyColor(infoPanel, C_TEXT_WHITE, C_CARD_BG);

    // 卡片内容（3 行纯文本统一为白色）
    var cardTitle = infoPanel.add("statictext", undefined, "命名规范与驱动规则");
    setFont(cardTitle, "Microsoft YaHei UI", "Bold", 11);
    applyColor(cardTitle, C_YELLOW, null);

    var infoText1 = infoPanel.add("statictext", undefined, "命名规则：[大图层]_[对象名]（同名自动追加 v1, v2...）");
    var infoText2 = infoPanel.add("statictext", undefined, "动态变量：绑定选中的【置入图片】或【文本框】");
    var infoText3 = infoPanel.add("statictext", undefined, "可视变量：绑定选中的【对象】或【编组】显隐控制");

    setFont(infoText1, "Microsoft YaHei UI", "Regular", 11);
    setFont(infoText2, "Microsoft YaHei UI", "Regular", 11);
    setFont(infoText3, "Microsoft YaHei UI", "Regular", 11);
    applyColor(infoText1, C_TEXT_WHITE, null);
    applyColor(infoText2, C_TEXT_WHITE, null);
    applyColor(infoText3, C_TEXT_WHITE, null);

    // --- 底部核心操作按钮 ---
    var btnGroup = win.add("group");
    btnGroup.orientation = "row";
    btnGroup.alignment = ["center", "center"];
    btnGroup.spacing = 14;

    var btnDynamic = btnGroup.add("button", undefined, "绑定动态变量");
    btnDynamic.preferredSize = [150, 34];
    setFont(btnDynamic, "Microsoft YaHei UI", "Bold", 11);

    var btnVis = btnGroup.add("button", undefined, "绑定可视性");
    btnVis.preferredSize = [150, 34];
    setFont(btnVis, "Microsoft YaHei UI", "Bold", 11);

    // ==========================================
    // 2. 核心逻辑处理
    // ==========================================

    // 获取对象所属的大图层（最顶层图层）名称
    function getTopLayerName(item) {
        var current = item;
        var topLayerName = "";
        while (current && current.typename !== "Document") {
            if (current.typename === "Layer") {
                topLayerName = current.name;
            }
            current = current.parent;
        }
        return topLayerName || "Layer";
    }

    // 获取唯一变量名：大图层_选中对象，同名冲突时自动追加 v1, v2, v3...
    function getUniqueVarName(doc, baseName) {
        try {
            doc.variables.getByName(baseName);
        } catch (e) {
            // 不存在同名变量，直接使用原始名
            return baseName;
        }
        // 若已存在，则从 v1 开始递增探测
        var index = 1;
        var finalName = "";
        while (true) {
            finalName = baseName + "v" + index;
            try {
                doc.variables.getByName(finalName);
                index++;
            } catch (e) {
                break;
            }
        }
        return finalName;
    }

    function processImages(selection) {
        var imgSuccess = 0;
        for (var j = 0; j < selection.length; j += 1) {
            var item = selection[j];
            if (item.typename === "PlacedItem") {
                try { if (item.contentVariable && item.contentVariable.name) continue; } catch (unboundImage) {}
                var topLayer = getTopLayerName(item);
                var objName = item.name && item.name !== "" ? item.name : "ImageVar";
                var baseName = topLayer + "_" + objName;
                var finalName = getUniqueVarName(doc, baseName);
                var newVar = doc.variables.add();
                newVar.name = finalName;
                newVar.kind = VariableKind.IMAGE;
                item.contentVariable = newVar;
                imgSuccess++;
            }
        }
        return imgSuccess;
    }

    function processTexts(selection) {
        var createdCount = 0;
        var skippedCount = 0;
        for (var k = 0; k < selection.length; k += 1) {
            var tItem = selection[k];
            if (tItem.typename === "TextFrame") {
                var isBound = false;
                try {
                    if (tItem.contentVariable && tItem.contentVariable.name) {
                        isBound = true;
                    }
                } catch (e) {
                    isBound = false;
                }
                if (!isBound) {
                    var topLayer = getTopLayerName(tItem);
                    var tObjName = tItem.name && tItem.name !== "" ? tItem.name : "TextVar";
                    var tBaseName = topLayer + "_" + tObjName;
                    var tFinalName = getUniqueVarName(doc, tBaseName);
                    var tNewVar = doc.variables.add();
                    tNewVar.name = tFinalName;
                    tNewVar.kind = VariableKind.TEXTUAL;
                    tItem.contentVariable = tNewVar;
                    createdCount++;
                } else {
                    skippedCount++;
                }
            }
        }
        return {
            created: createdCount,
            skipped: skippedCount
        };
    }

    btnDynamic.onClick = function () {
        try {
            var selection = doc.selection;
            if (!selection || selection.length === 0) {
                alert("请先选中【文本对象】或【置入的图像】对象！");
                return;
            }
            var imgResult = processImages(selection);
            var txtResult = processTexts(selection);
            if (imgResult > 0 || txtResult.created > 0 || txtResult.skipped > 0) {
                win.close();
            } else {
                alert("未检测到有效的链接图片或文本对象。\n请确保选中的是【置入的图像】或【文本对象】。");
            }
        } catch (e) {
            alert("发生错误: " + e.message + "\n行号: " + e.line);
        }
    };

    btnVis.onClick = function () {
        try {
            var selection = doc.selection;
            if (!selection || selection.length === 0) {
                alert("请先选中需要绑定可视性的【对象】或【编组】！");
                return;
            }
            var successCount = 0;
            for (var i = 0; i < selection.length; i += 1) {
                var item = selection[i];
                try { if (item.visibilityVariable && item.visibilityVariable.name) continue; } catch (unboundVisibility) {}
                var topLayer = getTopLayerName(item);
                var baseObjName = item.name && item.name !== "" ? item.name : "VisibilityVar";
                var baseName = topLayer + "_" + baseObjName;
                var finalName = getUniqueVarName(doc, baseName);
                var newVar = doc.variables.add();
                newVar.name = finalName;
                newVar.kind = VariableKind.VISIBILITY;
                item.visibilityVariable = newVar;
                successCount++;
            }
            if (successCount > 0) {
                win.close();
            }
        } catch (e) {
            alert("发生错误: " + e.message + "\n行号: " + e.line);
        }
    };

    win.show();
}

main();
