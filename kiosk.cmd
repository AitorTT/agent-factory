@echo off
setlocal
set PORT=%1
if "%PORT%"=="" set PORT=5100
set URL=http://localhost:%PORT%
start "" msedge --kiosk --app=%URL% --edge-kiosk-type=fullscreen --user-data-dir="%TEMP%\hermes-factory-kiosk"
if errorlevel 1 start "" chrome --kiosk --app=%URL% --user-data-dir="%TEMP%\hermes-factory-kiosk"
endlocal
