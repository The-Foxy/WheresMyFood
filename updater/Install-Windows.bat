@echo off
chcp 65001 >nul
setlocal
cd /d "%~dp0"
set "SCRIPT=updater\install.py"
if not exist "%SCRIPT%" set "SCRIPT=install.py"

py -3 -c "import sys; raise SystemExit(0 if sys.version_info >= (3, 10) else 1)" >nul 2>&1
if %ERRORLEVEL% EQU 0 (
    py -3 "%SCRIPT%" %*
    goto :finish
)

python -c "import sys; raise SystemExit(0 if sys.version_info >= (3, 10) else 1)" >nul 2>&1
if %ERRORLEVEL% EQU 0 (
    python "%SCRIPT%" %*
    goto :finish
)

echo.
echo [!] Python 3.10+ was not found on your Windows PC.
echo [!] پایتون ۳.۱۰ یا جدیدتر روی سیستم پیدا نشد.
where winget >nul 2>&1
if %ERRORLEVEL% EQU 0 (
    echo.
    set /p INSTALL_PY="Install Python 3.12 automatically now via winget? [Y/n]: "
    if "%INSTALL_PY%"=="" set "INSTALL_PY=Y"
    if /i "%INSTALL_PY%"=="Y" (
        winget install -e --id Python.Python.3.12 --scope user --accept-package-agreements --accept-source-agreements
        if exist "%LOCALAPPDATA%\Programs\Python\Python312\python.exe" (
            "%LOCALAPPDATA%\Programs\Python\Python312\python.exe" "%SCRIPT%" %*
            goto :finish
        )
    )
)

echo.
echo Please install Python 3 from https://www.python.org/downloads/
echo (Make sure to check "Add python.exe to PATH"), then run this file again.
start "" "https://www.python.org/downloads/"
pause
exit /b 1

:finish
set "CODE=%ERRORLEVEL%"
echo.
pause
exit /b %CODE%
