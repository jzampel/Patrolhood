@echo off
echo ========================================
echo  PATROLHOOD - Remote Access (Production Mode)
echo ========================================
echo.
echo 1. Building the App (this takes ~10-20 seconds)...
echo    PLEASE WAIT...
echo.

cd client
call npm run build
if %errorlevel% neq 0 (
  echo [ERROR] Build failed. Please check the errors above.
  pause
  exit /b
)
cd ..

echo.
echo 2. Starting Server...
echo.

REM Start backend server (which serves the built client)
start "PatrolHood Server" cmd /k "cd server && npm start"

echo.
echo 3. Creating Public Tunnel...
echo.
echo Waiting for server to boot...
timeout /t 5 /nobreak >nul

REM Create tunnel for backend port 3001
start "Remote Access URL (SHARE THIS)" cmd /k "npx -y localtunnel --port 3001"

echo.
echo ========================================
echo  SUCCESS!
echo ========================================
echo.
echo 1. Look for the window "Remote Access URL"
echo 2. Copy the URL (https://xxxx.loca.lt)
echo 3. That is your ONE SINGLE URL for everything.
echo.
echo Open it on your mobile. Login and SOS will work.
echo.
echo ========================================
pause
