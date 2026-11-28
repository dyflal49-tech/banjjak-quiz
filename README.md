# 반짝퀴즈

초등학생 교실에서 쓰는 실시간 퀴즈 게임입니다. 선생님이 큰 화면에 게임을 띄우면 학생들은 휴대폰이나 태블릿으로 PIN 또는 QR 코드를 찍고 들어와 함께 문제를 풉니다.

- 설치나 빌드 없이 HTML, CSS, JavaScript 파일만으로 돌아갑니다.
- 인터넷 주소: GitHub Pages (`https://dyflal49-tech.github.io/banjjak-quiz/`)
- 저장과 실시간 연결: Firebase (로그인 + Firestore 데이터베이스)

## 게임 모드 (10가지)

| 모드 | 이름 | 진행 방식 |
|---|---|---|
| `classic` | 클래식 | 선생님이 문제를 넘김 |
| `robot` | 로봇 경주 | 학생마다 자기 속도로 |
| `marble` | 마블 레이스 | 선생님이 문제를 넘김, 마지막에 구슬 레이스 |
| `submarine` | 잠수함 특공대 | 학생마다 자기 속도로 |
| `kingdom` | 컬러 킹덤 | 팀전 |
| `space` | 우주 정복 | 팀전 |
| `runner` | 퀴즈 런 | 학생마다 자기 속도로 |
| `treasure` | 행운의 보물상자 | 학생마다 자기 속도로 |
| `garden` | 우리반 꽃밭 | 선생님이 문제를 넘김 |
| `boss` | 보스 레이드 | 선생님이 문제를 넘김 |

## 어떻게 동작하나요

- **서버가 따로 없습니다.** 채점, 순위, 게임 진행은 모두 선생님 컴퓨터의 브라우저(`engine.js`)가 계산합니다.
- 학생이 낸 답과 화면 상태는 Firestore를 통해 실시간으로 주고받습니다(`backend.js`).
- 선생님 계정은 `backend.js`의 `TEACHER_EMAIL` 한 명입니다. 학생은 로그인 없이(익명) 들어옵니다.
- Firebase 프로젝트 `claude-padlet`은 **우리반 보드** 앱과 함께 씁니다. Firestore 보안 규칙을 바꿀 때는 우리반 보드 규칙과 합쳐야 두 앱이 모두 정상 동작합니다.

## 주요 파일

| 파일 | 하는 일 |
|---|---|
| `index.html`, `404.html` | 첫 화면. 두 파일은 내용이 같아야 합니다(`404.html`은 GitHub Pages에서 `/banjjak-quiz/play` 같은 주소를 열 때 쓰임) |
| `common.js` | 공통 도구, 주소 처리 |
| `engine.js` | 게임 규칙, 채점, 순위 (선생님 브라우저에서 실행) |
| `backend.js` | Firebase 연결 |
| `live.js` | 진행 화면과 학생 화면 |
| `studio.js` | 퀴즈 만들기 화면 |
| `modes.js`, `arena-*.js` | 모드별 그림과 연출 |
| `marble-physics.js` | 마블 레이스 구슬 물리 계산 |
| `fx.js` | 소리와 효과 |
| `ARENA-CONTRACT*.md`, `BOSS-DESIGN-v9.md` | 개발할 때 쓴 설계 메모 |

## 내 컴퓨터에서 켜 보기

사이트가 `/banjjak-quiz/` 주소 아래에 있다고 가정하고 만들어져 있어서, **이 폴더의 한 단계 위 폴더**에서 간단한 웹 서버를 켜야 합니다.

```bash
cd ..                      # banjjak-quiz 폴더가 들어 있는 상위 폴더로 이동
python3 -m http.server 8000
```

그다음 브라우저에서 `http://localhost:8000/banjjak-quiz/` 를 엽니다. Firebase에 연결하므로 인터넷이 필요합니다.

## 인터넷에 올리기 (배포)

GitHub Pages가 `main` 브랜치의 파일을 그대로 보여 줍니다. `main`에 변경이 합쳐지면 1~2분 뒤 사이트에 반영됩니다. 따로 빌드할 것은 없습니다.

## 자동 점검

고친 뒤 큰 문제가 없는지 컴퓨터로 확인할 수 있습니다. [Node.js](https://nodejs.org/) 18 이상만 있으면 되고, 따로 설치할 것은 없습니다.

```bash
node tests/check.js
```

확인하는 것:

1. 모든 `.js` 파일에 문법 오류가 없는지
2. `index.html`, `404.html`이 불러오는 파일이 모두 있는지
3. 한글 줄바꿈 규칙이 지켜지는지 (아래 "한글 줄바꿈 규칙" 참고)
4. 마블 레이스 물리
   - 같은 입력(맵, 구슬, 시드)이면 언제나 똑같은 결과가 나오는지
   - 엔진이 미리 계산한 순위(`simulate`)와 진행 화면에서 굴러가는 구슬(`create` + `step`)의 순위가 같은지. 이게 다르면 화면에서 본 1등과 실제 점수가 어긋납니다.
   - 모든 구슬이 한 번씩 결승에 들어오는지
   - 고정된 입력의 결과가 저장된 기준값(`tests/marble-baseline.json`)과 같은지

마블 물리를 **일부러** 바꿔서 결과가 달라지는 것이 맞다면, 기준값을 새로 저장합니다.

```bash
node tests/check.js --update
```

끝에 `✅ 통과`가 나오면 정상이고, `❌ 실패`가 나오면 위에 무엇이 틀렸는지 적혀 있습니다.

## 한글 줄바꿈 규칙

한글 문장은 **띄어쓰기 자리에서만** 줄을 바꿉니다. ("로그인하세 / 요."처럼 단어 중간에서 끊기지 않게)
`style.css`의 `body` 한 곳에 `word-break:keep-all; overflow-wrap:break-word`가 있어 모든 화면에 적용됩니다.
자세한 내용은 [docs/korean-line-break-prd.md](docs/korean-line-break-prd.md), [docs/korean-line-break-trd.md](docs/korean-line-break-trd.md), 지켜야 할 규칙은 [CLAUDE.md](CLAUDE.md)에 있습니다.
