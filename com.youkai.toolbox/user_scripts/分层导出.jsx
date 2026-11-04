#target illustrator
/* YOUKAI 1.0 | 作者：二百七 | Copyright (c) 2026 二百七 | SPDX-License-Identifier: MIT */

/**
 * 分层导出 (Layer & Sub-layer Batch Exporter)
 * 
 * 功能特点：
 * 1. 按照目标图层内的 子图层 (Sub-layers) 或 顶级子对象 (PageItems/Groups)，一键批量导出为独立的 .ai 文件
 * 2. 可在副本中删除其他子项和图层，或仅隐藏。
 * 3. 从已保存主稿复制，保留原稿的画板、专色和出血设置。
 */

(function () {
    // ====================== 校验文档状态 ======================
    if (app.documents.length === 0) {
        alert("【提示】请先在 Illustrator 中打开一个需要导出的文档！");
        return;
    }

    var doc = app.activeDocument;

    // 检查文档是否已保存到磁盘（需要基于磁盘文件创建独立副本）
    var isSaved = false;
    try {
        if (doc.path && doc.fullName && doc.fullName.exists) {
            isSaved = true;
        }
    } catch (e) {
        isSaved = false;
    }

    if (!isSaved) {
        alert("【提示】当前文档尚未保存到磁盘！\n为了保证导出的坐标与画板设置完全准确，请先【保存文档 (Ctrl+S)】后再执行分层导出。");
        return;
    }

    // ====================== 扫描图层结构 ======================
    var layersData = scanDocumentLayers(doc);
    if (layersData.length === 0) {
        alert("【提示】当前文档中未找到任何图层！");
        return;
    }

    // 计算总可用子项数
    var totalChildren = 0;
    for (var i = 0; i < layersData.length; i++) {
        totalChildren += layersData[i].childCount;
    }

    if (totalChildren === 0) {
        alert("【提示】当前文档的图层中未发现可导出的子图层或独立对象！\n请确保图层内部包含命名的子图层或对象。");
        return;
    }

    // ====================== 核心功能实现 ======================

    /**
     * 扫描文档的所有图层及其直接子项
     */
    function scanDocumentLayers(d) {
        var list = [];
        for (var i = 0; i < d.layers.length; i++) {
            var layer = d.layers[i];
            var children = getLayerChildren(layer, i);
            list.push({
                layer: layer,
                name: layer.name,
                index: i,
                children: children,
                childCount: children.length
            });
        }
        return list;
    }

    /**
     * 获取指定图层的导出子项（兼容子图层与直接子对象）
     */
    function getLayerChildren(layer, layerIndex) {
        var items = [];

        // 1. 收集子图层 (Sub-layers)
        if (layer.layers && layer.layers.length > 0) {
            for (var i = 0; i < layer.layers.length; i++) {
                var sub = layer.layers[i];
                items.push({
                    kind: "sublayer",
                    name: sub.name || ("子图层_" + (i + 1)),
                    index: i,
                    layerIndex: layerIndex,
                    layerName: layer.name
                });
            }
        }

        // 2. 收集该图层下的直接子对象 (Direct page items，排除深层孙项)
        if (layer.pageItems && layer.pageItems.length > 0) {
            for (var j = 0; j < layer.pageItems.length; j++) {
                var pi = layer.pageItems[j];
                try {
                    if (pi.parent === layer) {
                        var rawName = pi.name || "";
                        if (!rawName || rawName.charAt(0) === "<") {
                            rawName = (pi.typename === "GroupItem" ? "编组" : "对象") + "_" + (items.length + 1);
                        }
                        items.push({
                            kind: "pageItem",
                            name: rawName,
                            index: j,
                            layerIndex: layerIndex,
                            layerName: layer.name
                        });
                    }
                } catch (e) {}
            }
        }

        return items;
    }

    // ==========================================
    // YOUKAI 视觉规范：所有颜色初始化后才创建窗口。
    // ==========================================
    var C_MODAL_BG      = [0.102, 0.106, 0.122, 1]; // #1a1b1f 模态底色
    var C_HEADER_BG     = [0.141, 0.153, 0.173, 1]; // #24272c 顶栏背景
    var C_CARD_BG       = [0.078, 0.086, 0.098, 1]; // #141619 原生圆角卡片底色
    var C_YELLOW        = [0.976, 1.000, 0.000, 1]; // #F9FF00 品牌黄
    var C_RED           = [1.000, 0.200, 0.267, 1]; // #FF3344 YOUKAI红色
    var C_TEXT_WHITE    = [0.950, 0.950, 0.950, 1]; // #F2F2F2 亮白文字
    var C_TEXT_DIM      = [0.627, 0.651, 0.682, 1]; // #A0A6AE 辅助文字

    function addButton(parent, text, width, height, alignment) {
        var wrapper = parent.add("group");
        wrapper.orientation = "stack";
        wrapper.alignChildren = ["center", "center"];
        wrapper.alignment = alignment || ["left", "center"];
        wrapper.margins = 0;
        wrapper.spacing = 0;
        wrapper.preferredSize = wrapper.minimumSize = wrapper.maximumSize = [width, height];
        var button = wrapper.add("button", undefined, text);
        button.alignment = ["fill", "fill"];
        return button;
    }

    // 只自绘按钮底色，文字由原生 StaticText 居中，避开宿主 drawString 的坐标偏移。
    function styleButton(button, background, foreground, cutCorner) {
        applyColor(button, foreground, background);
        button.alignment = ["fill", "fill"];
        var caption = button.parent.add("statictext", undefined, button.text);
        caption.alignment = ["center", "center"];
        caption.graphics.font = button.graphics.font;
        applyColor(caption, foreground, background);
        button.caption = caption;
        caption.addEventListener("click", function () {
            if (!button.enabled) return;
            button.active = true;
            button.notify("onClick");
        });
        button.onDraw = function () {
            var g = this.graphics, w = this.size.width, h = this.size.height;
            var bg = this.enabled ? background : C_HEADER_BG;
            var fg = this.enabled ? foreground : C_TEXT_DIM;
            g.newPath();
            g.moveTo(0, 0); g.lineTo(w, 0);
            g.lineTo(w, h - (cutCorner ? 6 : 0));
            if (cutCorner) g.lineTo(w - 6, h);
            g.lineTo(0, h); g.closePath();
            g.fillPath(g.newBrush(g.BrushType.SOLID_COLOR, bg));
            g.strokePath(g.newPen(g.PenType.SOLID_COLOR, this.active ? C_YELLOW : C_TEXT_DIM, 1));
            if (caption.enabled !== this.enabled) caption.enabled = this.enabled;
            applyColor(caption, fg, bg);
        };
    }

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
        var fontStyle = String(style || "REGULAR").toUpperCase();
        if (ScriptUI.FontStyle && ScriptUI.FontStyle[fontStyle] !== undefined) fontStyle = ScriptUI.FontStyle[fontStyle];
        try {
            element.graphics.font = ScriptUI.newFont(fontName, fontStyle, size);
        } catch (e) {
            try {
                element.graphics.font = ScriptUI.newFont("Segoe UI", fontStyle, size);
            } catch (err) {}
        }
    }

    /**
     * 构建 YOUKAI 分层导出窗口。
     */
    function showExportDialog(currentDoc, layersInfo) {
        var docName = currentDoc.name.replace(/\.ai$/i, "");
        var defaultExportDir = new Folder(currentDoc.path.fsName + "/" + docName + "_分层导出");

        // 1. 创建 UI 窗口 (无系统白边框的纯暗黑面板)
        var win = new Window("dialog", undefined, undefined, { borderless: true });
        win.orientation = "column";
        win.alignChildren = ["fill", "top"];
        win.spacing = 10;
        win.margins = 14;
        win.preferredSize.width = 520;
        // 容器只设置背景属性；覆盖 onDraw 会盖住／跳过 Illustrator 的子控件绘制。
        applyColor(win, C_TEXT_WHITE, C_MODAL_BG);

        // --- 顶部 Header 栏（标题 + 右上角红色关闭按钮，整行支持拖拽） ---
        var headerGroup = win.add("group");
        headerGroup.orientation = "row";
        headerGroup.alignChildren = ["left", "center"];
        headerGroup.margins = [0, 0, 0, 2];

        var titleGroup = headerGroup.add("group");
        titleGroup.orientation = "row";
        titleGroup.alignChildren = ["left", "center"];
        titleGroup.alignment = ["fill", "center"];

        var titleLabel = titleGroup.add("statictext", undefined, "YOUKAI // 分层导出");
        setFont(titleLabel, "Microsoft YaHei UI", "Bold", 12);
        applyColor(titleLabel, C_YELLOW, null);

        var btnClose = addButton(headerGroup, "✕", 28, 24, ["right", "center"]);
        btnClose.preferredSize = [28, 24];
        btnClose.minimumSize = [28, 24];
        btnClose.maximumSize = [28, 24];
        setFont(btnClose, "Microsoft YaHei UI", "Bold", 12);
        styleButton(btnClose, C_RED, C_CARD_BG, false);
        btnClose.onClick = function () {
            win.close();
        };

        // 允许通过拖动顶部区域移动无边框窗口
        try {
            var isDragging = false;
            var mouseStartX = 0, mouseStartY = 0;
            var winStartX = 0, winStartY = 0;

            function startDrag(e) {
                if (e.target === btnClose || e.target === btnClose.caption || e.target === btnStart || e.target === btnCancel || e.target === btnBrowse) return;
                isDragging = true;
                mouseStartX = e.screenX;
                mouseStartY = e.screenY;
                winStartX = win.location[0];
                winStartY = win.location[1];
            }

            headerGroup.addEventListener("mousedown", startDrag);

            win.addEventListener("mousemove", function (e) {
                if (isDragging) {
                    var dx = e.screenX - mouseStartX;
                    var dy = e.screenY - mouseStartY;
                    win.location = [winStartX + dx, winStartY + dy];
                }
            });

            win.addEventListener("mouseup", function () { isDragging = false; });
            headerGroup.addEventListener("mouseup", function () { isDragging = false; });
        } catch (errDrag) {}

        // --- 模块 1：目标图层与命名确认卡片 ---
        var pnlTarget = win.add("panel", undefined, "");
        pnlTarget.orientation = "column";
        pnlTarget.alignChildren = ["fill", "top"];
        pnlTarget.spacing = 6;
        pnlTarget.margins = 12;
        applyColor(pnlTarget, C_TEXT_WHITE, C_CARD_BG);

        var cardTitle1 = pnlTarget.add("statictext", undefined, "01. 目标图层与文件命名规则");
        setFont(cardTitle1, "Microsoft YaHei UI", "Bold", 11);
        applyColor(cardTitle1, C_YELLOW, null);

        var grpLayer = pnlTarget.add("group");
        grpLayer.orientation = "row";
        grpLayer.alignChildren = ["left", "center"];
        var lblSelect = grpLayer.add("statictext", undefined, "选择图层：");
        setFont(lblSelect, "Microsoft YaHei UI", "Regular", 11);
        applyColor(lblSelect, C_TEXT_WHITE, null);

        var dropLayer = grpLayer.add("dropdownlist", undefined, []);
        dropLayer.alignment = ["fill", "center"];
        dropLayer.preferredSize.width = 330;
        setFont(dropLayer, "Microsoft YaHei UI", "Regular", 11);
        applyColor(dropLayer, C_TEXT_WHITE, C_HEADER_BG);

        // 填充下拉选项
        var activeIndex = 0;
        for (var idx = 0; idx < layersInfo.length; idx++) {
            var info = layersInfo[idx];
            var itemTitle = info.name + " (" + info.childCount + " 个子项)";
            dropLayer.add("item", itemTitle);
            if (currentDoc.activeLayer === info.layer) {
                activeIndex = idx;
            }
        }
        dropLayer.add("item", "【全部图层】(导出所有图层的子项)");
        dropLayer.selection = activeIndex;

        var lblLayerTip = pnlTarget.add("statictext", undefined, "");
        setFont(lblLayerTip, "Microsoft YaHei UI", "Regular", 10);
        applyColor(lblLayerTip, C_TEXT_DIM, null);

        var lblNamingRule = pnlTarget.add("statictext", undefined, "按子图层 / 对象名称命名；重名文件自动加序号。");
        setFont(lblNamingRule, "Microsoft YaHei UI", "Bold", 10);
        applyColor(lblNamingRule, C_YELLOW, null);

        var txtPreview = pnlTarget.add("statictext", undefined, "");
        txtPreview.preferredSize.width = 458;
        txtPreview.helpTip = "完整文件名会在导出后的文件夹中显示。";
        setFont(txtPreview, "Microsoft YaHei UI", "Regular", 10);
        applyColor(txtPreview, C_TEXT_WHITE, null);

        function updateLayerTip() {
            var selIndex = dropLayer.selection.index;
            var previewList = [];

            if (selIndex < layersInfo.length) {
                var cur = layersInfo[selIndex];
                lblLayerTip.text = "当前图层包含 " + cur.childCount + " 个待导出子项";
                for (var p = 0; p < Math.min(cur.children.length, 6); p++) {
                    previewList.push(cur.children[p].name + ".ai");
                }
                if (cur.children.length > 6) {
                    previewList.push("... (共 " + cur.children.length + " 个)");
                }
            } else {
                var sum = 0;
                for (var s = 0; s < layersInfo.length; s++) {
                    sum += layersInfo[s].childCount;
                    for (var t = 0; t < layersInfo[s].children.length; t++) {
                        if (previewList.length < 6) {
                            previewList.push(layersInfo[s].children[t].name + ".ai");
                        }
                    }
                }
                lblLayerTip.text = "全文档共计 " + sum + " 个待导出子项";
                if (sum > 6) {
                    previewList.push("... (共 " + sum + " 个)");
                }
            }
            txtPreview.text = "输出文件名预览：" + (previewList.length > 0 ? previewList.join("、 ") : "无");
            txtPreview.helpTip = txtPreview.text;
            if (txtPreview.text.length > 62) txtPreview.text = txtPreview.text.substring(0, 60) + "…";
        }
        dropLayer.onChange = updateLayerTip;
        updateLayerTip();

        // --- 模块 2：保存路径与工艺选项卡片 ---
        var pnlOutput = win.add("panel", undefined, "");
        pnlOutput.orientation = "column";
        pnlOutput.alignChildren = ["fill", "top"];
        pnlOutput.spacing = 6;
        pnlOutput.margins = 12;
        applyColor(pnlOutput, C_TEXT_WHITE, C_CARD_BG);

        var cardTitle2 = pnlOutput.add("statictext", undefined, "02. 保存路径与工艺选项");
        setFont(cardTitle2, "Microsoft YaHei UI", "Bold", 11);
        applyColor(cardTitle2, C_YELLOW, null);

        var grpFolder = pnlOutput.add("group");
        grpFolder.orientation = "row";
        grpFolder.alignChildren = ["left", "center"];
        var lblPath = grpFolder.add("statictext", undefined, "导出路径：");
        setFont(lblPath, "Microsoft YaHei UI", "Regular", 11);
        applyColor(lblPath, C_TEXT_WHITE, null);

        var txtFolder = grpFolder.add("edittext", undefined, defaultExportDir.fsName);
        txtFolder.alignment = ["fill", "center"];
        txtFolder.preferredSize.width = 270;
        setFont(txtFolder, "Microsoft YaHei UI", "Regular", 10);
        applyColor(txtFolder, C_TEXT_WHITE, C_HEADER_BG);
        txtFolder.helpTip = defaultExportDir.fsName;

        var btnBrowse = addButton(grpFolder, "浏览...", 60, 24, ["right", "center"]);
        btnBrowse.preferredSize = [60, 24];
        btnBrowse.minimumSize = [60, 24];
        btnBrowse.maximumSize = [60, 24];
        setFont(btnBrowse, "Microsoft YaHei UI", "Bold", 10);
        styleButton(btnBrowse, C_HEADER_BG, C_TEXT_WHITE, false);

        btnBrowse.onClick = function () {
            var sel = Folder.selectDialog("请选择导出文件保存文件夹", txtFolder.text);
            if (sel) {
                txtFolder.text = sel.fsName;
            }
        };

        var chkClean = pnlOutput.add("checkbox", undefined, "删除副本中的其他子项（含隐藏内容）");
        chkClean.value = true;
        setFont(chkClean, "Microsoft YaHei UI", "Regular", 11);
        applyColor(chkClean, C_TEXT_WHITE, null);

        var chkIsolate = pnlOutput.add("checkbox", undefined, "副本只保留目标图层");
        chkIsolate.value = true;
        setFont(chkIsolate, "Microsoft YaHei UI", "Regular", 11);
        applyColor(chkIsolate, C_TEXT_WHITE, null);

        var chkOpenDir = pnlOutput.add("checkbox", undefined, "导出完成后自动在资源管理器中打开文件夹");
        chkOpenDir.value = true;
        setFont(chkOpenDir, "Microsoft YaHei UI", "Regular", 11);
        applyColor(chkOpenDir, C_TEXT_WHITE, null);

        // --- 模块 3：底部状态栏 ---
        var lblStatus = win.add("statictext", undefined, "就绪 · 请先保存源稿，再开始导出。");
        setFont(lblStatus, "Microsoft YaHei UI", "Regular", 11);
        applyColor(lblStatus, C_TEXT_DIM, null);

        // --- 模块 4：底部核心操作按钮 ---
        var btnGroup = win.add("group");
        btnGroup.orientation = "row";
        btnGroup.alignment = ["center", "center"];
        btnGroup.spacing = 16;

        var btnCancel = addButton(btnGroup, "取消", 110, 34);
        btnCancel.preferredSize = [110, 34];
        setFont(btnCancel, "Microsoft YaHei UI", "Bold", 11);
        styleButton(btnCancel, C_HEADER_BG, C_TEXT_WHITE, false);

        var btnStart = addButton(btnGroup, "开始一键导出", 180, 34);
        btnStart.preferredSize = [180, 34];
        setFont(btnStart, "Microsoft YaHei UI", "Bold", 11);
        styleButton(btnStart, C_YELLOW, C_CARD_BG, true);
        win.defaultElement = btnStart;
        win.cancelElement = btnCancel;

        btnCancel.onClick = function () {
            win.close();
        };

        btnStart.onClick = function () {
            var outFolder = new Folder(txtFolder.text);
            if (!outFolder.exists) {
                if (!outFolder.create()) { alert("无法创建导出文件夹，请选择可写位置。"); return; }
            }

            var selIndex = dropLayer.selection.index;
            var targetList = [];

            if (selIndex < layersInfo.length) {
                targetList = layersInfo[selIndex].children;
            } else {
                for (var a = 0; a < layersInfo.length; a++) {
                    targetList = targetList.concat(layersInfo[a].children);
                }
            }

            if (targetList.length === 0) {
                alert("选中的图层中没有可导出的子项！");
                return;
            }

            // 禁用界面交互，展示导出进度
            btnStart.enabled = false;
            btnCancel.enabled = false;
            dropLayer.enabled = false;
            btnBrowse.enabled = false;
            btnClose.enabled = false;
            txtFolder.enabled = false;
            chkClean.enabled = false;
            chkIsolate.enabled = false;
            chkOpenDir.enabled = false;

            var options = {
                cleanMode: chkClean.value,
                isolateLayer: chkIsolate.value,
                openDir: chkOpenDir.value
            };

            // 执行核心导出逻辑
            doBatchExport(win, lblStatus, currentDoc, targetList, outFolder, options);
        };

        win.center();
        win.show();
    }

    /**
     * 批量执行独立副本导出
     */
    function doBatchExport(win, lblStatus, mainDoc, items, targetFolder, opts) {
        // 不替用户保存源稿，避免绕过批处理的保存源文件选项。
        if (!mainDoc.saved) {
            alert("请先保存当前文档，再执行分层导出。源文件尚未改写。");
            win.close();
            return;
        }

        var masterFile = mainDoc.fullName;
        var total = items.length;
        var successCount = 0;
        var failList = [];
        var nameCounter = {};

        // 临时屏蔽系统级弹窗
        var origLevel = app.userInteractionLevel;
        app.userInteractionLevel = UserInteractionLevel.DONTDISPLAYALERTS;

        try {
            for (var i = 0; i < total; i++) {
                var itemInfo = items[i];

                // 计算安全唯一文件名
                var rawBaseName = sanitizeFileName(itemInfo.name);
                if (!nameCounter[rawBaseName]) {
                    nameCounter[rawBaseName] = 1;
                } else {
                    nameCounter[rawBaseName]++;
                    rawBaseName = rawBaseName + "_" + nameCounter[rawBaseName];
                }
                var outFileName = rawBaseName + ".ai";

                // 更新界面进度
                lblStatus.text = "正在导出 (" + (i + 1) + "/" + total + ")：" + outFileName + " ...";
                win.update();

                var targetAiFile = new File(targetFolder.fsName + "/" + outFileName);
                var suffix = 2;
                while (targetAiFile.exists) {
                    outFileName = rawBaseName + "_" + suffix++ + ".ai";
                    targetAiFile = new File(targetFolder.fsName + "/" + outFileName);
                }

                // 复制原文件生成独立副本
                if (!masterFile.copy(targetAiFile)) {
                    failList.push(outFileName + " (无法复制源文件)");
                    continue;
                }

                // 打开副本进行内容精简与纯净化
                var tempDoc = null;
                try {
                    tempDoc = app.open(targetAiFile);
                } catch (openErr) {
                    try { targetAiFile.remove(); } catch (cleanupError) {}
                    failList.push(outFileName + " (无法打开副本: " + openErr.message + ")");
                    continue;
                }

                try {
                    // 提纯副本：只保留目标子项
                    processExportReplica(tempDoc, itemInfo, opts);

                    // 保存并关闭副本
                    tempDoc.save();
                    tempDoc.close(SaveOptions.DONOTSAVECHANGES);
                    successCount++;
                } catch (procErr) {
                    try { tempDoc.close(SaveOptions.DONOTSAVECHANGES); } catch (e) {}
                    try { targetAiFile.remove(); } catch (cleanupError) {}
                    failList.push(outFileName + " (处理失败: " + procErr.message + ")");
                }
            }
        } finally {
            app.userInteractionLevel = origLevel;
        }

        lblStatus.text = "✓ 导出完成！成功：" + successCount + " 个，失败：" + failList.length + " 个。";
        win.update();

        // 导出结果提示
        var finishMsg = "【分层导出完成】\n" +
                        "------------------------------------\n" +
                        "✓ 成功导出文件：" + successCount + " 个\n" +
                        "✓ 存放路径：" + targetFolder.fsName;

        if (failList.length > 0) {
            finishMsg += "\n⚠ 失败列表：\n" + failList.join("\n");
        }

        alert(finishMsg);

        // 如果勾选了打开目录，自动在资源管理器中定位
        if (opts.openDir && targetFolder.exists) {
            try {
                targetFolder.execute();
            } catch (e) {}
        }

        win.close();
    }

    /**
     * 对打开的临时副本进行精简提纯
     */
    function processExportReplica(docReplica, itemInfo, opts) {
        var targetLayer = null;

        // 磁盘副本顺序与已保存主稿相同，以索引定位，支持重名及未命名对象。
        if (itemInfo.layerIndex < docReplica.layers.length) {
            targetLayer = docReplica.layers[itemInfo.layerIndex];
        }

        if (!targetLayer) {
            throw new Error("副本中未定位到原所属图层：" + itemInfo.layerName);
        }

        // 确保目标图层可见且可编辑
        targetLayer.visible = true;
        targetLayer.locked = false;

        // 1. 处理目标图层内部的子项
        if (itemInfo.kind === "sublayer") {
            // 目标为子图层
            var subLayers = targetLayer.layers;
            var chosenSublayer = subLayers[itemInfo.index];
            if (!chosenSublayer) throw new Error("目标子图层索引无效");
            for (var s = subLayers.length - 1; s >= 0; s--) {
                var sub = subLayers[s];
                if (sub === chosenSublayer) {
                    sub.visible = true;
                    sub.locked = false;
                } else {
                    if (opts.cleanMode) {
                        try { sub.locked = false; sub.remove(); } catch (e) { throw new Error("无法删除副本中的其他子图层：" + e.message); }
                    } else {
                        sub.visible = false;
                    }
                }
            }

            // 处理同层的直接对象：若纯净模式则彻底清除
            var pageItems = targetLayer.pageItems;
            for (var p = pageItems.length - 1; p >= 0; p--) {
                var pi = pageItems[p];
                if (pi.parent === targetLayer) {
                    if (opts.cleanMode) {
                        try { pi.locked = false; pi.remove(); } catch (e) { throw new Error("无法删除副本中的其他对象：" + e.message); }
                    } else {
                        pi.hidden = true;
                    }
                }
            }
        } else {
            // 目标为直接对象 (pageItem / GroupItem)
            var pItems = targetLayer.pageItems;
            var chosenItem = pItems[itemInfo.index];
            if (!chosenItem || chosenItem.parent !== targetLayer) throw new Error("目标对象索引无效");
            for (var q = pItems.length - 1; q >= 0; q--) {
                var itemObj = pItems[q];
                if (itemObj.parent === targetLayer) {
                    var objName = itemObj.name || "";
                    var isTarget = (itemObj === chosenItem);

                    if (isTarget) {
                        itemObj.hidden = false;
                        itemObj.locked = false;
                    } else {
                        if (opts.cleanMode) {
                            try { itemObj.locked = false; itemObj.remove(); } catch (e) { throw new Error("无法删除副本中的其他对象：" + e.message); }
                        } else {
                            itemObj.hidden = true;
                        }
                    }
                }
            }

            // 清理内部多余的子图层
            var sLayers = targetLayer.layers;
            for (var sl = sLayers.length - 1; sl >= 0; sl--) {
                if (opts.cleanMode) {
                    try { sLayers[sl].locked = false; sLayers[sl].remove(); } catch (e) { throw new Error("无法删除副本中的其他子图层：" + e.message); }
                } else {
                    sLayers[sl].visible = false;
                }
            }
        }

        // 2. 处理文档中的其余非目标图层
        if (opts.isolateLayer) {
            for (var o = docReplica.layers.length - 1; o >= 0; o--) {
                var otherL = docReplica.layers[o];
                if (otherL !== targetLayer) {
                    if (opts.cleanMode) {
                        try {
                            otherL.locked = false;
                            otherL.visible = true;
                            otherL.remove();
                        } catch (e) {
                            throw new Error("无法删除副本中的其他图层：" + e.message);
                        }
                    } else {
                        otherL.visible = false;
                    }
                }
            }
        }
    }

    /**
     * 文件名安全过滤 (消除 Windows 系统非法字符)
     */
    function sanitizeFileName(name) {
        if (!name) return "未命名素材";
        var clean = name.replace(/[\\\/:\*\?"<>\|]/g, "_").replace(/^\s+|[.\s]+$/g, "");
        if (/^(con|prn|aux|nul|com[1-9]|lpt[1-9])(?:\.|$)/i.test(clean)) clean = "_" + clean;
        return clean || "未命名素材";
    }

    // 颜色变量必须先完成赋值，否则窗口只能显示宿主默认灰色。
    showExportDialog(doc, layersData);
})();
