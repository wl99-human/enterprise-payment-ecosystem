# ==============================================================================
# One-Click Ecosystem Launcher
# Starts Docker Compose infrastructure, 4 Spring Boot Microservices, and Frontend
# ==============================================================================
[CmdletBinding()]
param(
    [switch]$DockerOnly,      # Start only the Docker infrastructure (Kafka, Postgres, Redis, etc.)
    [switch]$BackendOnly,     # Start Docker + 4 backend services, skip frontend
    [switch]$SkipBuild,       # Skip gradle build if already compiled
    [switch]$UseBootRun       # Use 'gradlew bootRun' instead of pre-compiled JARs
)

$rootDir = Split-Path -Parent $PSScriptRoot
$backendDir = Join-Path $rootDir "backend"
$frontendDir = Join-Path $rootDir "frontend"

Write-Host "======================================================================" -ForegroundColor Cyan
Write-Host "  Enterprise Distributed Payment & Ledger Ecosystem - Launcher" -ForegroundColor Cyan
Write-Host "======================================================================" -ForegroundColor Cyan

# 1. Start Docker Infrastructure
Write-Host "`n>>> [1/3] Starting Docker Compose infrastructure..." -ForegroundColor Green
try {
    docker-compose -f (Join-Path $rootDir "docker-compose.yml") up -d
} catch {
    Write-Host "[ERROR] Failed to start Docker Compose. Please ensure Docker Desktop is running." -ForegroundColor Red
    exit 1
}

if ($DockerOnly) {
    Write-Host "`n[OK] Docker infrastructure started in background (-DockerOnly mode)." -ForegroundColor Green
    Write-Host "  - Kafka Broker:      localhost:9092" -ForegroundColor White
    Write-Host "  - Schema Registry:   http://localhost:8085" -ForegroundColor White
    Write-Host "  - PostgreSQL:        localhost:5432 (ledgerdb / user: sa)" -ForegroundColor White
    Write-Host "  - Redis:             localhost:6379" -ForegroundColor White
    Write-Host "  - Toxiproxy:         http://localhost:8474" -ForegroundColor White
    exit 0
}

# 2. Build Backend (if not skipped)
if (-not $SkipBuild -and -not $UseBootRun) {
    Write-Host "`n>>> [2/3] Building backend microservices..." -ForegroundColor Green
    Push-Location $backendDir
    try {
        .\gradlew.bat build -x test
        if ($LASTEXITCODE -ne 0) {
            Write-Host "[ERROR] Gradle build failed." -ForegroundColor Red
            exit 1
        }
    } finally {
        Pop-Location
    }
} else {
    Write-Host "`n>>> [2/3] Skipping backend build step." -ForegroundColor DarkGray
}

# 3. Launch Microservices
Write-Host "`n>>> [3/3] Launching Microservices & UI..." -ForegroundColor Green

$services = @(
    @{
        Name = "Ingestion Service"
        Project = ":services:ingestion-service"
        Port = 8080
        Jar = Join-Path $backendDir "services\ingestion-service\build\libs\ingestion-service-1.0.0-SNAPSHOT.jar"
    },
    @{
        Name = "Ledger Service"
        Project = ":services:ledger-service"
        Port = 8081
        Jar = Join-Path $backendDir "services\ledger-service\build\libs\ledger-service-1.0.0-SNAPSHOT.jar"
    },
    @{
        Name = "Notification Service"
        Project = ":services:notification-service"
        Port = 8082
        Jar = Join-Path $backendDir "services\notification-service\build\libs\notification-service-1.0.0-SNAPSHOT.jar"
    },
    @{
        Name = "Analytics CQRS Service"
        Project = ":services:analytics-cqrs-service"
        Port = 8083
        Jar = Join-Path $backendDir "services\analytics-cqrs-service\build\libs\analytics-cqrs-service-1.0.0-SNAPSHOT.jar"
    }
)

foreach ($svc in $services) {
    $svcName = $svc.Name
    $port = $svc.Port
    $windowTitle = "Ecosystem - $svcName [Port $port]"
    
    if (-not $UseBootRun -and (Test-Path $svc.Jar)) {
        $jarPath = $svc.Jar
        $cmd = "`$host.UI.RawUI.WindowTitle = '$windowTitle'; Write-Host '>>> Starting $svcName on port $port...' -ForegroundColor Cyan; java -jar '$jarPath'"
    } else {
        $gradleProj = $svc.Project
        $cmd = "`$host.UI.RawUI.WindowTitle = '$windowTitle'; Write-Host '>>> Starting $svcName via Gradle on port $port...' -ForegroundColor Cyan; cd '$backendDir'; .\gradlew.bat ${gradleProj}:bootRun"
    }
    
    Start-Process powershell -ArgumentList "-NoExit", "-Command", $cmd
    Write-Host "  [OK] Launched $svcName in background window (Port $port)" -ForegroundColor Green
    Start-Sleep -Milliseconds 800
}

# 4. Launch Frontend MFE Shell
if (-not $BackendOnly) {
    if (Test-Path $frontendDir) {
        $feTitle = "Ecosystem - Frontend MFE Shell [Port 3000/3001]"
        $feCmd = "`$host.UI.RawUI.WindowTitle = '$feTitle'; Write-Host '>>> Starting Frontend MFE Shell...' -ForegroundColor Cyan; cd '$frontendDir'; npm run dev"
        Start-Process powershell -ArgumentList "-NoExit", "-Command", $feCmd
        Write-Host "  [OK] Launched Frontend MFE Shell in background window" -ForegroundColor Green
    }
}

Write-Host "`n======================================================================" -ForegroundColor Cyan
Write-Host "  Ecosystem Topology Provisioned Successfully!" -ForegroundColor Cyan
Write-Host "======================================================================" -ForegroundColor Cyan
Write-Host "  - Ingestion Service:        http://localhost:8080" -ForegroundColor White
Write-Host "  - Ledger Service:           http://localhost:8081" -ForegroundColor White
Write-Host "  - Notification Service:     http://localhost:8082" -ForegroundColor White
Write-Host "  - Analytics CQRS (SSE):     http://localhost:8083" -ForegroundColor White
Write-Host "  - Frontend MFE Shell:       http://localhost:3000 (or 3001)" -ForegroundColor White
Write-Host "  - Kafka Broker:             localhost:9092" -ForegroundColor White
Write-Host "  - Schema Registry:          http://localhost:8085" -ForegroundColor White
Write-Host "  - PostgreSQL:               localhost:5432 (ledgerdb / user: sa)" -ForegroundColor White
Write-Host "  - Redis:                    localhost:6379" -ForegroundColor White
Write-Host "  - Toxiproxy (Chaos Engine): http://localhost:8474" -ForegroundColor White
Write-Host "`nTip: To stop all services, run: .\scripts\stop-all.ps1" -ForegroundColor Yellow
