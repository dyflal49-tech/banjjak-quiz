# 반짝퀴즈 작업 문서

버전마다 화면(렌더러) 작업을 나눌 때 쓴 계약 문서예요. 뒤 버전은 앞 버전 규칙을 그대로 따르고 바뀐 부분만 적어요.

- [contract-v4.md](contract-v4.md): v4 카훗형 5개 모드 렌더러 계약. 공통 규칙(등록 방식, modeKit 도구, 진행자/학생 화면 크기)의 기준 문서
- [contract-v5.md](contract-v5.md): v5 로봇 경주 단계와 협동 미니게임, 퀴즈 런(하늘 탑 쌓기 대체)
- [contract-v7.md](contract-v7.md): v7 마블 레이스 전면 개편(구슬 물리), 퀴즈 런 맵과 보스
- [boss-design-v9.md](boss-design-v9.md): v9 보스 레이드, 퀴즈 런 맵 보스, 추격자 디자인
- [korean-line-break-prd.md](korean-line-break-prd.md) / [korean-line-break-trd.md](korean-line-break-trd.md): 한글이 단어 중간에서 줄바뀌는 문제와 고치는 방법

참고: 우주 정복(모드 id `space`)은 `arena-space.js` / `arena-space.css` 가 그려요. 예전 이름은 `arena-tower.*` 였고, CSS 접두사 `ar-tower-` 와 엔진 값 `kind: 'tower'` 는 그대로 써요.
