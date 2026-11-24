# 반짝퀴즈 v4: 카훗형 5개 모드 렌더러 계약

엔진(engine.js), 백엔드(backend.js), live.js 는 부모가 담당. 렌더러 작업자는 자기 파일 2개만 만든다:
- `arena-chase.js` + `arena-chase.css` : robot(로봇 경주) + submarine(잠수함 특공대)
- `arena-marble.js` + `arena-marble.css` : marble(마블 레이스)
- `arena-kingdom.js` + `arena-kingdom.css` : kingdom(컬러 킹덤)
- `arena-tower.js` + `arena-tower.css` : space(우주 정복 = 팀 타워 쌓기)

index.html/404.html 에는 부모가 `<link rel="stylesheet" href="arena-*.css">`, `<script src="arena-*.js" defer>` 를 modes.js 다음에 추가한다.

## 등록
```js
(() => { const KQ = window.KQ || (window.KQ = {}); KQ.arena = KQ.arena || {};
  KQ.arena.robot = { host(root, view, send) {}, player(root, view, send) {} }; })();
```
- modes.js 의 META 가 `KQ.arena[id].host/player` 를 호출 시점에 찾는다(로드 순서 무관). 예외는 modes.js wrap 이 잡지만, 스스로도 던지지 않게.
- 같은 root 에 상태가 바뀔 때마다 반복 호출된다(진행자: 엔진 변경마다, 학생: 약 1.2초마다 + 내 문서 변경마다). 최초 1회 골격, 이후 바뀐 값만 갱신.
- `KQ.modeKit` 도구 사용 권장: `H(tag, attrs, ...kids)`, `S(svgTag, attrs, ...kids)`, `prep(root, key, classes, build(st, root))` → st (st.first, st.dead, st.raf, st.timers), `later(st, fn, ms)`, `act(send, kind, target)` (오류 토스트 후 reject), `txt/css/cls/show/attr/replay`, `nowMs()`(= KQ.now, 서버 시각 보정), `reducedMotion()`, `teamsOf(view)`, `teamColor(i, teams)`, `teamName(i, teams)`, `shade(hex, f)`, `colorFor(id)`, `robotSVG(color)`, `subSVG()`, `flameSVG()`, `crownSVG()`, `ms(view)`=modeState, `meOf(view)`.
- 연속 애니메이션은 requestAnimationFrame 루프를 직접 돌리고 `st.raf` 에 마지막 id 저장, 매 프레임 `if (st.dead) return;` 확인. prep 의 key 가 바뀌거나 dispose 되면 teardown 이 cancelAnimationFrame(st.raf) + timers 정리.
- 사용자 문자열(닉네임 등)은 textContent 로만. 이모지 금지. 한국어. 외부 이미지·라이브러리 금지(SVG/CSS 직접). prefers-reduced-motion 존중.
- CSS 클래스 접두사: `ar-chase-`, `ar-marble-`, `ar-kingdom-`, `ar-tower-`. 다른 파일 CSS 수정 금지.
- 기타 전역: `KQ.avatar.render(av, size)` → SVG 요소(av 없으면 null 처리하고 닉네임 첫 글자 원으로 대체), `KQ.shapeIcon(i, size)` (0 빨강 세모, 1 파랑 마름모, 2 노랑 동그라미, 3 초록 네모), `KQ.sound.play(kind)` ('correct','wrong','whoosh','levelup','coin','sparkle','boom','cheer','pop','countdown' 등; 없는 kind 는 무시됨), `KQ.fx.confetti/burst/stars/flash/shake/stamp` (있을 때만 호출), `window.KQEngine.symbolAt(ms, t)`, `KQEngine.hexNeighbors(cols, rows, idx)`, `KQEngine.canClaim(ms, team, idx)`.

## 진행자 root
- live.js 의 `.lv-stage-slot` 안에 들어간다: countdown(9초, 'small'), running('big', 오른쪽에 실시간 소식 칸이 있음), finished('medium', 접힌 details 안). 컨테이너 크기에 맞춰 늘어나야 함(SVG viewBox + preserveAspectRatio 권장). 교실 프로젝터 1280x720 기준 big 슬롯은 약 900x520.
- view: `{ phase: 'countdown'|'running'|'finished', mode, endsAt, playerCount, players:[{id,nickname,team,score,avatar}], teams:[{index,name,color,score,members}], feed:[{nickname,text,good,at}], modeState }`.

## 학생 root (`.lv-mode-panel`, 최대 폭 720~900px, 휴대폰 360px 고려)
- 평소(문제 풀 때): 질문 화면 아래에 붙는 **작은 상태 띠**(높이 120px 이하).
- `view.actions` 가 있을 때(아래 kind) 또는 마블 레이스 stage==='race' 일 때: live.js 가 질문 대신 짧은 제목만 띄우고 패널을 크게(lv-panel-big) 만든다 → 렌더러가 **미니게임/선택 화면 전체**를 그린다.
- view: `{ phase, mode, me:{id,nickname,team,teamName,teamColor,avatar,score,rank,stats:{charge,boosts,marbles,gold,tiles,floors,perfect}}, actions, result, modeState, endsAt }`.
- `send(kind, target)` → Promise({ok, result, actions}). 보낸 뒤 엔진이 actions 를 null 로 만들면 다음 호출에서 view.actions 가 사라진다(최대 1~2초 지연) → 보낸 직후 버튼 잠그고 "보내는 중" 표시.

## modeState (엔진 → 화면)
### chase (robot, submarine)
`{ kind:'chase', theme:'robot'|'sub', status:'ready'|'running'|'success'|'failed', startAt, endsAt, catchAt, gapMax:60000, boostMs, boosts, lastBoost:{nickname, at, gain}|null, symSeed, symPeriod:5000, symStart, symbols:['세모','마름모','동그라미','네모'], runners:[{id,nickname,avatar,correct,answered,charge,boosts,...}], awards:[{id,title,desc,unit,nickname,avatar,value}] }`
- 남은 거리(ms) = `max(0, catchAt - now)`; 0 이 되면 잡힘. 최대 gapMax. 화면은 이 값을 매 프레임 계산해 추격자 위치를 움직인다.
- 학생 actions: `{kind:'boost'}` → 길게 누르기(약 0.8초) 완료 시 `send('boost')`. 잠수함은 `{kind:'symbol', choices:[...]}` → 4개 도형 버튼, 누르면 `send('symbol', 0~3)`. 진행자 화면은 `KQEngine.symbolAt(ms, now)` 기호를 크게 보여 주고 다음 기호까지 남은 시간 링 표시(symPeriod).
### marble
`{ kind:'marble', stage:'collect'|'race', raceStart, raceEnd, marbles:[{id, owner, nickname, color, gold, T, lane, w:[{a,f,ph},{a,f,ph}], place}], race:{order:[{id,nickname}]}|null, players:[{id,nickname,avatar,color,marbles,gold,correct,finishedRank}] }`
- 마블 위치 공식(같은 결과를 모두가 보도록): `t = now - raceStart; u = clamp(t / T, 0, 1); env = 4*u*(1-u); p = clamp(u + env*(w0.a*sin(2π*w0.f*u + w0.ph) + w1.a*sin(2π*w1.f*u + w1.ph)), 0, 1)`; 화면에서는 마블별로 p 의 최댓값만 유지(뒤로 가지 않게). t>=T 면 도착(place 순서대로 결승 구역에 정렬). lane(0~1)은 트랙 폭 안 좌우 위치.
- raceStart 전 3초는 카운트다운. 학생 플레이어의 순위 = 자기 마블 중 가장 빠른 place 순서(race.order).
### kingdom
`{ kind:'kingdom', cols:13, rows:9, tiles:[팀번호 또는 -1], castles:[팀별 칸 번호], claims:[{team,nickname,tiles:[...],filled:[...],at}], teams:[{index,name,color,score(=칸수),members}], builders:[...] }`
- 뾰족한 위가 위로 향하는 육각형, **홀수 줄이 오른쪽으로 반 칸 밀림**(odd-r). idx = r*cols + c. 이웃은 `KQEngine.hexNeighbors`.
- 학생 actions `{kind:'flags', remaining:n}` → 지도에서 n칸을 고른다(우리 팀 땅과 맞닿은 칸, 성 제외, 다른 팀 땅 가능; 방금 고른 칸도 이어서 맞닿음 판정). 다시 누르면 취소. n개 다 고르면 자동 전송(또는 "깃발 꽂기" 버튼) `send('flags', [idx...])`. 판정은 `KQEngine.canClaim({...ms, tiles: 임시배열}, team, idx)`.
### tower (mode id 'space')
`{ kind:'tower', bonusEvery:10, towers:[{height, blocks:[{x, p}]}] (팀 순서, blocks 는 최근 40개, x 는 블록 폭 단위 가로 위치, p=1 완벽), drops:[{team,nickname,count,perfect,at}], teams:[{index,name,color,score(=높이),height,members}], builders:[...] }`
- 학생 actions `{kind:'blocks', remaining:n, bonus}` → 미니게임: 화면 아래에 우리 팀 타워 꼭대기 블록(마지막 x), 위에서 블록이 좌우로 흔들림. 누르면 떨어짐. dx = 떨어진 블록 x - 꼭대기 x (블록 폭 단위). |dx|<=0.12 완벽, |dx|<0.6 성공(꼭대기 x 를 갱신), 그 밖은 실패(떨어져 사라짐). n번 다 떨어뜨리면 `send('stack', [{dx, ok}...])` 한 번만.

## 공통 완성도 기준
- 카훗 원본과 같은 흐름(관찰 기록: 로봇=추격 탈출, 잠수함=같은 엔진+기호 미니게임, 마블=모아서 마지막 레이스, 킹덤=육각 지도 깃발 3개+둘러싸기, 우주 정복=팀 타워 블록 떨어뜨리기, 보너스 층) + 반짝퀴즈만의 추가 요소(실시간 해설 문구, 위험 경고, 완벽 착지 효과 등).
- 효과음은 이벤트마다 과하지 않게. 진행자 화면은 멀리서도 읽히게 큰 글씨.
