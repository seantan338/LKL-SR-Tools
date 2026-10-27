@echo off
powershell -NoProfile -ExecutionPolicy Bypass -File "%~dp0setup_local.ps1" %*
pause
