@echo off
echo ================================================================
echo  LauncherChef - Setup de Hosting en GitHub
echo ================================================================
echo.
echo Este script te ayuda a preparar los mods para subir a GitHub.
echo.
echo PASO 1: Crear la carpeta con los mods para subir
echo ----------------------------------------------------------------

if not exist "upload" mkdir upload
if not exist "upload\mods" mkdir upload\mods

echo Copiando mods de tu instancia de CurseForge...
echo Esto puede tardar unos minutos (339 MB)...
echo.

xcopy "C:\Users\car_g\curseforge\minecraft\Instances\TortillaLand 2 (Unofficial)\mods\*.jar" "upload\mods\" /Y /Q

echo.
echo ✓ Mods copiados a: upload\mods\
echo.
echo ================================================================
echo  SIGUIENTES PASOS (hazlos manualmente):
echo ================================================================
echo.
echo 1. Ve a https://github.com/new y crea un repositorio:
echo    Nombre: tortillaland-mods (o como quieras)
echo    Ponlo PUBLICO
echo.
echo 2. En GitHub, ve a Releases ^> Create new release
echo    Tag: v1 (o mods-v1)
echo    Titulo: Mods TortillaLand 2
echo    Arrastra TODOS los .jar de upload\mods\ al release
echo    (GitHub permite hasta 2GB por release)
echo.
echo 3. Despues de subir, cada mod tendra una URL como:
echo    https://github.com/TU-USUARIO/tortillaland-mods/releases/download/v1/NOMBRE-MOD.jar
echo.
echo 4. Ejecuta el siguiente comando para actualizar las URLs:
echo    node tools/update-urls.js TU-USUARIO tortillaland-mods v1
echo.
echo 5. Sube distribution.json al mismo repo y usa la URL raw
echo    en el launcher.
echo.
pause
