@echo off
chcp 65001 >nul
echo ========================================
echo    TikTok数据同步工具
echo ========================================
echo.

:: 进入脚本目录
cd /d "%~dp0"

:: 检查Python是否安装
python --version >nul 2>&1
if %errorlevel% neq 0 (
    echo [错误] 未检测到Python,请先安装Python 3.8+
    echo 下载地址: https://www.python.org/downloads/
    pause
    exit /b 1
)

:: 检查依赖是否安装
python -c "import playwright" >nul 2>&1
if %errorlevel% neq 0 (
    echo [提示] 正在安装依赖,请稍等...
    pip install -r requirements.txt
    echo.
    echo [提示] 安装浏览器驱动...
    playwright install chromium
)

:: 运行同步脚本
echo [提示] 启动数据同步...
python sync.py

echo.
echo ========================================
echo    同步完成
echo ========================================
pause
