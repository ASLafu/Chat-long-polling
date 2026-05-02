@echo off
title Chat Long Polling – CIS 2026
echo ============================================================
echo   Chat Long Polling – CIS 2026
echo ============================================================
echo.
echo   Iniciando servidor y abriendo el chat en el navegador...
echo.
echo   Para detener el servidor pulsa Ctrl+C
echo ============================================================
echo.

cd /d "%~dp0"
start http://localhost:4000
node servidor.js

pause
