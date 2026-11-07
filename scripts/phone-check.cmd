@echo off
rem Lives at C:\Projects\Cooking-Lab\phone-check.cmd on the PC, next to scripts\phone-check.ps1.
rem Cooking Lab phone check: double-click, or run "phone-check.cmd -Shots home,cook".
rem See scripts\phone-check.ps1 for what it does.
powershell -NoProfile -ExecutionPolicy Bypass -File "%~dp0scripts\phone-check.ps1" %*
echo.
pause
