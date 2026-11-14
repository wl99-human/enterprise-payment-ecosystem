# ==============================================================================
# One-Click Ecosystem Teardown
# Stops all running microservices, frontend dev server, and Docker containers
# ==============================================================================
[CmdletBinding()]
param(
    [switch]$KeepDocker # Only stop Java microservices and frontend, keep Docker containers running
)

$rootDir = Split-Path -Parent $PSScriptRoot

Write-Host "======================================================================" -ForegroundColor Yellow
Write-Host "  Stopping Enterprise Distributed Payment & Ledger Ecosystem" -ForegroundColor Yellow
Write-Host "======================================================================" -ForegroundColor Yellow

# 1. Stop backend microservices and frontend dev server by listening ports
$targetPorts = @(8080, 8081, 8082, 8083, 3001)
Write-Host "`n>>> [1/2] Terminating service processes..." -ForegroundColor Yellow

foreach ($port in $targetPorts) {
    try {
        $connections = Get-NetTCPConnection -LocalPort $port -ErrorAction SilentlyContinue
        if ($connections) {
            $pids = $connections | Select-Object -ExpandProperty OwningProcess -Unique
            foreach ($procId in $pids) {
                if ($procId -gt 4) { # Avoid system processes
                    Stop-Process -Id $procId -Force -ErrorAction SilentlyContinue
                    Write-Host "  [OK] Terminated process $procId listening on port $port" -ForegroundColor Green
                }
            }
        }
    } catch {}
}

# Also terminate Java processes running the ecosystem JARs via WMI/CIM
try {
    $javaProcs = Get-CimInstance Win32_Process -Filter "name = 'java.exe'" -ErrorAction SilentlyContinue |
        Where-Object { $_.CommandLine -match "enterprise-payment|ingestion-service|ledger-service|notification-service|analytics-cqrs-service" }
    
    foreach ($jp in $javaProcs) {
        Stop-Process -Id $jp.ProcessId -Force -ErrorAction SilentlyContinue
        Write-Host "  [OK] Terminated Java process $($jp.ProcessId)" -ForegroundColor Green
    }
} catch {}

# 2. Stop Docker infrastructure
if (-not $KeepDocker) {
    Write-Host "`n>>> [2/2] Stopping Docker Compose infrastructure..." -ForegroundColor Yellow
    try {
        docker-compose -f (Join-Path $rootDir "docker-compose.yml") down
        Write-Host "  [OK] Docker Compose containers stopped and network removed." -ForegroundColor Green
    } catch {
        Write-Host "  [WARN] Failed to stop Docker Compose automatically." -ForegroundColor Red
    }
} else {
    Write-Host "`n>>> [2/2] Keeping Docker infrastructure running (-KeepDocker specified)." -ForegroundColor DarkGray
}

Write-Host "`n======================================================================" -ForegroundColor Green
Write-Host "  All Ecosystem Services Successfully Stopped!" -ForegroundColor Green
Write-Host "======================================================================" -ForegroundColor Green
