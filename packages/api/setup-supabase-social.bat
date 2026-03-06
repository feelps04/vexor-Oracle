@echo off
echo ============================================================
echo   VEXOR - Setup Supabase Social Tables
echo ============================================================
echo.

set SUPABASE_URL=%1
set SUPABASE_KEY=%2

if "%SUPABASE_URL%"=="" (
  echo Usage: setup-supabase-social.bat ^<SUPABASE_URL^> ^<SUPABASE_SERVICE_KEY^>
  echo.
  echo Example:
  echo   setup-supabase-social.bat https://xyz.supabase.co eyJ...
  echo.
  echo Get your credentials from: Project Settings ^> API
  pause
  exit /b 1
)

echo Applying social schema to Supabase...
echo URL: %SUPABASE_URL%
echo.

:: Use curl to apply schema via Supabase REST API
curl -X POST "%SUPABASE_URL%/rest/v1/rpc/exec" ^
  -H "apikey: %SUPABASE_KEY%" ^
  -H "Authorization: Bearer %SUPABASE_KEY%" ^
  -H "Content-Type: application/json" ^
  -d "{\"query\": \"$(type %~dp0supabase-social-schema.sql)\"}" 2>nul

if %ERRORLEVEL%==0 (
  echo.
  echo ============================================================
  echo   Schema applied successfully!
  echo ============================================================
) else (
  echo.
  echo Note: If curl failed, apply the schema manually:
  echo   1. Go to Supabase Dashboard
  echo   2. Open SQL Editor
  echo   3. Paste contents of: supabase-social-schema.sql
  echo   4. Click Run
)

pause
