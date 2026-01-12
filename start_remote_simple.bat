@echo off
echo ========================================
echo  PATROLHOOD - Acceso Remoto
echo ========================================
echo.
echo PASO 1: Creando tunel para el BACKEND (servidor)...
echo.

start "Backend Tunnel" cmd /k "cd /d %~dp0 && npx -y localtunnel --port 3001"

echo.
echo ESPERA 5 segundos a que aparezca la URL del backend...
timeout /t 5 /nobreak

echo.
echo ========================================
echo  IMPORTANTE - LEE ESTO:
echo ========================================
echo.
echo 1. Mira la ventana "Backend Tunnel" que se acaba de abrir
echo 2. Busca una linea que dice: "your url is: https://xxxxx.loca.lt"
echo 3. COPIA esa URL completa (ejemplo: https://brave-cats-12345.loca.lt)
echo.
echo Cuando la tengas copiada, presiona cualquier tecla aqui...
pause

echo.
echo Ahora pega la URL del backend (Ctrl+V) y presiona Enter:
set /p BACKEND_URL=URL del backend: 

echo.
echo Perfecto! Ahora creando tunel para el FRONTEND (app)...
echo.

start "Frontend con Backend Remoto" cmd /k "cd /d %~dp0client && set VITE_API_URL=%BACKEND_URL% && npm run dev"

timeout /t 5 /nobreak

start "Frontend Tunnel" cmd /k "cd /d %~dp0 && npx -y localtunnel --port 5173"

echo.
echo ========================================
echo  ULTIMO PASO:
echo ========================================
echo.
echo 1. Mira la ventana "Frontend Tunnel"
echo 2. Busca la URL que dice: "your url is: https://yyyyy.loca.lt"
echo 3. ABRE ESA URL en tu movil (4G/5G)
echo.
echo IMPORTANTE: La primera vez que abras la URL, localtunnel
echo te mostrara una pagina de advertencia. Haz clic en "Continue".
echo.
echo ========================================
pause
