@echo off
chcp 65001 > nul
cd /d "%~dp0"
echo ============================================
echo   회로 공작소 - 3D 전기회로 게임
echo   브라우저가 열리면 게임이 시작됩니다.
echo   끝낼 때는 이 창에서 Ctrl + C 를 누르세요.
echo ============================================
echo.
start "" http://localhost:8765
where py > nul 2>&1
if %errorlevel%==0 (
  py -m http.server 8765
) else (
  python -m http.server 8765
)
pause
