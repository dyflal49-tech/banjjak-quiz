# 반짝퀴즈 v5 렌더러 계약 (contract-v4.md 의 규칙 그대로 + 아래 추가)

engine.js / backend.js / live.js / modes.js 는 부모 담당(이미 수정 완료). 작업자는 자기 파일만 만든다. 다른 파일 수정이 필요하면 최종 보고에 적는다.
index.html/404.html 등록은 부모가 한다(arena-mission, arena-runner, arena-orig 의 .js/.css).
등록: `KQ.arena[key] = { host(root, view, send), player(root, view, send) }`. 도구는 `KQ.modeKit` (prep, later, act, H, S, txt, css, nowMs, reducedMotion ...).
공통: 한국어, 이모지 금지, 닉네임은 textContent, 외부 이미지/라이브러리 금지, prefers-reduced-motion 존중, 360px 휴대폰~1280x720 프로젝터.

## A. 로봇 경주 단계 + 협동 미니게임 — `arena-mission.js/.css` (key `robotMini`) + `arena-chase.js` 로봇 HUD 보강
modes.js 는 `modeState.part === 'mini' && modeState.mini` 일 때 robot 대신 `KQ.arena.robotMini` 를 호출한다(같은 root, prep key 가 달라 자동 교체).
chase modeState 추가 필드: `stage`(1~6), `stages`(6), `part`('chase'|'mini'), `stageBoosts`, `stageGoal`(다음 미니게임까지 필요한 반 전체 부스트 수), `cleared`, `lastMini:{stage,type,title,ok}|null`, `pausedGap`(미니게임 중 멈춰 둔 거리 ms), `mini`(아래).
→ arena-chase.js 의 robot 테마 HUD 에 "n단계 / 6", "다음 미니게임까지 부스트 x / y" 진행 막대, 단계가 오를 때 "n단계! 로봇이 더 빨라졌어요" 배너, lastMini 결과 표시를 추가(진행자·학생 띠 모두). 잠수함 테마는 그대로.
`mini`: `{ type:'cores'|'plates'|'deliver', stage, title, desc, startAt, endAt, w:1600, h:900, status:'ready'|'playing'|'success'|'fail', goal, progress, hold(ms), items:[{id,x,y,by,carrier,done}], plates:[{id,x,y,r,need,on,holdFrom,done}], base:{x,y,r}|null, drones:[...], spawn:{x,y}, result:{ok,gapChange}|null, resultAt, players:[{id,nickname,avatar,x,y,carry,stun}] }`
- ready: startAt 까지 카운트다운(약 4초)과 미션 설명. playing: endAt 까지. success/fail: 약 4.5초 결과 화면 후 엔진이 추격으로 돌아감.
- cores: 코어(items, by 가 있으면 이미 주움) 모두 줍기. plates: 발판마다 need 명이 hold ms 동안 서 있으면 done (holdFrom 이 있으면 진행 링 = (now-holdFrom)/hold). deliver: 부품(items)을 들어(carrier=플레이어 id) base 원 안으로 가져가면 done. 
- 드론 위치(모두 같은 공식, t=(now-startAt)/1000 초): circle `x=cx+r*cos(w*t+ph), y=cy+r*sin(w*t+ph)`; line `u=((t/period+ph)%1+1)%1; k=u<0.5?u*2:2-u*2; x=ax+(bx-ax)*k; y=ay+(by-ay)*k`. 드론 반지름 38, 캐릭터 반지름 26 → 거리 < 60 이면 충돌.
- 학생 조작(로컬이 자기 위치의 주인): 방향키/WASD + 터치 조이스틱(화면 왼쪽 아래 드래그). 속도 약 330 단위/초, 맵 밖으로 못 나감. 카메라는 내 캐릭터를 따라가며 휴대폰에서 가로 약 700 단위가 보이게, 작은 전체 지도(미니맵) 권장.
- 전송은 응답 없이 바로 끝나는 fire-and-forget: `send('move', {x,y})` 움직이는 동안 최대 1초에 1번 + 멈출 때 1번(쓰기 횟수 절약이 중요: 무료 한도). `send('pick', itemId)` 코어/부품에 닿으면 자동(거리 < 55, 같은 아이템 중복 전송 금지, 즉시 숨기거나 들고 있는 것으로 표시). `send('deliver')` 부품을 든 채 base 원 안에 들어가면 자동. 드론 충돌 시 1.5초 기절(로컬) + `send('mhit')` + 들고 있던 부품 내려놓기 표시.
- 다른 친구 위치는 modeState(약 1.2초마다 갱신)를 부드럽게 보간. 기절(stun>now) 표시, 들고 있는 부품은 머리 위에.
- 진행자: 맵 전체(16:9), 모든 캐릭터+닉네임, 진행도 x/goal, 남은 시간, 단계, 미션 제목/설명, 시작 카운트다운, 성공/실패 큰 연출(성공: 로봇이 15초 뒤로, 실패: 10초 앞으로). 단계 테마 색이 조금씩 달라지면 좋음. 효과음 KQ.sound.play.

## B. 퀴즈 런 (하늘 탑 쌓기 대체) — `arena-runner.js/.css` (key `runner`, mode id 'runner')
- 학생 running 단계: live.js 가 질문 화면을 숨기고 패널(`.lv-mode-panel`)을 위쪽 막대 아래 전체 높이로 준다(flex:1). 렌더러가 게임 전체를 그린다. countdown 단계에서는 패널이 작은 띠 자리이므로 조작 키 안내 카드 정도만. finished 에는 내 기록 요약 띠.
- view: `question:{id,type:'quiz'|'truefalse',text,image,choices:[{text}],choiceCount}`(내 현재 문제, 답을 보내면 1~2초 뒤 다음 문제로 바뀜), `result:{seq,correct,points(음수 가능),streak,message}`, `me:{score,rank,playerCount,avatar,nickname,stats:{best,hits,dodges,coins,dist}}`, `endsAt`.
- 답 보내기: `send('runAnswer', {questionId, answer: 레인번호(=보기 번호), meta:{hits, dodges, coins, dist}})` → Promise `{ok, result}`. meta 는 그 문제 구간 동안의 충돌 수/피한 장애물 수/코인/달린 거리(m). 다음 문제를 기다리는 동안에도 계속 달리되 문(게이트)은 새 문제가 온 뒤에 나온다.
- 화면: 의사 3D(원근) 트랙 권장(테일즈런너/ZEP 퀴즈 느낌), 레인 수 = 보기 수(2~4). 위쪽 배너에 문제 글(+그림 작게)과 보기 목록(도형 색: 0 빨강 세모, 1 파랑 마름모, 2 노랑 동그라미, 3 초록 네모, 참/거짓은 2레인). 구간 끝에 레인마다 정답 문(도형+보기 글). 문을 지나면 판정 전송.
- 장애물: 낮은 허들(점프로 피함), 높은 막대(숙여서 피함), 레인을 막는 벽/상자(옆 레인으로 피함), 굴러오는 통 등. 단계적으로 늘어남. 코인, 아이템(방패: 한 번 충돌 무시, 자석: 코인 끌어옴) 추가.
- 키: ←/→(A/D) 줄 바꾸기, ↑/W/스페이스 점프, ↓/S 숙이기. 터치: 스와이프 + 아래 버튼. **게임 화면 오른쪽 위에 키 안내를 항상 표시.**
- 속도: 연속 정답(result.streak)마다 단계 상승(최대 6단계), 오답이면 처음 속도, 충돌하면 1.2초 감속+깜빡임. 피버(5연속) 연출. 정답/오답 골인 연출 크게(점수 +/- 숫자, 정답 문 공개).
- 진행자 host: 실시간 경주판(모든 학생: 캐릭터, 닉네임, 점수, 연속 불꽃, 충돌 수, 달린 거리 막대), 1~3위 강조, 순위 바뀜 애니메이션, 최근 사건(피버, 큰 점수). modeState `{kind:'runner', players:[{id,nickname,avatar,score,rank,correct,answered,streak,best,hits,dodges,coins,dist,lastAt}], awards}`. 시상식은 live.js 가 한다(호명+특별상 3~4개).

## C. 반짝 오리지널 고급화 — `arena-orig.js/.css` (keys `treasure`, `garden`, `boss`)
기존 modes.js 의 treasureHost/treasurePlayer, gardenHost/…, bossHost/… 를 참고하되 새로 훨씬 화려하게. "골랐을 때 임팩트"가 핵심.
- treasure(player 진행형): 학생 actions `{kind:'chest', remaining:1, golden}` 일 때 live.js 가 패널을 크게 → 상자 3개(golden 이면 황금 상자). 누르면 `act(send,'chest', i)` → 응답 `result:{prize, points, message, golden, victim, chest}`. prize: gold100, gold250, gold500, jackpot, double, share, magnet, empty. 연출: 고른 상자 확대·흔들림·빛 새어 나옴(약 1초 긴장, KQ.sound 'drumroll' 있으면) → 뚜껑 펑 + 빛줄기 + prize 별 연출(금화 분수, 잭팟 무지개+불꽃+화면 섬광, 두 배 x2 도장, 자석이 victim 이름에서 금화를 끌어옴, 나눔 금화가 퍼짐, 꽝 먼지와 귀여운 실망). 결과 카드 후 다음 문제로(엔진이 다음 문제를 줌). 평소 띠: 내 금화, 순위, 연속 정답(3연속마다 황금 상자 예고).
  진행자: 보물 동굴 테마, 상위권 금화 막대/카운트업과 순위 이동, 사건 티커(잭팟/자석/황금은 크게 팝업). modeState `{kind:'treasure', players:[{id,nickname,avatar,gold,streak,chests}], events:[{nickname,avatar,text,prize,gain,victim,golden,at}]}`.
- garden(host 진행형: countdown/question/reveal/leaderboard/finished 에서 호출, 진행자 root 크기는 small/side/big/medium 다양): modeState `{kind:'garden', goal, bloomed, status:'growing'|'success'|'failed', flowers:[{x(0~100),y(30~94),kind 0~5,by,rare,q,at}], lastBloom:{q,count,accuracy,at}}`. 새 꽃(at 비교)은 씨앗→새싹→봉오리→활짝 단계 애니메이션, rare 는 무지개 반짝임, 나비/벌, 목표 진행 막대와 25/50/75/100% 축하, 성공 시 꽃잎 비. 학생 띠: 우리반 진행도, 내가 피운 꽃(by==내 닉네임 수).
- boss(host 진행형): modeState `{kind:'boss', bossName, bossHp, bossMaxHp, shield(0~100), status:'fighting'|'victory'|'defeat', phase:'normal'|'angry'|'rage', hits:[{nickname,avatar,damage,crit,q,at}], lastAttack:{q,dmg,at}|null, finisher:{nickname,avatar}|null}`. 새 공격(at)마다 학생 캐릭터 아이콘이 날아가 맞고 피해 숫자(치명타는 크게 노랑 "치명타!"), 보스 움찔·흔들림, HP 막대가 줄고 흰 잔상, 화남/분노 단계 외형 변화와 오라, 반격(lastAttack) 시 화면 흔들림·방패 금, 승리 시 보스가 별가루로 사라짐+마지막 일격 친구 호명, 패배 시 보스 웃음. 학생 띠: 보스 HP, 내 누적 피해.
