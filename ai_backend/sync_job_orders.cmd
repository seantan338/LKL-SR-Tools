@echo off
powershell -NoProfile -ExecutionPolicy Bypass -File "%~dp0sync_job_orders.ps1" %*
pause
