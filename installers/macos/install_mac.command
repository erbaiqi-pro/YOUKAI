#!/bin/bash
# YOUKAI 1.0 | 作者：二百七 | Copyright (c) 2026 二百七 | SPDX-License-Identifier: MIT
set -euo pipefail
DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
SRC_DIR="$DIR/../../com.youkai.toolbox"
if [ ! -f "$SRC_DIR/CSXS/manifest.xml" ]; then
    echo "未找到完整的 com.youkai.toolbox，请解压整个项目后重试。"; exit 1
fi
CEP_BASE="$HOME/Library/Application Support/Adobe/CEP/extensions"
DEST_DIR="$CEP_BASE/com.youkai.toolbox"
mkdir -p "$CEP_BASE"
if [ -d "$DEST_DIR" ]; then
    BACKUP="$HOME/Library/Application Support/Youkai/backups/$(date +%Y%m%d-%H%M%S)-$$"
    mkdir -p "$BACKUP"
    cp -R "$DEST_DIR" "$BACKUP/"
    echo "旧版本已备份到: $BACKUP"
fi
mkdir -p "$DEST_DIR"
# Merge updates instead of deleting the installed extension and custom scripts.
cp -R "$SRC_DIR/." "$DEST_DIR/"
for i in {5..22}; do defaults write "com.adobe.CSXS.$i" PlayerDebugMode 1; done
xattr -dr com.apple.quarantine "$DEST_DIR" 2>/dev/null || true
echo "Youkai 已安装: $DEST_DIR"
echo "请重启 Illustrator，在 窗口 > 扩展 中打开 Youkai。"
if [ -t 0 ]; then read -n 1 -s -r -p "按任意键退出..."; fi
