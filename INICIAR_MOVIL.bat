@echo off
title PatrolHood - Iniciar para Movil
echo ========================================
echo  🚀 PATROLHOOD - MODO MOVIL
echo ========================================
echo.

REM Limpiar sesiones anteriores
taskkill /F /IM node.exe /T 2>nul

echo 1. Preparando la App (esto tarda unos segundos)...
cd client
call npm run build
cd ..

echo.
echo 2. Iniciando Servidor Backend...
start "Backend" cmd /k "cd server && node index.js"

timeout /t 5 /nobreak >nul

echo 2. Creando Puerta a Internet (Tunel)...
echo.
start "ESTA ES LA URL PARA EL MOVIL" cmd /k "npx -y localtunnel --port 3001"

echo.
echo ========================================
echo  ✅ ¡EXITO!
echo ========================================
echo.
echo 1. Ve a la ventana que dice "ESTA ES LA URL PARA EL MOVIL"
echo 2. Copia la direccion que pone (https://...)
echo 3. Abrela en tu movil.
echo 4. Si sale una advertencia, pulsa "Click to Continue".
echo.
echo Deja esta ventana abierta mientras uses la app.
echo ========================================
pause
