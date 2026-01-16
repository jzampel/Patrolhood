@echo off
echo ========================================
echo  PATROLHOOD - Acceso Remoto (Modo Estable)
echo ========================================
echo.

REM Kill previous node processes to avoid port conflicts
taskkill /F /IM node.exe /T 2>nul

echo 1. Preparando la App (esto tarda unos 10 segundos)...
echo.

cd client
call npm run build
if %errorlevel% neq 0 (
  echo [ERROR] El build ha fallado. Revisa los errores.
  pause
  exit /b
)
cd ..

echo.
echo 2. Iniciando Servidor...
echo.

REM Start backend server (which serves the built client)
start "PatrolHood Server" cmd /k "cd server && npm start"

echo.
echo 3. Creando Tunel Publico...
echo.
echo Esperando a que el servidor arranque...
timeout /t 5 /nobreak >nul

REM Create tunnel for backend port 3001
start "URL DE ACCESO (COPIA ESTO)" cmd /k "npx -y localtunnel --port 3001"

echo.
echo =======================================================
echo  ¡TODO LISTO!
echo =======================================================
echo.
echo 1. Mira la ventana: "URL DE ACCESO (COPIA ESTO)"
echo 2. Copia la URL (empieza por https://...)
echo 3. Abre esa URL en tu movil.
echo.
echo IMPORTANTE: Si ves una pagina azul de "localtunnel",
echo pulsa el boton azul que dice "Click to Continue".
echo.
echo =======================================================
pause

