# TRD: 한글 줄바꿈 고치는 방법

PRD: [korean-line-break-prd.md](korean-line-break-prd.md)

## 원인
CSS의 기본값 `word-break: normal`은 한글(CJK)을 글자마다 끊을 수 있게 둡니다.

## 해결 방법
### 1. 공통 규칙 한 곳 (`style.css`의 `body`)
```css
body{ word-break:keep-all; overflow-wrap:break-word }
```
- `word-break: keep-all` : 한글도 영어처럼 **띄어쓰기에서만** 줄을 바꿈.
- `overflow-wrap: break-word` : 띄어쓰기 없이 너무 긴 말이 칸을 넘칠 때만 글자 중간에서 끊음(안전장치).
- 두 값은 모든 글자에 물려 내려가므로(상속) 앱의 모든 화면·모드에 한 번에 적용됩니다.

### 2. 예외를 만든 곳 정리
- `arena-runner.css`의 퀴즈 런 보기 글자에 있던 `word-break:normal`(글자 단위로 끊기)을 `keep-all`로 바꿈.
- 개별 요소에 이미 있던 `word-break:keep-all; overflow-wrap:anywhere`는 그대로 둠(같은 방향이라 충돌 없음).

### 3. 그림(canvas)으로 그리는 글자
CSS가 닿지 않으므로 코드로 줄을 나눔.
- `arena-runner.js`의 `wrapText`: 글자 하나씩 넣던 방식 → **띄어쓰기 단위**로 넣고, 한 단어가 한 줄보다 길 때만 글자 단위로 나눔.
- 다른 모드의 canvas 글자(`결승선`, `버텨라!` 등)는 한 줄짜리 짧은 말이라 해당 없음.

### 4. 확인
- 화면 폭 320 / 375 / 768 / 1280px에서 로그인 화면 등 실제 확인.
- `node tests/check.js`에 검사 추가: `style.css`의 `body`에 `word-break:keep-all`이 있는지, 어느 CSS에도 `word-break:break-all`/`word-break:normal`이 없는지.

### 5. 앞으로의 규칙
`CLAUDE.md`에 "한글 줄바꿈 규칙"을 적어 둠. 새 화면에서 `word-break`를 따로 바꾸지 말 것, canvas 글자는 띄어쓰기 단위로 나눌 것.
