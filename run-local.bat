@echo off
chcp 65001 >nul
echo 로컬 미리보기 서버를 시작합니다. 브라우저에서 http://localhost:8000 을 여세요. (종료: 이 창에서 Ctrl+C)
where py >nul 2>nul && (py -m http.server 8000 & goto :eof)
where python >nul 2>nul && (python -m http.server 8000 & goto :eof)
echo Python이 없습니다. GitHub에 push한 뒤 Pages 주소에서 확인하거나, VS Code의 Live Server 확장을 사용하세요.
pause
