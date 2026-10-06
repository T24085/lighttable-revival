@echo off
setlocal DisableDelayedExpansion
set "APP_DIR=%~dp0deploy\core"
set "ELECTRON=%~dp0deploy\electron\node_modules\electron\dist\electron.exe"

if not exist "%ELECTRON%" (
    echo Light Table's Electron runtime was not found:
    echo "%ELECTRON%"
    echo This source folder needs to be built before it can run.
    echo See docs\revival\TESTING.md for prerequisites and build commands.
    pause
    exit /b 1
)
if not exist "%APP_DIR%\main.js" (
    echo Light Table's application files were not found:
    echo "%APP_DIR%"
    pause
    exit /b 1
)
if not exist "%APP_DIR%\lighttable\bootstrap.js" (
    echo Light Table's compiled editor was not found.
    echo See docs\revival\TESTING.md for prerequisites and build commands.
    pause
    exit /b 1
)
if not exist "%APP_DIR%\node_modules\yargs\package.json" (
    echo Light Table's application dependencies were not found.
    echo See docs\revival\TESTING.md for prerequisites and build commands.
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
