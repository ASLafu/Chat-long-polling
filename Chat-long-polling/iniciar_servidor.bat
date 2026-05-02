@echo off
title Ejercicio Long Polling - Servidor
echo ============================================================
echo   Ejercicio: REST vs Long Polling
echo   Iniciando servidor en http://localhost:4000
echo ============================================================
echo.
echo   Abre en el navegador: http://localhost:4000
echo.
echo   Para detener el servidor pulsa Ctrl+C
echo ============================================================
echo.

cd /d "%~dp0"
node servidor.js

pause
