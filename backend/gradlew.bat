@rem ==========================================================================
@rem Gradle Wrapper script for Windows (Enterprise Payment Ecosystem Backend)
@rem ==========================================================================
@echo off
setlocal
set "DIRNAME=%~dp0"
if "%DIRNAME%" == "" set "DIRNAME=.\"

if exist "%DIRNAME%tools\gradle-8.10.2\bin\gradle.bat" (
    set "GRADLE_HOME=%DIRNAME%tools\gradle-8.10.2"
) else if exist "%DIRNAME%..\tools\gradle-8.10.2\bin\gradle.bat" (
    set "GRADLE_HOME=%DIRNAME%..\tools\gradle-8.10.2"
) else if exist "C:\Users\Lenovo\.gemini\antigravity-ide\scratch\diple-engine\gradle-8.10.2\bin\gradle.bat" (
    set "GRADLE_HOME=C:\Users\Lenovo\.gemini\antigravity-ide\scratch\diple-engine\gradle-8.10.2"
) else if exist "D:\Projects\diple-engine\tools\gradle-8.10.2\bin\gradle.bat" (
    set "GRADLE_HOME=D:\Projects\diple-engine\tools\gradle-8.10.2"
) else (
    echo [ERROR] Gradle 8.10.2 was not found.
    exit /b 1
)

call "%GRADLE_HOME%\bin\gradle.bat" %*
exit /b %ERRORLEVEL%
