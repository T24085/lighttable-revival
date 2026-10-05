@echo off
setlocal DisableDelayedExpansion
set "APP_DIR=%~dp0deploy\core"
set "ELECTRON=%~dp0deploy\electron\node_modules\electron\dist\electron.exe"

if not exist "%ELECTRON%" (
    echo Light Table's Electron runtime was not found:
    echo "%ELECTRON%"
    pause
    exit /b 1
)
if not exist "%APP_DIR%\main.js" (
    echo Light Table's application files were not found:
    echo "%APP_DIR%"
    pause
    exit /b 1
)

start "Light Table" /D "%CD%" "%ELECTRON%" "%APP_DIR%" %*
if errorlevel 1 (
    echo Light Table could not be started.
    pause
    exit /b 1
)
exit /b 0
