# ==============================================================================
# Synchronize Enterprise Payment Ecosystem to D:\Projects
# ==============================================================================

$sourceDir = "C:\Users\Lenovo\.gemini\antigravity-ide\scratch\enterprise-payment-ecosystem"
$targetDir = "D:\Projects\enterprise-payment-ecosystem"

Write-Host ">>> Synchronizing project from $sourceDir to $targetDir..." -ForegroundColor Cyan

if (-not (Test-Path "D:\Projects")) {
    New-Item -ItemType Directory -Path "D:\Projects" -Force | Out-Null
}

if (-not (Test-Path $targetDir)) {
    New-Item -ItemType Directory -Path $targetDir -Force | Out-Null
}

# Use Robocopy for high-speed mirroring excluding large temporary build artifacts
robocopy $sourceDir $targetDir /E /XD ".gradle" "build" "node_modules" ".git" /XF "*.log" /R:1 /W:1 /NP /NFL /NDL

Write-Host "`n[OK] Successfully synchronized full project tree to $targetDir" -ForegroundColor Green
Get-ChildItem $targetDir | Select-Object Name, LastWriteTime | Format-Table -AutoSize
