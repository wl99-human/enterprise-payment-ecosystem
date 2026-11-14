@rem ==========================================================================
@rem Gradle Wrapper proxy for Enterprise Payment Ecosystem
@rem Forwards commands to the backend Gradle project
@rem ==========================================================================
@echo off
setlocal
set "DIRNAME=%~dp0"
if "%DIRNAME%" == "" set "DIRNAME=.\"

pushd "%DIRNAME%backend"
call gradlew.bat %*
set ERR=%ERRORLEVEL%
popd
exit /b %ERR%
