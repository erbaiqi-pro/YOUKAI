# YOUKAI 1.0 | 作者：二百七 | Copyright (c) 2026 二百七 | SPDX-License-Identifier: MIT
"""Build the current installer and prepare source, keeping internal records together."""
from pathlib import Path
from datetime import datetime
import importlib.util
import json
import os
import re
import shutil
import subprocess
import sys

sys.dont_write_bytecode = True
ROOT = Path(__file__).resolve().parents[1]
spec = importlib.util.spec_from_file_location('snapshot', ROOT / 'tools/build-github.py')
snapshot = importlib.util.module_from_spec(spec)
spec.loader.exec_module(snapshot)


def main():
    approved = snapshot.verify_approved_scripts()
    version = json.loads((ROOT / 'com.youkai.toolbox/release.json').read_text(encoding='utf-8'))['version']
    if not re.fullmatch(r'\d+\.\d+\.\d+', version):
        raise RuntimeError('Expected a three-part release version')
    exe_name = 'YOUKAI_' + version + '_Setup.exe'
    script_count = len(list((ROOT / 'com.youkai.toolbox/user_scripts').glob('*.jsx')))
    compiler = Path(os.environ.get('YOUKAI_ISCC', r'C:\Program Files (x86)\Inno Setup 6\ISCC.exe'))
    if not compiler.is_file():
        raise RuntimeError('Install Inno Setup 6 or set YOUKAI_ISCC')
    subprocess.run([sys.executable, str(ROOT / 'tools/build-update.py'), '--catalog-only'],
                   cwd=str(ROOT), check=True, stdout=subprocess.PIPE)
    cache = snapshot.within(snapshot.INTERNAL / '构建缓存')
    logs = snapshot.within(snapshot.INTERNAL / '构建记录')
    cache.mkdir(parents=True, exist_ok=True)
    logs.mkdir(parents=True, exist_ok=True)
    subprocess.run([sys.executable, str(ROOT / 'tools/check-public-privacy.py'),
                    '--root', str(ROOT / 'com.youkai.toolbox'),
                    '--report', str(logs / '安装内容隐私检查.json')],
                   cwd=str(ROOT), check=True, stdout=subprocess.PIPE)
    # Build from the verified official catalog, never from runtime logs or personal files.
    catalog = json.loads((ROOT / 'com.youkai.toolbox/release-files.json').read_text(encoding='utf-8'))
    payload = snapshot.within(cache / ('installer-payload-' + datetime.now().strftime('%Y%m%d-%H%M%S-%f')))
    payload.mkdir()
    for item in catalog['files']:
        original = ROOT / 'com.youkai.toolbox' / item['path']
        target_file = payload / item['path']
        target_file.parent.mkdir(parents=True, exist_ok=True)
        shutil.copy2(original, target_file)
        if target_file.stat().st_size != item['size'] or snapshot.digest(target_file) != item['sha256']:
            raise RuntimeError('Installer payload verification failed')
    shutil.copy2(ROOT / 'com.youkai.toolbox/release-files.json', payload / 'release-files.json')
    completed = subprocess.run([str(compiler), '/O'+str(cache), '/DYoukaiVersion='+version, '/DYoukaiPayloadRoot='+str(payload), str(ROOT / 'installers/windows/setup.iss')],
                               cwd=str(ROOT), stdout=subprocess.PIPE, stderr=subprocess.STDOUT)
    (logs / '安装器编译记录.txt').write_bytes(completed.stdout)
    if completed.returncode:
        raise RuntimeError('Inno compilation failed; see internal build records')
    snapshot.verify_approved_scripts()
    exe = cache / exe_name
    if not exe.is_file() or exe.stat().st_size < 100000 or exe.read_bytes()[:2] != b'MZ':
        raise RuntimeError('No valid Windows executable was produced')
    source = snapshot.prepare_source()
    delivery = snapshot.within(snapshot.PROJECT / '安装包')
    delivery.mkdir(parents=True, exist_ok=True)
    target = snapshot.within(delivery / exe.name)
    stamp = datetime.now().strftime('%Y%m%d-%H%M%S-%f')
    if target.exists() and snapshot.digest(target) != snapshot.digest(exe):
        previous = snapshot.within(snapshot.INTERNAL / '历史备份' / '旧安装包' / (stamp+'.exe'))
        previous.parent.mkdir(parents=True, exist_ok=True)
        shutil.copy2(target, previous)
    pending = snapshot.within(delivery / (exe.name+'.tmp'))
    shutil.copy2(exe, pending)
    if snapshot.digest(pending) != snapshot.digest(exe):
        raise RuntimeError('Installer copy verification failed')
    pending.replace(target)
    # Keep the delivery folder unambiguous; previous known YOUKAI installers remain backed up.
    for older in delivery.glob('YOUKAI_*_Setup.exe'):
        if older.name == exe_name:
            continue
        old_path = snapshot.within(older)
        if old_path.parent != delivery.resolve() or not old_path.is_file():
            raise RuntimeError('Unexpected previous installer path')
        archived = snapshot.within(snapshot.INTERNAL / '历史备份' / '旧安装包' / (stamp+'-'+older.name))
        archived.parent.mkdir(parents=True, exist_ok=True)
        shutil.move(str(old_path), str(archived))
    exe.unlink()  # Only the known, verified compiler output; never remove a directory tree.
    intro = (f'YOUKAI {version} · 内测版\n作者：二百七\n'
             f'内置 {script_count} 个脚本。\n\n'
             '包含集体注释、按注释批量修改和自愿联网更新。\n\n'
             '1. 保存工作，完全退出 Illustrator、Photoshop 和 InDesign。\n'
             f'2. 双击 {exe_name}，选择安装语言，允许旧版清理授权。\n'
             '3. 重启 Illustrator，在“窗口 > 扩展”中打开 YOUKAI。\n'
             '4. 在系统设置中重新选择 CSV 和输出目录。\n\n'
             '安装会先备份并清理旧版，再安装新版。外部 CSV 保留。\n'
             '旧版及自定义脚本备份：%LOCALAPPDATA%\\YOUKAI\\backups\n'
             '源码与版本下载：https://github.com/erbaiqi-pro/YOUKAI\n'
             '本版为内测版，首次使用请先用设计文件副本试用。\n')
    (delivery / '安装说明.txt').write_text(intro, encoding='utf-8-sig')
    record = dict(name='YOUKAI', version=version, author='二百七', channel='internal-test',
                  script_count=script_count,
                  built=datetime.now().isoformat(timespec='seconds'), exe=str(target),
                  exe_sha256=snapshot.digest(target), source=str(source),
                  approved_scripts={item['target']: item['sha256'] for item in approved['files']},
                  published=False, installer_executed=False, adobe_executed=False)
    (logs / '当前构建.json').write_text(json.dumps(record, ensure_ascii=False, indent=2)+'\n', encoding='utf-8')
    print(json.dumps(dict(exe=str(target), source=str(source), sha256=record['exe_sha256']), ensure_ascii=True))


if __name__ == '__main__':
    main()
