# Hook SessionStart - tao file log cho phien lam viec hien tai.
# Tu xac dinh thu muc goc du an tu vi tri script, khong phu thuoc ~/.claude.

$ErrorActionPreference = 'Stop'
$projectRoot = (Resolve-Path (Join-Path $PSScriptRoot '..\..')).Path
$sessionsDir = Join-Path $projectRoot 'docs\sessions'

if (-not (Test-Path $sessionsDir)) {
    New-Item -ItemType Directory -Path $sessionsDir -Force | Out-Null
}

$today = Get-Date -Format 'yyyy-MM-dd'
$count = @(Get-ChildItem -Path $sessionsDir -Filter "$today-*.md" -File -ErrorAction SilentlyContinue).Count
$logName = "{0}-{1:D2}.md" -f $today, ($count + 1)
$logPath = Join-Path $sessionsDir $logName

$template = @"
# Phien $today-{0:D2}

- **Ngay:** $today
- **Muc tieu phien:** _(chua ghi)_

## Quyet dinh

_(chua ghi)_

## File da thay doi

_(chua ghi)_

## Ket qua test

_(chua ghi)_

## Con do / phien sau lam gi

_(chua ghi)_
"@ -f ($count + 1)

if (-not (Test-Path $logPath)) {
    $template | Out-File -FilePath $logPath -Encoding utf8
}

Write-Output "[du-an] Thu muc goc: $projectRoot"
Write-Output "[du-an] Log phien nay: docs/sessions/$logName - BAT BUOC dien day du truoc khi ket thuc phien."
Write-Output "[du-an] Truoc khi lam viec: doc docs/codebase-map.md, log phien gan nhat trong docs/sessions/, va ke hoach dang do trong docs/plans/."

$cwd = (Get-Location).Path
if ($cwd -ne $projectRoot) {
    Write-Output "[CANH BAO] Thu muc hien tai la '$cwd', KHONG phai thu muc du an. Hay chuyen vao '$projectRoot' truoc khi lam bat cu viec gi."
}
