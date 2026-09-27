Write-Host "Iniciando PymEdu..." -ForegroundColor Cyan

if (-not (Test-Path "node_modules")) {
    Write-Host "Instalando dependencias del frontend..." -ForegroundColor Yellow
    npm install
}

if (-not (Test-Path "server/node_modules")) {
    Write-Host "Instalando dependencias del servidor..." -ForegroundColor Yellow
    Set-Location server
    npm install
    Set-Location ..
}

Write-Host "Iniciando servidor API..." -ForegroundColor Yellow
$serverJob = Start-Job -ScriptBlock {
    Set-Location $using:PWD\server
    npm run dev
}

Write-Host "Iniciando frontend..." -ForegroundColor Yellow
$frontendJob = Start-Job -ScriptBlock {
    Set-Location $using:PWD
    npm run dev
}

Start-Sleep -Seconds 5

Write-Host ""
Write-Host "============================================" -ForegroundColor Cyan
Write-Host "  PymEdu esta ejecutandose!" -ForegroundColor Green
Write-Host "============================================" -ForegroundColor Cyan
Write-Host ""
Write-Host "  Frontend:  http://localhost:3000" -ForegroundColor White
Write-Host "  API:       http://localhost:4000" -ForegroundColor White
Write-Host ""
Write-Host "  Base de datos: PostgreSQL en Railway" -ForegroundColor White
Write-Host "  (configura DATABASE_URL y JWT_SECRET en .env)" -ForegroundColor White
Write-Host ""
Write-Host "  Cuentas demo (password: Demo#2026):" -ForegroundColor Yellow
Write-Host "    - supadmin@pymedu.com (Super Admin)" -ForegroundColor White
Write-Host "    - admin@colegiosanjose.cl (Admin Institucional)" -ForegroundColor White
Write-Host "    - coord@colegiosanjose.cl (Coordinador)" -ForegroundColor White
Write-Host "    - mentor@colegiosanjose.cl (Mentor)" -ForegroundColor White
Write-Host "    - emprendedor@pymedu.com (Emprendedor)" -ForegroundColor White
Write-Host "    - demo@pymedu.com (Demo - todos los roles)" -ForegroundColor White
Write-Host ""
Write-Host "  Presiona Ctrl+C para detener todo" -ForegroundColor Yellow
Write-Host "============================================" -ForegroundColor Cyan

try {
    while ($true) {
        Start-Sleep -Seconds 1
        if ($serverJob.State -ne "Running") {
            Write-Host "El servidor API se detuvo" -ForegroundColor Yellow
            break
        }
        if ($frontendJob.State -ne "Running") {
            Write-Host "El frontend se detuvo" -ForegroundColor Yellow
            break
        }
    }
} finally {
    Write-Host "Deteniendo servicios..." -ForegroundColor Red
    Stop-Job -Job $serverJob -ErrorAction SilentlyContinue
    Remove-Job -Job $serverJob -ErrorAction SilentlyContinue
    Stop-Job -Job $frontendJob -ErrorAction SilentlyContinue
    Remove-Job -Job $frontendJob -ErrorAction SilentlyContinue
}
