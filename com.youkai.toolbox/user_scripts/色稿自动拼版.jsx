/* YOUKAI 1.0 | 作者：二百七 | Copyright (c) 2026 二百七 | SPDX-License-Identifier: MIT */
/**
 * 快速制作色稿 - Illustrator 自动化拼版脚本
 * 适用机型: 爱普生数码打样机 (固定幅宽 580mm，长度自适应延伸，兼容其他机型)
 * 核心规范: 
 *   1. 顶部置入标准矢量色控条 (保留纯矢量与 CMYK 阶梯梯尺)
 *   2. 每个卡种生成设计师确认框与标题 (图二印刷打卡规范)
 *   3. 批量读取 JPG 卡种图片，按名称智能归并正面/背面/变体，流式拼版
 *
 * 作者：二百七
 * 兼容: Illustrator CS6 / CC 2018 - 2026+ (Windows / macOS)
 */

#target illustrator

(function () {
    "use strict";

    // ==========================================
    // 基础常量与单位转换
    // ==========================================
    var PT_PER_MM = 72.0 / 25.4; // 2.83464567 pt/mm

    function mm2pt(mm) {
        return mm * PT_PER_MM;
    }

    function pt2mm(pt) {
        return pt / PT_PER_MM;
    }

    // ==========================================
    // 默认配置参数
    // ==========================================
    var DEFAULT_CONFIG = {
        // 画板与机型 (爱普生数码机 580mm)
        rollWidthMM: 580,
        marginLeftMM: 8,
        marginRightMM: 8,
        marginTopMM: 10,
        marginBottomMM: 15,

        // 间距配置
        gapInsideGroupMM: 0,      // 同一组正反面卡片间距 (0表示切齐贴合)
        gapBetweenGroupsMM: 15,   // 同一行卡组间距
        gapRowMM: 15,             // 行与行垂直间距
        gapSignToCardMM: 8,       // 签名框与卡片横向间距

        // 签名框尺寸 (按 0905 样稿精确测得尺寸)
        signBoxWidthMM: 32.4,     // 91.87 pt
        signHeaderHeightMM: 7.9,  // 22.45 pt
        signBodyHeightMM: 19.5,   // 55.06 pt
        titleFontSize: 10.5,      // 标题字号
        headerFontSize: 9,        // "设计师"字号

        // 选项开关
        useColorBar: true,
        useSignatureBox: true,
        autoDpi300: false,        // 可选尺寸缩放，默认保留素材物理尺寸
        autoFitArtboard: true,    // 自动闭合画板高度

        // 默认扫描目录
        defaultFolderPath: Folder.myDocuments.fsName
    };

    // ==========================================
    // 辅助工具函数
    // ==========================================

    function getScriptFolder() {
        try {
            return (new File($.fileName)).parent;
        } catch (e) {
            return Folder.current;
        }
    }

    function naturalCompare(a, b) {
        var ax = [], bx = [];
        a.replace(/(\d+)|(\D+)/g, function (_, $1, $2) { ax.push([$1 || 0, $2 || ""]); });
        b.replace(/(\d+)|(\D+)/g, function (_, $1, $2) { bx.push([$1 || 0, $2 || ""]); });
        while (ax.length && bx.length) {
            var an = ax.shift();
            var bn = bx.shift();
            var nn = (an[0] - bn[0]) || an[1].localeCompare(bn[1]);
            if (nn) return nn;
        }
        return ax.length - bx.length;
    }

    function extractGroupTitle(filename) {
        var base = filename.replace(/\.[^\.]+$/, "");
        
        var patterns = [
            /[-_](?:正面|背面|正|背|白卡面|白卡背|黑卡面|黑卡背|正酸|背酸|背男|背女)(?:[-_](?:男|女|酸))?$/i,
            /[-_](?:男|女)[-_](?:正面|背面|正|背)$/i,
            /[-_](?:0[1-9]|[1-9])$/i,
            /[-_]mb[-_](?:0[1-9]|[1-9])$/i,
            /[-_]mb$/i
        ];

        var cur = base;
        var changed = true;
        while (changed) {
            changed = false;
            for (var i = 0; i < patterns.length; i++) {
                var nextCur = cur.replace(patterns[i], "");
                if (nextCur !== cur) {
                    cur = nextCur;
                    changed = true;
                    break;
                }
            }
        }
        return cur.replace(/^\s+|\s+$/g, "");
    }

    function getFileSortScore(filename) {
        var s = filename;
        
        var variantScore = 0;
        if (s.indexOf("白卡") !== -1) variantScore = 100;
        else if (s.indexOf("黑卡") !== -1) variantScore = 200;
        else if (s.indexOf("男") !== -1) variantScore = 300;
        else if (s.indexOf("女") !== -1) variantScore = 400;
        else if (s.indexOf("酸") !== -1) variantScore = 500;

        var sideScore = 50;
        if (s.indexOf("_正.") !== -1 || s.indexOf("_正_") !== -1 || s.indexOf("正面") !== -1 || 
            s.indexOf("-01.") !== -1 || s.indexOf("_01.") !== -1 || s.indexOf("白卡面") !== -1 || 
            s.indexOf("黑卡面") !== -1 || s.indexOf("正酸") !== -1) {
            sideScore = 10;
        } else if (s.indexOf("_背.") !== -1 || s.indexOf("_背_") !== -1 || s.indexOf("背面") !== -1 || 
                   s.indexOf("-02.") !== -1 || s.indexOf("_02.") !== -1 || s.indexOf("白卡背") !== -1 || 
                   s.indexOf("黑卡背") !== -1 || s.indexOf("背男") !== -1 || s.indexOf("背女") !== -1 || 
                   s.indexOf("背酸") !== -1) {
            sideScore = 20;
        } else if (s.indexOf("-03.") !== -1 || s.indexOf("_03.") !== -1) {
            sideScore = 30;
        }

        return variantScore + sideScore;
    }

    function scanAndGroupCards(folder) {
        if (!folder || !folder.exists) return [];

        var allFiles = folder.getFiles(function (f) {
            if (f instanceof File) {
                var ext = f.name.toLowerCase().slice(-4);
                return ext === ".jpg" || ext === "jpeg" || ext === ".png" || ext === ".tif" || ext === "tiff";
            }
            return false;
        });

        if (!allFiles || allFiles.length === 0) return [];

        var groupMap = {};
        for (var i = 0; i < allFiles.length; i++) {
            var file = allFiles[i];
            var title = extractGroupTitle(decodeURI(file.name));
            if (!groupMap[title]) {
                groupMap[title] = [];
            }
            groupMap[title].push(file);
        }

        var groups = [];
        for (var titleKey in groupMap) {
            if (groupMap.hasOwnProperty(titleKey)) {
                var filesInGroup = groupMap[titleKey];
                
                filesInGroup.sort(function (a, b) {
                    var scoreA = getFileSortScore(a.name);
                    var scoreB = getFileSortScore(b.name);
                    if (scoreA !== scoreB) {
                        return scoreA - scoreB;
                    }
                    return naturalCompare(a.name, b.name);
                });

                groups.push({
                    title: titleKey,
                    files: filesInGroup
                });
            }
        }

        groups.sort(function (a, b) {
            return naturalCompare(a.title, b.title);
        });

        return groups;
    }

    // ==========================================
    // 矢量确认框生成器 (符合图二规范)
    // ==========================================
    function createDesignerSignatureBox(doc, targetLayer, x, y, title, cfg) {
        var boxGroup = targetLayer.groupItems.add();
        boxGroup.name = "确认框_" + title;

        var boxW = mm2pt(cfg.signBoxWidthMM);
        var headerH = mm2pt(cfg.signHeaderHeightMM);
        var bodyH = mm2pt(cfg.signBodyHeightMM);
        var totalH = headerH + bodyH;

        var blackColor = new CMYKColor();
        blackColor.cyan = 0; blackColor.magenta = 0; blackColor.yellow = 0; blackColor.black = 100;

        var whiteColor = new CMYKColor();
        whiteColor.cyan = 0; whiteColor.magenta = 0; whiteColor.yellow = 0; whiteColor.black = 0;

        // 1. 顶部标题文字
        var titleFrame = boxGroup.textFrames.add();
        titleFrame.contents = title;
        titleFrame.position = [x, y];
        if (titleFrame.textRange) {
            titleFrame.textRange.characterAttributes.size = cfg.titleFontSize;
            titleFrame.textRange.characterAttributes.fillColor = blackColor;
        }

        var titleBounds = titleFrame.visibleBounds;
        var titleH = Math.abs(titleBounds[1] - titleBounds[3]);
        var boxTopY = y - titleH - mm2pt(3.5);

        // 2. 外部主矩形
        var outerRect = boxGroup.pathItems.rectangle(boxTopY, x, boxW, totalH);
        outerRect.stroked = true;
        outerRect.strokeWidth = 0.5;
        outerRect.strokeColor = blackColor;
        outerRect.filled = true;
        outerRect.fillColor = whiteColor;

        // 3. 分割横线
        var splitLineY = boxTopY - headerH;
        var splitLine = boxGroup.pathItems.add();
        splitLine.setEntirePath([
            [x, splitLineY],
            [x + boxW, splitLineY]
        ]);
        splitLine.stroked = true;
        splitLine.strokeWidth = 0.5;
        splitLine.strokeColor = blackColor;
        splitLine.filled = false;

        // 4. "设计师" 标头文本 (居中)
        var headerFrame = boxGroup.textFrames.add();
        headerFrame.contents = "设计师";
        if (headerFrame.textRange) {
            headerFrame.textRange.characterAttributes.size = cfg.headerFontSize;
            headerFrame.textRange.characterAttributes.fillColor = blackColor;
        }
        var hBounds = headerFrame.visibleBounds;
        var hW = Math.abs(hBounds[2] - hBounds[0]);
        var hH = Math.abs(hBounds[1] - hBounds[3]);
        var centerX = x + (boxW - hW) / 2;
        var centerY = boxTopY - (headerH - hH) / 2 - 1.5;
        headerFrame.position = [centerX, centerY];

        return {
            group: boxGroup,
            width: boxW,
            height: Math.abs(y - (boxTopY - totalH)),
            boxTop: boxTopY
        };
    }

    // ==========================================
    // 矢量色控条置入器
    // ==========================================
    function placeVectorColorBar(doc, targetLayer, docWidthPt, cfg) {
        var scriptDir = getScriptFolder();
        var templateCandidates = [
            new File(scriptDir + "/assets/color_bar_template.ai")
        ];

        var templateFile = null;
        for (var i = 0; i < templateCandidates.length; i++) {
            if (templateCandidates[i].exists) {
                templateFile = templateCandidates[i];
                break;
            }
        }

        if (templateFile) {
            try {
                var tempDoc = app.open(templateFile);
                var copiedItems = [];

                var artboardTop = tempDoc.artboards[0].artboardRect[1];
                for (var j = 0; j < tempDoc.pageItems.length; j++) {
                    var item = tempDoc.pageItems[j];
                    if (!item.parent || (item.parent.typename !== "Document" && item.parent.typename !== "Layer")) {
                        continue;
                    }
                    var b = item.visibleBounds;
                    if (b[1] >= artboardTop - mm2pt(25)) {
                        copiedItems.push(item);
                    }
                }

                if (copiedItems.length > 0) {
                    var barGroup = targetLayer.groupItems.add();
                    barGroup.name = "矢量色控条";
                    for (var k = 0; k < copiedItems.length; k++) {
                        copiedItems[k].duplicate(barGroup, ElementPlacement.PLACEATEND);
                    }
                    tempDoc.close(SaveOptions.DONOTSAVECHANGES);

                    targetLayer.locked = true;
                    return mm2pt(15);
                } else {
                    tempDoc.close(SaveOptions.DONOTSAVECHANGES);
                }
            } catch (err) {
            }
        }

        var barHeight = drawFallbackVectorColorBar(doc, targetLayer, docWidthPt);
        targetLayer.locked = true;
        return barHeight;
    }

    function drawFallbackVectorColorBar(doc, layer, docWidthPt) {
        var startY = 0;
        var patchW = mm2pt(7);
        var patchH = mm2pt(7);

        function cmyk(c, m, y, k) {
            var col = new CMYKColor();
            col.cyan = c; col.magenta = m; col.yellow = y; col.black = k;
            return col;
        }

        var group = layer.groupItems.add();
        group.name = "矢量色控条_原生";

        var tints = [100, 90, 80, 70, 60, 50, 40, 30, 20, 10, 5];
        var curX = mm2pt(10);
        var curY = startY - mm2pt(2);

        var primaries = [
            { name: "C", c: 1, m: 0, y: 0, k: 0 },
            { name: "M", c: 0, m: 1, y: 0, k: 0 },
            { name: "Y", c: 0, m: 0, y: 1, k: 0 },
            { name: "K", c: 0, m: 0, y: 0, k: 1 }
        ];

        for (var p = 0; p < primaries.length; p++) {
            var pri = primaries[p];
            for (var t = 0; t < tints.length; t++) {
                var factor = tints[t];
                var rect = group.pathItems.rectangle(curY, curX, patchW, patchH);
                rect.stroked = false;
                rect.filled = true;
                rect.fillColor = cmyk(pri.c * factor, pri.m * factor, pri.y * factor, pri.k * factor);
                curX += patchW;
            }
            curX += mm2pt(3);
        }

        var overprints = [
            { c: 100, m: 100, y: 0, k: 0 },
            { c: 0, m: 100, y: 100, k: 0 },
            { c: 100, m: 0, y: 100, k: 0 },
            { c: 100, m: 100, y: 100, k: 0 },
            { c: 50, m: 40, y: 40, k: 0 }
        ];

        for (var o = 0; o < overprints.length; o++) {
            var op = overprints[o];
            var opRect = group.pathItems.rectangle(curY, curX, patchW, patchH);
            opRect.stroked = false;
            opRect.filled = true;
            opRect.fillColor = cmyk(op.c, op.m, op.y, op.k);
            curX += patchW;
        }

        var gb = group.visibleBounds;
        var groupW = Math.abs(gb[2] - gb[0]);
        var shiftX = (docWidthPt - groupW) / 2 - gb[0];
        group.translate(shiftX, 0);

        return mm2pt(15);
    }

    // ==========================================
    // 智能流式拼版核心引擎
    // ==========================================
    function executeImposition(groups, cfg) {
        var docWidthPt = mm2pt(cfg.rollWidthMM);
        var initialHeightPt = mm2pt(1200);

        var docPreset = new DocumentPreset();
        docPreset.colorMode = DocumentColorSpace.CMYK;
        docPreset.units = RulerUnits.Millimeters;
        docPreset.width = docWidthPt;
        docPreset.height = initialHeightPt;
        var doc = app.documents.add(DocumentColorSpace.CMYK, docPreset.width, docPreset.height);
        doc.rulerUnits = RulerUnits.Millimeters;

        var colorBarLayer = doc.layers[0];
        colorBarLayer.name = "01_色控条";
        var cardsLayer = doc.layers.add();
        cardsLayer.name = "02_卡种拼版";

        var colorBarOccupiedH = 0;
        if (cfg.useColorBar) {
            colorBarOccupiedH = placeVectorColorBar(doc, colorBarLayer, docWidthPt, cfg);
        }

        var currentX = mm2pt(cfg.marginLeftMM);
        var startY = -(colorBarOccupiedH + mm2pt(cfg.marginTopMM));
        var currentY = startY;
        var maxContentWidthPt = docWidthPt - mm2pt(cfg.marginRightMM);

        var rowMaxHeightPt = 0;
        var totalPlacedGroups = 0;
        var totalPlacedCards = 0;

        for (var g = 0; g < groups.length; g++) {
            var grp = groups[g];
            var files = grp.files;
            if (!files || files.length === 0) continue;

            var signW = cfg.useSignatureBox ? mm2pt(cfg.signBoxWidthMM) : 0;
            var signGap = cfg.useSignatureBox ? mm2pt(cfg.gapSignToCardMM) : 0;

            var placedItemsInGroup = [];
            var cardsTotalWidth = 0;
            var groupMaxCardHeight = 0;

            for (var f = 0; f < files.length; f++) {
                var placedItem = cardsLayer.placedItems.add();
                placedItem.file = files[f];

                if (cfg.autoDpi300) {
                    if (placedItem.width > mm2pt(100)) {
                        var scaleRatio = (72.0 / 300.0) * 100;
                        placedItem.resize(scaleRatio, scaleRatio);
                    }
                }

                cardsTotalWidth += placedItem.width;
                if (f > 0) cardsTotalWidth += mm2pt(cfg.gapInsideGroupMM);
                if (placedItem.height > groupMaxCardHeight) {
                    groupMaxCardHeight = placedItem.height;
                }
                placedItemsInGroup.push(placedItem);
                totalPlacedCards++;
            }

            var groupTotalWidthPt = signW + signGap + cardsTotalWidth;
            var groupTotalHeightPt = Math.max(
                cfg.useSignatureBox ? (mm2pt(cfg.signHeaderHeightMM + cfg.signBodyHeightMM) + mm2pt(8)) : 0,
                groupMaxCardHeight
            );

            if (currentX + groupTotalWidthPt > maxContentWidthPt && currentX > mm2pt(cfg.marginLeftMM)) {
                currentY -= (rowMaxHeightPt + mm2pt(cfg.gapRowMM));
                currentX = mm2pt(cfg.marginLeftMM);
                rowMaxHeightPt = 0;
            }

            var cardStartX = currentX;

            if (cfg.useSignatureBox) {
                var signInfo = createDesignerSignatureBox(doc, cardsLayer, currentX, currentY, grp.title, cfg);
                cardStartX += signInfo.width + mm2pt(cfg.gapSignToCardMM);
            }

            var cardTopY = cfg.useSignatureBox ? (currentY - mm2pt(cfg.titleFontSize * 0.35 + 3.5)) : currentY;
            var placeX = cardStartX;

            for (var p = 0; p < placedItemsInGroup.length; p++) {
                var pItem = placedItemsInGroup[p];
                pItem.position = [placeX, cardTopY];
                placeX += pItem.width + mm2pt(cfg.gapInsideGroupMM);
            }

            if (groupTotalHeightPt > rowMaxHeightPt) {
                rowMaxHeightPt = groupTotalHeightPt;
            }
            currentX += groupTotalWidthPt + mm2pt(cfg.gapBetweenGroupsMM);
            totalPlacedGroups++;
        }

        var finalTotalHeightPt = Math.abs(currentY - rowMaxHeightPt) + mm2pt(cfg.marginBottomMM);
        if (cfg.autoFitArtboard) {
            doc.artboards[0].artboardRect = [0, 0, docWidthPt, -finalTotalHeightPt];
        }

        app.activeDocument.views[0].zoom = 0.5;

        alert("🎉 色稿自动化拼版完成！\n" +
              "----------------------------------------\n" +
              "✓ 成功拼版卡种: " + totalPlacedGroups + " 组\n" +
              "✓ 导入卡片总数: " + totalPlacedCards + " 张\n" +
              "✓ 打样幅宽锁定: " + cfg.rollWidthMM + " mm\n" +
              "✓ 画板自动高度: " + Math.round(pt2mm(finalTotalHeightPt)) + " mm\n" +
              "----------------------------------------\n" +
              "矢量色控条与签名确认框已就绪，可直接打样核对！");
    }

    // ==========================================
    // ScriptUI 可视化交互窗口
    // ==========================================
    function showDialog() {
        var dialog = new Window("dialog", "YOUKAI · 色稿自动拼版");
        dialog.orientation = "column";
        dialog.alignChildren = ["fill", "top"];
        dialog.spacing = 10;
        dialog.margins = 15;

        var pnlSource = dialog.add("panel", undefined, "1. 卡种图片来源");
        pnlSource.orientation = "column";
        pnlSource.alignChildren = ["fill", "top"];
        pnlSource.spacing = 6;

        var grpFolder = pnlSource.add("group");
        grpFolder.orientation = "row";
        var txtFolder = grpFolder.add("edittext", undefined, DEFAULT_CONFIG.defaultFolderPath);
        txtFolder.characters = 45;
        var btnBrowse = grpFolder.add("button", undefined, "浏览...");

        var lblScanInfo = pnlSource.add("statictext", undefined, "请选择项目打样 JPG 文件夹进行拼版。");

        btnBrowse.onClick = function () {
            var initial = new Folder(txtFolder.text);
            var f = Folder.selectDialog("请选择卡种图片所在的项目文件夹", initial.exists ? initial : Folder.desktop);
            if (f) {
                txtFolder.text = f.fsName;
                updateScanInfo();
            }
        };

        function updateScanInfo() {
            var f = new Folder(txtFolder.text);
            if (f.exists) {
                var groups = scanAndGroupCards(f);
                var totalImgs = 0;
                for (var i = 0; i < groups.length; i++) totalImgs += groups[i].files.length;
                lblScanInfo.text = "已识别到 " + groups.length + " 组卡种，共 " + totalImgs + " 张卡牌图片。";
            } else {
                lblScanInfo.text = "指定的文件夹路径不存在，请重新选择。";
            }
        }
        updateScanInfo();

        var pnlPrinter = dialog.add("panel", undefined, "2. 打样机幅宽与边距 (爱普生等数码机)");
        pnlPrinter.orientation = "column";
        pnlPrinter.alignChildren = ["fill", "top"];

        var grpWidth = pnlPrinter.add("group");
        grpWidth.orientation = "row";
        grpWidth.add("statictext", undefined, "固定幅宽 (mm):");
        var edtWidth = grpWidth.add("edittext", undefined, String(DEFAULT_CONFIG.rollWidthMM));
        edtWidth.characters = 6;
        grpWidth.add("statictext", undefined, " (标准卷筒相纸宽度，可根据机型修改)");

        var grpMargins = pnlPrinter.add("group");
        grpMargins.orientation = "row";
        grpMargins.add("statictext", undefined, "左右边距 (mm):");
        var edtMarginLR = grpMargins.add("edittext", undefined, String(DEFAULT_CONFIG.marginLeftMM));
        edtMarginLR.characters = 4;
        grpMargins.add("statictext", undefined, "顶边距:");
        var edtMarginT = grpMargins.add("edittext", undefined, String(DEFAULT_CONFIG.marginTopMM));
        edtMarginT.characters = 4;
        grpMargins.add("statictext", undefined, "底边距:");
        var edtMarginB = grpMargins.add("edittext", undefined, String(DEFAULT_CONFIG.marginBottomMM));
        edtMarginB.characters = 4;

        var pnlSpacing = dialog.add("panel", undefined, "3. 拼版间距微调");
        pnlSpacing.orientation = "column";
        pnlSpacing.alignChildren = ["fill", "top"];

        var grpSpc1 = pnlSpacing.add("group");
        grpSpc1.orientation = "row";
        grpSpc1.add("statictext", undefined, "正反面间距 (mm):");
        var edtGapInside = grpSpc1.add("edittext", undefined, String(DEFAULT_CONFIG.gapInsideGroupMM));
        edtGapInside.characters = 4;
        grpSpc1.add("statictext", undefined, " (0为拼缝贴合)");

        grpSpc1.add("statictext", undefined, "  卡组间距 (mm):");
        var edtGapBetween = grpSpc1.add("edittext", undefined, String(DEFAULT_CONFIG.gapBetweenGroupsMM));
        edtGapBetween.characters = 4;

        var grpSpc2 = pnlSpacing.add("group");
        grpSpc2.orientation = "row";
        grpSpc2.add("statictext", undefined, "行与行垂直间距 (mm):");
        var edtGapRow = grpSpc2.add("edittext", undefined, String(DEFAULT_CONFIG.gapRowMM));
        edtGapRow.characters = 4;

        grpSpc2.add("statictext", undefined, "  签名框间距 (mm):");
        var edtGapSign = grpSpc2.add("edittext", undefined, String(DEFAULT_CONFIG.gapSignToCardMM));
        edtGapSign.characters = 4;

        var pnlOpts = dialog.add("panel", undefined, "4. 规范与自动化选项");
        pnlOpts.orientation = "column";
        pnlOpts.alignChildren = ["left", "top"];

        var chkColorBar = pnlOpts.add("checkbox", undefined, "顶部置入标准矢量色控条 (保留 CMYK 纯矢量梯尺与规矩线)");
        chkColorBar.value = DEFAULT_CONFIG.useColorBar;

        var chkSignBox = pnlOpts.add("checkbox", undefined, "生成项目名称与设计师签名确认框 (图二规范)");
        chkSignBox.value = DEFAULT_CONFIG.useSignatureBox;

        var chkDpi = pnlOpts.add("checkbox", undefined, "宽于 100 mm 的图片缩至 24%（仅用于 72 DPI 素材校正）");
        chkDpi.value = DEFAULT_CONFIG.autoDpi300;

        var chkFitArtboard = pnlOpts.add("checkbox", undefined, "完成后画板高度自动闭合裁剪 (自适应实际内容长度)");
        chkFitArtboard.value = DEFAULT_CONFIG.autoFitArtboard;

        var grpButtons = dialog.add("group");
        grpButtons.alignment = "right";
        var btnCancel = grpButtons.add("button", undefined, "取消");
        var btnOk = grpButtons.add("button", undefined, "开始自动拼版", { name: "ok" });

        btnCancel.onClick = function () {
            dialog.close(0);
        };

        btnOk.onClick = function () {
            var targetFolder = new Folder(txtFolder.text);
            if (!targetFolder.exists) {
                alert("指定的文件夹不存在，请检查路径！");
                return;
            }

            var scannedGroups = scanAndGroupCards(targetFolder);
            if (scannedGroups.length === 0) {
                alert("所选文件夹中未找到任何 JPG/PNG 图片文件！");
                return;
            }

            function measurement(field, label, positive) {
                var raw = String(field.text).replace(/^\s+|\s+$/g, "");
                var value = Number(raw);
                if (!raw || !isFinite(value) || value < 0 || (positive && value === 0))
                    throw new Error(label + "请填写" + (positive ? "大于 0" : "不小于 0") + "的毫米数。");
                return value;
            }
            var config;
            try {
            config = {
                rollWidthMM: measurement(edtWidth, "幅宽", true),
                marginLeftMM: measurement(edtMarginLR, "左右边距", false),
                marginRightMM: measurement(edtMarginLR, "左右边距", false),
                marginTopMM: measurement(edtMarginT, "顶边距", false),
                marginBottomMM: measurement(edtMarginB, "底边距", false),

                gapInsideGroupMM: measurement(edtGapInside, "组内间距", false),
                gapBetweenGroupsMM: measurement(edtGapBetween, "组间距", false),
                gapRowMM: measurement(edtGapRow, "行间距", false),
                gapSignToCardMM: measurement(edtGapSign, "签名框间距", false),

                signBoxWidthMM: DEFAULT_CONFIG.signBoxWidthMM,
                signHeaderHeightMM: DEFAULT_CONFIG.signHeaderHeightMM,
                signBodyHeightMM: DEFAULT_CONFIG.signBodyHeightMM,
                titleFontSize: DEFAULT_CONFIG.titleFontSize,
                headerFontSize: DEFAULT_CONFIG.headerFontSize,

                useColorBar: chkColorBar.value,
                useSignatureBox: chkSignBox.value,
                autoDpi300: chkDpi.value,
                autoFitArtboard: chkFitArtboard.value
            };

            if (config.rollWidthMM <= config.marginLeftMM + config.marginRightMM)
                throw new Error("幅宽必须大于左右边距之和。");
            } catch (invalid) { alert(invalid.message); return; }
            dialog.close(1);
            executeImposition(scannedGroups, config);
        };

        dialog.show();
    }

    showDialog();

})();
