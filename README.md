# V Quiz — iPhone Home Screen App

현재 Apple Clean + 반응 퀴즈 안정화 + 범위 입력 개선 버전을 기반으로 만든
iPhone 홈 화면 앱 버전입니다.

추가:
- Web App Manifest
- iPhone 홈 화면 아이콘
- standalone 앱 모드
- Apple mobile web app 메타 태그

중요:
- 이번 단계에서는 Service Worker를 넣지 않았습니다.
- 이유: 이전 테스트의 캐시/업데이트 문제를 피하고, 현재 퀴즈 기능을 안정적으로 유지하기 위해서입니다.
- iOS에서는 홈 화면 웹 앱 실행에 Service Worker가 필수는 아닙니다.
- 오프라인 캐시는 앱 내용이 완성된 뒤 마지막에 붙일 수 있습니다.

GitHub 반영:
```bash
git add .
git commit -m "Add iPhone app support"
git push
```
