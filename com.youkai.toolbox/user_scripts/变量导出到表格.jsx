#target illustrator
// 最终版：按绑定对象的文件名后缀加@
(function () {
    var doc = app.activeDocument;
    if (!doc) { alert("请打开带变量的AI文档！"); return; }
    if (doc.variables.length === 0) { alert("文档里没有变量！"); return; }

    var csvFile = File.saveDialog("保存CSV文件", "*.csv");
    if (!csvFile) return;

    var header = [];
    var values = [];

    for (var i = 0; i < doc.variables.length; i++) {
        var v = doc.variables[i];
        var name = v.name || "";
        var val = "";

        // ==============================================
        // 智能判断变量类型以添加前缀
        // ==============================================
        var prefix = "";
        try {
            if (v.kind === VariableKind.VISIBILITY) {
                prefix = "#"; // 可视性变量
            } else if (v.kind === VariableKind.IMAGE) {
                prefix = "@"; // 链接图片变量
            } else {
                // 备用判断：如果绑定了对象且对象名包含图片后缀
                if (v.pageItems && v.pageItems.length > 0) {
                    var objName = "";
                    try { objName = v.pageItems[0].name.toLowerCase(); } catch (e) {}
                    if (objName.indexOf(".psd") !== -1 || 
                        objName.indexOf(".png") !== -1 || 
                        objName.indexOf(".jpg") !== -1 || 
                        objName.indexOf(".tif") !== -1 ||
                        objName.indexOf(".jpeg") !== -1) {
                        prefix = "@";
                    }
                }
            }
        } catch (e) {}

        // 拼接前缀与变量名
        header.push(prefix + name);

        // 安全读取变量值
        try {
            val = v.value || "";
            val = val.toString().replace(/,/g, "，");
        } catch (e) {
            val = "";
        }
        values.push(val);
    }

    // 横版输出
    var csv = header.join(",") + "\n" + values.join(",");

    // 保存文件（UTF-8无乱码）
    csvFile.open("w");
    csvFile.encoding = "utf-8";
    csvFile.write("\ufeff" + csv);
    csvFile.close();

    alert("✅ 导出成功！\n说明：\n@开头=绑定对象为图片（.psd/.png等）");
})();