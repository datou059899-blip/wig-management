@echo off
chcp 65001 >nul
echo ========================================
echo    设置定时任务
echo    每小时自动同步一次
echo ========================================
echo.

:: 获取脚本完整路径
set SCRIPT_PATH=%~dp0sync.py
set SCRIPT_DIR=%~dp0

:: 删除已存在的任务(如果有)
schtasks /delete /tn "TikTokDataSync" /f >nul 2>&1

:: 创建新任务
echo [提示] 正在创建定时任务...
schtasks /create /tn "TikTokDataSync" ^
 /tr "python \"%SCRIPT_PATH%\"" ^
 /sc hourly ^
 /st 00:00 ^
 /mo 1 ^
 /ru System ^
 /f

if %errorlevel% equ 0 (
    echo.
    echo ========================================
    echo    定时任务创建成功!
    echo ========================================
    echo.
    echo 任务详情:
    echo   - 任务名称: TikTokDataSync
    echo   - 执行频率: 每小时
    echo   - 脚本路径: %SCRIPT_PATH%
    echo.
    echo 你可以:
    echo   1. 打开"任务计划程序"查看和管理任务
    echo   2. 运行"启动同步.bat"手动同步一次
    echo   3. 查看"logs\sync.log"查看同步日志
    echo.
) else (
    echo.
    echo [错误] 定时任务创建失败
    echo 请尝试以管理员身份运行此脚本
)

echo.
pause
