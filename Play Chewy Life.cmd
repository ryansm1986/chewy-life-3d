@echo off
cd /d "%~dp0"
if not exist node_modules (
  echo Installing dependencies...
  call npm install
)
echo Starting Chewy Life 3D...
call npx vite --port 5173 --open
