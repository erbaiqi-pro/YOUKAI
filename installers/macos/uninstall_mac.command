#!/bin/bash
# YOUKAI 1.0 | 作者：二百七 | Copyright (c) 2026 二百七 | SPDX-License-Identifier: MIT
set -euo pipefail
DEST_DIR="$HOME/Library/Application Support/Adobe/CEP/extensions/com.youkai.toolbox"
if [ ! -d "$DEST_DIR" ]; then echo "未检测到 Youkai。"; exit 0; fi
BACKUP="$HOME/Library/Application Support/Youkai/backups/uninstall-$(date +%Y%m%d-%H%M%S)-$$"
mkdir -p "$BACKUP"
mv "$DEST_DIR" "$BACKUP/"
echo "Youkai 已卸载；文件保留在: $BACKUP"
echo "共享 CEP 调试设置与 CSV 配置已保留。"
if [ -t 0 ]; then read -n 1 -s -r -p "按任意键退出..."; fi
