@echo off
REM Re-extrae el estado de Centro de Mando desde el LevelDB de Chrome (Paso 1 del flujo).
"%LOCALAPPDATA%\Python\pythoncore-3.14-64\python.exe" "%~dp0refresh_centro_de_mando.py" >> "%~dp0exports\refresh.log" 2>&1
