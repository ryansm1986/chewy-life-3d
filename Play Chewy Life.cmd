@echo off
cd /d "%~dp0"
if not exist node_modules (
  echo Installing dependencies...
  call npm install
)
echo Building Chewy Life 3D...
call npx vite build --logLevel error
if errorlevel 1 (
  echo Build failed - starting the dev server instead.
  call npx vite --port 5173 --open
  exit /b
)
echo Starting Chewy Life 3D...
call npx vite preview --port 4173 --open
