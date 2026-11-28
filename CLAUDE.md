# 반짝퀴즈 작업 규칙

저장소 설명과 점검 방법은 [README.md](README.md)에 있어요. 고친 뒤에는 `node tests/check.js`가 `✅ 통과`인지 확인하세요.

## 한글 줄바꿈 규칙 (반드시 지키기)

한글 문장은 **띄어쓰기 자리에서만** 줄을 바꿔야 해요. "로그인하세 / 요."처럼 단어 중간에서 끊기면 안 돼요.
배경: [docs/korean-line-break-prd.md](docs/korean-line-break-prd.md), 방법: [docs/korean-line-break-trd.md](docs/korean-line-break-trd.md)

1. 공통 규칙은 `style.css`의 `body` 한 곳에 있어요: `word-break:keep-all; overflow-wrap:break-word`. 지우거나 바꾸지 마세요.
2. 어떤 CSS에도 `word-break:normal`이나 `word-break:break-all`을 쓰지 마세요. (점검 스크립트가 막아요)
3. 띄어쓰기 없는 긴 글자(인터넷 주소, 긴 닉네임, 코드)가 좁은 칸이나 flex/grid 안에 들어가면, 그 요소에 `overflow-wrap:anywhere`를 더해 화면 밖으로 넘치지 않게 하세요.
4. canvas에 여러 줄 글자를 그릴 때는 글자 하나씩이 아니라 **띄어쓰기 단위**로 줄을 나누세요. 한 단어가 한 줄보다 길 때만 글자 단위로 나눠요. (`arena-runner.js`의 `wrapText` 참고)
5. 문장 안에 `<br>`이나 `\n`으로 줄을 억지로 나누지 마세요. 화면 폭마다 어색해져요.
6. 새 화면을 만들면 폭 320px(작은 휴대폰)과 큰 화면에서 단어 중간 줄바꿈과 가로 넘침이 없는지 확인하세요.
