#target illustrator
/* YOUKAI-PROVENANCE-BEGIN
 * YOUKAI 1.0 | 集体注释 | 作者：二百七
 * Copyright (c) 2026 二百七 | SPDX-License-Identifier: MIT
 * 来源标识：YOUKAI-ANNOTATE-20261104
 * 来源：作者确认版本；仅增加本水印，运行代码保持原样。
 * 原始脚本 SHA256（移除本注释后还原的完整原文件字节）：
 * 15c63a0e03a56d833821393eca37c758db4e3bf29bebca24ab30e2f1d4a0bccb
 * 此标识用于署名与版本溯源；发行文件以随附校验记录为准。
 * YOUKAI-PROVENANCE-END */
"use strict";
// 核心：/分段 + 无限嵌套覆盖 + 无任何报错 + 强制序号（即使单个对象也编号）
var hasDoc = false;
if(app.documents.length > 0){
    hasDoc = true;
} else {
    alert("请打开Illustrator文档后运行！");
}

if(hasDoc){
    var doc = app.activeDocument;
    // 类型映射（覆盖所有AI对象，无未知对象）
    var typeMap = new Object();
    typeMap["LayerItem"] = "图层";
    typeMap["GroupItem"] = "组";
    typeMap["PathItem"] = "路径";
    typeMap["TextFrame"] = "文本框";
    typeMap["PlacedItem"] = "置入图像";
    typeMap["RectangleItem"] = "矩形";
    typeMap["EllipseItem"] = "圆形";
    typeMap["PolygonItem"] = "多边形";
    typeMap["StarItem"] = "星形";
    typeMap["CompoundPathItem"] = "复合路径"; // 已存在，确保名称映射

    // 新增：用于记录每个父路径下，每种基础名称已出现的次数
    var nameCounter = {}; // 结构示例：{ "父路径/组": 2, "父路径/路径": 1 }

    // 层级栈：处理无限嵌套（子目标的子目标的子目标都覆盖）
    var stack = new Array();
    for(var i=0; i<doc.layers.length; i++){
        stack.push([doc.layers[i], ""]);
    }

    // 遍历所有层级对象
    while(stack.length > 0){
        var current = stack.pop();
        var item = current[0];
        var parentPath = current[1];

        // === 修改点：删除以下跳过复合路径的代码块 ===
        // if(item.typename == "CompoundPathItem"){
        //     continue;
        // }
        // === 修改结束 ===

        // 安全获取基础名称（无trim/无函数报错）
        var baseName = item.name;
        if(baseName == "" || baseName == null || baseName == undefined){
            baseName = typeMap[item.typename] || item.typename;
        }

        // 核心修改：构建用于计数的键
        // 格式为 "父路径/基础类型名"，例如 "图层1/组"
        var counterKey = parentPath + "/" + baseName;

        // 获取或初始化该键的计数器
        if(nameCounter[counterKey] === undefined){
            nameCounter[counterKey] = 1; // 从1开始计数
        } else {
            nameCounter[counterKey]++; // 递增计数
        }

        // 生成带有序号的最终名称
        var numberedName = baseName + nameCounter[counterKey]; // 例如 "组1"

        // 构建完整路径
        var fullPath = "";
        if(parentPath == ""){
            fullPath = numberedName;
        } else {
            fullPath = parentPath + "/" + numberedName; // 例如 "图层1/组1"
        }

        // 设置注释（兼容所有对象）
        try{
            item.note = fullPath;
        } catch(e){}

        // 反向加入子对象，保证层级顺序
        if(item.layers != null && item.layers.length > 0){
            for(var j=item.layers.length-1; j>=0; j--){
                stack.push([item.layers[j], fullPath]);
            }
        }
        if(item.pageItems != null && item.pageItems.length > 0){
            for(var k=item.pageItems.length-1; k>=0; k--){
                stack.push([item.pageItems[k], fullPath]);
            }
        }
    }

    
}
