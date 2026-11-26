'use strict';
/* 반짝퀴즈 퀴즈 런 (반짝 오리지널, mode id 'runner')
   학생: 의사 3D 달리기 트랙. 장애물을 피해 달리다가 문제의 정답 문으로 골인 → send('runAnswer').
   진행자: 실시간 경주판(캐릭터, 점수, 연속 정답, 충돌, 달린 거리, 순위 이동). */
(() => {
  const KQ = window.KQ || (window.KQ = {});
  KQ.arena = KQ.arena || {};
  const kit = () => KQ.modeKit || {};
  const N = v => { const n = Number(v); return Number.isFinite(n) ? n : 0; };
  const clamp = (v, a, b) => Math.min(b, Math.max(a, v));
  const snd = k => { try { if (KQ.sound && KQ.sound.play) KQ.sound.play(k); } catch {} };
  const fx = (k, ...a) => { try { if (KQ.fx && typeof KQ.fx[k] === 'function') KQ.fx[k](...a); } catch {} };
  const nowT = () => { try { return KQ.now ? KQ.now() : Date.now(); } catch { return Date.now(); } };
  const reduced = () => { try { return window.matchMedia('(prefers-reduced-motion: reduce)').matches; } catch { return false; } };
  const SHAPE_COLORS = ['#e21b3c', '#1368ce', '#d89e00', '#26890c'];
  const SHAPE_NAMES = ['세모', '마름모', '동그라미', '네모'];
  const fmt = n => Math.round(N(n)).toLocaleString('ko-KR');

  function H(tag, attrs, ...kids) {
    const K = kit(); if (K.H) return K.H(tag, attrs, ...kids);
    const n = document.createElement(tag);
    for (const [k, v] of Object.entries(attrs || {})) { if (v == null || v === false) continue; if (k === 'class') n.className = v; else if (k === 'text') n.textContent = v; else if (k.startsWith('on')) n.addEventListener(k.slice(2).toLowerCase(), v); else n.setAttribute(k, v); }
    for (const c of kids.flat()) if (c != null && c !== false) n.append(c instanceof Node ? c : document.createTextNode(String(c)));
    return n;
  }
  function prep(root, key, classes, build) {
    const K = kit();
    if (K.prep) return K.prep(root, key, classes, build);
    if (root.__arKey === key) { root.__arSt.first = false; return root.__arSt; }
    root.replaceChildren(); root.classList.add(...classes);
    const st = { first: true, dead: false, timers: new Set(), raf: 0 }; build(st, root); root.__arKey = key; root.__arSt = st; return st;
  }
  function shapeIcon(i, size) {
    try { if (KQ.shapeIcon) { const n = KQ.shapeIcon(i, size); if (n instanceof Node) return n; } } catch {}
    return H('span', { class: 'ar-runner-shp', style: `background:${SHAPE_COLORS[i % 4]};width:${size}px;height:${size}px` });
  }
  function avatarNode(av, size, name) {
    try { if (av && KQ.avatar && KQ.avatar.render) { const n = KQ.avatar.render(av, size); if (n instanceof Node) return n; } } catch {}
    const s = H('span', { class: 'ar-runner-avf', style: `width:${size}px;height:${size}px;font-size:${Math.round(size * 0.48)}px` });
    s.textContent = Array.from(String(name || '?'))[0] || '?'; return s;
  }
  // 캐릭터 SVG → 캔버스용 이미지
  const imgCache = new Map();
  function avatarImage(av, name) {
    const key = JSON.stringify(av || null) + '|' + (name || '');
    if (imgCache.has(key)) return imgCache.get(key);
    const img = new Image(); let ok = false;
    try {
      if (av && KQ.avatar && KQ.avatar.render) {
        const svg = KQ.avatar.render(av, 160);
        const el = svg instanceof SVGElement ? svg : svg.querySelector && svg.querySelector('svg');
        if (el) {
          const c = el.cloneNode(true); c.setAttribute('xmlns', 'http://www.w3.org/2000/svg'); c.setAttribute('width', '160'); c.setAttribute('height', '160');
          img.src = 'data:image/svg+xml;charset=utf-8,' + encodeURIComponent(new XMLSerializer().serializeToString(c)); ok = true;
        }
      }
    } catch { ok = false; }
    const rec = { img, ok, name: String(name || '') };
    imgCache.set(key, rec); return rec;
  }

  // ======================================================================
  // 학생 화면
  // ======================================================================
  const LANE_W = 2.2, CAM_BACK = 5.5, VIEW_D = 95;
  const BASE_SPEED = 9;
  const KEY_ROWS = [['← →', 'A D', '줄 바꾸기'], ['↑', '스페이스', '점프'], ['↓', 'S', '숙이기']];

  // ---------- 맵(테마): 달린 거리 MAP_LEN m 마다 다음 맵, 6개 순환. 진행자 화면도 같은 표로 계산 ----------
  let MAP_LEN = 450; let ORDER = [0, 1, 2, 3, 4, 5]; let cfgKey = '';
  const MAPS = [
    { id: 'meadow', name: '초원', title: '반짝 초원', desc: '점프대를 밟으면 하늘 높이 날아올라 코인을 모아요!', sky: ['#4dabf7', '#d0ebff'], hill: '#69db7c', ground: ['#8ce99a', '#2f9e44'], track: ['#f08c4a', '#e8773a'], curb: ['#ffffff', '#e03131'], line: 'rgba(255,255,255,.75)', chip: '#2f9e44' },
    { id: 'volcano', name: '화산', title: '부글부글 화산 지대!', desc: '하늘에서 용암 돌이 떨어져요. 그림자를 보고 옆으로! 용암 웅덩이는 점프!', sky: ['#1a0505', '#d9480f'], hill: '#3b1f1a', ground: ['#5c2d1f', '#1f0d08'], track: ['#4a3029', '#3d2620'], curb: ['#ff6b00', '#2b1a14'], line: 'rgba(255,140,60,.55)', chip: '#e8590c', boss: { name: '용암 거인 마그마론', title: '화산의 재앙', body: '#5c3d2e', glow: '#ff6b00', eye: '#ffd43b' } },
    { id: 'glacier', name: '빙하', title: '꽁꽁 빙하 지대!', desc: '바닥이 미끄러워 줄을 바꾸면 쭉 미끄러져요. 펭귄은 점프로 넘어요!', sky: ['#1971c2', '#e7f5ff'], hill: '#f8f9fa', ground: ['#e7f5ff', '#a5d8ff'], track: ['#d0ebff', '#bfe0fb'], curb: ['#ffffff', '#4dabf7'], line: 'rgba(25,113,194,.45)', chip: '#1c7ed6' },
    { id: 'jungle', name: '정글', title: '우거진 정글 지대!', desc: '통나무가 좌우로 흔들려요. 덩굴은 숙여서! 바나나 코인을 모아요!', sky: ['#2b8a3e', '#c0eb75'], hill: '#2f9e44', ground: ['#40c057', '#0b4d1a'], track: ['#8d6e63', '#7b5e52'], curb: ['#82c91e', '#3b5b0a'], line: 'rgba(255,255,255,.45)', chip: '#2b8a3e', boss: { name: '정글의 폭군 콩가', title: '잃어버린 사원의 수호자', body: '#4e342e', glow: '#82c91e', eye: '#ff6b6b' } },
    { id: 'desert', name: '사막', title: '뜨거운 사막 지대!', desc: '모래 폭풍이 불면 앞이 잘 안 보여요. 회전초와 선인장을 조심!', sky: ['#f08c00', '#fff3bf'], hill: '#e8b04b', ground: ['#f2c46d', '#c98b2b'], track: ['#e0a458', '#d4924a'], curb: ['#fff3bf', '#b7791f'], line: 'rgba(255,255,255,.6)', chip: '#e67700' },
    { id: 'space', name: '우주', title: '두근두근 우주 지대!', desc: '중력이 약해서 점프가 높고 길어요. 떨어지는 운석의 그림자를 피해요!', sky: ['#05010f', '#3b1f7a'], hill: '#4c2a99', ground: ['#1b1035', '#08040f'], track: ['#3b2a80', '#2d1f66'], curb: ['#22d3ee', '#a855f7'], line: 'rgba(34,211,238,.6)', chip: '#7048e8', boss: { name: '은하 파괴자 제노크', title: '차원의 포식자', body: '#3b1f7a', glow: '#22d3ee', eye: '#ffffff' } }
  ];
  const mapIdxAt = d => Math.max(0, Math.floor(N(d) / MAP_LEN));
  const mapByIdx = i => MAPS[ORDER[((i % ORDER.length) + ORDER.length) % ORDER.length]] || MAPS[0];
  const mapAt = d => mapByIdx(mapIdxAt(d));
  // 게임마다 맵 순서를 섞음: 보스 없는 맵은 1·3·5번째, 보스 맵은 2·4·6번째
  function orderFor(seed) {
    let a = (Number(seed) >>> 0) || 1; const rnd = () => { a = (a + 0x6D2B79F5) >>> 0; let t = a; t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
    const mix = arr => { for (let i = arr.length - 1; i > 0; i--) { const j = Math.floor(rnd() * (i + 1)); [arr[i], arr[j]] = [arr[j], arr[i]]; } return arr; };
    const nb = mix(MAPS.map((m, i) => (m.boss ? -1 : i)).filter(i => i >= 0)), bs = mix(MAPS.map((m, i) => (m.boss ? i : -1)).filter(i => i >= 0));
    const out = []; for (let k = 0; k < Math.max(nb.length, bs.length); k++) { if (k < nb.length) out.push(nb[k]); if (k < bs.length) out.push(bs[k]); }
    return out;
  }
  function applyCfg(view) {
    const s = (view && view.modeState) || {}; const key = (s.mapLen || '') + '|' + (s.mapSeed || '');
    if (key === cfgKey) return; cfgKey = key;
    if (Number(s.mapLen) >= 100) MAP_LEN = Number(s.mapLen);
    if (s.mapSeed) ORDER = orderFor(s.mapSeed);
    if (KQ.arena && KQ.arena.runnerMaps) { KQ.arena.runnerMaps.MAP_LEN = MAP_LEN; KQ.arena.runnerMaps.order = ORDER.slice(); }
  }
  const TABLES = {
    meadow: [['coins', 0.2], ['hurdle', 0.36], ['bar', 0.5], ['block', 0.64], ['spring', 0.78], ['barrel', 0.86], ['power', 0.93], ['skycoins', 1]],
    volcano: [['coins', 0.16], ['rock', 0.42], ['lava', 0.6], ['bar', 0.7], ['block', 0.8], ['power', 0.87], ['hurdle', 1]],
    glacier: [['coins', 0.18], ['bar', 0.36], ['slider', 0.56], ['block', 0.7], ['hurdle', 0.82], ['power', 0.9], ['barrel', 1]],
    jungle: [['coins', 0.24], ['swing', 0.46], ['bar', 0.62], ['hurdle', 0.76], ['block', 0.86], ['power', 0.93], ['barrel', 1]],
    desert: [['coins', 0.2], ['barrel', 0.42], ['block', 0.6], ['hurdle', 0.74], ['bar', 0.84], ['power', 0.92], ['slider', 1]],
    space: [['coins', 0.22], ['rock', 0.46], ['hurdle', 0.6], ['block', 0.72], ['bar', 0.82], ['power', 0.9], ['skycoins', 1]]
  };
  const HIT_MSG = { hurdle: '쿵! 허들은 점프(↑)로 넘어요', bar: '쾅! 위에 걸린 건 숙이기(↓)로 지나가요', barrel: '데굴데굴! 굴러오는 건 점프로 피해요', block: '꽝! 막힌 줄은 옆 줄로 피해요', rock: '쿵! 떨어지는 돌은 그림자를 보고 옆으로!', lava: '앗 뜨거! 용암 웅덩이는 점프(↑)!', swing: '퍽! 흔들리는 통나무는 옆 줄로 피해요', slider: '꽈당! 미끄러지는 펭귄은 점프로 넘어요' };
  function hexA(hex, a) { const h = String(hex || '#888888').replace('#', ''); const n = parseInt(h.length === 3 ? h.split('').map(x => x + x).join('') : h.slice(0, 6), 16); return `rgba(${(n >> 16) & 255},${(n >> 8) & 255},${n & 255},${a})`; }

  function keyGuide(compact) {
    return H('div', { class: 'ar-runner-keys' + (compact ? ' compact' : ''), 'aria-label': '조작 키 안내' },
      H('div', { class: 'ar-runner-keys-title' }, '조작 키'),
      KEY_ROWS.map(([a, b, t]) => H('div', { class: 'ar-runner-key' }, H('kbd', {}, a), H('kbd', { class: 'alt' }, b), H('span', {}, t))),
      H('div', { class: 'ar-runner-keys-touch' }, '휴대폰: 밀기(스와이프) 또는 아래 버튼'));
  }

  function player(root, view, send) {
    applyCfg(view);
    const phase = view && view.phase;
    if (phase === 'running') return playerRun(root, view, send);
    if (phase === 'finished') return playerSummary(root, view);
    return playerIdle(root, view);
  }

  function playerIdle(root, view) {
    prep(root, 'runner-idle', ['ar-runner-pidle'], (st, r) => {
      r.append(H('div', { class: 'ar-runner-idlecard' },
        H('div', { class: 'ar-runner-idle-left' }, H('strong', {}, '퀴즈 런 조작법'), H('span', {}, `장애물을 피해 달리다가 정답 문으로 골인! ${MAP_LEN}m마다 새로운 맵, 2·4·6번째 맵에는 보스도 나타나요!`)),
        H('div', { class: 'ar-runner-idle-keys' }, KEY_ROWS.map(([a, b, t]) => H('span', { class: 'ar-runner-ik' }, H('kbd', {}, a), H('kbd', { class: 'alt' }, b), t)))));
    });
  }

  function playerSummary(root, view) {
    const s = (view.me && view.me.stats) || {};
    const st = prep(root, 'runner-sum', ['ar-runner-psum'], (st, r) => {
      st.box = H('div', { class: 'ar-runner-sumcard' }); r.append(st.box);
    });
    const key = JSON.stringify(s);
    if (st.k === key) return; st.k = key;
    st.box.replaceChildren(H('strong', {}, '나의 퀴즈 런 기록'),
      H('div', { class: 'ar-runner-sumgrid' },
        [['최고 연속', N(s.best) + '번'], ['피한 장애물', N(s.dodges) + '개'], ['충돌', N(s.hits) + '번'], ['코인', N(s.coins) + '개'], ['달린 거리', fmt(s.dist) + 'm']]
          .map(([a, b]) => H('span', {}, H('small', {}, a), H('b', {}, b)))));
  }

  function playerRun(root, view, send) {
    const st = prep(root, 'runner-run', ['ar-runner-p'], (st, r) => buildRun(st, r));
    st.view = view; st.send = send;
    syncView(st, view);
  }

  function buildRun(st, r) {
    st.canvas = H('canvas', { class: 'ar-runner-canvas', 'aria-label': '퀴즈 런 달리기 화면' });
    st.ctx = st.canvas.getContext('2d');
    st.qText = H('div', { class: 'ar-runner-qtext' }, '');
    st.qChoices = H('div', { class: 'ar-runner-qchoices' });
    st.qImg = H('img', { class: 'ar-runner-qimg', alt: '문제 사진 (누르면 크게 보여요)', hidden: true });
    st.qImgBox = H('button', { type: 'button', class: 'ar-runner-qimgbox', 'aria-label': '문제 사진 크게 보기', hidden: true }, st.qImg, H('span', { class: 'ar-runner-qzoom' }, '크게'));
    st.qImgBox.addEventListener('click', () => zoomImg(st));
    st.qBox = H('div', { class: 'ar-runner-q', role: 'status', 'aria-live': 'polite' }, st.qImgBox, H('div', { class: 'ar-runner-qmain' }, st.qText, st.qChoices));
    st.hudScore = H('b', {}, '0'); st.hudSpeed = H('b', {}, '1'); st.hudStreak = H('b', {}, '0'); st.hudCoins = H('b', {}, '0'); st.hudDist = H('b', {}, '0');
    st.speedBar = H('span', { class: 'ar-runner-sbar-fill' });
    st.power = H('div', { class: 'ar-runner-power' });
    st.hud = H('div', { class: 'ar-runner-hud' },
      H('div', { class: 'ar-runner-hrow' }, H('span', { class: 'ar-runner-chip score' }, '점수 ', st.hudScore), H('span', { class: 'ar-runner-chip' }, '연속 ', st.hudStreak), H('span', { class: 'ar-runner-chip coin' }, '코인 ', st.hudCoins), H('span', { class: 'ar-runner-chip' }, st.hudDist, 'm'), (st.hudMap = H('span', { class: 'ar-runner-chip map' }, ''))),
      H('div', { class: 'ar-runner-speed' }, H('span', {}, '속도 ', st.hudSpeed, '단계'), H('span', { class: 'ar-runner-sbar' }, st.speedBar)), st.power);
    st.judge = H('div', { class: 'ar-runner-judge', 'aria-hidden': 'true' });
    st.banner = H('div', { class: 'ar-runner-banner', 'aria-hidden': 'true' });
    st.wait = H('div', { class: 'ar-runner-wait' }, '');
    st.bossName = H('b', {}, ''); st.bossCells = H('span', { class: 'ar-runner-bcells' }); st.bossNote = H('small', {}, '');
    st.bossBar = H('div', { class: 'ar-runner-bossbar', hidden: true, role: 'status' }, st.bossName, st.bossCells, st.bossNote);
    st.mapTitle = H('strong', {}, ''); st.mapDesc = H('span', {}, '');
    st.mapBan = H('div', { class: 'ar-runner-mapban', 'aria-live': 'polite' }, H('small', {}, '새로운 맵'), st.mapTitle, st.mapDesc);
    const btn = (label, cls, fn) => { const b = H('button', { type: 'button', class: 'ar-runner-btn ' + cls, 'aria-label': label }, H('span', { class: 'ar-runner-arrow' }), H('small', {}, label)); b.addEventListener('pointerdown', e => { e.preventDefault(); fn(); }); return b; };
    st.controls = H('div', { class: 'ar-runner-controls' },
      btn('왼쪽', 'left', () => input(st, 'left')), btn('점프', 'up', () => input(st, 'jump')), btn('숙이기', 'down', () => input(st, 'duck')), btn('오른쪽', 'right', () => input(st, 'right')));
    st.topBox = H('div', { class: 'ar-runner-top' }, st.qBox, keyGuide(false));
    st.stage = H('div', { class: 'ar-runner-stage' }, st.canvas, st.topBox, st.hud, st.bossBar, st.wait, st.banner, st.mapBan, st.judge, st.controls);
    r.append(st.stage);
    st.stage.__runner = st;

    // 게임 상태
    Object.assign(st, {
      pz: 0, px: 1, lane: 1, lanes: 4, vy: 0, y: 0, duckUntil: 0, slowUntil: 0, invulnUntil: 0, shieldOn: false, magnetUntil: 0,
      objs: [], spawnZ: 30, gate: null, curQ: null, needNew: false, ansSeq: -1, judging: false, streak: 0, fever: false, tier: 0,
      seg: { hits: 0, dodges: 0, coins: 0, dist: 0 }, totals: { coins: 0, dist: 0 }, seenSeq: null, qCount: 0, last: performance.now(), runT: 0,
      parts: [], shake: 0, flashCol: null, flashUntil: 0, gateFlash: null, laneFx: 0, scoreShown: 0,
      vx: 0, mapIdx: null, mapEnterD: 0, prevMap: null, boss: null, bossCount: 0, bossKills: 0, shots: [], bossHits: [], bossBonus: false, stormOn: false, stormK: 0
    });

    // 키보드
    const onKey = e => {
      if (st.dead) { window.removeEventListener('keydown', onKey); return; }
      const tg = e.target; if (tg && (tg.tagName === 'INPUT' || tg.tagName === 'TEXTAREA' || tg.isContentEditable)) return;
      const k = e.key;
      let a = null;
      if (k === 'ArrowLeft' || k === 'a' || k === 'A') a = 'left';
      else if (k === 'ArrowRight' || k === 'd' || k === 'D') a = 'right';
      else if (k === 'ArrowUp' || k === 'w' || k === 'W' || k === ' ' || k === 'Spacebar') a = 'jump';
      else if (k === 'ArrowDown' || k === 's' || k === 'S') a = 'duck';
      if (!a) return;
      e.preventDefault(); if (!e.repeat || a === 'duck') input(st, a);
    };
    window.addEventListener('keydown', onKey);
    // 스와이프
    let sx = 0, sy = 0, sw = false;
    st.canvas.addEventListener('pointerdown', e => { sx = e.clientX; sy = e.clientY; sw = true; });
    st.canvas.addEventListener('pointerup', e => {
      if (!sw) return; sw = false;
      const dx = e.clientX - sx, dy = e.clientY - sy;
      if (Math.max(Math.abs(dx), Math.abs(dy)) < 24) { input(st, 'jump'); return; }
      if (Math.abs(dx) > Math.abs(dy)) input(st, dx > 0 ? 'right' : 'left'); else input(st, dy < 0 ? 'jump' : 'duck');
    });
    st.canvas.addEventListener('touchmove', e => e.preventDefault(), { passive: false });
    // 크기
    const resize = () => {
      const rc = st.stage.getBoundingClientRect(); const dpr = Math.min(2, window.devicePixelRatio || 1);
      st.W = Math.max(200, rc.width); st.H = Math.max(240, rc.height); st.dpr = dpr;
      st.canvas.width = Math.round(st.W * dpr); st.canvas.height = Math.round(st.H * dpr);
    };
    resize();
    try { st.ro = new ResizeObserver(resize); st.ro.observe(st.stage); } catch { window.addEventListener('resize', resize); }
    const loop = t => {
      if (st.dead) { try { st.ro && st.ro.disconnect(); } catch {} window.removeEventListener('keydown', onKey); return; }
      try { step(st, t); draw(st, t); hud(st); } catch (e) { if (!st.warned) { st.warned = true; console.warn('[퀴즈 런]', e); } }
      st.raf = requestAnimationFrame(loop);
    };
    st.raf = requestAnimationFrame(loop);
  }

  const curMap = st => mapAt(st.pz + (st.d0 || 0));
  function input(st, a) {
    if (st.dead) return;
    if (a === 'left') { st.lane = clamp(st.lane - 1, 0, st.lanes - 1); snd('whoosh'); }
    else if (a === 'right') { st.lane = clamp(st.lane + 1, 0, st.lanes - 1); snd('whoosh'); }
    else if (a === 'jump') { if (st.y <= 0.001) { st.vy = curMap(st).id === 'space' ? 6.4 : 7.6; st.duckUntil = 0; snd('pop'); } }
    else if (a === 'duck') { st.duckUntil = performance.now() + 750; if (st.y > 0) st.vy = Math.min(st.vy, -9); }
  }

  // ---------- 화면 상태 반영 ----------
  function syncView(st, v) {
    if (st.d0 === undefined) { const s0 = (v.me && v.me.stats) || {}; st.d0 = N(s0.dist); st.mapEnterD = st.d0; st.totals.dist = st.d0; st.totals.coins = N(s0.coins); }
    const q = v.question;
    const fresh = q && !st.judging && (!st.curQ || st.curQ.id !== q.id || (st.needNew && v.result && N(v.result.seq) >= st.ansSeq));
    if (fresh) { st.curQ = q; st.needNew = false; st.qCount++; showQuestion(st, q); }
    if (!q && !st.judging) { st.qText.textContent = '다음 문제를 준비하는 중…'; st.qChoices.replaceChildren(); }
    const r = v.result;
    if (r && r.seq !== undefined && r.seq !== st.seenSeq && st.seenSeq !== null && !st.judging) { applyResult(st, r); }
    if (r && st.seenSeq === null) { st.seenSeq = r.seq; st.streak = N(r.streak); setTier(st); }
    if (st.seenSeq === null && !r) st.seenSeq = -1;
  }

  function zoomImg(st) {
    if (!st.qImg || !st.qImg.src || st.qImgBox.hidden) return;
    const big = H('div', { class: 'ar-runner-zoom', role: 'dialog', 'aria-label': '문제 사진' }, H('img', { src: st.qImg.src, alt: '문제 사진' }), H('span', {}, '잠깐 멈췄어요. 아무 곳이나 누르면 닫히고 다시 달려요'));
    st.zoomed = true;
    const close = () => { big.remove(); st.zoomed = false; };
    big.addEventListener('pointerdown', e => { e.preventDefault(); close(); });
    document.addEventListener('keydown', function k(e) { if (e.key === 'Escape') { close(); document.removeEventListener('keydown', k); } });
    st.stage.append(big);
  }
  function setQImage(st, ref) {
    const token = (st.imgToken = (st.imgToken || 0) + 1);
    st.qImgBox.hidden = true; st.qImg.hidden = true; st.qImg.removeAttribute('src');
    if (!ref || typeof ref !== 'string') return;
    const done = src => { if (st.dead || token !== st.imgToken || !src) return; st.qImg.src = src; st.qImg.hidden = false; st.qImgBox.hidden = false; };
    if (ref.startsWith('kqimg:')) { if (window.KQ && typeof KQ.loadImage === 'function') KQ.loadImage(ref).then(done).catch(() => {}); }
    else if (/^(data:image\/|https:\/\/|\/)/.test(ref)) done(ref);
  }
  function showQuestion(st, q) {
    const choices = Array.isArray(q.choices) ? q.choices : [];
    const n = clamp(choices.length || N(q.choiceCount) || 2, 2, 4);
    st.lanes = n; st.lane = clamp(st.lane, 0, n - 1);
    st.qText.textContent = q.text || '큰 화면의 문제를 보세요';
    setQImage(st, q.image);
    st.qChoices.replaceChildren(...choices.map((c, i) => H('span', { class: 'ar-runner-qc', style: `--c:${SHAPE_COLORS[i]}` }, shapeIcon(i, 18), H('span', {}, (c && c.text) || SHAPE_NAMES[i]))));
    st.qBox.classList.remove('pop'); void st.qBox.offsetWidth; st.qBox.classList.add('pop');
    // 문 배치
    const sp = speedNow(st, performance.now());
    const read = clamp(6 + String(q.text || '').length * 0.09 + choices.reduce((a, c) => a + String((c && c.text) || '').length, 0) * 0.05, 7, 14) + (q.image ? 5 : 0);
    const gz = st.pz + Math.max(60, sp * read);
    st.objs = st.objs.filter(o => o.z < gz - 14 || o.z > gz + 10);
    st.gate = { z: gz, qid: q.id, n, choices: choices.map((c, i) => (c && c.text) || SHAPE_NAMES[i]), passed: false };
    st.spawnZ = Math.min(st.spawnZ, gz - 14);
    snd('sparkle');
  }

  function speedNow(st, t) {
    let s = BASE_SPEED * (1 + 0.1 * st.tier) * (st.fever ? 1.12 : 1);
    if (t < st.slowUntil) s *= 0.5;
    if (!st.gate && !st.judging && !st.curQ) s *= 0.85;
    return s;
  }
  function setTier(st) { st.tier = clamp(st.streak, 0, 5); st.fever = st.streak >= 5; }

  // ---------- 물체 생성 ----------
  function spawnUntil(st) {
    const limit = st.gate ? st.gate.z - 14 : st.pz + VIEW_D;
    const diff = Math.min(1, st.qCount / 10);
    const d0 = st.d0 || 0;
    while (st.spawnZ < Math.min(limit, st.pz + VIEW_D)) {
      const z = st.spawnZ; const n = st.lanes;
      const into = ((z + d0) % MAP_LEN + MAP_LEN) % MAP_LEN;
      if (into < 10 || into > MAP_LEN - 8) { st.spawnZ += 6; continue; } // 맵 문(포털) 근처는 비움
      const map = mapAt(z + d0).id;
      const roll = Math.random(); let kind = 'coins';
      for (const [k, p] of TABLES[map]) if (roll < p) { kind = k; break; }
      const lane = Math.floor(Math.random() * n);
      const push = o => st.objs.push(Object.assign({ map, lane, z }, o));
      if (kind === 'coins') { const ln = Math.floor(Math.random() * n); for (let k = 0; k < 5; k++) push({ type: 'coin', lane: ln, z: z + k * 1.6, h: 0.8 }); }
      else if (kind === 'hurdle') push({ type: 'hurdle' });
      else if (kind === 'bar') push({ type: 'bar' });
      else if (kind === 'block') {
        push({ type: 'block' });
        if (diff > 0.4 && n >= 3 && Math.random() < diff * 0.6) { const l2 = (lane + 1 + Math.floor(Math.random() * (n - 1))) % n; push({ type: 'block', lane: l2 }); }
        push({ type: 'coin', lane: (lane + 1) % n, h: 0.8 });
      } else if (kind === 'barrel') push({ type: 'barrel', z: z + 18, roll: 4 + 2 * diff, drift: map === 'desert' ? (Math.random() < 0.5 ? -1 : 1) * (0.5 + Math.random() * 0.7) : 0 });
      else if (kind === 'power') push({ type: Math.random() < 0.5 ? 'shield' : 'magnet', h: 1 });
      else if (kind === 'skycoins') { const hh = map === 'space' ? 2.6 : 1.6; for (let k = 0; k < 4; k++) push({ type: 'coin', lane: k % n, z: z + k * 1.4, h: hh }); }
      else if (kind === 'spring') { push({ type: 'spring' }); for (let k = 0; k < 6; k++) push({ type: 'coin', z: z + 3 + k * 1.5, h: 2.4 + Math.sin(k / 5 * Math.PI) * 1.2 }); }
      else if (kind === 'rock') push({ type: 'rock', fallH: 12 });
      else if (kind === 'lava') push({ type: 'lava' });
      else if (kind === 'slider') push({ type: 'slider', lane: Math.random() * (n - 1), v: (Math.random() < 0.5 ? -1 : 1) * (1.1 + diff * 0.9) });
      else if (kind === 'swing') push({ type: 'swing', c: (n - 1) / 2, a: (n - 1) / 2 + 0.2, w: 1.5 + Math.random() * 0.7, ph: Math.random() * 6.283 });
      st.spawnZ += clamp(15 - diff * 5, 9, 16) * (0.8 + Math.random() * 0.5);
    }
  }

  // ---------- 맵 전환, 모래 폭풍, 보스 ----------
  function showMap(st, M) {
    st.mapTitle.textContent = M.title; st.mapDesc.textContent = M.desc;
    st.mapBan.style.setProperty('--mc', M.chip);
    st.mapBan.classList.remove('show'); void st.mapBan.offsetWidth; st.mapBan.classList.add('show');
    clearTimeout(st.mapBanT); st.mapBanT = setTimeout(() => { if (!st.dead) st.mapBan.classList.remove('show'); }, 2800);
  }
  function mapTick(st, t, dt) {
    const d = st.pz + (st.d0 || 0); const mi = mapIdxAt(d); const M = mapByIdx(mi);
    if (st.mapIdx === null) { st.mapIdx = mi; st.mapEnterD = d - (d % MAP_LEN); if (mi > 0) showMap(st, M); if (M.boss) startBoss(st, M, t); }
    else if (mi !== st.mapIdx) {
      const old = st.boss && !st.boss.dead && !st.boss.leaving ? st.boss : null;
      st.prevMap = mapByIdx(st.mapIdx); st.mapIdx = mi; st.mapEnterD = mi * MAP_LEN;
      if (old) { old.leaving = t; showBanner(st, `${old.name}이 도망갔어요! 다음 보스는 꼭 잡아요`, 'bad'); }
      showMap(st, M); snd('levelup'); fx('flash', M.chip, 220);
      if (M.boss) startBoss(st, M, t);
    }
    const storm = M.id === 'desert' && (st.runT % 15) > 8.5;
    if (storm && !st.stormOn) { showBanner(st, '모래 폭풍! 앞이 잘 안 보여요. 조심!', 'gold'); snd('whoosh'); }
    st.stormOn = storm; st.stormK = clamp(st.stormK + (storm ? dt : -dt) * 1.4, 0, 1);
    const b = st.boss;
    if (b) {
      if (b.leaving && t - b.leaving > 1500) st.boss = null;
      else if (b.dead && t - b.deadAt > 1900) st.boss = null;
      else if (!b.dead && !b.leaving && t > b.nextThrow && t - b.t0 > 3000) { b.nextThrow = t + 4200 + Math.random() * 2600; throwRock(st); }
    }
    st.shots = st.shots.filter(s => t - s.t0 < 520);
    st.bossHits = st.bossHits.filter(h => t - h.t < 1000);
  }
  function startBoss(st, M, t) {
    st.bossCount++;
    const max = Math.min(14, Math.round(Math.min(8, 3 + st.bossCount) * Math.max(1, MAP_LEN / 450)));
    st.boss = { name: (st.bossCount > 3 ? '분노한 ' : '') + M.boss.name, look: M.id, theme: M.boss, enraged: st.bossCount > 3, hp: max, max, t0: t, nextThrow: t + 4500, hitUntil: 0, laughUntil: 0, dead: false, deadAt: 0, leaving: 0 };
    setTimeout(() => { if (!st.dead && st.boss && st.boss.name === M.boss.name) { showBanner(st, `보스 출현 · ${M.boss.title || M.boss.name} — ${M.boss.name}`, 'red'); snd('boom'); } }, 2700);
  }
  function throwRock(st) {
    const b = st.boss; if (!b) return;
    const z = st.pz + 30 + Math.random() * 6;
    if (st.gate && Math.abs(z - st.gate.z) < 14) return;
    const lane = clamp(Math.round(st.px) + (Math.random() < 0.55 ? 0 : (Math.random() < 0.5 ? -1 : 1)), 0, st.lanes - 1);
    st.objs.push({ type: 'rock', lane, z, map: b.look, fallH: 10, thrown: true });
    b.throwAt = performance.now(); snd('whoosh');
  }
  function bossAttack(st) {
    const b = st.boss; const dmg = st.fever ? 3 : st.streak >= 3 ? 2 : 1; const t0 = performance.now();
    st.shots.push({ t0, dmg });
    setTimeout(() => {
      if (st.dead || st.boss !== b || b.dead || b.leaving) return;
      b.hp = Math.max(0, b.hp - dmg); b.hitUntil = performance.now() + 380; st.shake = Math.max(st.shake, 0.25); snd('boom');
      st.bossHits.push({ t: performance.now(), dmg });
      if (b.hp > 0) return;
      b.dead = true; b.deadAt = performance.now(); st.bossBonus = true; st.bossKills++;
      showBanner(st, `${b.name} 격파! 다음 골인 때 보너스 +200점`, 'gold');
      snd('cheer'); fx('confetti', { y: 0.35, count: 160, power: 1.1, spread: 100 }); fx('flash', '#ffffff', 260);
      const bp = st.bossPos || { x: st.W / 2, y: st.H * 0.35 };
      if (!reduced()) for (let i = 0; i < 46; i++) st.parts.push({ x: bp.x, y: bp.y, vx: (Math.random() - 0.5) * 800, vy: -Math.random() * 520, life: 1.2, col: i % 2 ? b.theme.glow : '#ffd43b', r: 4 + Math.random() * 4 });
    }, 450);
  }

  // ---------- 진행 ----------
  function step(st, t) {
    if (st.zoomed) { st.last = t; return; }
    const dt = Math.min(0.05, Math.max(0, (t - st.last) / 1000)); st.last = t; st.runT += dt;
    const sp = speedNow(st, t);
    const dz = sp * dt; st.pz += dz; st.seg.dist += dz; st.totals.dist += dz;
    // 좌우, 점프
    const M = curMap(st);
    if (M.id === 'glacier') { st.vx += ((st.lane - st.px) * 26 - st.vx * 4.2) * dt; st.px = clamp(st.px + st.vx * dt, -0.35, st.lanes - 0.65); }
    else { st.vx = 0; st.px += clamp(st.lane - st.px, -dt * 9, dt * 9); }
    mapTick(st, t, dt);
    if (st.y > 0 || st.vy > 0) { st.vy -= (M.id === 'space' ? 9 : 22) * dt; st.y = Math.max(0, st.y + st.vy * dt); if (st.y === 0) st.vy = 0; }
    spawnUntil(st);
    const ducking = t < st.duckUntil && st.y < 0.15;
    const myLane = Math.round(st.px);
    const magnet = t < st.magnetUntil;
    for (const o of st.objs) {
      if (o.type === 'barrel') o.z -= o.roll * dt;
      if (o.type === 'swing') o.lane = clamp(o.c + o.a * Math.sin(st.runT * o.w + o.ph), 0, st.lanes - 1);
      if (o.type === 'slider' || (o.type === 'barrel' && o.drift)) { const k = o.type === 'slider' ? 'v' : 'drift'; o.lane += o[k] * dt; if (o.lane < 0) { o.lane = 0; o[k] = Math.abs(o[k]); } if (o.lane > st.lanes - 1) { o.lane = st.lanes - 1; o[k] = -Math.abs(o[k]); } }
      if (o.type === 'coin' && magnet && !o.got && o.z - st.pz < 14 && o.z - st.pz > 0) o.lane += clamp(st.px - o.lane, -dt * 4, dt * 4);
      if (o.done || o.z > st.pz + 0.2) continue;
      o.done = true;
      const same = Math.abs(o.lane - st.px) < 0.55;
      if (o.type === 'coin' || o.type === 'shield' || o.type === 'magnet') {
        const hgt = o.h || 0.8; const reach = st.y + (ducking ? 0.9 : 1.8);
        if ((same || (magnet && o.type === 'coin' && Math.abs(o.lane - st.px) < 1.6)) && reach >= hgt - 0.2 && st.y <= hgt + 0.6) {
          o.got = true;
          if (o.type === 'coin') { st.seg.coins++; st.totals.coins++; snd('coin'); burst(st, 'coin'); }
          else if (o.type === 'shield') { st.shieldOn = true; snd('levelup'); showBanner(st, '방패 획득! 한 번 부딪혀도 괜찮아요', 'blue'); }
          else { st.magnetUntil = t + 8000; snd('levelup'); showBanner(st, '자석 획득! 8초 동안 코인이 끌려와요', 'red'); }
        }
        continue;
      }
      if (o.type === 'spring') { if (same && st.y < 0.3) { st.vy = M.id === 'space' ? 8 : 11.5; st.duckUntil = 0; o.ok = true; snd('levelup'); showBanner(st, '점프대! 하늘의 코인을 모아요', 'gold'); burst(st, 'dodge'); } continue; }
      if (!same) { if (Math.abs(o.lane - st.px) < 1.5) st.seg.dodges++; continue; }
      let hit = false;
      if (o.type === 'hurdle' || o.type === 'barrel') hit = st.y < (o.type === 'barrel' ? 0.75 : 0.55);
      else if (o.type === 'bar') hit = !ducking || st.y > 0.15;
      else if (o.type === 'block' || o.type === 'rock' || o.type === 'swing') hit = true;
      else if (o.type === 'lava') hit = st.y < 0.3;
      else if (o.type === 'slider') hit = st.y < 0.6;
      if (!hit) { st.seg.dodges++; o.ok = true; burst(st, 'dodge'); continue; }
      if (t < st.invulnUntil) continue;
      if (st.shieldOn) { st.shieldOn = false; st.invulnUntil = t + 900; snd('sparkle'); showBanner(st, '방패가 막아 줬어요!', 'blue'); o.smash = t; continue; }
      st.seg.hits++; st.slowUntil = t + 1200; st.invulnUntil = t + 1400; st.shake = 0.35; o.smash = t;
      snd('boom'); try { if (navigator.vibrate) navigator.vibrate(120); } catch {}
      floatText(st, '-20', '#ff6b6b');
      showBanner(st, HIT_MSG[o.type] || HIT_MSG.block, 'bad');
    }
    st.objs = st.objs.filter(o => o.z > st.pz - 6 && !(o.got));
    // 정답 문
    const g = st.gate;
    if (g && !g.passed && st.pz >= g.z) {
      g.passed = true; g.lane = clamp(Math.round(st.px), 0, g.n - 1);
      submitGate(st, g);
    }
    if (g && g.passed && st.pz > g.z + 8 && !st.judging) st.gate = null;
    st.shake = Math.max(0, st.shake - dt);
    for (const p of st.parts) { p.x += p.vx * dt; p.y += p.vy * dt; p.vy += 600 * dt; p.life -= dt; }
    st.parts = st.parts.filter(p => p.life > 0);
  }

  function submitGate(st, g) {
    const q = st.curQ; if (!q || q.id !== g.qid) return;
    st.judging = true;
    st.wait.textContent = '판정 중…'; st.wait.classList.add('on');
    const meta = { hits: st.seg.hits, dodges: st.seg.dodges, coins: st.seg.coins, dist: Math.round(st.seg.dist) };
    if (st.bossBonus) { meta.boss = 1; st.bossBonus = false; }
    st.seg = { hits: 0, dodges: 0, coins: 0, dist: 0 };
    const K = kit(); const send = st.send;
    const p = K.act ? K.act(send, 'runAnswer', { questionId: q.id, answer: g.lane, meta }) : Promise.resolve(send && send('runAnswer', { questionId: q.id, answer: g.lane, meta }));
    Promise.resolve(p).then(r => {
      if (st.dead) return;
      st.judging = false; st.wait.classList.remove('on');
      const res = r && r.result;
      if (res) applyResult(st, res, g); else if (st.view && st.view.result) applyResult(st, st.view.result, g);
      st.needNew = true; st.ansSeq = res ? N(res.seq) : (st.view && st.view.result ? N(st.view.result.seq) : 0);
      if (st.view) syncView(st, st.view);
    }).catch(() => {
      if (meta.boss) st.bossBonus = true;
      if (st.dead) return;
      st.judging = false; st.wait.classList.remove('on'); st.gate = null; st.curQ = null; st.needNew = false;
      if (st.view) syncView(st, st.view);
    });
  }

  function applyResult(st, r, g) {
    if (r.seq === st.seenSeq) return; st.seenSeq = r.seq;
    const before = st.streak;
    st.streak = N(r.streak); setTier(st);
    if (g) g.result = r.correct ? 'ok' : 'bad';
    const bb = st.boss && !st.boss.dead && !st.boss.leaving ? st.boss : null;
    if (bb && r.correct && g) bossAttack(st);
    else if (bb && r.correct === false && g) { bb.laughUntil = performance.now() + 1600; setTimeout(() => { if (!st.dead && st.boss === bb) throwRock(st); }, 500); }
    if (r.correct) {
      st.gateFlash = { col: '#40c057', until: performance.now() + 900 };
      judge(st, st.streak >= 5 && st.streak % 5 === 0 ? '피버 타임!' : '정답 골인!', (N(r.points) >= 0 ? '+' : '') + fmt(r.points), 'good');
      snd('correct'); fx('confetti', { y: 0.55, count: 70 + st.streak * 10, power: 0.8, spread: 70 });
      if (st.streak > before && st.streak >= 2) setTimeout(() => { if (!st.dead) showBanner(st, `연속 ${st.streak}번! 속도 ${st.tier + 1}단계`, 'gold'); }, 700);
      if (st.streak >= 5 && st.streak % 5 === 0) { snd('cheer'); fx('flash', '#ffe066', 260); }
    } else {
      st.gateFlash = { col: '#fa5252', until: performance.now() + 900 };
      const ans = String(r.answerText || '').replace(/^정답:\s*/, '');
      judge(st, '오답이에요', (N(r.points) >= 0 ? '+' : '') + fmt(r.points) + (ans ? `  ·  정답: ${ans}` : ''), 'bad');
      snd('wrong'); st.shake = 0.3; try { if (navigator.vibrate) navigator.vibrate([80, 60, 80]); } catch {}
      if (before >= 2) setTimeout(() => { if (!st.dead) showBanner(st, '속도가 처음으로 돌아갔어요', 'bad'); }, 900);
    }
  }

  function judge(st, big, small, cls) {
    st.judge.replaceChildren(H('strong', {}, big), H('span', {}, small));
    st.judge.className = 'ar-runner-judge show ' + cls;
    clearTimeout(st.judgeT); st.judgeT = setTimeout(() => { if (!st.dead) st.judge.className = 'ar-runner-judge'; }, 1700);
  }
  function showBanner(st, text, cls) {
    st.banner.textContent = text; st.banner.className = 'ar-runner-banner show ' + (cls || '');
    clearTimeout(st.bannerT); st.bannerT = setTimeout(() => { if (!st.dead) st.banner.className = 'ar-runner-banner'; }, 1600);
  }
  function floatText(st, text, col) { st.parts.push({ text, col, x: st.W / 2, y: st.H * 0.62, vx: 0, vy: -160, life: 0.9, big: true }); }
  function burst(st, kind) {
    if (reduced()) return;
    const n = kind === 'coin' ? 6 : 4;
    for (let i = 0; i < n; i++) st.parts.push({ x: st.W / 2 + (Math.random() - 0.5) * 30, y: st.H * 0.7, vx: (Math.random() - 0.5) * 220, vy: -200 - Math.random() * 160, life: 0.6, col: kind === 'coin' ? '#ffd43b' : '#a5d8ff', r: 4 });
  }

  // ---------- 그리기 ----------
  function cam(st) {
    const W = st.W, Hh = st.H, n = st.lanes;
    const ctrl = st.controls ? st.controls.offsetHeight + 18 : 90;
    const feetY = Math.min(Hh * 0.86, Hh - ctrl - 10);
    const topH = st.topBox ? st.topBox.offsetHeight + 8 : 0;
    const horizon = Math.max(Hh * 0.3, Math.min(Hh * 0.42, topH + 30));
    const s0 = Math.min((W * 0.92) / (n * LANE_W + 0.8), (feetY - horizon) / 2.2);
    const camH = (feetY - horizon) / s0;
    const F = s0 * CAM_BACK;
    const camX = (st.px - (n - 1) / 2) * LANE_W * 0.35;
    return { W, H: Hh, n, horizon, F, camH, camX, s0, feetY };
  }
  function proj(c, wx, dz, h) { // dz: 플레이어 기준 앞 거리
    const d = dz + CAM_BACK; if (d < 0.6) return null;
    const s = c.F / d;
    return { x: c.W / 2 + (wx - c.camX) * s, y: c.horizon + (c.camH - (h || 0)) * s, s };
  }
  const laneX = (c, l) => (l - (c.n - 1) / 2) * LANE_W;

  function draw(st, t) {
    const ctx = st.ctx; if (!ctx) return;
    const c = cam(st); const dpr = st.dpr || 1;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    let sx = 0, sy = 0; if (st.shake > 0 && !reduced()) { sx = (Math.random() - 0.5) * 14 * st.shake; sy = (Math.random() - 0.5) * 10 * st.shake; }
    ctx.save(); ctx.translate(sx, sy);
    // 하늘·배경 (맵이 바뀌면 30m 동안 이전 맵에서 서서히 바뀜)
    const fever = st.fever;
    const Mc = curMap(st); const into = st.pz + (st.d0 || 0) - st.mapEnterD;
    if (st.prevMap && into < 30) { drawBack(st, c, st.prevMap, t); ctx.globalAlpha = clamp(into / 30, 0, 1); drawBack(st, c, Mc, t); ctx.globalAlpha = 1; }
    else drawBack(st, c, Mc, t);
    if (fever) { const hu = (t / 20) % 360; const fs2 = ctx.createLinearGradient(0, 0, 0, c.horizon); fs2.addColorStop(0, `hsla(${hu},80%,55%,.35)`); fs2.addColorStop(1, `hsla(${(hu + 60) % 360},90%,75%,.2)`); ctx.fillStyle = fs2; ctx.fillRect(-20, -20, c.W + 40, c.horizon + 2); }
    // 트랙 띠
    const half = (c.n * LANE_W) / 2 + 0.5;
    const z0 = Math.floor((st.pz - 4) / 4) * 4;
    for (let z = z0 + VIEW_D; z >= z0; z -= 4) {
      const a = proj(c, -half, z - st.pz, 0), b = proj(c, half, z - st.pz, 0), a2 = proj(c, -half, z + 4 - st.pz, 0), b2 = proj(c, half, z + 4 - st.pz, 0);
      if (!a || !a2) continue;
      const Ms = mapAt(z + (st.d0 || 0));
      ctx.fillStyle = Ms.track[(z / 4) & 1];
      ctx.beginPath(); ctx.moveTo(a.x, a.y); ctx.lineTo(b.x, b.y); ctx.lineTo(b2.x, b2.y); ctx.lineTo(a2.x, a2.y); ctx.closePath(); ctx.fill();
      trackFx(st, c, Ms, z, a, b, a2, b2, t);
      // 연석 (피버 때는 무지개)
      ctx.fillStyle = fever ? `hsl(${(t / 4 + z * 9) % 360},90%,60%)` : Ms.curb[(z / 4) & 1];
      const k1 = proj(c, -half - 0.35, z - st.pz, 0), k2 = proj(c, -half - 0.35, z + 4 - st.pz, 0), m1 = proj(c, half + 0.35, z - st.pz, 0), m2 = proj(c, half + 0.35, z + 4 - st.pz, 0);
      ctx.beginPath(); ctx.moveTo(k1.x, k1.y); ctx.lineTo(a.x, a.y); ctx.lineTo(a2.x, a2.y); ctx.lineTo(k2.x, k2.y); ctx.fill();
      ctx.beginPath(); ctx.moveTo(b.x, b.y); ctx.lineTo(m1.x, m1.y); ctx.lineTo(m2.x, m2.y); ctx.lineTo(b2.x, b2.y); ctx.fill();
      // 줄 표시
      if (((z / 4) & 1) === 0) {
        ctx.strokeStyle = Ms.line;
        for (let l = 1; l < c.n; l++) { const lx = laneX(c, l) - LANE_W / 2; const p1 = proj(c, lx, z - st.pz, 0), p2 = proj(c, lx, z + 2 - st.pz, 0); ctx.lineWidth = Math.max(1, 0.12 * p1.s); ctx.beginPath(); ctx.moveTo(p1.x, p1.y); ctx.lineTo(p2.x, p2.y); ctx.stroke(); }
      }
      // 옆 깃발
      if (z % 12 === 0) for (const side of [-1, 1]) { const p = proj(c, side * (half + 1.4), z - st.pz, 0); if (p) decor(ctx, p, Ms, z, side, t); }
    }
    drawBoss(st, c, t);
    // 물체 (멀리부터)
    const list = st.objs.filter(o => o.z - st.pz > -CAM_BACK + 0.8 && o.z - st.pz < VIEW_D).sort((a, b) => b.z - a.z);
    let playerDrawn = false;
    const gate = st.gate && !st.gate.passedFar ? st.gate : null;
    const items = list.map(o => ({ z: o.z, o }));
    if (gate) items.push({ z: gate.z, gate });
    if (st.mapIdx !== null) { const B = (st.mapIdx + 1) * MAP_LEN - (st.d0 || 0); if (B - st.pz < VIEW_D && B - st.pz > -CAM_BACK + 0.8) items.push({ z: B, portal: mapByIdx(st.mapIdx + 1) }); }
    items.sort((a, b) => b.z - a.z);
    for (const it of items) {
      if (!playerDrawn && it.z < st.pz) { drawPlayer(st, c, t); playerDrawn = true; }
      if (it.gate) drawGate(st, c, it.gate, t); else if (it.portal) drawPortal(st, c, it.z, it.portal, t); else drawObj(st, c, it.o, t);
    }
    if (!playerDrawn) drawPlayer(st, c, t);
    ambient(st, c, Mc, t);
    drawShots(st, c, t);
    if (st.stormK > 0) storm(st, c, t);
    // 입자
    for (const p of st.parts) {
      ctx.globalAlpha = clamp(p.life / 0.6, 0, 1);
      if (p.text) { ctx.font = '900 34px system-ui, sans-serif'; ctx.textAlign = 'center'; ctx.lineWidth = 5; ctx.strokeStyle = '#000'; ctx.strokeText(p.text, p.x, p.y); ctx.fillStyle = p.col; ctx.fillText(p.text, p.x, p.y); }
      else { ctx.fillStyle = p.col; ctx.beginPath(); ctx.arc(p.x, p.y, p.r, 0, 6.283); ctx.fill(); }
      ctx.globalAlpha = 1;
    }
    // 속도선
    if ((st.tier >= 3 || fever) && !reduced()) {
      ctx.strokeStyle = fever ? 'rgba(255,255,255,.55)' : 'rgba(255,255,255,.3)'; ctx.lineWidth = 2;
      for (let i = 0; i < (fever ? 14 : 7); i++) { const a = (i * 2.4 + t / 90) % 6.283; const r1 = c.W * 0.35 + ((t / 3 + i * 97) % 120); ctx.beginPath(); ctx.moveTo(c.W / 2 + Math.cos(a) * r1, c.H * 0.5 + Math.sin(a) * r1 * 0.6); ctx.lineTo(c.W / 2 + Math.cos(a) * (r1 + 60), c.H * 0.5 + Math.sin(a) * (r1 + 60) * 0.6); ctx.stroke(); }
    }
    if (t < st.slowUntil) { ctx.fillStyle = 'rgba(255,0,0,' + (0.12 + 0.08 * Math.sin(t / 60)) + ')'; ctx.fillRect(0, 0, c.W, c.H); }
    ctx.restore();
  }
  // ---------- 맵별 배경 ----------
  function drawBack(st, c, M, t) {
    const ctx = st.ctx; const W = c.W, hz = c.horizon; const pz = st.pz;
    const sky = ctx.createLinearGradient(0, 0, 0, hz); sky.addColorStop(0, M.sky[0]); sky.addColorStop(1, M.sky[1]);
    ctx.fillStyle = sky; ctx.fillRect(-20, -20, W + 40, hz + 22);
    const id = M.id;
    if (id === 'meadow') { ctx.fillStyle = 'rgba(255,255,255,.85)'; for (let i = 0; i < 5; i++) { const x = ((i * 260 - pz * 2) % (W + 300) + W + 300) % (W + 300) - 150; cloud(ctx, x, hz * (0.25 + (i % 3) * 0.18), 26 + (i % 2) * 12); } }
    else if (id === 'volcano') {
      const vx = W * 0.68 - (pz * 0.3) % (W * 0.2), top = hz * 0.34, bw = W * 0.34;
      ctx.fillStyle = 'rgba(60,40,40,.55)'; for (let i = 0; i < 4; i++) cloud(ctx, vx + Math.sin(t / 900 + i) * 30 + (i - 1.5) * 50, top - 30 - i * 22 - (t / 30 + i * 40) % 60, 30 + i * 6);
      ctx.fillStyle = '#2b1611'; ctx.beginPath(); ctx.moveTo(vx - bw, hz); ctx.lineTo(vx - bw * 0.16, top); ctx.lineTo(vx + bw * 0.16, top); ctx.lineTo(vx + bw, hz); ctx.closePath(); ctx.fill();
      const gl = ctx.createRadialGradient(vx, top, 2, vx, top, bw * 0.4); gl.addColorStop(0, 'rgba(255,170,60,.95)'); gl.addColorStop(1, 'rgba(255,80,0,0)'); ctx.fillStyle = gl; ctx.beginPath(); ctx.arc(vx, top, bw * 0.4, 0, 6.283); ctx.fill();
      ctx.strokeStyle = '#ff6b00'; ctx.lineWidth = 3; ctx.beginPath(); ctx.moveTo(vx - bw * 0.05, top + 4); ctx.lineTo(vx - bw * 0.12, top + hz * 0.18); ctx.lineTo(vx - bw * 0.08, top + hz * 0.3); ctx.stroke();
      if (!reduced()) for (let i = 0; i < 14; i++) { const ph = ((t / 1000) * 0.55 + i * 0.137) % 1; const dir = Math.sin(i * 7.3); const x = vx + dir * bw * 0.5 * ph; const y = top - Math.sin(ph * Math.PI) * hz * 0.32 + ph * hz * 0.1; ctx.fillStyle = `rgba(255,${120 + (i % 3) * 40},0,${1 - ph})`; ctx.beginPath(); ctx.arc(x, y, 3 + (i % 3) * 2.5, 0, 6.283); ctx.fill(); }
    } else if (id === 'glacier') {
      for (let i = 0; i < 6; i++) { const x = ((i * 230 - pz * 0.6) % (W + 260) + W + 260) % (W + 260) - 130; const h = hz * (0.35 + (i % 3) * 0.12); ctx.fillStyle = '#f8f9fa'; ctx.beginPath(); ctx.moveTo(x - 120, hz); ctx.lineTo(x, hz - h); ctx.lineTo(x + 120, hz); ctx.fill(); ctx.fillStyle = '#a5d8ff'; ctx.beginPath(); ctx.moveTo(x, hz - h); ctx.lineTo(x + 120, hz); ctx.lineTo(x + 25, hz); ctx.fill(); }
    } else if (id === 'jungle') {
      for (let layer = 0; layer < 2; layer++) { ctx.fillStyle = layer ? '#237032' : '#1b5e20'; for (let x = -60; x < W + 80; x += 46) { const xx = x - ((pz * (layer ? 1.2 : 0.6)) % 46); ctx.beginPath(); ctx.arc(xx, hz - 20 - layer * 10 - 14 * Math.sin(x * 0.07 + layer), 34 + 10 * Math.sin(x * 0.13), 0, 6.283); ctx.fill(); } }
      ctx.strokeStyle = 'rgba(30,90,30,.8)'; ctx.lineWidth = 3; for (let i = 0; i < 7; i++) { const x = ((i * 170 - pz * 1.5) % (W + 200) + W + 200) % (W + 200) - 100; ctx.beginPath(); ctx.moveTo(x, -5); ctx.quadraticCurveTo(x + 12 * Math.sin(t / 700 + i), hz * 0.25, x, hz * (0.25 + (i % 3) * 0.1)); ctx.stroke(); }
    } else if (id === 'desert') {
      const sx = W * 0.8, sy = hz * 0.3; const sg = ctx.createRadialGradient(sx, sy, 10, sx, sy, 90); sg.addColorStop(0, 'rgba(255,255,220,1)'); sg.addColorStop(0.35, 'rgba(255,230,120,.9)'); sg.addColorStop(1, 'rgba(255,200,80,0)'); ctx.fillStyle = sg; ctx.beginPath(); ctx.arc(sx, sy, 90, 0, 6.283); ctx.fill();
      const px = W * 0.25 - (pz * 0.25) % (W * 0.3); ctx.fillStyle = '#d4a04a'; ctx.beginPath(); ctx.moveTo(px - 70, hz); ctx.lineTo(px, hz - 80); ctx.lineTo(px + 70, hz); ctx.fill(); ctx.fillStyle = '#b8862f'; ctx.beginPath(); ctx.moveTo(px, hz - 80); ctx.lineTo(px + 70, hz); ctx.lineTo(px + 18, hz); ctx.fill();
    } else if (id === 'space') {
      for (let i = 0; i < 70; i++) { const x = (i * 97.3 + 13) % W, y = (i * 53.7) % hz; ctx.fillStyle = `rgba(255,255,255,${0.35 + 0.6 * Math.abs(Math.sin(t / 600 + i))})`; ctx.fillRect(x, y, 1.6 + (i % 3), 1.6 + (i % 3)); }
      const nb = ctx.createRadialGradient(W * 0.3, hz * 0.4, 5, W * 0.3, hz * 0.4, W * 0.3); nb.addColorStop(0, 'rgba(236,72,153,.35)'); nb.addColorStop(1, 'rgba(236,72,153,0)'); ctx.fillStyle = nb; ctx.fillRect(0, 0, W, hz);
      const plx = W * 0.78, ply = hz * 0.38, pr = Math.min(70, hz * 0.22); ctx.fillStyle = '#f783ac'; ctx.beginPath(); ctx.arc(plx, ply, pr, 0, 6.283); ctx.fill(); ctx.strokeStyle = '#ffd43b'; ctx.lineWidth = 5; ctx.beginPath(); ctx.ellipse(plx, ply, pr * 1.7, pr * 0.4, -0.3, 0, 6.283); ctx.stroke();
    }
    ctx.fillStyle = M.hill;
    ctx.beginPath(); ctx.moveTo(0, hz);
    for (let x = 0; x <= W; x += 20) ctx.lineTo(x, hz - (id === 'desert' ? 12 + 12 * Math.sin(x / 140 + pz * 0.005) : 18 + 14 * Math.sin(x / 70 + pz * 0.01) + 8 * Math.sin(x / 23)));
    ctx.lineTo(W, hz); ctx.closePath(); ctx.fill();
    const gr = ctx.createLinearGradient(0, hz, 0, c.H); gr.addColorStop(0, M.ground[0]); gr.addColorStop(1, M.ground[1]);
    ctx.fillStyle = gr; ctx.fillRect(-20, hz, W + 40, c.H - hz + 20);
  }
  function trackFx(st, c, M, z, a, b, a2, b2, t) {
    const ctx = st.ctx; const k = (z / 4) | 0;
    if (M.id === 'volcano' && k % 4 === 1) { ctx.strokeStyle = `rgba(255,${110 + 60 * Math.sin(t / 200 + k)},0,.85)`; ctx.lineWidth = Math.max(1, (a.s || 1) * 0.08); ctx.beginPath(); ctx.moveTo(a.x + (b.x - a.x) * 0.2, (a.y + a2.y) / 2); ctx.lineTo(a.x + (b.x - a.x) * 0.45, (a.y * 0.3 + a2.y * 0.7)); ctx.lineTo(a.x + (b.x - a.x) * 0.7, (a.y + a2.y) / 2); ctx.stroke(); }
    else if (M.id === 'glacier' && k % 3 === 0) { ctx.fillStyle = 'rgba(255,255,255,.45)'; ctx.beginPath(); ctx.moveTo(a.x + (b.x - a.x) * 0.15, a.y); ctx.lineTo(a.x + (b.x - a.x) * 0.3, a.y); ctx.lineTo(a2.x + (b2.x - a2.x) * 0.32, a2.y); ctx.lineTo(a2.x + (b2.x - a2.x) * 0.17, a2.y); ctx.fill(); }
    else if (M.id === 'space') { ctx.strokeStyle = `rgba(34,211,238,${0.5 + 0.4 * Math.sin(t / 250 + k)})`; ctx.lineWidth = 2; ctx.beginPath(); ctx.moveTo(a.x, a.y); ctx.lineTo(a2.x, a2.y); ctx.moveTo(b.x, b.y); ctx.lineTo(b2.x, b2.y); ctx.stroke(); }
  }
  function decor(ctx, p, M, z, side, t) {
    const s = p.s, id = M.id;
    if (id === 'meadow') return flagPost(ctx, p, ['#e21b3c', '#1368ce', '#d89e00', '#26890c'][(z / 12) & 3]);
    if (id === 'volcano') { ctx.fillStyle = '#2b1611'; ctx.beginPath(); ctx.moveTo(p.x - 0.6 * s, p.y); ctx.lineTo(p.x - 0.3 * s, p.y - 2.6 * s); ctx.lineTo(p.x + 0.3 * s, p.y - 2.6 * s); ctx.lineTo(p.x + 0.6 * s, p.y); ctx.fill(); ctx.fillStyle = `rgba(255,${120 + 50 * Math.sin(t / 180 + z)},0,.95)`; ctx.beginPath(); ctx.ellipse(p.x, p.y - 2.6 * s, 0.32 * s, 0.12 * s, 0, 0, 6.283); ctx.fill(); return; }
    if (id === 'glacier') { ctx.fillStyle = 'rgba(208,235,255,.95)'; ctx.strokeStyle = '#74c0fc'; ctx.lineWidth = Math.max(1, 0.06 * s); ctx.beginPath(); ctx.moveTo(p.x - 0.45 * s, p.y); ctx.lineTo(p.x - 0.1 * s, p.y - 2.4 * s); ctx.lineTo(p.x + 0.2 * s, p.y - 1.2 * s); ctx.lineTo(p.x + 0.45 * s, p.y - 1.7 * s); ctx.lineTo(p.x + 0.55 * s, p.y); ctx.closePath(); ctx.fill(); ctx.stroke(); return; }
    if (id === 'jungle') { ctx.strokeStyle = '#6d4c2f'; ctx.lineWidth = Math.max(2, 0.22 * s); ctx.beginPath(); ctx.moveTo(p.x, p.y); ctx.quadraticCurveTo(p.x + side * 0.4 * s, p.y - 1.8 * s, p.x + side * 0.2 * s, p.y - 3.4 * s); ctx.stroke(); ctx.fillStyle = '#2f9e44'; for (let i = 0; i < 5; i++) { const a = -Math.PI / 2 + (i - 2) * 0.6 + Math.sin(t / 600 + z) * 0.08; ctx.beginPath(); ctx.ellipse(p.x + side * 0.2 * s + Math.cos(a) * 0.8 * s, p.y - 3.4 * s + Math.sin(a) * 0.5 * s + 0.3 * s, 0.9 * s, 0.22 * s, a, 0, 6.283); ctx.fill(); } return; }
    if (id === 'desert') { ctx.fillStyle = '#2b8a3e'; rr(ctx, p.x - 0.22 * s, p.y - 2.2 * s, 0.44 * s, 2.2 * s, 0.2 * s); ctx.fill(); rr(ctx, p.x - 0.75 * s, p.y - 1.6 * s, 0.32 * s, 0.9 * s, 0.15 * s); ctx.fill(); rr(ctx, p.x + 0.43 * s, p.y - 1.9 * s, 0.32 * s, 0.8 * s, 0.15 * s); ctx.fill(); ctx.fillRect(p.x - 0.6 * s, p.y - 0.9 * s, 0.5 * s, 0.22 * s); ctx.fillRect(p.x + 0.1 * s, p.y - 1.3 * s, 0.5 * s, 0.22 * s); return; }
    if (id === 'space') { ctx.fillStyle = '#495057'; ctx.fillRect(p.x - 0.07 * s, p.y - 3 * s, 0.14 * s, 3 * s); ctx.fillStyle = (z / 12) & 1 ? '#22d3ee' : '#e64980'; ctx.shadowColor = ctx.fillStyle; ctx.shadowBlur = 12; ctx.beginPath(); ctx.arc(p.x, p.y - 3.1 * s, 0.25 * s, 0, 6.283); ctx.fill(); ctx.shadowBlur = 0; }
  }
  function drawPortal(st, c, z, M, t) {
    const ctx = st.ctx; const dz = z - st.pz; const half = (c.n * LANE_W) / 2 + 0.6;
    const l = proj(c, -half, dz, 0), r = proj(c, half, dz, 0); if (!l || !r) return;
    const s = l.s, H5 = 5.2 * s; const fade = clamp((VIEW_D - dz) / 14, 0, 1); ctx.globalAlpha = fade;
    const swirl = ctx.createRadialGradient((l.x + r.x) / 2, l.y - H5 * 0.5, 4, (l.x + r.x) / 2, l.y - H5 * 0.5, (r.x - l.x) * 0.6);
    swirl.addColorStop(0, hexA(M.chip, 0.05)); swirl.addColorStop(0.7 + 0.1 * Math.sin(t / 300), hexA(M.chip, 0.3)); swirl.addColorStop(1, hexA(M.chip, 0.05));
    ctx.fillStyle = swirl; ctx.fillRect(l.x, l.y - H5, r.x - l.x, H5);
    ctx.fillStyle = M.chip; ctx.fillRect(l.x - 0.25 * s, l.y - H5, 0.5 * s, H5); ctx.fillRect(r.x - 0.25 * s, r.y - H5, 0.5 * s, H5);
    ctx.lineWidth = 0.6 * s; ctx.strokeStyle = M.chip; ctx.beginPath(); ctx.moveTo(l.x, l.y - H5); ctx.quadraticCurveTo((l.x + r.x) / 2, l.y - H5 - 1.6 * s, r.x, r.y - H5); ctx.stroke();
    const fs = clamp(0.62 * s, 10, 40); ctx.font = `900 ${fs}px system-ui, sans-serif`; ctx.textAlign = 'center'; ctx.lineWidth = 5; ctx.strokeStyle = 'rgba(0,0,0,.6)';
    const tx = `${M.name} 지대${M.boss ? ' · ' + M.boss.name : ''}`; ctx.strokeText(tx, (l.x + r.x) / 2, l.y - H5 - 0.5 * s); ctx.fillStyle = '#fff'; ctx.fillText(tx, (l.x + r.x) / 2, l.y - H5 - 0.5 * s);
    ctx.globalAlpha = 1;
  }
  function ambient(st, c, M, t) {
    if (reduced()) return; const ctx = st.ctx;
    if (M.id === 'glacier') { ctx.fillStyle = 'rgba(255,255,255,.85)'; for (let i = 0; i < 50; i++) { const x = ((i * 137.7 + t * 0.02 * (1 + i % 3)) % c.W); const y = ((i * 89.3 + t * 0.06 * (1 + i % 2)) % c.H); ctx.beginPath(); ctx.arc(x, y, 1.5 + (i % 3), 0, 6.283); ctx.fill(); } }
    else if (M.id === 'volcano') { for (let i = 0; i < 26; i++) { const x = ((i * 151.3 - t * 0.015 * (1 + i % 3)) % c.W + c.W) % c.W; const y = c.H - ((i * 71.9 + t * 0.07 * (1 + i % 2)) % c.H); ctx.fillStyle = i % 3 ? 'rgba(255,140,40,.8)' : 'rgba(80,70,70,.7)'; ctx.fillRect(x, y, 2 + (i % 2) * 2, 2 + (i % 2) * 2); } }
  }
  function storm(st, c, t) {
    const ctx = st.ctx; const k = st.stormK;
    const g = ctx.createLinearGradient(0, c.horizon - 40, 0, c.H); g.addColorStop(0, `rgba(214,160,80,${0.8 * k})`); g.addColorStop(0.4, `rgba(214,160,80,${0.5 * k})`); g.addColorStop(1, `rgba(214,160,80,${0.1 * k})`);
    ctx.fillStyle = g; ctx.fillRect(0, 0, c.W, c.H);
    if (!reduced()) { ctx.strokeStyle = `rgba(255,240,200,${0.45 * k})`; ctx.lineWidth = 2; for (let i = 0; i < 30; i++) { const y = (i * 37.3) % c.H; const x = ((i * 211 - t * 0.9 * (1 + i % 3)) % (c.W + 200) + c.W + 200) % (c.W + 200) - 100; ctx.beginPath(); ctx.moveTo(x, y); ctx.lineTo(x + 70, y + 6); ctx.stroke(); } }
  }
  // ---------- 보스 ----------
  function drawBoss(st, c, t) {
    const b = st.boss; if (!b) return; const ctx = st.ctx;
    let enter = clamp((t - b.t0) / 1800, 0, 1), fade = 1, sc = 1, rot = 0;
    if (b.leaving) { const k = clamp((t - b.leaving) / 1500, 0, 1); fade = 1 - k; enter = 1 - k; }
    if (b.dead) { const k = clamp((t - b.deadAt) / 1800, 0, 1); sc = 1 + k * 0.5; fade = 1 - k; rot = k * 1.2; }
    const S = Math.min(c.H * 0.36, c.W * 0.34);
    const cx = c.W * 0.77 + Math.sin(t / 1300) * c.W * 0.04;
    const thrown = b.throwAt && t - b.throwAt < 400;
    let topLim = st.topBox ? st.topBox.offsetTop + st.topBox.offsetHeight : 0;
    for (const el of [st.bossBar, st.hud]) if (el && !el.hidden && el.offsetLeft + el.offsetWidth > cx - S * 0.45) topLim = Math.max(topLim, el.offsetTop + el.offsetHeight);
    const cy = Math.max(c.horizon - S * 0.22, topLim + S * 0.55 + 4) + S * 0.9 * (1 - enter) + Math.sin(t / 380) * S * 0.04 - (thrown ? S * 0.06 : 0);
    st.bossPos = { x: cx, y: cy, S };
    ctx.save(); ctx.globalAlpha = fade; ctx.translate(cx, cy); ctx.rotate(rot); ctx.scale(sc, sc);
    if (t < b.hitUntil && !reduced()) ctx.translate((Math.random() - 0.5) * S * 0.08, (Math.random() - 0.5) * S * 0.04);
    const th = b.theme, lk = b.look;
    const gl = ctx.createRadialGradient(0, 0, S * 0.15, 0, 0, S * 0.85); gl.addColorStop(0, hexA(th.glow, 0.5)); gl.addColorStop(1, hexA(th.glow, 0)); ctx.fillStyle = gl; ctx.beginPath(); ctx.arc(0, 0, S * 0.85, 0, 6.283); ctx.fill();
    const W2 = S * 0.42, H2 = S * 0.46; const arm = Math.sin(t / 260) * S * 0.06;
    if (lk === 'volcano') {
      ctx.fillStyle = th.body; rr(ctx, -W2 - S * 0.2, -H2 * 0.3 + arm, S * 0.22, S * 0.55, S * 0.08); ctx.fill(); rr(ctx, W2 - S * 0.02, -H2 * 0.3 - arm, S * 0.22, S * 0.55, S * 0.08); ctx.fill();
      rr(ctx, -W2, -H2, W2 * 2, H2 * 2, S * 0.12); ctx.fill();
      ctx.strokeStyle = th.glow; ctx.lineWidth = S * 0.025; ctx.shadowColor = th.glow; ctx.shadowBlur = 16; ctx.beginPath(); ctx.moveTo(-W2 * 0.6, -H2); ctx.lineTo(-W2 * 0.3, -H2 * 0.4); ctx.lineTo(-W2 * 0.5, H2 * 0.3); ctx.moveTo(W2 * 0.5, H2); ctx.lineTo(W2 * 0.2, H2 * 0.5); ctx.lineTo(W2 * 0.45, 0); ctx.stroke(); ctx.shadowBlur = 0;
    } else if (lk === 'jungle') {
      ctx.fillStyle = th.body; ctx.beginPath(); ctx.ellipse(-W2 * 1.05, -H2 * 0.45, S * 0.1, S * 0.1, 0, 0, 6.283); ctx.ellipse(W2 * 1.05, -H2 * 0.45, S * 0.1, S * 0.1, 0, 0, 6.283); ctx.fill();
      rr(ctx, -W2 - S * 0.18, -H2 * 0.1 - arm, S * 0.2, S * 0.6, S * 0.1); ctx.fill(); rr(ctx, W2 - S * 0.02, -H2 * 0.1 + arm, S * 0.2, S * 0.6, S * 0.1); ctx.fill();
      ctx.beginPath(); ctx.ellipse(0, 0, W2, H2, 0, 0, 6.283); ctx.fill();
      ctx.fillStyle = '#a1887f'; ctx.beginPath(); ctx.ellipse(0, -H2 * 0.15, W2 * 0.68, H2 * 0.55, 0, 0, 6.283); ctx.fill();
    } else {
      ctx.strokeStyle = th.body; ctx.lineCap = 'round'; ctx.lineWidth = S * 0.09;
      for (let i = 0; i < 6; i++) { const x0 = (i - 2.5) * W2 * 0.33; ctx.beginPath(); ctx.moveTo(x0, H2 * 0.4); ctx.quadraticCurveTo(x0 + Math.sin(t / 300 + i) * S * 0.15, H2 * 1.1, x0 + Math.sin(t / 260 + i * 2) * S * 0.1, H2 * 1.5); ctx.stroke(); }
      ctx.fillStyle = th.body; ctx.beginPath(); ctx.ellipse(0, -H2 * 0.15, W2 * 1.05, H2 * 0.95, 0, 0, 6.283); ctx.fill();
      ctx.fillStyle = hexA('#ffffff', 0.18); for (let i = 0; i < 5; i++) { ctx.beginPath(); ctx.arc(Math.cos(i * 2.1) * W2 * 0.6, -H2 * 0.55 + Math.sin(i * 1.7) * H2 * 0.25, S * 0.04, 0, 6.283); ctx.fill(); }
    }
    // 눈과 입 (화나면 눈썹, 놀리면 크게 웃음)
    const laugh = t < b.laughUntil; const ex = W2 * 0.42, ey = lk === 'space' ? -H2 * 0.2 : -H2 * 0.25, er = S * 0.085;
    ctx.fillStyle = '#fff'; ctx.beginPath(); ctx.arc(-ex, ey, er, 0, 6.283); ctx.arc(ex, ey, er, 0, 6.283); ctx.fill();
    ctx.fillStyle = lk === 'space' ? '#1b1035' : th.eye; ctx.beginPath(); ctx.arc(-ex + er * 0.25, ey + er * 0.1, er * 0.5, 0, 6.283); ctx.arc(ex - er * 0.25, ey + er * 0.1, er * 0.5, 0, 6.283); ctx.fill();
    ctx.strokeStyle = '#1a1a1a'; ctx.lineWidth = S * 0.03; ctx.beginPath(); ctx.moveTo(-ex - er, ey - er * 1.5); ctx.lineTo(-ex + er, ey - er * 0.9); ctx.moveTo(ex + er, ey - er * 1.5); ctx.lineTo(ex - er, ey - er * 0.9); ctx.stroke();
    ctx.fillStyle = '#1a1a1a'; ctx.beginPath(); const my = lk === 'space' ? H2 * 0.25 : H2 * 0.25;
    if (laugh) ctx.ellipse(0, my, W2 * 0.4, H2 * 0.22, 0, 0, 6.283); else ctx.ellipse(0, my, W2 * 0.32, H2 * 0.1, 0, 0, Math.PI);
    ctx.fill(); ctx.fillStyle = '#fff'; for (let i = -2; i <= 2; i++) { ctx.beginPath(); ctx.moveTo(i * W2 * 0.12 - W2 * 0.05, my); ctx.lineTo(i * W2 * 0.12, my + H2 * 0.08); ctx.lineTo(i * W2 * 0.12 + W2 * 0.05, my); ctx.fill(); }
    // 맵 보스마다 알아보기 쉬운 실루엣과 발광 문양 추가
    ctx.save(); ctx.lineJoin='round'; ctx.lineCap='round';
    if (lk === 'volcano') { ctx.fillStyle='#3b1f1a'; ctx.strokeStyle='#ff6b00'; ctx.lineWidth=S*.035; ctx.beginPath(); ctx.moveTo(-W2*.65,-H2*.62);ctx.lineTo(-W2*.48,-H2*1.35);ctx.lineTo(-W2*.12,-H2*.76);ctx.lineTo(W2*.08,-H2*1.48);ctx.lineTo(W2*.28,-H2*.75);ctx.lineTo(W2*.58,-H2*1.25);ctx.lineTo(W2*.7,-H2*.55);ctx.closePath();ctx.fill();ctx.stroke();ctx.strokeStyle='#ffd43b';ctx.lineWidth=S*.028;ctx.beginPath();ctx.moveTo(-W2*.55,-H2*.25);ctx.lineTo(-W2*.18,H2*.35);ctx.lineTo(W2*.1,-H2*.05);ctx.lineTo(W2*.4,H2*.45);ctx.stroke(); }
    else if (lk === 'jungle') { ctx.fillStyle='#8d6e63';ctx.strokeStyle='#ffd43b';ctx.lineWidth=S*.03;ctx.beginPath();ctx.moveTo(-W2*.8,-H2*.55);ctx.lineTo(-W2*.55,-H2*1.05);ctx.lineTo(-W2*.28,-H2*.62);ctx.lineTo(0,-H2*1.2);ctx.lineTo(W2*.25,-H2*.62);ctx.lineTo(W2*.6,-H2*1.05);ctx.lineTo(W2*.8,-H2*.5);ctx.closePath();ctx.fill();ctx.stroke();for(const sx of [-1,1]){ctx.beginPath();ctx.moveTo(sx*W2*.3,H2*.02);ctx.lineTo(sx*W2*.42,H2*.42);ctx.lineTo(sx*W2*.54,H2*.02);ctx.fillStyle='#fff3bf';ctx.fill();}ctx.strokeStyle='#82c91e';ctx.lineWidth=S*.025;ctx.beginPath();ctx.moveTo(-W2*.58,-H2*.4);ctx.lineTo(-W2*.36,H2*.35);ctx.lineTo(-W2*.12,-H2*.25);ctx.moveTo(W2*.58,-H2*.4);ctx.lineTo(W2*.36,H2*.35);ctx.lineTo(W2*.12,-H2*.25);ctx.stroke(); }
    else { ctx.strokeStyle='#22d3ee';ctx.lineWidth=S*.035;ctx.beginPath();ctx.ellipse(0,-H2*.15,W2*1.6,H2*.72,Math.sin(t/700)*.22,0,Math.PI*2);ctx.stroke();ctx.strokeStyle='#a855f7';ctx.lineWidth=S*.022;ctx.beginPath();ctx.ellipse(0,-H2*.15,W2*1.85,H2*.9,-Math.sin(t/900)*.24,0,Math.PI*2);ctx.stroke();for(let j=0;j<4;j++){const a=t/900+j*Math.PI/2;ctx.fillStyle=j%2?'#f783ac':'#22d3ee';ctx.shadowColor=ctx.fillStyle;ctx.shadowBlur=12;ctx.beginPath();ctx.arc(Math.cos(a)*W2*1.6,-H2*.15+Math.sin(a)*H2*.72,S*.055,0,Math.PI*2);ctx.fill();}ctx.shadowBlur=0;ctx.fillStyle='#22d3ee';ctx.font='900 '+(S*.09)+'px system-ui';ctx.textAlign='center';ctx.fillText('X',-W2*.48,-H2*.5);ctx.fillText('X',W2*.48,-H2*.5); }
    ctx.restore();
    if (t < b.hitUntil) { ctx.fillStyle = 'rgba(255,255,255,.55)'; ctx.beginPath(); ctx.ellipse(0, 0, W2 * 1.1, H2 * 1.05, 0, 0, 6.283); ctx.fill(); }
    if (b.dead) { ctx.strokeStyle = '#1a1a1a'; ctx.lineWidth = S * 0.03; for (const sx2 of [-ex, ex]) { ctx.beginPath(); ctx.moveTo(sx2 - er, ey - er); ctx.lineTo(sx2 + er, ey + er); ctx.moveTo(sx2 + er, ey - er); ctx.lineTo(sx2 - er, ey + er); ctx.stroke(); } }
    ctx.restore();
    if (laugh && !b.dead) { const fs = clamp(S * 0.16, 14, 44); ctx.font = `900 ${fs}px system-ui, sans-serif`; ctx.textAlign = 'center'; ctx.lineWidth = 5; ctx.strokeStyle = '#000'; ctx.strokeText('하하하!', cx + S * 0.55, cy - S * 0.45); ctx.fillStyle = '#ffd43b'; ctx.fillText('하하하!', cx + S * 0.55, cy - S * 0.45); }
    for (const h of st.bossHits) { const k = (t - h.t) / 1000; const fs = clamp(S * (h.dmg > 1 ? 0.3 : 0.22), 18, 70); ctx.globalAlpha = 1 - k; ctx.font = `900 ${fs}px system-ui, sans-serif`; ctx.textAlign = 'center'; ctx.lineWidth = 6; ctx.strokeStyle = '#000'; const tx = h.dmg > 1 ? `-${h.dmg} 강한 공격!` : '-1'; ctx.strokeText(tx, cx, cy - S * 0.55 - k * 50); ctx.fillStyle = h.dmg > 1 ? '#ffd43b' : '#ff6b6b'; ctx.fillText(tx, cx, cy - S * 0.55 - k * 50); ctx.globalAlpha = 1; }
  }
  function drawShots(st, c, t) {
    const bp = st.bossPos; if (!bp || !st.shots.length) return; const ctx = st.ctx;
    const x0 = c.W / 2, y0 = c.feetY - 90;
    for (const s of st.shots) {
      const k = clamp((t - s.t0) / 450, 0, 1); const x = x0 + (bp.x - x0) * k, y = y0 + (bp.y - y0) * k - Math.sin(k * Math.PI) * 80;
      const r = 12 + s.dmg * 6; const g = ctx.createRadialGradient(x, y, 2, x, y, r * 2); g.addColorStop(0, '#fff'); g.addColorStop(0.4, '#ffd43b'); g.addColorStop(1, 'rgba(255,212,59,0)');
      ctx.fillStyle = g; ctx.beginPath(); ctx.arc(x, y, r * 2, 0, 6.283); ctx.fill();
    }
  }
  function cloud(ctx, x, y, r) { ctx.beginPath(); ctx.arc(x, y, r, 0, 6.283); ctx.arc(x + r, y + 4, r * 0.8, 0, 6.283); ctx.arc(x - r, y + 6, r * 0.7, 0, 6.283); ctx.fill(); }
  function flagPost(ctx, p, col) {
    const h = 3.2 * p.s; ctx.strokeStyle = '#495057'; ctx.lineWidth = Math.max(1, 0.12 * p.s);
    ctx.beginPath(); ctx.moveTo(p.x, p.y); ctx.lineTo(p.x, p.y - h); ctx.stroke();
    ctx.fillStyle = col; ctx.beginPath(); ctx.moveTo(p.x, p.y - h); ctx.lineTo(p.x + 0.9 * p.s, p.y - h + 0.3 * p.s); ctx.lineTo(p.x, p.y - h + 0.6 * p.s); ctx.fill();
  }
  function rr(ctx, x, y, w, h, r) { ctx.beginPath(); ctx.moveTo(x + r, y); ctx.arcTo(x + w, y, x + w, y + h, r); ctx.arcTo(x + w, y + h, x, y + h, r); ctx.arcTo(x, y + h, x, y, r); ctx.arcTo(x, y, x + w, y, r); ctx.closePath(); }
  function shadow(ctx, p, w) { ctx.fillStyle = 'rgba(0,0,0,.22)'; ctx.beginPath(); ctx.ellipse(p.x, p.y, w * p.s * 0.5, w * p.s * 0.14, 0, 0, 6.283); ctx.fill(); }

  function drawObj(st, c, o, t) {
    const ctx = st.ctx; const wx = laneX(c, o.lane); const dz = o.z - st.pz;
    const p = proj(c, wx, dz, 0); if (!p) return;
    const s = p.s; const w = LANE_W * 0.86 * s;
    const fade = clamp((VIEW_D - dz) / 12, 0, 1); ctx.globalAlpha = fade;
    if (o.smash && !reduced()) ctx.globalAlpha = fade * clamp(1 - (t - o.smash) / 400, 0.2, 1);
    const mp = o.map || 'meadow';
    if (o.type === 'hurdle') {
      shadow(ctx, p, LANE_W * 0.8);
      const top = p.y - 0.6 * s; const hc = HURDLE_COL[mp] || HURDLE_COL.meadow;
      ctx.fillStyle = '#868e96'; ctx.fillRect(p.x - w / 2, top, 0.12 * s, 0.6 * s); ctx.fillRect(p.x + w / 2 - 0.12 * s, top, 0.12 * s, 0.6 * s);
      const bh = 0.22 * s; for (let i = 0; i < 6; i++) { ctx.fillStyle = hc[i % 2]; ctx.fillRect(p.x - w / 2 + (w / 6) * i, top, w / 6 + 0.5, bh); }
      ctx.strokeStyle = 'rgba(0,0,0,.35)'; ctx.lineWidth = 1; ctx.strokeRect(p.x - w / 2, top, w, bh);
      if (dz < 22 && dz > 4) hint(ctx, p.x, top - 0.5 * s, s, '점프', '#e03131');
    } else if (o.type === 'bar' && (mp === 'glacier' || mp === 'jungle')) {
      const lo = 1.15, hi = 1.55; const y1 = p.y - hi * s;
      if (mp === 'glacier') {
        ctx.fillStyle = '#a5d8ff'; ctx.fillRect(p.x - w / 2 - 0.1 * s, y1 - 0.2 * s, w + 0.2 * s, 0.25 * s);
        for (let i = 0; i < 7; i++) { const x = p.x - w / 2 + (w / 7) * (i + 0.5); const len = (hi - lo) * s * (0.8 + 0.4 * ((i * 37) % 5) / 5) + 0.15 * s; ctx.fillStyle = 'rgba(231,245,255,.95)'; ctx.beginPath(); ctx.moveTo(x - w / 16, y1); ctx.lineTo(x + w / 16, y1); ctx.lineTo(x, y1 + len); ctx.fill(); ctx.strokeStyle = '#74c0fc'; ctx.lineWidth = 1; ctx.stroke(); }
      } else {
        ctx.strokeStyle = '#2b8a3e'; ctx.lineWidth = Math.max(3, 0.18 * s); ctx.beginPath(); ctx.moveTo(p.x - w / 2 - 0.4 * s, y1 - 0.6 * s); ctx.quadraticCurveTo(p.x, y1 + (hi - lo) * s * 1.4, p.x + w / 2 + 0.4 * s, y1 - 0.6 * s); ctx.stroke();
        ctx.fillStyle = '#51cf66'; for (let i = 0; i < 6; i++) { const k = (i + 0.5) / 6; const x = p.x - w / 2 + w * k; const y = y1 + Math.sin(k * Math.PI) * (hi - lo) * s * 0.9; ctx.beginPath(); ctx.ellipse(x, y + 0.1 * s, 0.22 * s, 0.1 * s, i % 2 ? 0.6 : -0.6, 0, 6.283); ctx.fill(); }
      }
      if (dz < 22 && dz > 4) hint(ctx, p.x, y1 - 0.5 * s, s, '숙이기', '#f08c00');
    } else if (o.type === 'bar') {
      const lo = 1.15, hi = 1.55; const bc = BAR_COL[mp] || BAR_COL.meadow;
      ctx.fillStyle = '#495057'; ctx.fillRect(p.x - w / 2 - 0.1 * s, p.y - 2.4 * s, 0.14 * s, 2.4 * s); ctx.fillRect(p.x + w / 2 - 0.04 * s, p.y - 2.4 * s, 0.14 * s, 2.4 * s);
      const y1 = p.y - hi * s, bh = (hi - lo) * s;
      for (let i = 0; i < 8; i++) { ctx.fillStyle = bc[i % 2]; ctx.fillRect(p.x - w / 2 + (w / 8) * i, y1, w / 8 + 0.5, bh); }
      ctx.fillStyle = 'rgba(0,0,0,.18)'; ctx.fillRect(p.x - w / 2, p.y - 0.04 * s, w, 0.08 * s);
      if (dz < 22 && dz > 4) hint(ctx, p.x, y1 - 0.4 * s, s, '숙이기', '#f08c00');
    } else if (o.type === 'block' && mp !== 'meadow') {
      shadow(ctx, p, LANE_W); blockSkin(ctx, p, s, w, mp, t);
    } else if (o.type === 'block') {
      shadow(ctx, p, LANE_W);
      const h = 1.8 * s; const x = p.x - w / 2, y = p.y - h;
      ctx.fillStyle = '#b97a3c'; rr(ctx, x, y, w, h, 0.1 * s); ctx.fill();
      ctx.strokeStyle = '#7f4f24'; ctx.lineWidth = Math.max(1, 0.1 * s); ctx.stroke();
      ctx.beginPath(); ctx.moveTo(x, y); ctx.lineTo(x + w, y + h); ctx.moveTo(x + w, y); ctx.lineTo(x, y + h); ctx.stroke();
      ctx.fillStyle = '#d9a066'; ctx.fillRect(x + w * 0.08, y + h * 0.42, w * 0.84, h * 0.16);
    } else if (o.type === 'barrel' && (mp === 'desert' || mp === 'volcano')) {
      shadow(ctx, p, LANE_W * 0.7); const r = 0.48 * s; const cy = p.y - r; const rot = (st.pz + o.z) * 1.7;
      if (mp === 'desert') { ctx.strokeStyle = '#8d6e3f'; ctx.lineWidth = Math.max(1, 0.06 * s); for (let i = 0; i < 9; i++) { ctx.beginPath(); ctx.ellipse(p.x, cy, r * (0.5 + (i % 3) * 0.22), r * (0.95 - (i % 2) * 0.3), rot + i * 0.7, 0, 6.283); ctx.stroke(); } }
      else { const g = ctx.createRadialGradient(p.x - r * 0.3, cy - r * 0.3, 2, p.x, cy, r * 1.4); g.addColorStop(0, '#ffe066'); g.addColorStop(0.5, '#ff6b00'); g.addColorStop(1, '#7a1d00'); ctx.fillStyle = g; ctx.beginPath(); ctx.arc(p.x, cy, r, 0, 6.283); ctx.fill(); }
      if (dz < 24 && dz > 4) hint(ctx, p.x, cy - r - 0.5 * s, s, '점프', '#e03131');
    } else if (o.type === 'barrel') {
      shadow(ctx, p, LANE_W * 0.7);
      const r = 0.45 * s; const cy = p.y - r; const rot = (st.pz + o.z) * 1.7;
      ctx.fillStyle = '#a0522d'; rr(ctx, p.x - w * 0.42, cy - r, w * 0.84, r * 2, r * 0.6); ctx.fill();
      ctx.strokeStyle = '#5c2e12'; ctx.lineWidth = Math.max(1, 0.08 * s);
      for (let i = 0; i < 3; i++) { const yy = cy - r + ((i / 3 + rot * 0.15) % 1) * 2 * r; ctx.beginPath(); ctx.moveTo(p.x - w * 0.42, yy); ctx.lineTo(p.x + w * 0.42, yy); ctx.stroke(); }
      if (dz < 24 && dz > 4) hint(ctx, p.x, cy - r - 0.5 * s, s, '점프', '#e03131');
    } else if (o.type === 'coin' && mp === 'jungle') {
      const cy = p.y - (o.h || 0.8) * s; const r = 0.38 * s; const a = Math.sin(t / 250 + o.z) * 0.4;
      ctx.fillStyle = '#ffd43b'; ctx.strokeStyle = '#e67700'; ctx.lineWidth = Math.max(1, 0.05 * s); ctx.beginPath(); ctx.arc(p.x, cy - r * 0.3, r, 0.25 + a, Math.PI - 0.25 + a); ctx.arc(p.x, cy - r * 0.9, r * 1.15, Math.PI - 0.55 + a, 0.55 + a, true); ctx.closePath(); ctx.fill(); ctx.stroke();
    } else if (o.type === 'coin') {
      const h = o.h || 0.8; const cy = p.y - h * s; const r = 0.32 * s; const sq = Math.abs(Math.cos(t / 180 + o.z));
      ctx.fillStyle = '#fab005'; ctx.beginPath(); ctx.ellipse(p.x, cy, Math.max(1, r * sq), r, 0, 0, 6.283); ctx.fill();
      ctx.fillStyle = '#ffe066'; ctx.beginPath(); ctx.ellipse(p.x, cy, Math.max(0.5, r * sq * 0.6), r * 0.6, 0, 0, 6.283); ctx.fill();
    } else if (o.type === 'rock') {
      const land = o.thrown ? 26 : 30; const hh = (o.fallH || 10) * clamp((dz - 3) / land, 0, 1);
      ctx.fillStyle = `rgba(0,0,0,${0.15 + 0.35 * (1 - hh / (o.fallH || 10))})`; ctx.beginPath(); ctx.ellipse(p.x, p.y, w * 0.45, w * 0.13, 0, 0, 6.283); ctx.fill();
      const cy = p.y - (hh + 0.6) * s; const r = 0.62 * s;
      if (hh > 0.2 && !reduced()) { const tr = ctx.createLinearGradient(p.x, cy - r * 4, p.x, cy); tr.addColorStop(0, 'rgba(255,120,0,0)'); tr.addColorStop(1, mp === 'space' ? 'rgba(120,200,255,.8)' : 'rgba(255,140,0,.8)'); ctx.fillStyle = tr; ctx.beginPath(); ctx.moveTo(p.x - r * 0.7, cy); ctx.lineTo(p.x, cy - r * 4.5); ctx.lineTo(p.x + r * 0.7, cy); ctx.fill(); }
      ctx.fillStyle = mp === 'space' ? '#868e96' : mp === 'jungle' ? '#6d4c2f' : '#3b2a25'; ctx.beginPath();
      for (let i = 0; i < 8; i++) { const a = i / 8 * 6.283; const rr2 = r * (0.8 + 0.25 * Math.sin(i * 3.1 + o.z)); ctx.lineTo(p.x + Math.cos(a) * rr2, cy + Math.sin(a) * rr2); } ctx.closePath(); ctx.fill();
      if (mp !== 'jungle') { ctx.strokeStyle = mp === 'space' ? '#22d3ee' : '#ff6b00'; ctx.lineWidth = Math.max(1, 0.06 * s); ctx.beginPath(); ctx.moveTo(p.x - r * 0.4, cy - r * 0.2); ctx.lineTo(p.x, cy + r * 0.1); ctx.lineTo(p.x + r * 0.3, cy - r * 0.3); ctx.stroke(); }
      if (dz < 26 && dz > 3) hint(ctx, p.x, Math.min(cy - r - 0.3 * s, p.y - 1.4 * s), s, '옆으로', '#7048e8');
    } else if (o.type === 'lava') {
      const a = proj(c, wx - LANE_W * 0.45, dz - 1.2, 0), b = proj(c, wx + LANE_W * 0.45, dz - 1.2, 0), a2 = proj(c, wx - LANE_W * 0.45, dz + 1.2, 0), b2 = proj(c, wx + LANE_W * 0.45, dz + 1.2, 0);
      if (a && a2) { const g = ctx.createLinearGradient(0, a2.y, 0, a.y); g.addColorStop(0, '#ff922b'); g.addColorStop(0.5 + 0.2 * Math.sin(t / 200 + o.z), '#ff3d00'); g.addColorStop(1, '#ffd43b'); ctx.fillStyle = g; ctx.shadowColor = '#ff6b00'; ctx.shadowBlur = 18; ctx.beginPath(); ctx.moveTo(a.x, a.y); ctx.lineTo(b.x, b.y); ctx.lineTo(b2.x, b2.y); ctx.lineTo(a2.x, a2.y); ctx.closePath(); ctx.fill(); ctx.shadowBlur = 0;
        ctx.fillStyle = 'rgba(255,240,180,.9)'; for (let i = 0; i < 3; i++) { const k = ((t / 700 + i * 0.33 + o.z) % 1); ctx.beginPath(); ctx.arc(p.x + (i - 1) * w * 0.25, p.y - k * 0.5 * s, (1 - k) * 0.1 * s + 1, 0, 6.283); ctx.fill(); } }
      if (dz < 22 && dz > 4) hint(ctx, p.x, p.y - 0.8 * s, s, '점프', '#e03131');
    } else if (o.type === 'swing') {
      const pv = proj(c, laneX(c, o.c), dz, 5.2); const y0 = p.y - 1.0 * s;
      if (pv) { ctx.strokeStyle = '#5c940d'; ctx.lineWidth = Math.max(2, 0.1 * s); ctx.beginPath(); ctx.moveTo(pv.x - w * 0.3, pv.y); ctx.lineTo(p.x - w * 0.35, y0); ctx.moveTo(pv.x + w * 0.3, pv.y); ctx.lineTo(p.x + w * 0.35, y0); ctx.stroke(); }
      shadow(ctx, p, LANE_W * 0.8);
      ctx.fillStyle = '#8d5524'; rr(ctx, p.x - w * 0.5, y0 - 0.45 * s, w, 0.9 * s, 0.45 * s); ctx.fill(); ctx.fillStyle = '#c68642'; ctx.beginPath(); ctx.ellipse(p.x + w * 0.5 - 0.2 * s, y0, 0.2 * s, 0.42 * s, 0, 0, 6.283); ctx.fill();
      ctx.strokeStyle = '#5d3a1a'; ctx.lineWidth = Math.max(1, 0.05 * s); ctx.beginPath(); ctx.moveTo(p.x - w * 0.4, y0 - 0.1 * s); ctx.lineTo(p.x + w * 0.2, y0 - 0.1 * s); ctx.moveTo(p.x - w * 0.3, y0 + 0.15 * s); ctx.lineTo(p.x + w * 0.3, y0 + 0.15 * s); ctx.stroke();
      if (dz < 24 && dz > 4) hint(ctx, p.x, y0 - 0.9 * s, s, '옆으로', '#7048e8');
    } else if (o.type === 'slider') {
      shadow(ctx, p, LANE_W * 0.7); const r = 0.38 * s; const cy = p.y - r; const dir = (o.v || 1) > 0 ? 1 : -1;
      ctx.fillStyle = '#212529'; ctx.beginPath(); ctx.ellipse(p.x, cy, r * 1.5, r, 0, 0, 6.283); ctx.fill();
      ctx.fillStyle = '#fff'; ctx.beginPath(); ctx.ellipse(p.x, cy + r * 0.25, r * 1.2, r * 0.6, 0, 0, 6.283); ctx.fill();
      ctx.fillStyle = '#212529'; ctx.beginPath(); ctx.arc(p.x + dir * r * 1.4, cy - r * 0.2, r * 0.6, 0, 6.283); ctx.fill();
      ctx.fillStyle = '#fff'; ctx.beginPath(); ctx.arc(p.x + dir * r * 1.6, cy - r * 0.35, r * 0.16, 0, 6.283); ctx.fill();
      ctx.fillStyle = '#fd7e14'; ctx.beginPath(); ctx.moveTo(p.x + dir * r * 1.9, cy - r * 0.25); ctx.lineTo(p.x + dir * r * 2.4, cy - r * 0.1); ctx.lineTo(p.x + dir * r * 1.9, cy + r * 0.05); ctx.fill();
      if (dz < 22 && dz > 4) hint(ctx, p.x, cy - r * 1.8, s, '점프', '#e03131');
    } else if (o.type === 'spring') {
      const cy = p.y - 0.35 * s; const sq = o.ok ? 0.6 : 1;
      ctx.strokeStyle = '#868e96'; ctx.lineWidth = Math.max(1, 0.07 * s); ctx.beginPath(); for (let i = 0; i <= 6; i++) ctx.lineTo(p.x + (i % 2 ? 0.25 : -0.25) * s, p.y - i * 0.05 * s * sq); ctx.stroke();
      ctx.fillStyle = '#e03131'; ctx.beginPath(); ctx.ellipse(p.x, cy, w * 0.42, 0.22 * s, 0, Math.PI, 0); ctx.fill(); ctx.fillStyle = '#fff'; for (let i = -1; i <= 1; i++) { ctx.beginPath(); ctx.arc(p.x + i * w * 0.2, cy - 0.08 * s, 0.06 * s, 0, 6.283); ctx.fill(); }
      if (dz < 22 && dz > 4) hint(ctx, p.x, cy - 0.5 * s, s, '점프대', '#2f9e44');
    } else if (o.type === 'shield' || o.type === 'magnet') {
      const cy = p.y - 1.0 * s - Math.sin(t / 200) * 0.15 * s; const r = 0.42 * s;
      ctx.fillStyle = o.type === 'shield' ? 'rgba(77,171,247,.35)' : 'rgba(255,107,107,.35)'; ctx.beginPath(); ctx.arc(p.x, cy, r * 1.35, 0, 6.283); ctx.fill();
      ctx.fillStyle = o.type === 'shield' ? '#1c7ed6' : '#e03131';
      if (o.type === 'shield') { ctx.beginPath(); ctx.moveTo(p.x, cy - r); ctx.lineTo(p.x + r * 0.85, cy - r * 0.6); ctx.lineTo(p.x + r * 0.7, cy + r * 0.3); ctx.lineTo(p.x, cy + r); ctx.lineTo(p.x - r * 0.7, cy + r * 0.3); ctx.lineTo(p.x - r * 0.85, cy - r * 0.6); ctx.closePath(); ctx.fill(); }
      else { ctx.lineWidth = r * 0.45; ctx.strokeStyle = '#e03131'; ctx.beginPath(); ctx.arc(p.x, cy, r * 0.6, 0, Math.PI); ctx.stroke(); ctx.fillStyle = '#ced4da'; ctx.fillRect(p.x - r * 0.83, cy - r * 0.5, r * 0.45, r * 0.5); ctx.fillRect(p.x + r * 0.38, cy - r * 0.5, r * 0.45, r * 0.5); }
    }
    ctx.globalAlpha = 1;
  }
  const HURDLE_COL = { meadow: ['#e03131', '#fff'], volcano: ['#ff6b00', '#343a40'], glacier: ['#4dabf7', '#fff'], jungle: ['#8d5524', '#5d3a1a'], desert: ['#e67700', '#fff3bf'], space: ['#22d3ee', '#7048e8'] };
  const BAR_COL = { meadow: ['#fcc419', '#212529'], volcano: ['#ff6b00', '#212529'], desert: ['#ffd43b', '#7f4f24'], space: ['#22d3ee', '#1b1035'] };
  function blockSkin(ctx, p, s, w, mp, t) {
    const h = 1.8 * s, x = p.x - w / 2, y = p.y - h;
    if (mp === 'desert') { ctx.fillStyle = '#2f9e44'; rr(ctx, p.x - w * 0.2, y - 0.2 * s, w * 0.4, h + 0.2 * s, w * 0.2); ctx.fill(); rr(ctx, x + w * 0.02, y + h * 0.25, w * 0.22, h * 0.45, w * 0.11); ctx.fill(); rr(ctx, x + w * 0.76, y + h * 0.1, w * 0.22, h * 0.45, w * 0.11); ctx.fill(); ctx.fillRect(x + w * 0.1, y + h * 0.58, w * 0.2, h * 0.12); ctx.fillRect(x + w * 0.7, y + h * 0.45, w * 0.2, h * 0.12); ctx.strokeStyle = '#1b5e20'; ctx.lineWidth = Math.max(1, 0.04 * s); for (let i = 1; i < 4; i++) { ctx.beginPath(); ctx.moveTo(p.x - w * 0.2 + w * 0.1 * i, y); ctx.lineTo(p.x - w * 0.2 + w * 0.1 * i, p.y); ctx.stroke(); } return; }
    const pal = { volcano: ['#343a40', '#ff6b00'], glacier: ['rgba(165,216,255,.85)', '#e7f5ff'], jungle: ['#868e96', '#5c940d'], space: ['#495057', '#22d3ee'] }[mp] || ['#b97a3c', '#7f4f24'];
    ctx.fillStyle = pal[0]; rr(ctx, x, y, w, h, 0.18 * s); ctx.fill();
    ctx.strokeStyle = pal[1]; ctx.lineWidth = Math.max(1, 0.08 * s);
    if (mp === 'volcano') { ctx.shadowColor = '#ff6b00'; ctx.shadowBlur = 10; ctx.beginPath(); ctx.moveTo(x + w * 0.2, y + h * 0.1); ctx.lineTo(x + w * 0.45, y + h * 0.5); ctx.lineTo(x + w * 0.3, y + h * 0.9); ctx.moveTo(x + w * 0.7, y + h * 0.2); ctx.lineTo(x + w * 0.55, y + h * 0.6); ctx.stroke(); ctx.shadowBlur = 0; }
    else if (mp === 'glacier') { ctx.stroke(); ctx.fillStyle = 'rgba(255,255,255,.7)'; ctx.fillRect(x + w * 0.12, y + h * 0.1, w * 0.12, h * 0.6); ctx.fillRect(x + w * 0.3, y + h * 0.1, w * 0.06, h * 0.4); }
    else if (mp === 'jungle') { ctx.stroke(); ctx.fillStyle = '#5c940d'; ctx.beginPath(); ctx.ellipse(x + w * 0.3, y + 0.1 * s, w * 0.3, 0.2 * s, 0, 0, 6.283); ctx.ellipse(x + w * 0.75, y + 0.15 * s, w * 0.2, 0.15 * s, 0, 0, 6.283); ctx.fill(); ctx.strokeStyle = '#495057'; ctx.beginPath(); ctx.moveTo(x, y + h * 0.5); ctx.lineTo(x + w, y + h * 0.5); ctx.moveTo(x + w * 0.5, y + h * 0.5); ctx.lineTo(x + w * 0.5, p.y); ctx.stroke(); }
    else if (mp === 'space') { ctx.stroke(); ctx.fillStyle = `rgba(34,211,238,${0.6 + 0.3 * Math.sin(t / 200)})`; ctx.fillRect(x + w * 0.1, y + h * 0.42, w * 0.8, h * 0.12); }
  }
  function hint(ctx, x, y, s, text, col) {
    const fs = clamp(0.38 * s, 10, 22); ctx.font = `900 ${fs}px system-ui, sans-serif`; ctx.textAlign = 'center';
    const w = ctx.measureText(text).width + fs; ctx.fillStyle = col; rr(ctx, x - w / 2, y - fs, w, fs * 1.4, fs * 0.5); ctx.fill();
    ctx.fillStyle = '#fff'; ctx.fillText(text, x, y + fs * 0.12);
  }
  function wrapText(ctx, text, maxW, lines) {
    const out = []; let cur = '';
    for (const ch of Array.from(String(text))) { if (ctx.measureText(cur + ch).width > maxW && cur) { out.push(cur); cur = ch; if (out.length >= lines) break; } else cur += ch; }
    if (out.length < lines && cur) out.push(cur);
    if (out.length === lines && Array.from(String(text)).length > out.join('').length) out[lines - 1] = out[lines - 1].slice(0, -1) + '…';
    return out;
  }
  function drawGate(st, c, g, t) {
    const ctx = st.ctx; const dz = g.z - st.pz;
    const flash = st.gateFlash && performance.now() < st.gateFlash.until ? st.gateFlash : null;
    for (let i = 0; i < g.n; i++) {
      const p = proj(c, laneX(c, i), dz, 0); if (!p) continue;
      const s = p.s; const w = LANE_W * 0.94 * s; const top = p.y - 3.5 * s;
      ctx.globalAlpha = clamp((VIEW_D - dz) / 12, 0, 1);
      const col = SHAPE_COLORS[i];
      ctx.fillStyle = col; ctx.fillRect(p.x - w / 2, top, 0.18 * s, 3.5 * s); ctx.fillRect(p.x + w / 2 - 0.18 * s, top, 0.18 * s, 3.5 * s);
      const ph = 1.25 * s;
      ctx.fillStyle = col; rr(ctx, p.x - w / 2, top - 0.1 * s, w, ph, 0.18 * s); ctx.fill();
      if (g.passed && g.lane === i && flash) { ctx.strokeStyle = flash.col; ctx.lineWidth = 0.22 * s; ctx.stroke(); ctx.fillStyle = flash.col; ctx.globalAlpha *= 0.35; ctx.fillRect(p.x - w / 2, top, w, 3.5 * s); ctx.globalAlpha = 1; }
      // 도형
      const ic = 0.3 * s, ix = p.x - w / 2 + 0.45 * s, iy = top + ph / 2 - 0.05 * s;
      ctx.fillStyle = '#fff'; ctx.beginPath();
      if (i === 0) { ctx.moveTo(ix, iy - ic); ctx.lineTo(ix + ic, iy + ic * 0.8); ctx.lineTo(ix - ic, iy + ic * 0.8); }
      else if (i === 1) { ctx.moveTo(ix, iy - ic); ctx.lineTo(ix + ic, iy); ctx.lineTo(ix, iy + ic); ctx.lineTo(ix - ic, iy); }
      else if (i === 2) ctx.arc(ix, iy, ic * 0.9, 0, 6.283);
      else ctx.rect(ix - ic * 0.8, iy - ic * 0.8, ic * 1.6, ic * 1.6);
      ctx.closePath(); ctx.fill();
      // 글
      const fs = clamp(0.36 * s, 8, 30); ctx.font = `800 ${fs}px system-ui, sans-serif`; ctx.textAlign = 'left';
      const tw = w - 1.0 * s; const ls = wrapText(ctx, g.choices[i], tw, 2);
      ctx.fillStyle = '#fff'; ls.forEach((ln, k) => ctx.fillText(ln, p.x - w / 2 + 0.85 * s, top + ph / 2 + (k - (ls.length - 1) / 2) * fs * 1.1 + fs * 0.32));
      // 문 안쪽 빛
      const gl = ctx.createLinearGradient(0, top + ph, 0, p.y); gl.addColorStop(0, 'rgba(255,255,255,.35)'); gl.addColorStop(1, 'rgba(255,255,255,.05)');
      ctx.fillStyle = gl; ctx.fillRect(p.x - w / 2 + 0.18 * s, top + ph, w - 0.36 * s, p.y - top - ph);
      ctx.globalAlpha = 1;
    }
    if (dz > 0 && dz < 60) {
      const p = proj(c, 0, dz, 4.3); if (p) { const fs = clamp(0.5 * p.s, 10, 30); ctx.font = `900 ${fs}px system-ui, sans-serif`; ctx.textAlign = 'center'; ctx.lineWidth = 4; ctx.strokeStyle = 'rgba(0,0,0,.5)'; ctx.strokeText('정답 문으로 골인!', p.x, p.y); ctx.fillStyle = '#fff'; ctx.fillText('정답 문으로 골인!', p.x, p.y); }
    }
  }
  function drawPlayer(st, c, t) {
    const ctx = st.ctx; const wx = (st.px - (c.n - 1) / 2) * LANE_W;
    const p = proj(c, wx, 0, 0); if (!p) return;
    const s = p.s; const ducking = t < st.duckUntil && st.y < 0.15;
    const blink = t < st.invulnUntil && Math.floor(t / 90) % 2 === 0;
    shadow(ctx, p, 1.1);
    const feet = p.y - st.y * s; const run = st.y > 0 ? 0 : Math.sin(st.runT * 16);
    const A = clamp(1.7 * s, 58, 150); const bodyH = ducking ? A * 0.25 : A * 0.5;
    if (blink) ctx.globalAlpha = 0.35;
    // 피버 꼬리
    if (st.fever && !reduced()) { for (let i = 0; i < 6; i++) { ctx.fillStyle = `hsla(${(t / 5 + i * 50) % 360},90%,60%,${0.5 - i * 0.07})`; ctx.beginPath(); ctx.arc(p.x, feet - bodyH * 0.5 + i * 7, A * 0.35 - i * 3, 0, 6.283); ctx.fill(); } }
    // 다리
    ctx.strokeStyle = '#343a40'; ctx.lineWidth = Math.max(3, A * 0.09); ctx.lineCap = 'round';
    const hip = feet - bodyH * 0.55;
    if (!ducking) {
      ctx.beginPath(); ctx.moveTo(p.x - A * 0.1, hip); ctx.lineTo(p.x - A * 0.12 - run * A * 0.12, feet); ctx.moveTo(p.x + A * 0.1, hip); ctx.lineTo(p.x + A * 0.12 + run * A * 0.12, feet); ctx.stroke();
    }
    // 몸통
    ctx.fillStyle = st.fever ? `hsl(${(t / 4) % 360},80%,55%)` : '#ff922b';
    rr(ctx, p.x - A * 0.22, hip - bodyH * 0.6, A * 0.44, bodyH * 0.75, A * 0.12); ctx.fill();
    // 머리(캐릭터)
    const me = (st.view && st.view.me) || {};
    const rec = avatarImage(me.avatar, me.nickname);
    const hy = (ducking ? hip - A * 0.3 : hip - bodyH * 0.55 - A * 0.42) - (st.y > 0 ? 0 : Math.abs(run) * A * 0.03);
    if (rec.ok && rec.img.complete && rec.img.naturalWidth) ctx.drawImage(rec.img, p.x - A * 0.45, hy - A * 0.45, A * 0.9, A * 0.9);
    else { ctx.fillStyle = '#845ef7'; ctx.beginPath(); ctx.arc(p.x, hy, A * 0.42, 0, 6.283); ctx.fill(); ctx.fillStyle = '#fff'; ctx.font = `900 ${A * 0.4}px system-ui`; ctx.textAlign = 'center'; ctx.fillText(Array.from(rec.name || '?')[0] || '?', p.x, hy + A * 0.14); }
    if (st.shieldOn) { ctx.strokeStyle = 'rgba(77,171,247,.9)'; ctx.lineWidth = 4; ctx.beginPath(); ctx.arc(p.x, hy + A * 0.2, A * 0.75, 0, 6.283); ctx.stroke(); ctx.fillStyle = 'rgba(77,171,247,.15)'; ctx.fill(); }
    if (t < st.magnetUntil) { ctx.strokeStyle = 'rgba(255,107,107,.7)'; ctx.setLineDash([6, 6]); ctx.lineWidth = 3; ctx.beginPath(); ctx.arc(p.x, hy + A * 0.2, A * 0.9 + Math.sin(t / 120) * 4, 0, 6.283); ctx.stroke(); ctx.setLineDash([]); }
    ctx.globalAlpha = 1;
  }

  function hud(st) {
    const v = st.view || {}; const me = v.me || {};
    const score = N(me.score);
    if (st.scoreShown !== score) { st.scoreShown = score; st.hudScore.textContent = fmt(score); st.hudScore.parentNode.classList.remove('bump'); void st.hudScore.offsetWidth; st.hudScore.parentNode.classList.add('bump'); }
    const set = (n, val) => { const s = String(val); if (n.textContent !== s) n.textContent = s; };
    set(st.hudSpeed, st.tier + 1); set(st.hudStreak, st.streak); set(st.hudCoins, st.totals.coins); set(st.hudDist, fmt(st.totals.dist));
    const w = ((st.tier + 1) / 6 * 100).toFixed(0) + '%'; if (st.speedBar.style.width !== w) st.speedBar.style.width = w;
    st.stage.classList.toggle('fever', !!st.fever);
    const ht = (st.topBox.offsetHeight + 14) + 'px'; if (st.hud.style.top !== ht) st.hud.style.top = ht;
    const Mh = curMap(st); set(st.hudMap, Mh.name); if (st.hudMap.style.background !== Mh.chip) st.hudMap.style.background = Mh.chip;
    const b = st.boss;
    if (b && !b.leaving) {
      st.bossBar.hidden = false;
      const bt = (st.topBox.offsetHeight + 20 + st.hud.offsetHeight) + 'px'; if (st.bossBar.style.top !== bt) st.bossBar.style.top = bt;
      set(st.bossName, '보스 ' + b.name);
      const ck = b.hp + '/' + b.max; if (st.bossCells.dataset.k !== ck) { st.bossCells.dataset.k = ck; st.bossCells.replaceChildren(...Array.from({ length: b.max }, (_, i) => H('i', { class: i < b.hp ? 'on' : '' }))); st.bossBar.classList.remove('hit'); void st.bossBar.offsetWidth; if (b.hp < b.max) st.bossBar.classList.add('hit'); }
      const left = Math.max(0, Math.round(MAP_LEN - ((st.pz + (st.d0 || 0)) % MAP_LEN)));
      set(st.bossNote, b.dead ? '격파! 다음 골인 때 +200점' : `정답으로 공격! 연속 정답은 더 세게 · ${left}m 뒤에 도망가요`);
      st.bossBar.classList.toggle('dead', !!b.dead);
    } else if (!st.bossBar.hidden) st.bossBar.hidden = true;
    const t = performance.now();
    const pw = [st.shieldOn ? '방패' : '', t < st.magnetUntil ? `자석 ${Math.ceil((st.magnetUntil - t) / 1000)}초` : '', st.fever ? '피버 타임' : '', t < st.slowUntil ? '느려짐' : ''].filter(Boolean).join(' · ');
    if (st.power.textContent !== pw) st.power.textContent = pw;
  }

  // ======================================================================
  // 진행자 화면: 실시간 경주판
  // ======================================================================
  function host(root, view) {
    applyCfg(view);
    const s = (view && view.modeState) || {};
    const players = Array.isArray(s.players) ? s.players : [];
    const st = prep(root, 'runner-host', ['ar-runner-h'], (st, r) => {
      st.title = H('div', { class: 'ar-runner-htitle' }, H('strong', {}, '퀴즈 런 실시간 경주판'), H('span', { class: 'ar-runner-hsub' }, ''));
      st.list = H('div', { class: 'ar-runner-hlist' });
      st.pop = H('div', { class: 'ar-runner-hpop', 'aria-live': 'polite' });
      st.keys = keyGuide(true);
      r.append(H('div', { class: 'ar-runner-hbg', 'aria-hidden': 'true' }), st.title, st.keys, st.list, st.pop);
      st.rows = new Map(); st.prev = new Map(); st.leader = null;
    });
    const sorted = players.slice().sort((a, b) => N(a.rank || 999) - N(b.rank || 999) || N(b.score) - N(a.score));
    const maxDist = Math.max(100, ...sorted.map(p => N(p.dist)));
    const totalDist = sorted.reduce((a, p) => a + N(p.dist), 0);
    const ans = sorted.reduce((a, p) => a + N(p.answered), 0), cor = sorted.reduce((a, p) => a + N(p.correct), 0);
    st.title.lastChild.textContent = `참가 ${sorted.length}명 · 반 전체 ${fmt(totalDist)}m 달림` + (ans ? ` · 정답률 ${Math.round(cor / ans * 100)}%` : '');
    const box = root.getBoundingClientRect();
    const cols = sorted.length > 10 && box.width > 640 ? 2 : 1;
    const perCol = Math.ceil(Math.max(1, sorted.length) / cols);
    const avail = Math.max(120, (box.height || 400) - 70);
    const rowH = clamp(Math.floor(avail / Math.max(1, perCol)), 30, 56);
    const shown = sorted.slice(0, cols * Math.max(1, Math.floor(avail / rowH)));
    st.list.style.setProperty('--rh', rowH + 'px'); st.list.style.setProperty('--cols', cols);
    const keep = new Set();
    shown.forEach((p, i) => {
      keep.add(p.id);
      let row = st.rows.get(p.id);
      if (!row) {
        row = { el: H('div', { class: 'ar-runner-row new' }) };
        row.rank = H('span', { class: 'ar-runner-rank' }); row.av = H('span', { class: 'ar-runner-av' }); row.name = H('span', { class: 'ar-runner-name' });
        row.streak = H('span', { class: 'ar-runner-streak' }); row.hits = H('span', { class: 'ar-runner-hits' }); row.map = H('span', { class: 'ar-runner-mapchip' });
        row.runner = H('span', { class: 'ar-runner-dot' }); row.bar = H('span', { class: 'ar-runner-bar' }, H('span', { class: 'ar-runner-barfill' }), row.runner);
        row.score = H('span', { class: 'ar-runner-score' });
        row.el.append(row.rank, row.av, H('span', { class: 'ar-runner-mid' }, H('span', { class: 'ar-runner-nl' }, row.name, row.map, row.streak, row.hits), row.bar), row.score);
        st.list.append(row.el); st.rows.set(p.id, row);
        setTimeout(() => row.el.classList.remove('new'), 600);
      }
      const avKey = JSON.stringify(p.avatar || null);
      if (row.avKey !== avKey) { row.avKey = avKey; row.av.replaceChildren(avatarNode(p.avatar, Math.round(rowH * 0.78), p.nickname)); }
      const col = Math.floor(i / perCol), ri = i % perCol;
      row.el.style.transform = `translate(${col * 100}%, ${ri * rowH}px)`;
      row.el.style.width = `calc(${100 / cols}% - 8px)`;
      row.el.className = 'ar-runner-row' + (i < 3 ? ' top' + (i + 1) : '') + (N(p.streak) >= 5 ? ' fever' : '');
      row.rank.textContent = String(i + 1);
      row.name.textContent = p.nickname || '';
      row.streak.textContent = N(p.streak) >= 2 ? `연속 ${N(p.streak)}` : '';
      row.streak.hidden = N(p.streak) < 2;
      row.hits.textContent = N(p.hits) ? `충돌 ${N(p.hits)}` : '';
      row.hits.hidden = !N(p.hits);
      const pm = mapAt(p.dist); if (row.map.textContent !== pm.name) { row.map.textContent = pm.name; row.map.style.background = pm.chip; }
      const pmi = mapIdxAt(p.dist); if (pmi > (st.maxMap || 0)) { st.maxMap = pmi; if (view.phase === 'running') popup(st, `${p.nickname} 가장 먼저 ${pm.name} 지대 도착!` + (pm.boss ? ` 보스 ${pm.boss.name} 등장!` : '')); }
      const pct = clamp(N(p.dist) / maxDist * 100, 2, 100);
      row.bar.firstChild.style.width = pct + '%'; row.runner.style.left = pct + '%';
      const prev = st.prev.get(p.id);
      if (prev) {
        if (prev.rank > i + 1) { row.el.classList.add('up'); }
        if (N(p.score) !== prev.score) countUp(row.score, prev.score, N(p.score));
        if (N(p.streak) >= 5 && N(p.streak) % 5 === 0 && prev.streak !== N(p.streak)) popup(st, `${p.nickname} 피버 타임! ${N(p.streak)}연속 정답`);
      } else row.score.textContent = fmt(p.score);
      st.prev.set(p.id, { rank: i + 1, score: N(p.score), streak: N(p.streak) });
    });
    for (const [id, row] of st.rows) if (!keep.has(id)) { row.el.remove(); st.rows.delete(id); }
    const lead = sorted[0];
    if (lead && N(lead.score) > 0 && st.leader && st.leader !== lead.id && view.phase === 'running') popup(st, `선두 교체! ${lead.nickname}`);
    if (lead && N(lead.score) > 0) st.leader = lead.id;
    if (!sorted.length) st.list.replaceChildren(H('p', { class: 'ar-runner-empty' }, '곧 친구들이 달리기 시작해요')), st.rows.clear();
  }
  function countUp(el, from, to) {
    if (reduced()) { el.textContent = fmt(to); return; }
    const t0 = performance.now(); el.classList.toggle('down', to < from); el.classList.add('chg');
    const f = t => { const k = Math.min(1, (t - t0) / 700); el.textContent = fmt(from + (to - from) * k); if (k < 1) requestAnimationFrame(f); else setTimeout(() => el.classList.remove('chg', 'down'), 400); };
    requestAnimationFrame(f);
  }
  function popup(st, text) {
    const p = H('div', { class: 'ar-runner-hpopi' }, text); st.pop.append(p);
    while (st.pop.children.length > 2) st.pop.firstChild.remove();
    setTimeout(() => p.remove(), 2600); snd('sparkle');
  }

  KQ.arena.runnerMaps = { MAP_LEN, MAPS: MAPS.map(m => ({ id: m.id, name: m.name, color: m.chip, boss: m.boss ? m.boss.name : null })) };
  KQ.arena.runner = {
    host(root, view, send) { try { host(root, view || {}, send); } catch (e) { console.warn('[퀴즈 런 진행자]', e); } },
    player(root, view, send) { try { player(root, view || {}, send); } catch (e) { console.warn('[퀴즈 런 학생]', e); } }
  };
})();
