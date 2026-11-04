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
PUBLIC_README = '''# YOUKAI @@VERSION@@ 正式版

作者：二百七。面向 Adobe Illustrator 的脚本工具箱，内置 26 个工具，提供简明说明、CSV 模板及批处理。

[下载安装包](https://github.com/erbaiqi-pro/YOUKAI/releases/latest) · [作者网站](https://erbaiqi.pages.dev/)

## 使用

1. 首次安装前保存工作并退出 Adobe 软件，运行 Windows 安装包。
2. 在 Illustrator 的“窗口 > 扩展”中打开 YOUKAI。
3. 在系统设置中选择 CSV 和输出目录。双击工具运行，点击“说明”查看步骤。

先用“集体注释”生成对象注释，再手填 CSV，通过“按注释批量修改”移动对象、改专色 T 值、改普通 CMYK 色值或删除。批处理跳过 link／links 文件夹；打包收集链接素材的功能保持原样。

“导出PDF”已从内置工具中移除。当前不调整分类，其余工具代码原样保留。9 个已验收内置脚本采用固定 SHA256 校验；被移除的 PDF 脚本只保留历史校验记录。

## 自愿更新

发现新版本时，网站 LOGO 旁显示红色 NEW；没有自动弹窗或强制更新。

- 1.0.x 的脚本更新：仅更新内置脚本、说明、模板和版本清单，保留路径设置、个人 CSV、自定义脚本和插件程序。
- 1.1.0、2.0.0 等大版本或需要新版插件程序的更新：显示官网下载入口，不在面板里替换程序。
- 测试版首次升级到此正式版：一次性同步升级更新器，保留现有路径设置；以后按上述规则更新。

对外版本为 **1.0.0 正式版**。为使数字更大的旧测试版也能识别更新，本次内部更新编号和 GitHub 标签为 **1.0.3 / v1.0.3**。历史测试标签不覆盖、不改写。

完整步骤与维护规则见 [联网更新](docs/联网更新.md)。

## 源码与验证

- `com.youkai.toolbox/`：插件、脚本、说明和模板。
- `installers/`：Windows 与 macOS 安装工具；Windows 使用 Inno Setup 6 编译。
- `tools/`：构建与检查工具。`npm test` 检查脚本及隔离目录内的更新事务；`npm run test:ui` 检查面板。
- `docs/`、`licenses/`：更新记录、校验记录、隐私说明及许可。

`python tools/build-release.py` 生成完整安装包和干净源码副本。`python tools/build-update.py` 默认生成仅含脚本及配套文件的更新包；程序升级使用 `--kind installer`。`--kind bootstrap` 仅允许本次测试版转正式版的兼容升级。

真实宿主编译可运行 `npm run test:host`，不运行或保存画稿处理脚本。实际输出仍需在设计文件副本上核对；macOS 尚未实机验收。

普通工具本地运行；更新不需要 API Key，不上传设计稿、对象注释或 CSV。发布前执行密钥筛查，详见 [隐私说明](docs/PRIVACY.md)。项目采用 [MIT](LICENSE.txt)，第三方许可见 [第三方说明](THIRD_PARTY_NOTICES.md)。
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
    if len(record['files']) != 9:
        raise RuntimeError('Expected the nine bundled author-approved scripts')
    for item in record['files']:
        target = within(ROOT / item['target'])
        if target.stat().st_size != item['bytes'] or digest(target) != item['sha256']:
            raise RuntimeError('Author-approved script changed: ' + item['target'])
    retired = record.get('retiredFiles', [])
    if len(retired) != 1 or retired[0]['target'] != 'com.youkai.toolbox/user_scripts/导出PDF.jsx':
        raise RuntimeError('Expected the retired PDF script record')
    for item in retired:
        target = within(ROOT / item['target'])
        if target.exists() or target.with_suffix('.md').exists():
            raise RuntimeError('Retired script is still bundled: ' + item['target'])
        # Internal archives are deliberately absent from the public source snapshot.
        for name in ('source', 'archive'):
            original = within(ROOT / item[name])
            if original.exists() and (original.stat().st_size != item['bytes'] or digest(original) != item['sha256']):
                raise RuntimeError('Retired script archive changed: ' + item[name])
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
    release = json.loads((ROOT / 'com.youkai.toolbox/release.json').read_text(encoding='utf-8'))
    version = release.get('productVersion', release['version'])
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
