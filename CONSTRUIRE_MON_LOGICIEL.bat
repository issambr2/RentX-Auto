@echo off
setlocal
title Dhokkar - Generateur d'application (.exe)

:: Couleurs (Vert sur Noir pour un look pro)
color 0A

echo ============================================================
echo           GENERATEUR D'APPLICATION DHOKKAR (.EXE)
echo ============================================================
echo.
echo Ce script va transformer votre projet en un logiciel installable.
echo.

echo [ETAPE 1] Verification de Node.js...
node -v >nul 2>&1
if %errorlevel% neq 0 (
    color 0C
    echo ERREUR: Node.js n'est pas installe sur cet ordinateur.
    echo Veuillez l'installer sur https://nodejs.org
    pause
    exit
)
echo Node.js est present.
echo.

echo [ETAPE 2] Nettoyage automatique des erreurs (Cache)...
:: On nettoie le cache qui cause l'erreur "zip: not a valid zip file"
if exist "%LOCALAPPDATA%\electron-builder\Cache" (
    echo Nettoyage du cache de construction en cours...
    rd /s /q "%LOCALAPPDATA%\electron-builder\Cache" >nul 2>&1
)
:: Optionnel: Nettoyage des fichiers temporaires npm
call npm cache clean --force >nul 2>&1
echo Nettoyage termine.
echo.

echo [ETAPE 3] Installation des outils et dependances...
echo (Cette etape peut prendre 1 a 2 minutes)
call npm install
echo.

echo [ETAPE 4] Compilation du logiciel...
:: On lance la construction Electron
call npm run electron:build
echo.

if %errorlevel% neq 0 (
    color 0C
    echo.
    echo XXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXX
    echo    UNE ERREUR EST SURVENUE DURANT LA COMPILATION.
    echo XXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXX
    echo.
    echo Essayez de supprimer le dossier "node_modules" et relancez.
    pause
    exit
)

echo ============================================================
echo    SUCCES ! Votre logiciel est pret.
echo    Le fichier d'installation se trouve dans le dossier :
echo    --^> release\
echo ============================================================
echo.
echo Ouverture du dossier de sortie...
if exist "release" start "" "release"
echo.
pause
