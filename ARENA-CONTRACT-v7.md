# 반짝퀴즈 v7 계약 (v5/ARENA-CONTRACT 규칙 그대로 + 아래)
부모 담당: engine.js, backend.js, live.js, modes.js, index.html, 404.html (작업자는 수정 금지, 필요하면 보고). 테스트 출처는 작업자마다 다르게: 마블 https://www.example.com/, 퀴즈 런 https://www.example.net/, 보스 https://example.org/ (부모는 www.example.org).

## M. 마블 레이스 전면 개편 — 작업자 M: `marble-physics.js`(새 파일), `arena-marble.js/.css`(다시 작성), `fx.js` 트랙 추가
진행 방식(엔진, 부모 구현): 클래식처럼 진행자가 넘기는 퀴즈(question → reveal → leaderboard 반복, 점수도 클래식과 같음). 정답마다 구슬 1개(개수 제한 없음), 빠른 정답(제한시간 1/3 안)이면 황금 구슬 1개 추가, 3연속 이상 정답이면 구슬 1개 추가. 마지막 문제의 점수판 뒤 phase 'running' 으로 바뀌어 구슬 레이스. **가장 늦게 도착한 구슬의 주인이 레이스 1등**(학생 기준은 자기 구슬 중 가장 늦게 도착한 구슬). 1·2·3등에게 추가 점수 후 시상식.
### marble-physics.js (DOM 없이 순수 계산, 엔진과 진행자 화면이 같은 함수를 씀 → 같은 입력이면 완전히 같은 결과여야 함. Math.random 금지, 시드 난수만)
```
window.KQMarble = {
  MAPS: [{ id, name, desc, bgm }],            // 최소 4개, bgm 은 fx.js 트랙 이름 'race0'..'race3'
  mapFor(seed) -> mapId,                       // 시드로 맵 고르기
  create(mapId, marbles, seed) -> world,       // marbles: [{ id, gold }] (순서 고정)
  simulate(mapId, marbles, seed, opts) -> { duration (초), finish: [{ id, t }] }  // 도착 빠른 순, 모든 구슬 포함
}
world: { map, t, done, step() /* 1/60초 진행(내부 하위 단계 가능) */, bodies: [{ id, x, y, r, angle, gold, finished, finishT }], statics(): 그리기용 현재 장애물(선분, 못, 회전 막대 각도 등), w, h }
```
- lazygyu/roulette(깃허브 "마블 룰렛")처럼: 세로로 긴 맵을 구슬들이 중력으로 떨어지며 못(peg), 경사로, 깔때기, 회전하는 풍차/막대, 튕기는 범퍼, 갈림길을 지나 맨 아래 결승선으로. 원-원, 원-선분 충돌(반발·마찰), 회전 장애물(운동학적). 고정 시간 간격.
- 맵 4개 이상, 분위기·구조가 확실히 다르게(예: 핀볼 못 숲, 풍차 공장, 지그재그 경사로+깔때기, 우주 블랙홀/소용돌이). 매판 시드로 무작위 선택.
- 황금 구슬은 공기 저항이 조금 커서 살짝 느림(늦게 들어올수록 유리하니 혜택).
- 끼임 방지: 2초 넘게 거의 안 움직이면 시드 난수로 살짝 튕김. 보통 35~60초에 끝나고 80초 상한(상한에 남은 구슬은 진행이 적은 순서로 맨 뒤에 붙임).
- 성능: 구슬 400개를 simulate 하는 데 노트북에서 2초 안쪽(격자 공간 분할 등). 1000개도 멈추지 않게.
### modeState (엔진 → 화면)
collect 단계(진행자 진행 중): `{ kind:'marble', stage:'collect', totalMarbles, totalGold, players:[{id,nickname,avatar,color,marbles,gold,correct,score}], lastGain:{ q, items:[{nickname,count,gold}] } | null }`
race 단계(phase 'running'): `{ kind:'marble', stage:'race', mapId, seed, raceStart(ms, 이 시각까지 카운트다운 약 4초), duration(초), raceEnd(ms), marbles:[{id, owner, nickname, color, gold}], finish:[{id,t}], order:[{id,nickname,avatar,place}] (레이스 등수, 1=가장 늦게 도착), bonus:{1,2,3}(점수), players:[...] }`
- 진행자 화면은 `KQMarble.create(mapId, marbles.map(m=>({id:m.id,gold:m.gold})), seed)` 로 같은 세계를 만들어 raceStart 부터 실시간으로 step 하며 그림(새로 고침 등으로 늦게 열리면 빨리 감기로 현재 시각까지). 카메라는 처음엔 선두를 따라가다가 남은 구슬이 적어질수록 **남아 있는 마지막 구슬들**을 비춤(늦게 들어올수록 1등이니 마지막이 하이라이트). 구슬마다 주인 색과 닉네임 작은 표시, 황금 구슬은 반짝임. 오른쪽에 "남은 구슬" 실시간 순위(가장 오래 남은 학생 위쪽), 마지막 3명 남으면 긴장 연출, 결승선 통과마다 작은 효과. 끝나면 1·2·3등 캐릭터와 추가 점수(bonus) 크게.
- 진행자 다른 단계(countdown/question 의 작은 칸): 학생별 구슬 병(모은 개수와 황금), 총 개수.
- 학생 화면: 평소 띠 = 내 구슬 n개(황금 m개), "늦게 들어올수록 1등!" 안내. race 단계 큰 패널 = "큰 화면을 보세요", 내 구슬 수, raceEnd 뒤에는 내 레이스 등수와 추가 점수(order/bonus 에서 찾기).
### fx.js
TRACKS 에 빠르고 신나는 레이스 곡 'race0'..'race3'(맵마다 다른 느낌, 150 BPM 이상 빠른 비트, 긴장감) + 로봇 경주 미니게임용 'mission'(긴박한 작전 느낌, 기존 robot 곡과 확실히 다르게) 추가. 기존 형식 그대로. live.js 연결은 부모가 함.

## R. 퀴즈 런 맵·보스 — 작업자 R: `arena-runner.js/.css`만
- 일정 거리(예: 400~500m)마다 맵이 바뀜, 순환: 초원 → 화산(용암 돌이 떨어져 그림자 표시 후 낙하, 바닥 일부가 용암으로 빛남) → 빙하(미끄러운 얼음: 줄 바꿀 때 미끄러지는 관성, 고드름/펭귄) → 정글(흔들리는 통나무, 덩굴 숙이기, 바나나 코인) → 사막(모래 폭풍으로 시야 흐림, 굴러오는 회전초) → 우주(낮은 중력: 점프가 길고 높음, 운석) 등 5개 이상. 맵 전환 연출(문/포털과 "화산 지대!" 큰 글씨), 하늘·트랙·장식 색이 확실히 달라야 함. 맵마다 특별 기믹 1개 이상.
- 보스 구간: 일정 거리마다(예: 맵 2개마다) 거대 보스가 트랙 앞에 등장해 따라오며 공격(장애물 던지기). 그동안 맞힌 정답이 보스를 공격(정답 1개 = 체력 칸 1개 감소, 연속 정답은 더 큰 공격). 보스를 쓰러뜨리면 큰 연출 + 다음 답 전송의 `meta.boss = 1`(엔진이 +200점). 일정 시간 안에 못 잡으면 보스가 떠남(벌점 없음).
- 이미 있는 것(문제 사진, 키 안내, 장애물, 속도, 피버, 진행자 경주판)은 유지. 진행자 경주판에 각 학생의 현재 맵 이름 작은 표시(학생이 meta 로 보내는 값이 없으니 dist 로 계산: 맵 길이 상수는 공용으로 정해 쓰기).

## B. 보스 레이드 강화 — 작업자 B: `arena-orig.js/.css` 의 boss 부분만(보물상자·꽃밭 유지)
엔진(부모): 보스가 쓰러지면 다음 단계의 더 강한 보스가 등장(체력 약 1.6배, 반격 피해 더 큼). 게임은 마지막 문제까지 계속, 방패 0이면 즉시 패배로 끝.
modeState 추가/변경: `level`(1부터, 지금 보스 단계), `bossName`, `bossHp`, `bossMaxHp`, `shield`(0~100), `phase`('normal'|'angry'|'rage'), `status`('fighting'|'victory'|'defeat'), `defeated:[{level,name,finisher:{nickname,avatar}}]`, `spawnAt`(새 보스 등장 시각 ms 또는 null), `lastAttack:{q, dmg, at, level, wrong}`(오답 수만큼 강해진 반격), `hits`, `finisher`(직전 처치자).
- 새 보스 등장: 쓰러진 보스 폭발 → "n단계 보스 등장!" 경고(빨간 경고등, 사이렌 효과음, 화면 어두워짐) → 더 크고 다른 색·뿔/갑옷 등 강해진 모습(단계별 외형 차이 4단계 이상, 그 뒤는 순환+색 변화). 단계 표시.
- 반격 임팩트 강화(학생들이 놀랄 정도): 보스가 화면 앞으로 돌진/레이저/땅 내려찍기 중 단계별 다른 공격, 화면 전체 강한 흔들림, 빨간 섬광, 금 간 유리 효과, 방패 깨지는 조각, 큰 "-n" 숫자, 'boom' 효과음. 피해가 클수록 더 크게. reduced-motion 이면 흔들림 대신 깜빡임.
- 학생 휴대폰: 오답이었던 학생(view.result.correct === false 이고 lastAttack 이 새로움)은 휴대폰 화면에도 큰 피격 연출(빨간 화면 금, 흔들림, 진동 navigator.vibrate([200,80,200])). 정답 학생은 방패가 깎이는 작은 경고. 새 보스 등장도 휴대폰 띠에 표시.
- 끝 화면 카드: "보스 n마리 처치", 마지막 보스 단계.
