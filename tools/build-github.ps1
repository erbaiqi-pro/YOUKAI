# YOUKAI 1.0 | 作者：二百七 | Copyright (c) 2026 二百七 | SPDX-License-Identifier: MIT
param([string]$PythonExe = 'python')
$ErrorActionPreference = 'Stop'
& $PythonExe (Join-Path $PSScriptRoot 'build-github.py')
if ($LASTEXITCODE -ne 0) { throw 'GitHub folder build failed.' }
