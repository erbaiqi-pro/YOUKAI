# YOUKAI 1.0 | 作者：二百七 | Copyright (c) 2026 二百七 | SPDX-License-Identifier: MIT
"""Prepare a local source folder. Never upload or publish anything."""
from pathlib import Path
from datetime import datetime
import hashlib
import json
import shutil
import subprocess
import sys

ROOT = Path(__file__).resolve().parents[1]
PROJECT = ROOT.parent if ROOT.name == '源码' else ROOT
INTERNAL = ROOT / '项目资料'
ROOT_FILES = ['LICENSE.txt', 'THIRD_PARTY_NOTICES.md', '.gitignore', '.gitattributes', 'package.json']
SOURCE_FOLDERS = ['com.youkai.toolbox', 'installers', 'licenses']
DOC_FILES = ['CHANGELOG.md', '联网更新.md', 'PRIVACY.md', 'maintenance/VERIFIED-SCRIPTS.json']
TOOL_FILES = sorted(p.name for p in (ROOT / 'tools').iterdir()
                    if p.is_file() and p.suffix in ('.py', '.ps1', '.cjs'))
IGNORE = shutil.ignore_patterns('node_modules', '__pycache__', '.DS_Store', 'Thumbs.db',
                               '.youkai-offset-backups', '.env', '.env.*', '*.pyc', '*.log',
                               '执行报告', 'install-state.json')
PUBLIC_README = '''# YOUKAI @@VERSION@@

作者：二百七。Adobe Illustrator 脚本工具箱，包含 27 个脚本、简明说明、CSV 配置与批量运行面板。

[下载 Windows 内测安装包](https://github.com/erbaiqi-pro/YOUKAI/releases/tag/v@@VERSION@@) · [作者网站](https://erbaiqi.pages.dev/)

## 使用

1. 保存工作，退出 Adobe 软件后安装 YOUKAI。
2. 在 Illustrator 的“窗口 > 扩展”中打开 YOUKAI。
3. 设置 CSV 和输出目录；双击脚本运行，点击“说明”查看步骤。

“战队色修改”仅改文件名为“色板方案切换”。配色表首列表头仍为“战队”，第二列及后续列表头是实际色板名，文档使用 `战队@名称`。

2026-10-20 新增：刀线尺寸标注、导出PDF、链接按文件夹命名、文本按空格拆分、文字跟随排版。均保留作者确认的测试版本代码，说明已整理到对应脚本旁。

2026-11-04 新增：集体注释、按注释批量修改。先生成注释，再手填 CSV 规则，批量移动、改专色 T 值、改普通 CMYK 色值或删除；批处理跳过 link／links 文件夹。各工具的简明说明位于脚本旁。

1.0.1 修复 Illustrator 2026 中宿主桥接无法加载的问题。更新检查改为直接读取 GitHub 公开发布清单，不依赖 REST API 额度；403 会提示请求被拒绝或受限，不再误报为电脑没联网。

## 联网更新

此版本已接入 GitHub 更新：后续正式版本在网站 LOGO 旁显示红色 NEW，点击后自愿更新，没有自动弹窗。可在系统设置中手动检查更新。检查通过公开发布文件完成，不使用 API Key。

当前仓库：https://github.com/erbaiqi-pro/YOUKAI 。1.0.0 为首个含更新器的内测首装版本，请改用 1.0.1 修复包。内测发布不触发正式版自动更新提醒；宿主加载已在 Illustrator 2026 验证，完整的实际画稿流程仍需试用。发布与使用步骤见 [联网更新](docs/联网更新.md)。

## 隐私

普通脚本本地运行，更新器不需要 API Key，不上传设计稿、CSV 或对象注释。源码与更新包构建前会筛查常见密钥和敏感文件；检查不等于绝对安全保证。详见 [隐私与密钥](docs/PRIVACY.md)。

## 源码

- `com.youkai.toolbox/`：插件、脚本及使用说明。
- `installers/`：安装器源码；Windows EXE 使用 Inno Setup 6 编译。
- `tools/`：检查和打包工具。
- `docs/`、`licenses/`：更新记录、已验收脚本校验和许可。

运行 `npm test` 检查代码；`python tools/build-release.py` 生成 Windows 安装包。界面检查需要 Playwright，可用 `PLAYWRIGHT_MODULE` 和 `CHROME_PATH` 指定本地环境。

Windows 安装了 Illustrator 时，可运行 `npm run test:host` 进行真实宿主编译和桥接加载检查。测试前先结束批处理；该检查不运行画稿处理脚本，不修改、保存或关闭文档。

运行 `python tools/build-update.py` 在本地生成 `YOUKAI-Update.json` 和更新 ZIP。该命令不生成 EXE，也不上传文件。测试更新使用隔离的 CEP 文件夹，不会改动真实 Adobe 安装。

已验收的 10 个脚本按固定 SHA256 校验，保持原文件内容，其中包括本次纳入的 5 个测试脚本。自动检查采用模拟 Adobe 对象，实际输出以宿主试用为准。macOS 安装脚本尚未验收。

## 许可

项目采用 [MIT](LICENSE.txt)；版权声明与许可须保留。第三方说明见 [THIRD_PARTY_NOTICES.md](THIRD_PARTY_NOTICES.md)。
'''


def within(path):
    resolved = path.resolve()
    resolved.relative_to(PROJECT.resolve())
    if resolved == PROJECT.resolve():
        raise ValueError('Refusing to move or replace the project root')
    return resolved


def digest(path):
    value = hashlib.sha256()
    with path.open('rb') as stream:
        for block in iter(lambda: stream.read(1024 * 1024), b''):
            value.update(block)
    return value.hexdigest()


def verify_approved_scripts():
    record = json.loads((ROOT / 'docs/maintenance/VERIFIED-SCRIPTS.json').read_text(encoding='utf-8'))
    if len(record['files']) != 10:
        raise RuntimeError('Expected the ten author-approved scripts')
    for item in record['files']:
        target = within(ROOT / item['target'])
        if target.stat().st_size != item['bytes'] or digest(target) != item['sha256']:
            raise RuntimeError('Author-approved script changed: ' + item['target'])
    return record


def tree_hashes(folder):
    return {p.relative_to(folder).as_posix(): digest(p)
            for p in sorted(folder.rglob('*')) if p.is_file()}


def prepare_source():
    verify_approved_scripts()
    # An exported checkout is already the prepared source; do not export into itself.
    if ROOT.name == '开源部分':
        return ROOT
    subprocess.run([sys.executable, str(ROOT / 'tools/build-update.py'), '--catalog-only'],
                   cwd=str(ROOT), check=True, stdout=subprocess.PIPE)
    stamp = datetime.now().strftime('%Y%m%d-%H%M%S-%f')
    staging = within(INTERNAL / '构建缓存' / ('source-' + stamp))
    staging.mkdir(parents=True)
    for name in ROOT_FILES:
        shutil.copy2(ROOT / name, staging / name)
    for name in SOURCE_FOLDERS:
        shutil.copytree(ROOT / name, staging / name, ignore=IGNORE)
    for name in DOC_FILES:
        target = staging / 'docs' / name
        target.parent.mkdir(parents=True, exist_ok=True)
        shutil.copy2(ROOT / 'docs' / name, target)
    (staging / 'tools').mkdir()
    for name in TOOL_FILES:
        shutil.copy2(ROOT / 'tools' / name, staging / 'tools' / name)
    version = json.loads((ROOT / 'com.youkai.toolbox/release.json').read_text(encoding='utf-8'))['version']
    (staging / 'README.md').write_text(PUBLIC_README.replace('@@VERSION@@', version), encoding='utf-8')
    subprocess.run([sys.executable, str(ROOT / 'tools/check-public-privacy.py'), '--root', str(staging),
                    '--report', str(INTERNAL / '构建记录' / '公开源码隐私检查.json')],
                   cwd=str(ROOT), check=True, stdout=subprocess.PIPE)
    for item in verify_approved_scripts()['files']:
        if digest(staging / item['target']) != item['sha256']:
            raise RuntimeError('Author-approved script differs in prepared source')
    records = tree_hashes(staging)
    destination = within(PROJECT / '开源部分')
    if destination.exists():
        if not destination.is_dir() or destination.is_symlink():
            raise RuntimeError('Source destination is not an ordinary directory')
        if any(destination.iterdir()):
            previous = within(INTERNAL / '历史备份' / '开源快照' / stamp)
            previous.parent.mkdir(parents=True, exist_ok=True)
            shutil.move(str(destination), str(previous))
        else:
            destination.rmdir()
    shutil.move(str(staging), str(destination))
    if tree_hashes(destination) != records:
        raise RuntimeError('Prepared source verification failed')
    logs = within(INTERNAL / '构建记录')
    logs.mkdir(parents=True, exist_ok=True)
    (logs / '开源文件校验.json').write_text(json.dumps(records, ensure_ascii=False, indent=2)+'\n', encoding='utf-8')
    return destination


def main():
    destination = prepare_source()
    print(json.dumps({'folder': str(destination), 'published': False}, ensure_ascii=True))


if __name__ == '__main__':
    main()
