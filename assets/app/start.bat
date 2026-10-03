@echo off
cd /d "%~dp0"
if not exist node_modules (
  echo Installing dependencies...
  call npm install --no-audit --no-fund
)
if not exist .env copy .env.example .env >nul
start "" http://localhost:4300
node server.js
pause
