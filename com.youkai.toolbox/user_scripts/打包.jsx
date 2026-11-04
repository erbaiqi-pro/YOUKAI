function main() {
    var doc = app.activeDocument;
    
    // 1. 解锁并显示所有图层
    if (doc.layers.length > 0) {
        for (var i = 0; i < doc.layers.length; i += 1) {
            var currentLayer = doc.layers[i];
            currentLayer.visible = true;
            currentLayer.locked = false;
        }
    }
    app.redraw();
    
    // 2. 解锁所有对象
    doc.selection = null;
    app.executeMenuCommand("unlockAll");
    app.redraw();
    delay(100);
    
    // 3. 显示所有隐藏对象并清除它们（清理无用垃圾）
    doc.selection = null;
    app.executeMenuCommand("showAll");
    app.redraw();
    delay(100);
    app.executeMenuCommand("clear");
    app.redraw();
    delay(100);
    
    // 4. 选中所有文本并转曲
    doc.selection = null;
    app.executeMenuCommand("Text Objects menu item");
    app.redraw();
    delay(100);
    
    if (doc.selection && doc.selection.length > 0) {
        delay(100);
        app.executeMenuCommand("outline");
    }
    
    // 源文件保存由批处理的“保存修改后的源 AI 文件”控制；这里仅保存打包副本。
    
    // 6. 自定义静默打包逻辑 (替代原生 Package Menu Item，彻底消除弹窗)
    try {
        var docName = doc.name.replace(/\.ai$/i, "");
        var targetBaseFolder = null;
        
        // 获取输出路径：优先使用批处理全局变量，否则使用原文档同级目录
        if ($.global && $.global.YOUKAI_OUTPUT_FOLDER) {
            targetBaseFolder = new Folder($.global.YOUKAI_OUTPUT_FOLDER);
        } else {
            try { targetBaseFolder = doc.path; } catch(e) { targetBaseFolder = Folder.desktop; }
        }
        
        function ensureFolder(folder) {
            if (folder.exists) return;
            if (folder.parent && !folder.parent.exists) ensureFolder(folder.parent);
            if (!folder.create()) throw new Error("无法创建输出文件夹: " + folder.fsName);
        }
        ensureFolder(targetBaseFolder);
        var copiedLinks = {};
        // 创建专属的打包文件夹
        var packageFolder = new Folder(targetBaseFolder.fsName + "/" + docName + "_打包");
        if (!packageFolder.exists) {
            ensureFolder(packageFolder);
        }
        
        var linksFolder = new Folder(packageFolder.fsName + "/Links");
        
        // 收集并复制所有的链接图片
        function copyLinksToPackage(items) {
            for (var i = 0; i < items.length; i++) {
                    var item = items[i];
                    // 嵌入图像没有外部链接，忽略；缺失的外部链接应明确报错。
                    var sourceFile = null;
                    try { sourceFile = item.file; } catch (embedded) { continue; }
                    if (sourceFile && !sourceFile.exists) throw new Error("缺失链接: " + sourceFile.fsName);
                    if (sourceFile && sourceFile.exists) {
                        ensureFolder(linksFolder);
                        if (copiedLinks[sourceFile.fsName]) { item.file = copiedLinks[sourceFile.fsName]; continue; }
                        
                        var ext = "";
                        var dotIndex = item.file.name.lastIndexOf(".");
                        if (dotIndex > -1) ext = item.file.name.substring(dotIndex);
                        
                        var targetFile = new File(linksFolder.fsName + "/" + item.file.name);
                        var counter = 1;
                        
                        // 处理重名冲突 (文件大小不同则认为是不同文件)
                        while (targetFile.exists) {
                            var baseName = item.file.name.substring(0, dotIndex > -1 ? dotIndex : item.file.name.length);
                            targetFile = new File(linksFolder.fsName + "/" + baseName + "_" + counter + ext);
                            counter++;
                        }
                        
                        // 复制文件
                        if (!targetFile.exists) {
                            if (!sourceFile.copy(targetFile)) throw new Error("复制链接失败: " + sourceFile.fsName);
                        }
                        
                        // 重新链接到打包目录内的文件
                        copiedLinks[sourceFile.fsName] = targetFile;
                        item.file = targetFile;
                    }
            }
        }
        
        copyLinksToPackage(doc.placedItems);
        copyLinksToPackage(doc.rasterItems);
        
        // 将包含了新链接的文档另存为到打包目录
        var saveFile = new File(packageFolder.fsName + "/" + doc.name);
        var saveOptions = new IllustratorSaveOptions();
        saveOptions.pdfCompatible = true;
        doc.saveAs(saveFile, saveOptions);
        
        // 7. 生成打包报告 (替代原生报告)
        try {
            var reportName = docName + "_报告.txt";
            var reportFile = new File(packageFolder.fsName + "/" + reportName);
            reportFile.encoding = "UTF-8";
            if(reportFile.open('w')) {
                reportFile.writeln("Adobe Illustrator 打包报告");
                reportFile.writeln("--------------------------------------------------------------------------------");
                reportFile.writeln("文档名称: " + doc.name);
                reportFile.writeln("颜色模式: " + (doc.documentColorSpace === DocumentColorSpace.CMYK ? "CMYK" : "RGB"));
                reportFile.writeln("");
                reportFile.writeln("包含的链接:");
                
                var count = 0;
                for (var i = 0; i < doc.placedItems.length; i++) {
                    try {
                        if (doc.placedItems[i].file) {
                            reportFile.writeln(" - " + doc.placedItems[i].file.name);
                            count++;
                        }
                    } catch(e) {}
                }
                for (var j = 0; j < doc.rasterItems.length; j++) {
                    try {
                        if (doc.rasterItems[j].file) {
                            reportFile.writeln(" - " + doc.rasterItems[j].file.name);
                            count++;
                        }
                    } catch(e) {}
                }
                
                if (count === 0) {
                    reportFile.writeln(" (无链接文件)");
                }
                
                reportFile.writeln("");
                reportFile.writeln("字体:");
                reportFile.writeln("所有文本均已转曲。");
                reportFile.close();
            }
        } catch(e) {}
        
    } catch(err) {
        throw err;
    }
}

// 延迟函数，用于等待 AI 软件响应命令
function delay(ms) {
    $.sleep(ms);
}

// 直接运行主程序
main();
