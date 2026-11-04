# YOUKAI | 作者：二百七 | Copyright (c) 2026 二百七 | SPDX-License-Identifier: MIT
"""Create versioned update files locally. Never publish, install or compile an EXE."""
from pathlib import Path
import argparse
import hashlib
import json
import re
import zipfile
import importlib.util
import sys

ROOT = Path(__file__).resolve().parents[1]
EXTENSION = ROOT / 'com.youkai.toolbox'
REPOSITORY = 'erbaiqi-pro/YOUKAI'


def digest(data):
    return hashlib.sha256(data).hexdigest()


def normalized(value):
    value = str(value).lstrip('v')
    if re.fullmatch(r'\d+\.\d+', value):
        value += '.0'
    if not re.fullmatch(r'(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)', value):
        raise ValueError('Invalid stable version')
    return value


def collect():
    payload = {}
    top = ['index.html', 'index_full.html', 'index_2023_safe.html', 'release.json', 'config.json']
    for name in top:
        payload[name] = (EXTENSION / name).read_bytes()
    for directory in ['assets', 'CSXS', 'scripts', 'user_scripts']:
        base = EXTENSION / directory
        for file in sorted(base.rglob('*')):
            if file.is_symlink():
                raise ValueError('Symlinks are not allowed: ' + str(file))
            if not file.is_file():
                continue
            relative = file.relative_to(EXTENSION).as_posix()
            # Only maintained program assets; never include runtime reports, AI files or backups.
            if any(part.startswith('.') for part in file.relative_to(base).parts):
                continue
            allowed = {'.js', '.jsx', '.css', '.html', '.json', '.xml', '.md', '.csv', '.svg', '.png', '.jpg', '.ico', '.woff', '.woff2', '.ttf'}
            if file.suffix.lower() not in allowed or '执行报告' in file.parts:
                continue
            if directory == 'user_scripts' and (file.parent != base or file.suffix not in ('.jsx', '.md')):
                continue
            payload[relative] = file.read_bytes()
    for name in ['LICENSE.txt', 'THIRD_PARTY_NOTICES.md']:
        payload[name] = (ROOT / name).read_bytes()
    payload['assets/icon.ico'] = (ROOT / 'installers/windows/icon.ico').read_bytes()
    for name in ['INNO-SETUP-LICENSE.txt', 'MIT-zh-CN.txt']:
        payload['licenses/' + name] = (ROOT / 'licenses' / name).read_bytes()
    release = json.loads(payload['release.json'].decode('utf-8-sig'))
    version = normalized(release['version'])
    xml = payload['CSXS/manifest.xml'].decode('utf-8')
    match = re.search(r'ExtensionBundleVersion="([^"]+)"', xml)
    if not match or normalized(match.group(1)) != version:
        raise ValueError('CEP manifest and release version differ')
    count = sum(name.startswith('user_scripts/') and name.endswith('.jsx') for name in payload)
    if count != release['scriptCount']:
        raise ValueError('Script count differs from release metadata')
    if len(payload) > 4095 or sum(len(data) for data in payload.values()) > 128 * 1024 * 1024:
        raise ValueError('Payload exceeds updater limits')
    return version, payload


def build(output, catalog_only=False):
    version, payload = collect()
    sys.dont_write_bytecode = True
    spec = importlib.util.spec_from_file_location('privacy_check', ROOT / 'tools/check-public-privacy.py')
    checker = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(checker)
    findings = [hit for name, data in payload.items() for hit in checker.inspect_bytes(name, data)]
    if findings:
        raise RuntimeError('Possible credentials in update payload; details contain no secrets: ' + json.dumps(findings))
    catalog = {'schemaVersion': 1, 'name': 'YOUKAI', 'version': version, 'files': [
        {'path': name, 'size': len(payload[name]), 'sha256': digest(payload[name])}
        for name in sorted(payload)
    ]}
    data = (json.dumps(catalog, ensure_ascii=False, indent=2) + '\n').encode('utf-8')
    # Installers ship this inventory so later updates can distinguish personal files.
    (EXTENSION / 'release-files.json').write_bytes(data)
    for name in ['LICENSE.txt', 'THIRD_PARTY_NOTICES.md']:
        (EXTENSION / name).write_bytes(payload[name])
    (EXTENSION / 'assets/icon.ico').write_bytes(payload['assets/icon.ico'])
    (EXTENSION / 'licenses').mkdir(exist_ok=True)
    for name in ['INNO-SETUP-LICENSE.txt', 'MIT-zh-CN.txt']:
        (EXTENSION / 'licenses' / name).write_bytes(payload['licenses/' + name])
    if catalog_only:
        return {'version': version, 'catalog': str(EXTENSION / 'release-files.json')}
    output = output.resolve()
    output.mkdir(parents=True, exist_ok=True)
    archive = output / ('YOUKAI-Update-' + version + '.zip')
    # Stored ZIP is small for this toolbox and also works in older CEP Node runtimes.
    with zipfile.ZipFile(str(archive), 'w', compression=zipfile.ZIP_STORED, allowZip64=False) as package:
        for name in sorted(payload):
            entry = zipfile.ZipInfo(name, date_time=(2026, 1, 1, 0, 0, 0))
            entry.external_attr = 0o100644 << 16
            package.writestr(entry, payload[name])
        package.writestr('release-files.json', data)
    manifest = {
        'schemaVersion': 1, 'name': 'YOUKAI', 'repository': REPOSITORY,
        'version': version, 'channel': 'stable', 'minUpdaterVersion': 1,
        'platforms': ['win32', 'darwin'], 'minHostMajor': 16,
        'asset': archive.name, 'size': archive.stat().st_size,
        'sha256': digest(archive.read_bytes())
    }
    manifest_file = output / 'YOUKAI-Update.json'
    manifest_file.write_text(json.dumps(manifest, ensure_ascii=False, indent=2) + '\n', encoding='utf-8')
    return {'version': version, 'archive': str(archive), 'manifest': str(manifest_file), 'published': False}


if __name__ == '__main__':
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--output', type=Path, default=ROOT / '项目资料' / '发布准备' / '联网更新')
    parser.add_argument('--catalog-only', action='store_true')
    args = parser.parse_args()
    print(json.dumps(build(args.output, args.catalog_only), ensure_ascii=True))
