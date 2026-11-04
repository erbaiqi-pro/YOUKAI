# YOUKAI | 作者：二百七 | Copyright (c) 2026 二百七 | SPDX-License-Identifier: MIT
"""Fail public builds on likely credentials. Never print matched secret values."""
from pathlib import Path
import argparse
import hashlib
import json
import os
import re
import stat

TEXT_SUFFIXES = {'.js', '.jsx', '.cjs', '.mjs', '.py', '.ps1', '.iss', '.isl', '.md', '.txt', '.json', '.xml', '.csv', '.tsv', '.html', '.css', '.ini', '.yaml', '.yml', '.toml', '.command', '.sh', '.bat'}
PATTERNS = {
    'provider-key-or-token': re.compile(r'(?<![A-Za-z0-9])(?:sk-(?:(?:proj|svcacct|ant-api\d+)-)?[A-Za-z0-9_-]{18,}|(?:ghp_|gho_|ghu_|ghs_|ghr_)[A-Za-z0-9]{25,}|github_pat_[A-Za-z0-9_]{30,}|AIza[A-Za-z0-9_-]{30,}|AKIA[A-Z0-9]{16}|xox[baprs]-[A-Za-z0-9-]{20,}|SG\.[A-Za-z0-9_-]{15,}\.[A-Za-z0-9_-]{20,})'),
    'private-key': re.compile(r'-----BEGIN (?:RSA |EC |OPENSSH |DSA )?PRIVATE KEY-----'),
    'literal-secret': re.compile(r'''(?i)\b(?:[a-z0-9]+[_-])*(?:api[_-]?key|apikey|access[_-]?token|auth[_-]?token|client[_-]?secret|password|passwd|secret|token)\b["']?\s*[:=]\s*["']([^"'\r\n]{8,})["']'''),
    'credential-in-url': re.compile(r'https?://[^\s/"\'<>:]+:[^\s/"\'<>@]+@[^\s/"\'<>]+'),
    'secret-in-query': re.compile(r'(?i)[?&](?:api[_-]?key|token|access_token|password|secret)=([^&\s"\'<>]{8,})'),
}
SENSITIVE_NAMES = {'.env', '.npmrc', '.git-credentials', 'credentials.json', 'service-account.json', 'id_rsa', 'id_dsa', 'id_ecdsa', 'id_ed25519', 'auth.json'}
PLACEHOLDER = re.compile(r'(?i)^(?:your[_ -].*|example.*|dummy.*|placeholder.*|test[-_]?key.*|\$.*|<.*>|undefined|null|true|false)$')


def inspect_bytes(name, data):
    findings = []
    lower = Path(name).name.lower()
    if lower in SENSITIVE_NAMES or lower.startswith('.env.') and lower != '.env.example' or Path(lower).suffix in {'.pem', '.key', '.p12', '.pfx', '.keystore'}:
        findings.append({'file': name, 'line': 0, 'kind': 'sensitive-filename'})
    if Path(name).suffix.lower() not in TEXT_SUFFIXES:
        return findings
    text = data.decode('utf-8-sig', errors='replace')
    for kind, regex in PATTERNS.items():
        for match in regex.finditer(text):
            value = match.group(1) if match.lastindex else match.group(0)
            if kind == 'literal-secret' and (PLACEHOLDER.match(value) or value.startswith('[')):
                continue
            findings.append({'file': name, 'line': text.count('\n', 0, match.start()) + 1, 'kind': kind, 'fingerprint': hashlib.sha256(value.encode()).hexdigest()[:12]})
    return findings


def scan(root):
    findings, count = [], 0
    for folder, directories, files in os.walk(str(root), followlinks=False):
        keep = []
        for name in directories:
            item = Path(folder) / name
            if name in {'.git', 'node_modules', '__pycache__'}:
                continue
            info = item.lstat()
            if item.is_symlink() or getattr(info, 'st_file_attributes', 0) & stat.FILE_ATTRIBUTE_REPARSE_POINT:
                findings.append({'file': item.relative_to(root).as_posix(), 'line': 0, 'kind': 'linked-directory'})
            else:
                keep.append(name)
        directories[:] = keep
        for name in files:
            file = Path(folder) / name
            relative = file.relative_to(root).as_posix()
            if file.is_symlink():
                findings.append({'file': relative, 'line': 0, 'kind': 'linked-file'})
                continue
            count += 1
            findings.extend(inspect_bytes(relative, file.read_bytes()))
    return {'scannedFiles': count, 'findings': findings, 'passed': not findings}


if __name__ == '__main__':
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--root', type=Path)
    parser.add_argument('--report', type=Path)
    parser.add_argument('--self-test', action='store_true')
    args = parser.parse_args()
    if args.self_test:
        samples = ['sk-' + 'A' * 48, 'ghp_' + 'B' * 36, 'github_pat_' + 'C' * 60,
                   'AIza' + 'D' * 35, 'AKIA' + 'E' * 16, 'xoxb-' + 'F' * 30]
        for sample in samples:
            hits = inspect_bytes('sample.js', ('const credential = "' + sample + '";').encode())
            assert hits and sample not in json.dumps(hits)
        for content in ['const SERVICE_API_KEY = "' + 'G' * 40 + '";',
                        'const ' + 'password' + ' = "' + 'a long private pass phrase' + '";',
                        '-----' + 'BEGIN PRIVATE KEY' + '-----',
                        'https://user:' + 'H' * 20 + '@github.com/path',
                        'https://example.com?access_token=' + 'I' * 30]:
            assert inspect_bytes('sample.js', content.encode())
        for name in ['.env', '.env.production', 'credentials.json', 'id_rsa', 'cert.pfx']:
            assert inspect_bytes(name, b'')
        for content in ['const key = process.env.SERVICE_API_KEY;',
                        'const api_key = "YOUR_API_KEY";',
                        'const checksum = "' + 'a' * 64 + '";']:
            assert not inspect_bytes('sample.js', content.encode())
        print('19 privacy-rule checks passed; all credentials were synthetic and reports redacted.')
        raise SystemExit(0)
    if not args.root:
        parser.error('--root is required unless --self-test is used')
    result = scan(args.root.resolve())
    if args.report:
        args.report.parent.mkdir(parents=True, exist_ok=True)
        args.report.write_text(json.dumps(result, ensure_ascii=False, indent=2) + '\n', encoding='utf-8')
    print(json.dumps(result, ensure_ascii=True))
    raise SystemExit(0 if result['passed'] else 1)
