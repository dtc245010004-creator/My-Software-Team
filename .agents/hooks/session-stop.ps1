# Hook Stop - don file log rong va nhac cap nhat tai lieu truoc khi ket thuc phien.

$ErrorActionPreference = 'Stop'
$projectRoot = (Resolve-Path (Join-Path $PSScriptRoot '..\..')).Path
$sessionsDir = Join-Path $projectRoot 'docs\sessions'

if (-not (Test-Path $sessionsDir)) { exit 0 }

function Get-Placeholders($path) {
    $content = Get-Content -Path $path -Raw -Encoding UTF8
    return ([regex]::Matches([string]$content, '_\(chua ghi\)_')).Count
}

# Template goc co 5 cho danh dau '_(chua ghi)_'. Con nguyen ca 5 nghia la chua ai ghi gi
# -> xoa de khong sinh rac trong repo. Soat MOI log, khong chi file moi nhat cua hom nay:
# mot lan mo phien khong co luot nao (chi go /plugin, /model) khong bao gio chay hook nay,
# va file rong cua lan do se nam lai mai neu chi xet file moi nhat (loi that 11/09).
Get-ChildItem -Path $sessionsDir -Filter '20*.md' -File -ErrorAction SilentlyContinue |
    Where-Object { (Get-Placeholders $_.FullName) -ge 5 } |
    Remove-Item -Force

$today = Get-Date -Format 'yyyy-MM-dd'
$log = Get-ChildItem -Path $sessionsDir -Filter "$today-*.md" -File -ErrorAction SilentlyContinue |
       Sort-Object Name | Select-Object -Last 1

if ($null -eq $log) { exit 0 }

$placeholders = Get-Placeholders $log.FullName

if ($placeholders -gt 0) {
    Write-Output "[NHAC] docs/sessions/$($log.Name) con $placeholders muc chua dien. Muc 'Ket qua test' phai co ket qua chay that."
}

Write-Output "[NHAC] Truoc khi ket thuc phien: docs/codebase-map.md da cap nhat chua? Checklist trong docs/plans/ da tick chua?"
