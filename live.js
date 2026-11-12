'use strict';
/* 반짝퀴즈 live.js: 홈(PIN 입장), 학생 플레이, 게임 만들기(모드 선택), 진행자 화면 */
(() => {
  const KQ = window.KQ;
  if (!KQ) return;
  // KQ.el 은 style 객체를 Object.assign 하므로 CSS 변수(--x)는 setProperty 로 따로 넣는다
  const el = (tag, attrs, ...children) => {
    let vars = null;
    if (attrs && attrs.style && typeof attrs.style === 'object') {
      const st = {};
      for (const [k, v] of Object.entries(attrs.style)) { if (k.startsWith('--')) (vars = vars || {})[k] = v; else st[k] = v; }
      if (vars) attrs = { ...attrs, style: st };
    }
    const node = KQ.el(tag, attrs, ...children);
    if (vars) for (const [k, v] of Object.entries(vars)) if (v !== undefined && v !== null) node.style.setProperty(k, String(v));
    return node;
  };

  // ---------- 공통 도우미 ----------
  // Element.append(null) 은 'null' 글자를 넣으므로 빈 값을 거른다
  const add = (parent, ...kids) => { parent.append(...kids.flat().filter(k => k !== null && k !== undefined && k !== false)); return parent; };
  const SHAPE_NAMES = ['빨강 삼각형', '파랑 마름모', '노랑 원', '초록 사각형'];
  const SHAPE_COLORS = ['#e21b3c', '#1368ce', '#d89e00', '#26890c'];
  const TEAM_DEFAULT = [{ name: '빨강 팀', color: '#e21b3c' }, { name: '파랑 팀', color: '#1368ce' }, { name: '노랑 팀', color: '#d89e00' }, { name: '초록 팀', color: '#26890c' }];
  const FALLBACK_MODES = [
    { id: 'classic', color: '#46178f', name: '클래식', pacing: 'host', teams: false, original: false, description: '모두 같은 문제를 풀고 빠르고 정확하게 답해 점수를 모아요.' },
    { id: 'submarine', color: '#0a5fa3', name: '잠수함 특공대', pacing: 'host', teams: false, original: false, description: '반 전체가 힘을 모아 깊은 바다까지 잠수해요.' },
    { id: 'kingdom', color: '#b8341b', name: '컬러 킹덤', pacing: 'host', teams: true, original: false, description: '팀별로 정답을 맞혀 지도의 땅을 차지해요.' },
    { id: 'space', color: '#1d1d5c', name: '우주 정복', pacing: 'host', teams: true, original: false, description: '팀 에너지를 행성에 보내 우주를 정복해요.' },
    { id: 'garden', color: '#2f8f2f', name: '우리반 꽃밭', pacing: 'host', teams: false, original: true, description: '정답마다 꽃이 피어 함께 꽃밭을 채워요.' },
    { id: 'boss', color: '#7a1fa2', name: '보스 레이드', pacing: 'host', teams: false, original: true, description: '모두의 정답으로 거대한 보스를 물리쳐요.' },
    { id: 'robot', color: '#0aa3a3', name: '로봇 경주', pacing: 'player', teams: false, original: false, description: '각자 문제를 풀며 로봇을 결승선까지 달리게 해요.' },
    { id: 'marble', color: '#c2410c', name: '마블 레이스', pacing: 'player', teams: false, original: false, description: '정답을 맞힐수록 구슬이 빠르게 굴러가요.' },
    { id: 'tower', color: '#1368ce', name: '하늘 탑 쌓기', pacing: 'player', teams: false, original: true, description: '정답마다 블록을 쌓아 가장 높은 탑을 만들어요.' },
    { id: 'treasure', color: '#b37f00', name: '행운의 보물상자', pacing: 'player', teams: false, original: true, description: '정답을 맞히면 보물상자를 골라 행운을 시험해요.' }
  ];
  const COOP = new Set(['submarine', 'garden', 'boss']);
  const TEAM_MODES = new Set(['kingdom', 'space']);
  const fmtPin = pin => String(pin || '').replace(/^(\d{3})(\d{3})$/, '$1 $2');
  const num = n => Number(n || 0).toLocaleString('ko-KR');
  const fmtClock = s => { s = Math.max(0, Math.floor(s || 0)); return Math.floor(s / 60) + ':' + String(s % 60).padStart(2, '0'); };
  const vibrate = p => { try { if (navigator.vibrate) navigator.vibrate(p); } catch { /* 무시 */ } };
  const imgOk = src => typeof src === 'string' && src.startsWith('/');
  const teamInfo = (teams, i) => {
    const t = (teams || []).find(x => x && x.index === i);
    return { name: t?.name || TEAM_DEFAULT[i]?.name || `${i + 1}팀`, color: t?.color || TEAM_DEFAULT[i]?.color || '#864cbf' };
  };

  function modeMeta(id) {
    let m = null;
    try { m = KQ.modeMeta ? KQ.modeMeta(id) : null; } catch { m = null; }
    return m || { id, name: id };
  }
  function rawModeMeta(id) {
    try { return window.KQModes && typeof window.KQModes.get === 'function' ? window.KQModes.get(id) || null : null; } catch { return null; }
  }
  const warned = new Set();
  function modeCall(m, fn, ...args) {
    if (!m || typeof m[fn] !== 'function') return undefined;
    try { return m[fn](...args); } catch (e) { if (!warned.has(fn)) { warned.add(fn); console.warn('[반짝퀴즈] 모드 그래픽 오류:', fn, e); } return undefined; }
  }

  function checkIcon(size = 34) {
    return el('svg', { viewBox: '0 0 32 32', width: size, height: size, 'aria-hidden': 'true', class: 'lv-ico' },
      el('polyline', { points: '6,17 13,24 26,9', fill: 'none', stroke: 'currentColor', 'stroke-width': 5, 'stroke-linecap': 'round', 'stroke-linejoin': 'round' }));
  }
  function crossIcon(size = 34) {
    return el('svg', { viewBox: '0 0 32 32', width: size, height: size, 'aria-hidden': 'true', class: 'lv-ico' },
      el('line', { x1: 8, y1: 8, x2: 24, y2: 24, stroke: 'currentColor', 'stroke-width': 5, 'stroke-linecap': 'round' }),
      el('line', { x1: 24, y1: 8, x2: 8, y2: 24, stroke: 'currentColor', 'stroke-width': 5, 'stroke-linecap': 'round' }));
  }
  function shape(i, size) { try { return KQ.shapeIcon(i, size); } catch { return el('span', { 'aria-hidden': 'true' }); } }

  // 게임이 없는지 확인 (EventSource 는 상태 코드를 알려주지 않으므로 fetch 로 머리만 확인 후 끊음)
  async function probeGame(pin, role) {
    // Firebase 판(GitHub Pages)에는 /api 서버가 없으므로 KQ.api(info)로 게임이 있는지만 확인한다
    if (KQ.me && KQ.me.firebase) {
      try { await KQ.api(`/api/games/${encodeURIComponent(pin)}/info`); return 200; }
      catch (e) { return typeof e.status === 'number' ? e.status : 0; }
    }
    const ctrl = new AbortController();
    const t = setTimeout(() => ctrl.abort(), 5000);
    try {
      const r = await fetch(`/api/games/${encodeURIComponent(pin)}/stream?role=${role}`, { credentials: 'same-origin', signal: ctrl.signal, headers: { Accept: 'text/event-stream' } });
      return r.status;
    } catch { return 0; } finally { clearTimeout(t); try { ctrl.abort(); } catch { /* 무시 */ } }
  }
  function watchStream(pin, role, onState, onGone, onConn) {
    let lastProbe = 0, stream = null, dead = false;
    stream = KQ.stream(pin, role, v => { if (!dead) onState(v); }, async st => {
      if (dead) return;
      onConn(st);
      if (st === 'gone') { dead = true; onGone(410); return; }
      if (st === 'reconnecting' && Date.now() - lastProbe > 4000) {
        lastProbe = Date.now();
        const s = await probeGame(pin, role);
        if (!dead && [400, 401, 403, 404, 410].includes(s)) { dead = true; stream?.close(); onGone(s); }
      }
    });
    return { close() { dead = true; stream?.close(); } };
  }
  // ---------- v2: 효과·배경음악·캐릭터·QR 안전 호출 (fx.js 가 없거나 일부 함수가 없어도 죽지 않게) ----------
  const AUTO_CHOICES = [0, 5, 10, 15, 20];
  const CHEERS = ['괜찮아요, 다음 문제에서 만회해요!', '실수하면서 더 똑똑해져요', '거의 다 왔어요, 힘내요!', '다음엔 꼭 맞힐 수 있어요', '틀려도 괜찮아요, 계속 도전해요!'];
  const fxWarned = new Set();
  function fxCall(name, ...args) {
    try {
      const o = KQ.fx; const f = o && o[name];
      if (typeof f === 'function') return f.apply(o, args);
    } catch (e) { if (!fxWarned.has('fx.' + name)) { fxWarned.add('fx.' + name); console.warn('[반짝퀴즈] 효과 오류:', name, e); } }
    return undefined;
  }
  function fxCountUp(node, from, to, ms) {
    if (!node) return;
    if (KQ.fx && typeof KQ.fx.countUp === 'function') { try { KQ.fx.countUp(node, from, to, ms); return; } catch { /* 아래로 */ } }
    node.textContent = Number(to || 0).toLocaleString('ko-KR');
  }
  function fxShake(node) {
    if (!node) return;
    if (KQ.fx && typeof KQ.fx.shake === 'function') { try { KQ.fx.shake(node); return; } catch { /* 아래로 */ } }
    node.classList.remove('lv-shake'); void node.offsetWidth; node.classList.add('lv-shake');
  }
  function bgmCall(name, ...args) {
    try {
      const b = KQ.bgm; const f = b && b[name];
      if (typeof f === 'function') return f.apply(b, args);
    } catch (e) { if (!fxWarned.has('bgm.' + name)) { fxWarned.add('bgm.' + name); console.warn('[반짝퀴즈] 배경음악 오류:', name, e); } }
    return undefined;
  }
  const bgmOn = () => !!(KQ.bgm && KQ.bgm.enabled !== false);
  const bgmVol = () => { const x = KQ.bgm ? Number(KQ.bgm.volume) : NaN; return Number.isFinite(x) ? Math.max(0, Math.min(1, x)) : 0.5; };
  const snd = kind => { try { if (KQ.sound && typeof KQ.sound.play === 'function') KQ.sound.play(kind); } catch { /* 무시 */ } };

  const AV_FALLBACK = ['#e21b3c', '#1368ce', '#d89e00', '#26890c', '#864cbf', '#0aa3a3', '#c2410c', '#46178f'];
  const avKey = av => { try { return av ? JSON.stringify(av) : ''; } catch { return ''; } };
  // 캐릭터: KQ.avatar.render 가 있으면 그것, 없으면(구버전 참가자 등) 이니셜 동그라미
  function avatarNode(av, size, nickname, cls = '') {
    let inner = null;
    if (av && typeof av === 'object' && KQ.avatar && typeof KQ.avatar.render === 'function') {
      try { const r = KQ.avatar.render(av, size); if (r instanceof Node) inner = r; } catch { inner = null; }
    }
    const wrap = el('span', { class: ('lv-av ' + cls).trim(), 'aria-hidden': 'true', style: { width: size + 'px', height: size + 'px' } });
    if (inner) { wrap.append(inner); return wrap; }
    const name = String(nickname || '').trim();
    let h = 0; for (const ch of name) h = (h * 31 + ch.codePointAt(0)) >>> 0;
    wrap.classList.add('lv-av-fallback');
    wrap.style.background = AV_FALLBACK[h % AV_FALLBACK.length];
    wrap.style.fontSize = Math.max(10, Math.round(size * 0.46)) + 'px';
    if (name) wrap.textContent = Array.from(name)[0];
    else wrap.append(shape(h % 4, Math.round(size * 0.5)));
    return wrap;
  }
  function qrNode(url, px) {
    try { if (typeof KQ.qr === 'function') { const n = KQ.qr(url, px); if (n instanceof Node) return n; } } catch { /* 아래로 */ }
    return el('span', { class: 'lv-qr-missing' }, 'QR 코드를 만들 수 없어요. 주소를 직접 입력해 들어오세요.');
  }
  function joinBase(v) {
    const raw = (v && Array.isArray(v.joinUrls) && v.joinUrls[0]) || (KQ.me && Array.isArray(KQ.me.addresses) && KQ.me.addresses[0]) || (location.origin + (KQ.BASE || ''));
    return String(raw).replace(/\/+$/, '');
  }
  const joinUrlOf = (v, pin) => joinBase(v) + '/?pin=' + encodeURIComponent(String(pin || (v && v.pin) || ''));
  const shortUrl = u => String(u || '').replace(/^https?:\/\//, '').replace(/\/+$/, '');
  function crownIcon(size = 40) {
    return el('svg', { viewBox: '0 0 48 36', width: size, height: Math.round(size * 0.75), 'aria-hidden': 'true', class: 'lv-crown' },
      el('polygon', { points: '4,29 2,7 14,17 24,2 34,17 46,7 44,29', fill: '#ffd43b', stroke: '#b37f00', 'stroke-width': 2, 'stroke-linejoin': 'round' }),
      el('rect', { x: 4, y: 28, width: 40, height: 6, rx: 2, fill: '#f2b705', stroke: '#b37f00', 'stroke-width': 2 }),
      el('circle', { cx: 24, cy: 20, r: 3.2, fill: '#e21b3c' }), el('circle', { cx: 13, cy: 23, r: 2.2, fill: '#1368ce' }), el('circle', { cx: 35, cy: 23, r: 2.2, fill: '#26890c' }));
  }
  function arrowUpIcon(size = 20) {
    return el('svg', { viewBox: '0 0 24 24', width: size, height: size, 'aria-hidden': 'true', class: 'lv-up-ico' },
      el('polygon', { points: '12,2 22,13 15.5,13 15.5,22 8.5,22 8.5,13 2,13', fill: 'currentColor' }));
  }
  function starIcon(size = 40) {
    return el('svg', { viewBox: '0 0 32 32', width: size, height: size, 'aria-hidden': 'true', class: 'lv-ico' },
      el('polygon', { points: '16,2 20.2,11.6 30.5,12.4 22.6,19.1 25,29.2 16,23.8 7,29.2 9.4,19.1 1.5,12.4 11.8,11.6', fill: 'currentColor' }));
  }
  function medalNode(rank) {
    const cls = ['', 'gold', 'silver', 'bronze'][rank] || '';
    return el('div', { class: 'lv-medal ' + cls, 'aria-hidden': 'true' }, el('div', { class: 'lv-medal-ribbon' }), el('div', { class: 'lv-medal-disc' }, el('span', {}, String(rank))));
  }
  const announce = (node, text) => { node.textContent = ''; setTimeout(() => { node.textContent = text; }, 30); };

  // =====================================================================
  // 1. 홈: PIN 입장
  // =====================================================================
  KQ.route('/', (params, query) => {
    if (query.code) { KQ.go('/submit/' + encodeURIComponent(String(query.code).trim()), true); return; }
    const qpin = String(query.pin || '').replace(/\D/g, '');
    if (/^\d{6}$/.test(qpin)) { KQ.go('/play/' + qpin, true); return; }
    const err = el('p', { class: 'lv-form-error', role: 'alert' });
    const input = el('input', { class: 'input big lv-pin-input', id: 'lv-pin', type: 'text', inputmode: 'numeric', autocomplete: 'off', maxlength: 7, placeholder: '게임 PIN', 'aria-label': '게임 PIN 6자리', value: query.pin ? String(query.pin).slice(0, 7) : '' });
    input.addEventListener('input', () => { err.textContent = ''; });
    const goBtn = el('button', { type: 'submit', class: 'btn big lv-dark-btn' }, '입장');
    const form = el('form', { class: 'card lv-pin-card', novalidate: true, onSubmit: async e => {
      e.preventDefault();
      const pin = input.value.replace(/\D/g, '');
      if (!/^\d{6}$/.test(pin)) { err.textContent = '게임 PIN은 6자리 숫자예요.'; input.focus(); return; }
      goBtn.disabled = true;
      try { await KQ.api(`/api/games/${pin}/info`); }
      catch (ex) {
        goBtn.disabled = false;
        if (ex.status === 404) { err.textContent = '그 PIN의 게임이 없어요. 화면의 PIN을 다시 확인하세요.'; input.focus(); return; }
        if (ex.status === 0) { err.textContent = ex.message; return; }
        // 그 밖의 오류(예: 예전 서버에 info 없음)는 플레이 화면에서 다시 확인
      }
      KQ.go('/play/' + pin);
    } }, el('label', { class: 'sr-only', for: 'lv-pin' }, '게임 PIN'), input, err, goBtn);
    if (query.pin && !/^\d{6}$/.test(qpin)) err.textContent = '주소의 PIN이 올바르지 않아요. 6자리 숫자를 입력하세요.';
    KQ.render(el('div', { class: 'lv-home purple-bg' },
      el('div', { class: 'lv-home-inner' },
        el('h1', { class: 'logo-big lv-home-logo' }, '반짝퀴즈'),
        form,
        el('nav', { class: 'lv-home-links', 'aria-label': '다른 화면' },
          el('a', { href: '/submit', 'data-link': '' }, '문제 내러 가기'),
          el('a', { href: '/teacher', 'data-link': '' }, '선생님 화면')))));
    requestAnimationFrame(() => input.focus());
  });

  // =====================================================================
  // 2. 학생 플레이
  // =====================================================================
  KQ.route('/play/:pin', params => {
    const pin = String(params.pin || '');
    if (!/^\d{6}$/.test(pin)) {
      KQ.render(simpleScreen('PIN이 올바르지 않아요', '게임 PIN은 6자리 숫자예요.', '다시 입력하기', () => KQ.go('/')));
      return;
    }
    const live = el('div', { class: 'sr-only', role: 'status', 'aria-live': 'assertive', 'aria-atomic': 'true' });
    const barTime = el('span', { class: 'lv-pbar-time' });
    const barAv = el('span', { class: 'lv-pbar-av', 'aria-hidden': 'true' });
    const barName = el('span', { class: 'lv-pbar-name' });
    const barScore = el('span', { class: 'lv-pbar-score' });
    const bar = el('header', { class: 'lv-pbar', hidden: true }, barTime, el('span', { class: 'lv-pbar-who' }, barAv, barName), barScore);
    const main = el('main', { class: 'lv-pmain' });
    const panel = el('section', { class: 'lv-mode-panel', 'aria-label': '게임 모드 상태' });
    const autoFill = el('span', { class: 'lv-pauto-fill' });
    const autoStrip = el('div', { class: 'lv-pauto', hidden: true }, el('span', { class: 'lv-pauto-text' }, '곧 다음 문제'), el('span', { class: 'lv-pauto-track', 'aria-hidden': 'true' }, autoFill));
    const flashTitle = el('div', { class: 'lv-flash-title' });
    const flashSub = el('div', { class: 'lv-flash-sub' });
    const flash = el('div', { class: 'lv-flash', hidden: true, 'aria-hidden': 'true' }, el('div', { class: 'lv-flash-icon' }), flashTitle, flashSub);
    const shell = el('div', { class: 'lv-player lv-bg-purple' }, bar, main, autoStrip, panel, flash, live);
    KQ.render(shell);

    let view = null, sig = '', screen = null, m = null, mId = null, seeded = false, lastSeq = null, submitted = null, autoNamed = false, ended = false, flashTimer = null, panelOn = false, conn = 'ok';
    let barAvKey = null, lastScore = null, autoKey = null, autoTotal = 1;
    const pTimers = [];
    const later = (fn, ms) => { const t = setTimeout(() => { if (ended) return; try { fn(); } catch (e) { console.warn('[반짝퀴즈] 효과 오류:', e); } }, Math.max(0, ms)); pTimers.push(t); return t; };
    const sendAction = (kind, target) => KQ.api(`/api/games/${encodeURIComponent(pin)}/action`, 'POST', { kind, target }).catch(e => { KQ.toast(e.message, true); throw e; });

    function setScreen(key, built) {
      sig = key; screen = built;
      main.replaceChildren(built.node);
      shell.className = 'lv-player ' + (built.bg || 'lv-bg-purple') + (built.panelBig ? ' lv-panel-big' : '') + (built.full ? ' lv-full' : '');
      if (built.teamColor) shell.style.setProperty('--lv-team', built.teamColor); else shell.style.removeProperty('--lv-team');
      if (typeof built.enter === 'function') { try { built.enter(); } catch (e) { console.warn('[반짝퀴즈] 화면 효과 오류:', e); } }
    }
    setScreen('loading', { node: el('div', { class: 'lv-center-msg' }, el('div', { class: 'lv-spinner', 'aria-hidden': 'true' }), el('h1', {}, '게임에 연결하는 중…'), el('p', {}, 'PIN ' + fmtPin(pin))) });

    const isLocked = v => !!(v.lockedUntil && v.lockedUntil > KQ.now());
    const isSubmitted = v => !!(v.question && submitted && submitted.qid === v.question.id && submitted.seq === (v.result ? v.result.seq : null));

    function sigOf(v) {
      const q = v.question;
      return ['v', v.phase, q ? q.id : '-', (v.answered || isSubmitted(v)) ? 1 : 0, q?.ownQuestion ? 1 : 0, isLocked(v) ? 1 : 0, v.actions?.kind || '', v.result ? v.result.seq : '', v.me?.team ?? ''].join('|');
    }

    function rankUpOf(res, v) {
      const now = Number((res && res.rank) || (v && v.me && v.me.rank) || 0);
      const prev = Number(res && res.prevRank);
      return prev > 0 && now > 0 && prev > now ? prev - now : 0;
    }
    function noteResult(res, phase) {
      if (!res || res.seq === lastSeq) return false;
      lastSeq = res.seq;
      const msg = res.correct === true ? `정답! ${num(res.points)}점 획득` : res.correct === false ? '아쉬워요, 오답이에요' + (res.answerText ? `. ${res.answerText}` : '') : '응답 고마워요';
      const up = rankUpOf(res, view);
      announce(live, msg + (res.rank ? `. 현재 ${res.rank}위` : '') + (up ? `. ${up}계단 올랐어요` : ''));
      if (res.correct === true) { snd('correct'); vibrate(60); }
      else if (res.correct === false) { snd('wrong'); vibrate([80, 60, 80]); }
      else snd('sparkle');
      if (phase === 'running') showFlash(res);
      return true;
    }
    // 진행자가 넘기는 게임의 정답 공개 효과 (같은 seq 로는 한 번만: noteResult 가 걸러 줌)
    function celebrate(res) {
      const sc = screen || {};
      const streak = Number(res.streak) || 0;
      if (res.correct === true) {
        fxCall('flash', '#ffffff', 260);
        fxCall('confetti', { y: 0.78, count: Math.min(320, 90 + streak * 35), power: Math.min(1.9, 1 + streak * 0.12), spread: Math.min(110, 70 + streak * 6) });
        fxCall('stamp', '정답!', { color: '#26890c', sub: streak >= 2 ? `연속 정답 ${streak}` : '' });
        if (sc.pointsNum) fxCountUp(sc.pointsNum, 0, Number(res.points) || 0, 900);
        if (streak >= 3) later(() => snd('cheer'), 380);
        if (streak >= 3 && sc.streakEl) later(() => fxCall('stars', sc.streakEl), 600);
      } else if (res.correct === false) {
        later(() => fxShake(sc.node), 60);
      } else if (sc.icon) {
        later(() => fxCall('stars', sc.icon), 150);
      }
      if (rankUpOf(res, view) > 0) later(() => { snd('levelup'); if (sc.rankBadge) fxCall('stars', sc.rankBadge); }, 900);
    }
    function showFlash(res) {
      clearTimeout(flashTimer);
      const good = res.correct === true, bad = res.correct === false;
      flash.className = 'lv-flash ' + (good ? 'good' : bad ? 'bad' : 'neutral');
      const icon = flash.firstChild; icon.replaceChildren(good ? checkIcon(64) : bad ? crossIcon(64) : checkIcon(64));
      flashTitle.textContent = good ? '정답!' : bad ? '아쉬워요' : '응답 고마워요';
      flashSub.textContent = good ? `+${num(res.points)}` + (res.streak >= 2 ? `  ·  연속 정답 ${res.streak}` : '') : bad ? (res.answerText || '다음 문제에서 만회해요') : '';
      flash.hidden = false;
      if (good) fxCall('confetti', { y: 0.62, count: Math.min(90, 36 + (Number(res.streak) || 0) * 8), power: 0.75, spread: 60 });
      else if (bad) fxShake(icon);
      flashTimer = setTimeout(() => { flash.hidden = true; }, 900);
    }

    function updateBar(v) {
      const me = v.me;
      bar.hidden = !me;
      if (!me) return;
      barName.textContent = me.nickname || '';
      const k = avKey(me.avatar) + '|' + (me.nickname || '');
      if (k !== barAvKey) { barAvKey = k; barAv.replaceChildren(avatarNode(me.avatar, 32, me.nickname)); }
      const sc = Number(me.score) || 0;
      if (lastScore !== null && sc > lastScore) fxCountUp(barScore, lastScore, sc, 900);
      else if (lastScore !== sc) barScore.textContent = num(sc);
      lastScore = sc;
      barScore.setAttribute('aria-label', `점수 ${num(me.score)}점`);
      if (me.teamColor) bar.style.setProperty('--lv-team', me.teamColor); else bar.style.removeProperty('--lv-team');
      bar.classList.toggle('lv-pbar-team', !!me.teamColor);
      updateTime(v);
    }
    function updateTime(v) {
      if ((v.phase === 'question' || v.phase === 'running') && v.endsAt) {
        const s = KQ.secondsLeft(v.endsAt);
        barTime.textContent = v.phase === 'running' ? fmtClock(s) : String(s);
        barTime.setAttribute('aria-label', `남은 시간 ${s}초`);
        barTime.classList.toggle('hurry', s <= 5);
        barTime.hidden = false;
      } else { barTime.textContent = ''; barTime.hidden = true; }
    }
    // 학생 기기: 자동 넘김이 예약돼 있으면 작은 "곧 다음 문제" 막대
    function updateAuto(v) {
      const on = !!(v && v.autoAt && v.me && !v.kicked && (v.phase === 'reveal' || v.phase === 'leaderboard'));
      autoStrip.hidden = !on;
      if (!on) { autoKey = null; return; }
      const rem = Math.max(0, Number(v.autoAt) - KQ.now());
      if (autoKey !== v.autoAt) { autoKey = v.autoAt; autoTotal = Math.max(1000, rem); }
      autoFill.style.transform = `scaleX(${Math.min(1, rem / autoTotal).toFixed(3)})`;
    }
    function renderPanel(v) {
      if (!v.me || v.kicked) { if (panelOn) { modeCall(m, 'dispose', panel); panel.replaceChildren(); panelOn = false; } return; }
      panelOn = true;
      modeCall(m, 'renderPlayer', panel, v, sendAction);
    }

    function apply(v) {
      if (ended) return;
      view = v;
      if (v.kicked) {
        renderPanel(v); bar.hidden = true;
        if (sig !== 'kicked') setScreen('kicked', { node: msgNode('진행자가 게임에서 내보냈어요', '궁금한 점은 선생님께 여쭤보세요.', true), bg: 'lv-bg-purple' });
        return;
      }
      if (!m || mId !== v.mode) { if (m && panelOn) { modeCall(m, 'dispose', panel); panel.replaceChildren(); panelOn = false; } m = modeMeta(v.mode); mId = v.mode; }
      if (!v.me) {
        updateBar(v); renderPanel(v);
        if (sig !== 'join') setScreen('join', joinScreen(v));
        return;
      }
      const seq = v.result ? v.result.seq : null;
      let fresh = false;
      if (!seeded) { seeded = true; lastSeq = seq; } else if (v.result && (v.phase === 'running' || v.phase === 'reveal')) fresh = noteResult(v.result, v.phase);
      updateBar(v);
      const s = sigOf(v);
      if (s !== sig) setScreen(s, build(v)); else if (screen && screen.update) screen.update(v);
      renderPanel(v);
      updateAuto(v);
      if (fresh && v.phase === 'reveal') celebrate(v.result);
    }

    function build(v) {
      const q = v.question;
      switch (v.phase) {
        case 'lobby': return lobbyScreen(v);
        case 'countdown': return countdownScreen(v);
        case 'question':
        case 'running': {
          if (v.phase === 'running' && isLocked(v)) return lockScreen(v);
          if (v.phase === 'running' && v.actions && v.actions.kind === 'chest') return { node: msgNode('보물상자를 골라요!', '아래 상자 중 하나를 눌러 보세요.'), bg: 'lv-bg-purple', panelBig: true };
          if (!q) return { node: waitNode(v.phase === 'running' ? '다음 문제를 불러오는 중…' : '다음 문제를 기다려요', '곧 시작해요.'), bg: 'lv-bg-purple' };
          if (q.ownQuestion) return { node: msgNode('내가 낸 문제예요!', '이번 문제는 쉬어가요. 친구들이 어떻게 푸는지 화면을 보세요.'), bg: 'lv-bg-purple' };
          if (v.answered || isSubmitted(v)) {
            if (v.pacing === 'player') return { node: waitNode('다음 문제 준비 중…', ''), bg: 'lv-bg-light' };
            return { node: waitNode('답을 보냈어요!', '다른 친구들을 기다리는 중…'), bg: 'lv-bg-purple' };
          }
          return questionScreen(v);
        }
        case 'reveal': return revealScreen(v);
        case 'leaderboard': return leaderboardScreen(v);
        case 'finished': return finishedScreen(v);
        default: return { node: waitNode('잠시만 기다려 주세요', ''), bg: 'lv-bg-purple' };
      }
    }

    // --- 닉네임 + 캐릭터 ---
    function joinScreen(v) {
      const err = el('p', { class: 'lv-form-error', role: 'alert' });
      const input = el('input', { class: 'input big', id: 'lv-nick', type: 'text', maxlength: 15, autocomplete: 'off', placeholder: '닉네임', 'aria-describedby': 'lv-nick-help' });
      input.addEventListener('input', () => { err.textContent = ''; });
      const randomBtn = KQ.btn('무작위 닉네임', async () => {
        randomBtn.disabled = true;
        try { const r = await KQ.api('/api/nickname'); input.value = String(r.nickname || '').slice(0, 15); }
        catch { input.value = KQ.randomNickname().slice(0, 15); }
        finally { randomBtn.disabled = false; input.focus(); err.textContent = ''; }
      }, 'ghost lv-random-btn');
      // 캐릭터 편집기 (fx.js 의 KQ.avatar 가 없으면 생략)
      let curAv = null, editor = null;
      if (KQ.avatar && typeof KQ.avatar.editor === 'function') {
        try {
          curAv = typeof KQ.avatar.saved === 'function' ? KQ.avatar.saved() : (typeof KQ.avatar.random === 'function' ? KQ.avatar.random() : null);
          const ed = KQ.avatar.editor(curAv, av => { curAv = av; });
          editor = ed instanceof Node ? ed : null;
        } catch (e) { console.warn('[반짝퀴즈] 캐릭터 편집기 오류:', e); editor = null; }
      }
      // 편집기 단추가 폼 제출을 일으키지 않도록 편집기는 폼 밖에 두고, 확인 단추는 form 속성으로 폼에 연결
      const okBtn = el('button', { type: 'submit', class: 'btn big lv-dark-btn lv-join-ok', form: 'lv-join-form' }, editor ? '이 캐릭터로 입장' : '확인');
      const form = el('form', { id: 'lv-join-form', class: 'lv-join-form', novalidate: true, onSubmit: async e => {
        e.preventDefault();
        const nick = input.value.trim();
        if (nick.length < 1 || nick.length > 15) { err.textContent = '닉네임은 1~15자로 입력하세요.'; input.focus(); return; }
        okBtn.disabled = true; randomBtn.disabled = true;
        if (curAv && KQ.avatar && typeof KQ.avatar.save === 'function') { try { KQ.avatar.save(curAv); } catch { /* 무시 */ } }
        try {
          const body = { nickname: nick };
          if (curAv) body.avatar = curAv;
          const r = await KQ.api(`/api/games/${encodeURIComponent(pin)}/join`, 'POST', body);
          if (r.me) {
            autoNamed = !!(r.me.nickname && r.me.nickname !== nick);
            const me = { ...r.me };
            if (!me.avatar && curAv) me.avatar = curAv;
            if (view) { view = { ...view, me }; sig = ''; apply(view); }
          }
        } catch (ex) {
          err.textContent = ex.status === 404 ? '게임을 찾을 수 없어요. PIN을 확인하세요.'
            : ex.status === 423 ? (ex.message || '지금은 게임이 잠겨 있어요. 선생님께 여쭤보세요.')
            : ex.status === 403 ? (ex.message || '이 게임에는 다시 들어갈 수 없어요.')
            : ex.message;
          okBtn.disabled = false; randomBtn.disabled = false; input.focus();
        }
      } },
      el('p', { class: 'lv-join-pinline' }, 'PIN ' + fmtPin(pin)),
      v.quizTitle ? el('p', { class: 'lv-join-title' }, v.quizTitle) : null,
      el('label', { class: 'lv-field-label', for: 'lv-nick' }, '닉네임'),
      input,
      el('p', { class: 'lv-help', id: 'lv-nick-help' }, '1~15자, 친구가 알아볼 수 있는 순한 이름으로 정해요.'),
      randomBtn);
      const card = el('div', { class: 'card lv-pin-card lv-join-card' }, form,
        editor ? el('section', { class: 'lv-av-section', 'aria-labelledby': 'lv-av-h' }, el('h2', { class: 'lv-av-h', id: 'lv-av-h' }, '내 캐릭터 고르기'), editor) : null,
        err, okBtn);
      // 휴대폰에서는 키보드가 캐릭터 고르기를 가리지 않도록 자동 포커스하지 않는다
      const coarse = !!(window.matchMedia && window.matchMedia('(pointer:coarse)').matches);
      if (!coarse || !editor) requestAnimationFrame(() => input.focus());
      return { node: el('div', { class: 'lv-home-inner lv-join-inner' }, el('h1', { class: 'logo-big lv-home-logo' }, '반짝퀴즈'), card), bg: 'lv-bg-purple', full: true };
    }

    // --- 로비 ---
    function lobbyScreen(v) {
      const me = v.me;
      const avBox = el('div', { class: 'lv-p-lobby-av pop-in' });
      const nickEl = el('div', { class: 'lv-nick-big pop-in' }, me.nickname || '');
      let shownKey = null;
      const update = vv => {
        const mm = vv.me || {};
        const k = avKey(mm.avatar) + '|' + (mm.nickname || '');
        if (k === shownKey) return;
        shownKey = k;
        avBox.replaceChildren(avatarNode(mm.avatar, 132, mm.nickname));
        nickEl.textContent = mm.nickname || '';
      };
      update(v);
      const canEdit = !!(KQ.avatar && typeof KQ.avatar.editor === 'function');
      const node = el('div', { class: 'lv-center-msg lv-p-lobby' },
        el('h1', {}, '들어왔어요!'),
        el('p', { class: 'lv-lead' }, '화면에서 내 캐릭터와 닉네임을 확인하세요'),
        avBox,
        nickEl,
        canEdit ? KQ.btn('캐릭터 바꾸기', () => openAvatarEdit(), 'small lv-white-btn lv-av-change') : null,
        autoNamed ? el('p', { class: 'lv-note' }, '닉네임이 자동으로 정해졌어요') : null,
        el('p', { class: 'lv-p-mode' }, v.modeName || modeMeta(v.mode).name || ''),
        me.teamName ? el('p', { class: 'lv-team-badge' }, me.teamName) : null,
        el('div', { class: 'lv-dots', 'aria-hidden': 'true' }, el('span'), el('span'), el('span')),
        el('p', { class: 'lv-sub' }, '선생님이 곧 시작해요'));
      announce(live, `${me.nickname} 닉네임으로 들어왔어요`);
      return { node, bg: me.teamColor ? 'lv-bg-team' : 'lv-bg-purple', teamColor: me.teamColor, update };
    }
    function openAvatarEdit() {
      if (!view || !view.me || !KQ.avatar) return;
      let cur = view.me.avatar || (typeof KQ.avatar.saved === 'function' ? KQ.avatar.saved() : null);
      let ed = null;
      try { ed = KQ.avatar.editor(cur, av => { cur = av; }); } catch (e) { console.warn('[반짝퀴즈] 캐릭터 편집기 오류:', e); }
      if (!(ed instanceof Node)) { KQ.toast('캐릭터 편집기를 열 수 없어요.', true); return; }
      const md = KQ.modal('내 캐릭터 바꾸기');
      md.root.classList.add('lv-av-modal');
      md.body.append(ed);
      const save = KQ.btn('저장', async () => {
        save.disabled = true;
        try {
          if (typeof KQ.avatar.save === 'function') { try { KQ.avatar.save(cur); } catch { /* 무시 */ } }
          const r = await KQ.api(`/api/games/${encodeURIComponent(pin)}/join`, 'POST', { nickname: view.me.nickname, avatar: cur });
          if (view && view.me) {
            view = { ...view, me: { ...view.me, ...((r && r.me) || {}), avatar: cur } };
            if (screen && screen.update) screen.update(view);
            updateBar(view);
          }
          md.close();
          KQ.toast('캐릭터를 바꿨어요.');
        } catch (e) { KQ.toast(e.message, true); save.disabled = false; }
      }, 'primary');
      md.foot.append(KQ.btn('취소', () => md.close(), 'ghost'), save);
    }

    // --- 카운트다운 ---
    function countdownScreen(v) {
      const big = el('div', { class: 'lv-count-big', 'aria-hidden': 'true' });
      let lastN = null;
      const tick = vv => {
        const n = Math.max(1, KQ.secondsLeft(vv.endsAt) || 1);
        if (n !== lastN) { lastN = n; const s = el('span', { class: 'lv-count-num' }, String(n)); big.replaceChildren(s); }
      };
      tick(v);
      return { node: el('div', { class: 'lv-center-msg' }, el('p', { class: 'lv-lead' }, v.quizTitle || ''), big, el('h1', {}, '준비!')), bg: 'lv-bg-purple', tick, update: tick };
    }

    // --- 수리 중 (로봇) ---
    function lockScreen(v) {
      const n = el('span', {}, '');
      const tick = vv => {
        if (!isLocked(vv)) { sig = ''; apply(vv); return; }
        n.textContent = String(Math.max(1, Math.ceil((vv.lockedUntil - KQ.now()) / 1000)));
      };
      tick(v);
      return { node: el('div', { class: 'lv-center-msg' }, el('div', { class: 'lv-gear', 'aria-hidden': 'true' }), el('h1', {}, '로봇 수리 중… ', n, '초'), el('p', {}, '오답이라 잠깐 멈췄어요. 곧 다시 달려요!')), bg: 'lv-bg-bad', tick };
    }

    // --- 문제 ---
    function questionScreen(v) {
      const q = v.question;
      const wrap = el('div', { class: 'lv-q lv-q-' + q.type });
      if (q.text) wrap.append(el('h1', { class: 'lv-q-text' }, q.text));
      else wrap.append(el('p', { class: 'lv-q-look' }, '화면을 보세요'));
      if (q.text && imgOk(q.image)) wrap.append(el('div', { class: 'lv-q-img' }, el('img', { src: q.image, alt: '문제 그림' })));
      const controls = [];
      let busy = false;
      const lockAll = on => controls.forEach(c => { c.disabled = on; });
      async function send(answer) {
        if (busy) return;
        busy = true; lockAll(true);
        const seqBefore = view && view.result ? view.result.seq : null;
        try {
          const r = await KQ.api(`/api/games/${encodeURIComponent(pin)}/answer`, 'POST', { questionId: q.id, answer });
          if (view && view.question && view.question.id === q.id && (view.result ? view.result.seq : null) === seqBefore) submitted = { qid: q.id, seq: seqBefore };
          if (view && view.pacing === 'player' && r && r.result) noteResult(r.result, 'running');
          else KQ.sound.play('pop');
          if (view) { const s = sigOf(view); if (s !== sig) setScreen(s, build(view)); }
        } catch (e) {
          KQ.toast(e.message, true);
          busy = false; lockAll(false);
        }
      }
      if (q.type === 'quiz' || q.type === 'truefalse' || q.type === 'poll') {
        const n = Math.min(4, q.choiceCount || (q.choices || []).length || 0);
        const grid = el('div', { class: 'lv-choices lv-choices-' + n, role: 'group', 'aria-label': '보기' });
        for (let i = 0; i < n; i++) {
          const t = q.choices && q.choices[i] ? q.choices[i].text : null;
          const b = el('button', { type: 'button', class: `answer-tile shape-${i} lv-choice`, 'aria-label': SHAPE_NAMES[i] + (t ? `: ${t}` : ''), onClick: () => send(i) }, shape(i, t ? 34 : 64), t ? el('span', { class: 'lv-choice-text' }, t) : null);
          if (!t) b.classList.add('lv-choice-shape-only');
          controls.push(b); grid.append(b);
        }
        wrap.append(grid);
      } else if (q.type === 'type') {
        const inp = el('input', { class: 'input big', id: 'lv-type', type: 'text', maxlength: 20, autocomplete: 'off', placeholder: '답을 입력하세요' });
        const sub = el('button', { type: 'submit', class: 'btn big lv-dark-btn' }, '제출');
        controls.push(inp, sub);
        wrap.append(el('form', { class: 'lv-type-form', novalidate: true, onSubmit: e => {
          e.preventDefault();
          const a = inp.value.trim();
          if (!a) { KQ.toast('답을 입력하세요.', true); inp.focus(); return; }
          send(a.slice(0, 20));
        } }, el('label', { class: 'sr-only', for: 'lv-type' }, '답 입력'), inp, sub));
        if (window.matchMedia && !window.matchMedia('(pointer:coarse)').matches) requestAnimationFrame(() => inp.focus());
      } else if (q.type === 'slider') {
        const sl = q.slider || {};
        const min = Number.isFinite(+sl.min) ? +sl.min : 0, max = Number.isFinite(+sl.max) ? +sl.max : 100, step = +sl.step > 0 ? +sl.step : 1;
        const start = Math.round(((min + max) / 2 - min) / step) * step + min;
        const dec = (String(step).split('.')[1] || '').length;
        const out = el('output', { class: 'lv-slider-out', for: 'lv-slider' }, start.toFixed(dec));
        const range = el('input', { type: 'range', id: 'lv-slider', class: 'lv-range', min, max, step, value: start, 'aria-label': '숫자 고르기' });
        range.addEventListener('input', () => { out.textContent = (+range.value).toFixed(dec); });
        const minus = KQ.btn('-', () => { range.value = String(Math.max(min, +range.value - step)); out.textContent = (+range.value).toFixed(dec); }, 'lv-step-btn', { 'aria-label': '조금 작게' });
        const plus = KQ.btn('+', () => { range.value = String(Math.min(max, +range.value + step)); out.textContent = (+range.value).toFixed(dec); }, 'lv-step-btn', { 'aria-label': '조금 크게' });
        const sub = KQ.btn('제출', () => send(+(+range.value).toFixed(dec)), 'big lv-dark-btn');
        controls.push(range, minus, plus, sub);
        wrap.append(el('div', { class: 'lv-slider' }, out, el('div', { class: 'lv-slider-row' }, minus, range, plus), el('div', { class: 'lv-slider-ends' }, el('span', {}, String(min)), el('span', {}, String(max))), sub));
      } else if (q.type === 'puzzle') {
        let items = (q.puzzleItems || []).slice();
        const list = el('ol', { class: 'lv-puzzle', 'aria-label': '순서 맞추기 항목' });
        let dragIdx = -1;
        const move = (from, to) => { if (to < 0 || to >= items.length || from === to) return; const [it] = items.splice(from, 1); items.splice(to, 0, it); draw(to); };
        function draw(focusIdx) {
          list.replaceChildren();
          items.forEach((it, i) => {
            const up = KQ.btn('위로', () => move(i, i - 1), 'small lv-pz-btn', { 'aria-label': `${it.text} 위로 올리기`, disabled: i === 0 });
            const down = KQ.btn('아래로', () => move(i, i + 1), 'small lv-pz-btn', { 'aria-label': `${it.text} 아래로 내리기`, disabled: i === items.length - 1 });
            const li = el('li', { class: `lv-pz-item shape-${i % 4}`, draggable: 'true' }, el('span', { class: 'lv-pz-num', 'aria-hidden': 'true' }, String(i + 1)), el('span', { class: 'lv-pz-text' }, it.text), el('span', { class: 'lv-pz-btns' }, up, down));
            li.addEventListener('dragstart', e => { dragIdx = i; li.classList.add('dragging'); try { e.dataTransfer.setData('text/plain', String(i)); e.dataTransfer.effectAllowed = 'move'; } catch { /* 무시 */ } });
            li.addEventListener('dragend', () => li.classList.remove('dragging'));
            li.addEventListener('dragover', e => { e.preventDefault(); li.classList.add('over'); });
            li.addEventListener('dragleave', () => li.classList.remove('over'));
            li.addEventListener('drop', e => { e.preventDefault(); li.classList.remove('over'); if (dragIdx >= 0) move(dragIdx, i); dragIdx = -1; });
            list.append(li);
            if (focusIdx === i) requestAnimationFrame(() => { const b = (i === 0 ? down : up); if (!b.disabled) b.focus(); });
          });
        }
        draw();
        const sub = KQ.btn('제출', () => send(items.map(x => x.id)), 'big lv-dark-btn');
        controls.push(sub);
        wrap.append(el('p', { class: 'lv-help' }, '위로/아래로 버튼이나 끌어서 올바른 순서로 맞춘 뒤 제출하세요.'), list, sub);
      } else {
        wrap.append(el('p', {}, '이 문제 형식은 화면을 보고 참여해요.'));
      }
      return { node: wrap, bg: 'lv-bg-light' };
    }

    // --- 정답 공개 ---
    function revealScreen(v) {
      const r = v.result, q = v.question, me = v.me;
      const team = TEAM_MODES.has(v.mode);
      let bg = 'lv-bg-purple', pointsNum = null, icon = null, rankBadge = null, streakEl = null;
      const box = el('div', { class: 'lv-center-msg lv-result' + (team ? ' compact' : '') });
      if (!r) {
        if (q && q.ownQuestion) add(box, el('h1', {}, '내가 낸 문제였어요'), el('p', {}, '친구들이 잘 풀었는지 화면을 보세요.'));
        else { bg = 'lv-bg-dark'; add(box, el('div', { class: 'lv-res-icon' }, crossIcon(56)), el('h1', {}, '시간이 끝났어요'), el('p', {}, '이번 문제는 답하지 못했어요. 다음 문제를 노려 봐요!')); }
      } else if (r.correct === true) {
        bg = 'lv-bg-good';
        const st = Number(r.streak) || 0;
        pointsNum = el('span', { class: 'lv-points-num' }, num(r.points));
        icon = el('div', { class: 'lv-res-icon pop-in' }, checkIcon(64));
        streakEl = st >= 2 ? el('div', { class: 'lv-streak lv-streak-hot' + (st >= 3 ? ' fire' : '') + (st >= 5 ? ' blaze' : '') }, el('span', { class: 'lv-flame', 'aria-hidden': 'true' }), `연속 정답 ${st}`) : null;
        add(box, icon, el('h1', { class: 'lv-res-title lv-res-pop' }, '정답!'),
          el('div', { class: 'lv-points pop-in' }, '+', pointsNum),
          streakEl);
      } else if (r.correct === false) {
        bg = 'lv-bg-bad';
        icon = el('div', { class: 'lv-res-icon' }, crossIcon(64));
        add(box, icon, el('h1', { class: 'lv-res-title' }, '아쉬워요'),
          el('p', { class: 'lv-cheer' }, CHEERS[Math.abs(Number(r.seq) || 0) % CHEERS.length]),
          r.answerText ? el('p', { class: 'lv-answer-text' }, r.answerText) : null,
          r.lostStreak ? el('p', { class: 'lv-sub' }, '연속 정답이 끊겼어요') : null);
      } else {
        icon = el('div', { class: 'lv-res-icon lv-res-poll pop-in' }, starIcon(56));
        add(box, icon, el('h1', { class: 'lv-res-title' }, '응답 고마워요'), el('p', { class: 'lv-sub' }, '설문은 정답이 없어요. 모두의 생각을 화면에서 봐요.'));
      }
      const rank = (r && r.rank) || me.rank;
      if (rank) add(box, el('div', { class: 'lv-rank-pill' }, `현재 ${rank}위`));
      const up = r ? rankUpOf(r, v) : 0;
      if (up) { rankBadge = el('div', { class: 'lv-rankup' }, arrowUpIcon(22), el('span', {}, `${up}계단 상승!`)); box.append(rankBadge); }
      if (r && r.message) add(box, el('p', { class: 'lv-message' }, r.message));
      if (team && v.actions && v.actions.remaining > 0) box.append(el('p', { class: 'lv-sub' }, v.actions.kind === 'launch' ? '아래에서 에너지를 보낼 행성을 눌러요!' : '아래 지도를 눌러 땅을 차지해요!'));
      return { node: box, bg, panelBig: team, pointsNum, icon, rankBadge, streakEl };
    }

    // --- 순위 (클래식) ---
    function leaderboardScreen(v) {
      const me = v.me;
      const box = el('div', { class: 'lv-center-msg' },
        el('p', { class: 'lv-lead' }, '점수판'),
        el('h1', { class: 'lv-rank-big' }, me.rank ? `현재 ${me.rank}위` : '현재 순위'),
        el('p', {}, `${num(me.score)}점`),
        top5List(v.leaderboard, me));
      return { node: box, bg: 'lv-bg-purple' };
    }
    function top5List(rows, me) {
      const list = el('ol', { class: 'lv-top5', 'aria-label': '상위 5명' });
      (rows || []).slice(0, 5).forEach((row, i) => {
        list.append(el('li', { class: 'lv-top5-row' + (me && row.nickname === me.nickname ? ' me' : ''), style: { animationDelay: (i * 0.12) + 's' } },
          el('span', { class: 'lv-top5-rank' }, String(row.rank || i + 1)),
          avatarNode(row.avatar, 30, row.nickname, 'lv-top5-av'),
          el('span', { class: 'lv-top5-name' }, row.nickname || ''),
          el('span', { class: 'lv-top5-score' }, num(row.score))));
      });
      if (!list.childNodes.length) list.append(el('li', { class: 'lv-top5-row' }, el('span', { class: 'lv-top5-name' }, '아직 순위가 없어요')));
      return list;
    }

    // --- 종료 ---
    function finishedScreen(v) {
      const me = v.me;
      const rank = Number(me.rank) || 0;
      const top = rank >= 1 && rank <= 3;
      const pod = (v.podium || []).slice().sort((a, b) => (a.rank || 99) - (b.rank || 99));
      const top3 = el('div', { class: 'lv-mini-podium', 'aria-hidden': 'true' },
        [1, 0, 2].map(i => pod[i] ? el('div', { class: `lv-mini-pod p${i + 1}` }, avatarNode(pod[i].avatar, 36, pod[i].nickname, 'lv-mini-av'), el('span', { class: 'lv-mini-name' }, pod[i].nickname || ''), el('span', { class: 'lv-mini-block' }, String(pod[i].rank || i + 1))) : el('div', { class: `lv-mini-pod p${i + 1} empty` })));
      const scoreNum = el('span', { class: 'lv-final-num' }, num(me.score));
      const acc = me.answered ? (Number(me.correct) || 0) / me.answered : 0;
      const praise = top ? ['', '최고예요! 1등을 차지했어요', '멋져요! 2등이에요', '훌륭해요! 3등이에요'][rank] : '끝까지 함께해 줘서 고마워요';
      const praiseSub = top ? '끝까지 함께해 줘서 고마워요'
        : acc >= 0.7 ? '정답을 정말 많이 맞혔어요. 대단해요!'
        : (Number(me.correct) || 0) > 0 ? `${me.correct}문제나 맞혔어요. 다음엔 더 잘할 수 있어요!`
        : '다음 게임에서 더 멋지게 해 봐요!';
      const box = el('div', { class: 'lv-center-msg lv-finished' + (top ? ' lv-fin-top' : '') },
        el('p', { class: 'lv-lead' }, '게임 끝!'),
        el('div', { class: 'lv-fin-me' }, avatarNode(me.avatar, 120, me.nickname, 'lv-fin-av'), top ? medalNode(rank) : null),
        el('h1', { class: 'lv-rank-big lv-fin-rank pop-in' }, rank ? `${rank}위` : '수고했어요'),
        el('p', { class: 'lv-praise' }, praise),
        el('p', { class: 'lv-praise-sub' }, praiseSub),
        el('p', { class: 'lv-final-score' }, scoreNum, '점' + (me.answered ? ` · ${me.answered}문제 중 ${me.correct || 0}개 정답` : '')),
        top3,
        top5List(pod, me),
        KQ.btn('다시 홈으로', () => KQ.go('/'), 'big lv-white-btn'));
      announce(live, `게임이 끝났어요. ${rank ? rank + '위' : ''}, ${num(me.score)}점. ${praise}`);
      const enter = () => {
        fxCountUp(scoreNum, 0, Number(me.score) || 0, 1400);
        if (top) {
          later(() => { fxCall('fireworks', 5000); snd('fanfare'); }, 350);
          later(() => snd('cheer'), 1300);
        } else {
          fxCall('rain', 4500);
          later(() => snd('sparkle'), 300);
        }
      };
      return { node: box, bg: 'lv-bg-purple', enter };
    }

    function onGone() {
      if (view && view.phase === 'finished' && view.me) { ended = true; return; }
      ended = true;
      bar.hidden = true;
      if (panelOn) { modeCall(m, 'dispose', panel); panel.replaceChildren(); panelOn = false; }
      setScreen('gone', { node: msgNode('게임이 끝났거나 없어요', 'PIN을 다시 확인하거나 선생님께 여쭤보세요.', true), bg: 'lv-bg-purple' });
    }

    const timer = setInterval(() => {
      if (!view || ended) return;
      updateTime(view);
      updateAuto(view);
      if (screen && screen.tick) screen.tick(view);
    }, 250);
    const stream = watchStream(pin, 'player', apply, onGone, st => {
      conn = st;
      shell.classList.toggle('lv-offline', conn === 'reconnecting');
    });
    KQ.onLeave(() => {
      ended = true;
      clearInterval(timer); clearTimeout(flashTimer); stream.close();
      while (pTimers.length) clearTimeout(pTimers.pop());
      if (panelOn) modeCall(m, 'dispose', panel);
      // 학생 기기는 배경음악을 틀지 않지만, 혹시 남아 있으면 정리
      fxCall('stop'); bgmCall('stop');
    });
  });

  function msgNode(title, sub, withHome) {
    return el('div', { class: 'lv-center-msg' }, el('h1', {}, title), sub ? el('p', {}, sub) : null, withHome ? KQ.btn('처음으로', () => KQ.go('/'), 'big lv-white-btn') : null);
  }
  function waitNode(title, sub) {
    return el('div', { class: 'lv-center-msg' }, el('div', { class: 'lv-spinner', 'aria-hidden': 'true' }), el('h1', {}, title), sub ? el('p', {}, sub) : null);
  }
  function simpleScreen(title, sub, btnText, onClick) {
    return el('div', { class: 'lv-home purple-bg' }, el('div', { class: 'lv-home-inner' }, el('div', { class: 'card lv-pin-card' }, el('h1', {}, title), el('p', {}, sub), KQ.btn(btnText, onClick, 'big lv-dark-btn'))));
  }

  // =====================================================================
  // 3. 게임 만들기 (모드 선택)
  // =====================================================================
  KQ.route('/teacher/host/:quizId', async params => {
    if (!KQ.me || !KQ.me.teacher) { KQ.go('/teacher', true); return; }
    const quizId = params.quizId;
    KQ.render(el('div', {}, KQ.topbar(el('a', { href: '/teacher', 'data-link': '', class: 'btn ghost small' }, '대시보드')), el('div', { class: 'page' }, el('p', { class: 'muted' }, '불러오는 중…'))));
    const [qr, mr] = await Promise.allSettled([KQ.api('/api/quizzes/' + encodeURIComponent(quizId)), KQ.api('/api/modes')]);
    if (qr.status === 'rejected') throw qr.reason;
    const quiz = qr.value.quiz || {};
    const qs = Array.isArray(quiz.questions) ? quiz.questions : [];
    const pollCount = qs.filter(x => x.type === 'poll').length;
    let modes = mr.status === 'fulfilled' && Array.isArray(mr.value.modes) && mr.value.modes.length ? mr.value.modes : null;
    if (!modes) { try { modes = Array.isArray(window.KQModes?.list) && window.KQModes.list.length ? window.KQModes.list : null; } catch { modes = null; } }
    if (!modes) modes = FALLBACK_MODES;
    const infos = modes.map(md => {
      const fb = FALLBACK_MODES.find(f => f.id === md.id) || {};
      const raw = rawModeMeta(md.id) || {};
      return { ...fb, ...raw, ...md, name: md.name || raw.name || fb.name || md.id, color: raw.color || md.color || fb.color || '#46178f', icon: raw.icon || md.icon, description: raw.description || md.description || fb.description || '', howTo: Array.isArray(raw.howTo) ? raw.howTo : Array.isArray(md.howTo) ? md.howTo : [], tag: raw.tag || md.tag || (md.original ? '반짝 오리지널' : '') };
    });

    let selected = null;
    const cards = new Map();
    const optsBox = el('section', { class: 'card lv-opts', hidden: true, 'aria-live': 'polite', 'aria-label': '게임 옵션' });
    const grid = el('div', { class: 'lv-mode-grid', role: 'group', 'aria-label': '게임 모드' });
    for (const info of infos) {
      let icon = null;
      try { icon = typeof info.icon === 'function' ? info.icon() : null; } catch { icon = null; }
      if (!(icon instanceof Node)) icon = el('span', { class: 'lv-mode-fallback-icon', 'aria-hidden': 'true' }, shape(0, 22), shape(1, 22), shape(2, 22), shape(3, 22));
      const card = el('button', { type: 'button', class: 'lv-mode-card', 'aria-pressed': 'false', 'aria-label': [info.name, info.pacing === 'player' ? '각자 속도로 달리는 게임' : '진행자가 넘기는 게임', info.teams ? '팀 대항' : '', info.original ? '반짝 오리지널' : '', info.description].filter(Boolean).join(', '), style: { '--lv-mode': info.color }, onClick: () => choose(info) },
        el('div', { class: 'lv-mode-art' }, icon),
        el('div', { class: 'lv-mode-body' },
          el('div', { class: 'lv-mode-badges' },
            info.tag ? el('span', { class: 'badge ' + (info.original ? 'orange' : 'purple') }, info.tag) : null,
            el('span', { class: 'badge' }, info.pacing === 'player' ? '각자 속도로 달리는 게임' : '진행자가 넘기는 게임'),
            info.teams ? el('span', { class: 'badge green' }, '팀 대항') : null,
            COOP.has(info.id) ? el('span', { class: 'badge green' }, '반 전체 협동') : null),
          el('h3', { class: 'lv-mode-name' }, info.name),
          info.description ? el('p', { class: 'lv-mode-desc' }, info.description) : null,
          info.howTo.length ? el('ol', { class: 'lv-mode-how' }, info.howTo.slice(0, 3).map(t => el('li', {}, String(t)))) : null),
        el('span', { class: 'lv-mode-check', 'aria-hidden': 'true' }, checkIcon(22)));
      cards.set(info.id, card);
      grid.append(card);
    }

    function choose(info) {
      selected = info;
      for (const [id, c] of cards) { const on = id === info.id; c.classList.toggle('selected', on); c.setAttribute('aria-pressed', String(on)); }
      drawOptions();
      optsBox.hidden = false;
      requestAnimationFrame(() => optsBox.scrollIntoView({ behavior: 'smooth', block: 'nearest' }));
    }
    const state = { randomizeQuestions: false, randomizeAnswers: false, showOnDevice: true, friendlyNicknames: false, skipOwnQuestions: true, teamCount: 4, durationMin: 5, goal: 15, autoAdvance: 10 };
    function check(key, label, help) {
      const id = 'lv-opt-' + key;
      return el('label', { class: 'lv-opt' }, el('input', { type: 'checkbox', id, checked: state[key], 'aria-describedby': help ? id + '-help' : null, onChange: e => { state[key] = e.target.checked; } }), el('span', {}, el('strong', {}, label), help ? el('small', { id: id + '-help' }, help) : null));
    }
    function select(key, label, values, fmt) {
      const id = 'lv-opt-' + key;
      const s = el('select', { class: 'input', id, onChange: e => { state[key] = Number(e.target.value); } }, values.map(v => el('option', { value: v, selected: state[key] === v }, fmt(v))));
      return el('div', { class: 'field lv-opt-select' }, el('label', { for: id }, label), s);
    }
    function drawOptions() {
      const info = selected;
      const createBtn = KQ.btn('게임 만들기', create, 'big accent lv-create-btn');
      if (!qs.length) createBtn.disabled = true;
      const usable = info.pacing === 'player' ? qs.length - pollCount : qs.length;
      optsBox.replaceChildren(); add(optsBox,
        el('div', { class: 'lv-opts-head' }, el('h2', {}, info.name + ' 옵션'), el('span', { class: 'badge' }, info.pacing === 'player' ? '각자 속도로 달리는 게임' : '진행자가 넘기는 게임')),
        el('div', { class: 'lv-opts-grid' },
          check('randomizeQuestions', '문제 순서 섞기'),
          check('randomizeAnswers', '보기 순서 섞기'),
          check('showOnDevice', '학생 기기에 문제 보이기', '끄면 학생 기기에는 도형만 보여요'),
          check('friendlyNicknames', '닉네임 자동 생성', '학생이 닉네임을 정하지 않고 친근한 이름을 받아요'),
          check('skipOwnQuestions', '학생이 낸 문제는 출제자가 풀지 않기')),
        el('div', { class: 'lv-opts-grid' },
          info.teams ? select('teamCount', '팀 수', [2, 3, 4], v => `${v}팀`) : null,
          info.pacing === 'player' ? select('durationMin', '게임 시간', [2, 3, 5, 7, 10], v => `${v}분`) : null,
          info.id === 'robot' ? select('goal', '결승선 문제 수', [10, 15, 20, 30], v => `${v}문제`) : null,
          info.pacing !== 'player' ? select('autoAdvance', '결과 자동 넘김', AUTO_CHOICES, v => v ? `${v}초 뒤 자동으로 넘김` : '끔 (선생님이 직접 넘김)') : null),
        info.pacing !== 'player' ? el('p', { class: 'lv-help' }, '정답 공개와 점수판이 정한 시간 뒤에 저절로 다음으로 넘어가요. 게임 중에도 상단의 설정에서 바꿀 수 있어요.') : null,
        info.pacing === 'player' && pollCount ? el('p', { class: 'notice' }, `각자 속도 게임에서는 설문 문제 ${pollCount}개를 빼고 진행해요.`) : null,
        !qs.length || usable <= 0 ? el('p', { class: 'notice warn' }, '이 모드로 풀 수 있는 문제가 없어요. 먼저 문제를 추가하세요.') : null,
        el('div', { class: 'row' }, el('span', { class: 'spacer' }), createBtn));
      if (usable <= 0) createBtn.disabled = true;
      async function create() {
        createBtn.disabled = true;
        const options = { randomizeQuestions: state.randomizeQuestions, randomizeAnswers: state.randomizeAnswers, showOnDevice: state.showOnDevice, friendlyNicknames: state.friendlyNicknames, skipOwnQuestions: state.skipOwnQuestions };
        if (info.teams) options.teamCount = state.teamCount;
        if (info.pacing === 'player') options.duration = state.durationMin * 60;
        if (info.id === 'robot') options.goal = state.goal;
        if (info.pacing !== 'player') options.autoAdvance = state.autoAdvance;
        try {
          const r = await KQ.api('/api/games', 'POST', { quizId, mode: info.id, options });
          try { sessionStorage.setItem('lv-quiz-' + r.pin, quizId); } catch { /* 무시 */ }
          KQ.go('/host/' + r.pin);
        } catch (e) { KQ.toast(e.message, true); createBtn.disabled = false; }
      }
    }

    KQ.render(el('div', { class: 'lv-create' },
      KQ.topbar(el('a', { href: '/teacher', 'data-link': '', class: 'btn ghost small' }, '대시보드')),
      el('div', { class: 'page' },
        el('div', { class: 'lv-create-head' },
          el('h1', {}, '게임 만들기'),
          el('p', { class: 'lv-create-quiz' }, el('strong', {}, quiz.title || '제목 없는 퀴즈'), el('span', { class: 'muted' }, ` · ${qs.length}문제`))),
        el('h2', { class: 'lv-create-sub' }, '게임 모드를 골라요'),
        grid, optsBox)));
  });

  // =====================================================================
  // 4. 진행자 화면
  // =====================================================================
  KQ.route('/host/:pin', params => {
    if (!KQ.me || !KQ.me.teacher) { KQ.go('/teacher', true); return; }
    const pin = String(params.pin || '');
    const hostAct = (action, extra = {}) => KQ.api(`/api/games/${encodeURIComponent(pin)}/host`, 'POST', { action, ...extra });
    const act = async (action, btn, extra) => {
      if (btn) btn.disabled = true;
      try { await hostAct(action, extra); } catch (e) { KQ.toast(e.message, true); } finally { if (btn) setTimeout(() => { if (btn.isConnected) btn.disabled = false; }, 600); }
    };

    let view = null, sig = '', screen = null, m = null, mId = null, prevIds = null, ended = false, conn = 'connecting';
    let tenseOn = false, settingsUI = null, podiumStarted = false, preRanks = null, preRanksQi = -1;
    const fxTimers = [];
    const later = (fn, ms) => { const t = setTimeout(() => { if (ended) return; try { fn(); } catch (e) { console.warn('[반짝퀴즈] 효과 오류:', e); } }, Math.max(0, ms)); fxTimers.push(t); return t; };
    const clearLater = () => { while (fxTimers.length) clearTimeout(fxTimers.pop()); };
    const fxDone = new Set();
    const stage = el('div', { class: 'lv-stage', 'aria-label': '게임 무대' });
    let stageUsed = false;
    const live = el('div', { class: 'sr-only', role: 'status', 'aria-live': 'polite', 'aria-atomic': 'true' });

    const soundBtn = KQ.btn(KQ.sound.enabled ? '소리 켬' : '소리 끔', () => {
      const on = KQ.sound.toggle();
      soundBtn.textContent = on ? '소리 켬' : '소리 끔'; soundBtn.setAttribute('aria-pressed', String(on));
      if (on) syncBgm(view, true); else bgmCall('stop');
    }, 'ghost small', { 'aria-pressed': String(KQ.sound.enabled), title: '효과음과 음악 전체 소리' });
    const musicLabel = () => (bgmOn() ? '음악 켬' : '음악 끔');
    const musicBtn = KQ.btn(musicLabel(), () => toggleMusic(), 'ghost small', { 'aria-pressed': String(bgmOn()), title: '배경음악 켜고 끄기' });
    if (!KQ.bgm) musicBtn.hidden = true;
    const settingsBtn = KQ.btn('설정', () => openSettings(), 'ghost small', { 'aria-haspopup': 'dialog', title: '진행 중에 바꿀 수 있는 설정' });
    const qrBtn = KQ.btn('QR', () => openQr(), 'ghost small', { 'aria-haspopup': 'dialog', 'aria-label': '입장 QR 코드 크게 보기' });
    const lockBtn = KQ.btn('잠금', () => act(view && view.locked ? 'unlock' : 'lock', lockBtn), 'ghost small');
    const fsBtn = KQ.btn('전체 화면', () => {
      try {
        if (document.fullscreenElement) document.exitFullscreen?.();
        else document.documentElement.requestFullscreen?.().catch(() => KQ.toast('전체 화면을 열 수 없어요.', true));
      } catch { KQ.toast('전체 화면을 열 수 없어요.', true); }
    }, 'ghost small');
    const onFs = () => { fsBtn.textContent = document.fullscreenElement ? '전체 화면 끝' : '전체 화면'; };
    document.addEventListener('fullscreenchange', onFs);
    const endBtn = KQ.btn('게임 종료', async () => {
      if (await KQ.confirm('게임을 지금 끝내고 시상대로 갈까요?', '게임 종료', true)) act('end', endBtn);
    }, 'ghost small');
    const closeBtn = KQ.btn('게임 닫기', closeGame, 'ghost small');
    async function closeGame() {
      if (!await KQ.confirm('게임을 닫을까요? 학생들의 연결이 끊어지고 이 PIN은 더 이상 쓸 수 없어요.', '게임 닫기', true)) return;
      try { await hostAct('close'); } catch (e) { if (e.status !== 404) { KQ.toast(e.message, true); return; } }
      try { sessionStorage.removeItem('lv-quiz-' + pin); } catch { /* 무시 */ }
      KQ.go('/teacher');
    }
    const topTitle = el('span', { class: 'lv-htop-title' }, '');
    const top = el('header', { class: 'lv-htop' }, el('a', { href: '/teacher', 'data-link': '', class: 'lv-htop-brand', 'aria-label': '선생님 대시보드로' }, '반짝퀴즈'), topTitle, el('span', { class: 'spacer' }), soundBtn, musicBtn, settingsBtn, qrBtn, lockBtn, fsBtn, endBtn, closeBtn);
    const main = el('main', { class: 'lv-hmain' });
    const footPin = el('span', { class: 'lv-hfoot-pin' }, 'PIN ' + fmtPin(pin));
    const footCount = el('span', {}, '');
    const footConn = el('span', { class: 'lv-conn' }, '연결 중…');
    const foot = el('footer', { class: 'lv-hfoot' }, footPin, footCount, el('span', { class: 'spacer' }), footConn);
    const shell = el('div', { class: 'lv-host purple-bg' }, top, main, foot, live);
    KQ.render(shell);
    main.append(el('div', { class: 'lv-center-msg' }, el('div', { class: 'lv-spinner', 'aria-hidden': 'true' }), el('h1', {}, '게임을 불러오는 중…')));

    function attachStage(slot) { slot.append(stage); stageUsed = true; return slot; }

    // --- 배경음악 (진행자 화면에서만) ---
    function setTense(on) { on = !!on; if (on !== tenseOn) { tenseOn = on; bgmCall('tense', on); } }
    function syncBgm(v, force) {
      if (!v || ended || !KQ.bgm || !bgmOn()) return;
      if (v.phase === 'finished') { if (force && podiumStarted) bgmCall('play', 'podium'); return; } // 시상식 음악은 단상 등장 뒤에
      bgmCall('play', v.phase === 'lobby' ? 'lobby' : (v.mode || 'classic'));
    }
    function toggleMusic() {
      if (!KQ.bgm || typeof KQ.bgm.toggle !== 'function') { KQ.toast('배경음악을 불러오지 못했어요.', true); return; }
      let on;
      try { on = !!KQ.bgm.toggle(); } catch { on = bgmOn(); }
      if (on) { tenseOn = false; syncBgm(view, true); } else bgmCall('stop');
      refreshMusicUI();
      announce(live, on ? '배경음악을 켰어요' : '배경음악을 껐어요');
    }
    function refreshMusicUI() {
      musicBtn.textContent = musicLabel();
      musicBtn.setAttribute('aria-pressed', String(bgmOn()));
      if (settingsUI) settingsUI.refreshMusic();
    }

    // --- 늦게 온 학생용 큰 QR ---
    function openQr() {
      const v = view || { pin };
      const md = KQ.modal('QR 코드로 들어오기', { wide: true });
      md.root.classList.add('lv-qr-modal');
      md.body.append(el('div', { class: 'lv-qr-big' },
        el('div', { class: 'lv-qr-box' }, qrNode(joinUrlOf(v, pin), 360)),
        el('div', { class: 'lv-qr-info' },
          el('p', { class: 'lv-qr-label' }, '휴대폰 카메라로 QR 코드를 찍거나 이 주소로 접속해요'),
          el('strong', { class: 'lv-qr-addr' }, shortUrl(joinBase(v))),
          el('p', { class: 'lv-qr-label' }, '게임 PIN'),
          el('strong', { class: 'lv-qr-pin', 'aria-label': `게임 PIN ${pin.split('').join(' ')}` }, fmtPin(pin)))));
      md.foot.append(KQ.btn('닫기', () => md.close(), 'primary'));
    }

    // --- 진행 중 설정 ---
    const pendingOpts = new Map();
    function optVal(v, key) {
      const cur = key === 'locked' ? !!v.locked : (v.options || {})[key];
      const p = pendingOpts.get(key);
      if (p && Date.now() - p.at < 4000 && cur !== p.val) return p.val;
      pendingOpts.delete(key);
      return cur;
    }
    async function sendSettings(patch) {
      for (const [k, val] of Object.entries(patch)) pendingOpts.set(k, { val, at: Date.now() });
      try { await hostAct('settings', { options: patch }); }
      catch (e) { for (const k of Object.keys(patch)) pendingOpts.delete(k); KQ.toast(e.message, true); }
      if (settingsUI && view) settingsUI.update(view);
    }
    async function sendLock(on) {
      pendingOpts.set('locked', { val: on, at: Date.now() });
      try { await hostAct(on ? 'lock' : 'unlock'); }
      catch (e) { pendingOpts.delete('locked'); KQ.toast(e.message, true); }
      if (settingsUI && view) settingsUI.update(view);
    }
    function openSettings() {
      if (!view || view.phase === 'finished') return;
      const md = KQ.modal('진행 설정', { onClose: () => { settingsUI = null; } });
      md.root.classList.add('lv-set-modal');
      const ui = buildSettings(md);
      settingsUI = ui;
      ui.update(view);
      md.foot.append(KQ.btn('닫기', () => md.close(), 'primary'));
    }
    function buildSettings(md) {
      const segBtns = AUTO_CHOICES.map(s => el('button', { type: 'button', class: 'lv-seg-btn', 'aria-pressed': 'false', onClick: () => { setSeg(s); sendSettings({ autoAdvance: s }); } }, s ? `${s}초` : '끔'));
      function setSeg(val) { segBtns.forEach((b, i) => { const on = AUTO_CHOICES[i] === val; b.classList.toggle('on', on); b.setAttribute('aria-pressed', String(on)); }); }
      const seg = el('div', { class: 'lv-seg', role: 'group', 'aria-labelledby': 'lv-set-auto-h' }, segBtns);
      const autoHelp = el('p', { class: 'lv-set-help' }, '정답 공개와 점수판 화면이 이 시간이 지나면 저절로 다음으로 넘어가요. 끄면 선생님이 직접 넘겨요.');
      const playerNote = el('p', { class: 'notice lv-set-note' }, '이 게임은 시간이 끝날 때까지 자동으로 진행돼요.');
      const mkCheck = (id, label, help, onChange) => {
        const input = el('input', { type: 'checkbox', id, 'aria-describedby': help ? id + '-h' : null, onChange: e => onChange(e.target.checked) });
        const row = el('label', { class: 'lv-opt lv-set-opt', for: id }, input, el('span', {}, el('strong', {}, label), help ? el('small', { id: id + '-h' }, help) : null));
        return { row, input };
      };
      const cShow = mkCheck('lv-set-show', '학생 기기에 문제 보이기', '끄면 학생 기기에는 도형만 보여요. 다음 문제부터 적용돼요.', on => sendSettings({ showOnDevice: on }));
      const cSkip = mkCheck('lv-set-skip', '학생이 낸 문제는 출제자가 쉬기', '자기가 낸 문제는 풀지 않고 친구들이 푸는 것을 봐요.', on => sendSettings({ skipOwnQuestions: on }));
      const cNick = mkCheck('lv-set-nick', '닉네임 자동 생성', '로비에서 새로 들어오는 학생에게만 적용돼요.', on => sendSettings({ friendlyNicknames: on }));
      const cLock = mkCheck('lv-set-lock', '로비 잠금', '잠그면 새 학생이 들어올 수 없어요.', on => sendLock(on));
      const cMusic = mkCheck('lv-set-music', '배경음악', '진행자 화면에서만 나와요. 학생 기기에서는 효과음만 나요.', on => { if (on !== bgmOn()) toggleMusic(); });
      const volOut = el('output', { class: 'lv-set-volout', for: 'lv-set-vol' }, '');
      const vol = el('input', { type: 'range', id: 'lv-set-vol', class: 'lv-range', min: 0, max: 100, step: 5, value: Math.round(bgmVol() * 100), onInput: e => { bgmCall('setVolume', (Number(e.target.value) || 0) / 100); volOut.textContent = e.target.value + '%'; } });
      const volRow = el('div', { class: 'lv-set-vol' }, el('label', { for: 'lv-set-vol' }, '음량'), vol, volOut);
      const noBgm = el('p', { class: 'lv-set-help' }, '배경음악 기능을 불러오지 못했어요. 새로고침해 보세요.');
      function refreshMusic() {
        const has = !!KQ.bgm;
        cMusic.input.checked = bgmOn(); cMusic.input.disabled = !has;
        if (document.activeElement !== vol) vol.value = String(Math.round(bgmVol() * 100));
        volOut.textContent = vol.value + '%';
        vol.disabled = !has; noBgm.hidden = has;
      }
      add(md.body,
        el('section', { class: 'lv-set-sec' }, el('h3', { id: 'lv-set-auto-h' }, '결과 자동 넘김'), seg, autoHelp, playerNote),
        el('section', { class: 'lv-set-sec' }, el('h3', {}, '문제와 참가'), cShow.row, cSkip.row, cNick.row, cLock.row),
        el('section', { class: 'lv-set-sec' }, el('h3', {}, '배경음악'), cMusic.row, volRow, noBgm));
      return {
        refreshMusic,
        update(v) {
          const player = v.pacing === 'player';
          seg.hidden = player; autoHelp.hidden = player; playerNote.hidden = !player;
          setSeg(Number(optVal(v, 'autoAdvance')) || 0);
          cShow.input.checked = optVal(v, 'showOnDevice') !== false;
          cSkip.input.checked = optVal(v, 'skipOwnQuestions') !== false;
          cNick.input.checked = !!optVal(v, 'friendlyNicknames');
          cLock.input.checked = !!optVal(v, 'locked');
          refreshMusic();
        }
      };
    }

    // --- 자동 넘김 표시 (정답 공개 / 점수판) ---
    function autoPanel(nextBtn, baseLabel) {
      const fill = el('span', { class: 'lv-auto-fill' });
      const text = el('span', { class: 'lv-auto-text' }, '');
      const stopBtn = KQ.btn('자동 넘김 멈추기', async () => {
        stopBtn.disabled = true;
        await sendSettings({ autoAdvance: 0 });
        setTimeout(() => { if (stopBtn.isConnected) stopBtn.disabled = false; }, 600);
      }, 'ghost small lv-auto-stop');
      const node = el('div', { class: 'lv-auto', hidden: true }, el('div', { class: 'lv-auto-row' }, text, stopBtn), el('span', { class: 'lv-auto-track', 'aria-hidden': 'true' }, fill));
      let key = null, total = 1, lastSec = null;
      const tick = vv => {
        const on = !!vv.autoAt;
        node.hidden = !on;
        const label = on ? '지금 넘기기' : baseLabel;
        if (nextBtn.textContent !== label) nextBtn.textContent = label;
        if (!on) { key = null; lastSec = null; return; }
        const rem = Math.max(0, Number(vv.autoAt) - KQ.now());
        if (key !== vv.autoAt) {
          key = vv.autoAt;
          const conf = (Number(vv.options && vv.options.autoAdvance) || 0) * 1000;
          total = Math.max(1000, conf && conf >= rem - 800 ? conf : rem);
        }
        fill.style.transform = `scaleX(${Math.min(1, rem / total).toFixed(3)})`;
        const s = Math.ceil(rem / 1000);
        if (s !== lastSec) { lastSec = s; text.textContent = s > 0 ? `${s}초 후 자동으로 넘어가요` : '넘어가는 중…'; }
      };
      return { node, tick };
    }

    function updateChrome(v) {
      topTitle.textContent = [v.quizTitle, v.modeName].filter(Boolean).join(' · ');
      lockBtn.textContent = v.locked ? '잠금 해제' : '잠금';
      lockBtn.setAttribute('aria-pressed', String(!!v.locked));
      lockBtn.setAttribute('aria-label', v.locked ? '로비 잠금 해제' : '로비 잠그기');
      footCount.textContent = `참가자 ${num(v.playerCount)}명` + (v.locked ? ' · 잠김' : '');
      endBtn.hidden = v.phase === 'finished';
      settingsBtn.hidden = v.phase === 'finished';
      qrBtn.hidden = v.phase === 'finished';
      if (v.phase === 'finished' && settingsUI) KQ.closeModal(true);
      shell.dataset.phase = v.phase;
      // 새 참가자 소리
      const ids = new Set((v.players || []).map(p => p.id));
      if (prevIds) { let fresh = 0; for (const id of ids) if (!prevIds.has(id)) fresh++; if (fresh) { snd('join'); if (v.phase !== 'lobby') announce(live, `새 참가자 ${fresh}명`); } }
      prevIds = ids;
      // 점수판의 순위 상승 표시용: 문제 직전 순위를 기억
      const qi = v.questionIndex ?? -1;
      if (v.phase === 'countdown' || (v.phase === 'question' && preRanksQi !== qi)) {
        preRanks = new Map((v.players || []).map((p, i) => [p.nickname, i + 1]));
        preRanksQi = qi;
      }
      syncBgm(v);
    }

    function apply(v) {
      if (ended) return;
      view = v;
      if (!m || mId !== v.mode) { if (m && stageUsed) { modeCall(m, 'dispose', stage); stage.replaceChildren(); } m = modeMeta(v.mode); mId = v.mode; }
      updateChrome(v);
      const s = [v.mode, v.teamsEnabled ? 1 : 0, v.phase, v.question ? v.question.id : '', v.questionIndex ?? ''].join('|');
      if (s !== sig) {
        sig = s; clearLater(); setTense(false);
        screen = buildHost(v);
        main.replaceChildren(screen.node);
        main.scrollTop = 0;
        onEnter(v);
      } else if (screen && screen.update) screen.update(v);
      if (stage.isConnected) modeCall(m, 'renderHost', stage, v);
      if (settingsUI) settingsUI.update(v);
    }

    function onEnter(v) {
      const qn = (v.questionIndex ?? 0) + 1;
      const fxKey = [v.phase, v.questionIndex ?? '', v.question ? v.question.id : ''].join('|');
      const first = !fxDone.has(fxKey);
      fxDone.add(fxKey);
      if (v.phase === 'question') { snd('start'); announce(live, `${qn}번 문제. ${v.question?.text || ''}`); }
      else if (v.phase === 'reveal') {
        snd('reveal');
        announce(live, `정답 공개. ${v.reveal ? `정답 ${v.reveal.correctCount}명, 응답 ${v.reveal.answered}명` : ''}` + (v.autoAt ? '. 잠시 후 자동으로 넘어가요' : ''));
        if (first) revealFx(v);
      }
      else if (v.phase === 'leaderboard') { snd('whoosh'); announce(live, '점수판' + (v.autoAt ? '. 잠시 후 자동으로 넘어가요' : '')); if (first) leaderboardFx(); }
      else if (v.phase === 'running') { snd('start'); announce(live, '게임 시작!'); }
      else if (v.phase === 'finished') { announce(live, '게임 끝! 시상식'); bgmCall('stop'); finishFx(); }
      else if (v.phase === 'lobby') announce(live, '참가자를 기다리는 중');
    }

    // 정답 공개 효과: 정답 타일 폭죽, 막대 숫자 올라가기, 정답률 80% 이상이면 축하
    function revealFx(v) {
      const sc = screen || {};
      (sc.barCounts || []).forEach(([node, n], i) => later(() => fxCountUp(node, 0, n, 700), i * 80));
      (sc.fxTargets || []).forEach((t, i) => later(() => fxCall('burst', t, { count: 46 }), 550 + i * 140));
      const rv = v.reveal || {}, q = v.question || {};
      const answered = Number(rv.answered) || 0;
      if (q.type !== 'poll' && answered > 0) {
        const pct = Math.round((Number(rv.correctCount) || 0) / answered * 100);
        if (pct >= 80) later(() => { fxCall('confetti', { count: 180, power: 1.2 }); fxCall('stamp', '대단해요!', { color: '#d89e00', sub: `정답률 ${pct}%` }); snd('cheer'); }, 1000);
      } else if (q.type === 'poll' && sc.fxTargets && sc.fxTargets[0]) later(() => fxCall('stars', sc.fxTargets[0]), 600);
    }
    function leaderboardFx() {
      const sc = screen || {};
      if (sc.first) later(() => fxCall('stars', sc.first), 900);
      (sc.ups || []).forEach(({ row, idx }) => later(() => fxCall('burst', row, { count: 24, colors: ['#51cf66', '#ffd43b', '#ffffff'] }), (0.2 + idx * 0.28 + 0.7) * 1000));
    }
    // 시상식: 드럼롤 → 3위 → 2위 → 1위 (등장마다 폭죽 + 쿵), 1위에 불꽃놀이·색종이 비·팡파르
    const POD_DELAY = { 3: 1.9, 2: 3.0, 1: 4.3 };
    function finishFx() {
      const sc = screen || {};
      const base = sc.delayBase || 0;
      const pods = sc.pods || {};
      podiumStarted = false;
      if (sc.banner) later(() => {
        if (sc.bannerWin) { fxCall('confetti', { count: 170, power: 1.2 }); fxCall('burst', sc.banner, { count: 60 }); snd('cheer'); }
        else { fxCall('stars', sc.banner); snd('sparkle'); }
      }, 350);
      if (sc.teamWin) later(() => { fxCall('burst', sc.teamWin, { count: 70 }); fxCall('stars', sc.teamWin); snd('boom'); }, 650);
      const any = pods[1] || pods[2] || pods[3];
      if (any) later(() => snd('drumroll'), base * 1000 + 100);
      [3, 2, 1].forEach(place => {
        const who = pods[place];
        if (!who) return;
        later(() => {
          fxCall('burst', who, { count: place === 1 ? 110 : 60 });
          snd('boom');
          if (place === 1) {
            if (sc.node) sc.node.classList.add('lv-spot-on');
            fxCall('fireworks', 6000);
            fxCall('rain', 5000);
            snd('fanfare');
            later(() => snd('cheer'), 700);
          }
        }, (base + POD_DELAY[place] + 0.6) * 1000);
      });
      later(() => { podiumStarted = true; if (bgmOn()) bgmCall('play', 'podium'); }, pods[1] ? (base + POD_DELAY[1] + 2.6) * 1000 : 1500);
    }

    function buildHost(v) {
      switch (v.phase) {
        case 'lobby': return hostLobby(v);
        case 'countdown': return hostCountdown(v);
        case 'question': return hostQuestion(v);
        case 'reveal': return hostReveal(v);
        case 'leaderboard': return hostLeaderboard(v);
        case 'running': return hostRunning(v);
        case 'finished': return hostFinished(v);
        default: return { node: el('div', { class: 'lv-center-msg' }, el('h1', {}, '잠시만 기다려 주세요')) };
      }
    }

    // --- 로비 ---
    function hostLobby(v) {
      const urlShort = shortUrl(joinBase(v));
      const qrUrl = joinUrlOf(v, pin);
      const count = el('div', { class: 'lv-count-num-host' }, '0');
      const startBtn = KQ.btn('시작', () => act('start', startBtn), 'big lv-white-btn lv-start-btn');
      const chipsArea = el('div', { class: 'lv-chips-area' });
      const empty = el('p', { class: 'lv-lobby-empty' }, '참가자를 기다리는 중…');
      const chips = new Map();
      let teamCols = null, ready = false;
      const teamCount = v.teamsEnabled ? ((v.teams && v.teams.length) || (v.options && v.options.teamCount) || 4) : 0;
      if (teamCount) {
        teamCols = [];
        const cols = el('div', { class: 'lv-team-cols', style: { '--lv-cols': teamCount } });
        for (let i = 0; i < teamCount; i++) {
          const ti = teamInfo(v.teams, i);
          const head = el('h2', { class: 'lv-team-head' }, ti.name);
          const cnt = el('span', { class: 'lv-team-cnt' }, '0명');
          const body = el('div', { class: 'lv-chips' });
          cols.append(el('section', { class: 'lv-team-col', style: { '--lv-team': ti.color }, 'aria-label': ti.name }, el('div', { class: 'lv-team-top' }, head, cnt), body));
          teamCols.push({ body, cnt });
        }
        chipsArea.append(cols);
      }
      const flat = el('div', { class: 'lv-chips' });
      if (!teamCount) chipsArea.append(flat);
      chipsArea.append(empty);
      function update(vv) {
        count.textContent = num(vv.playerCount);
        startBtn.disabled = !(vv.playerCount > 0);
        empty.hidden = (vv.players || []).length > 0;
        const seen = new Set();
        for (const p of vv.players || []) {
          seen.add(p.id);
          let c = chips.get(p.id);
          if (!c) {
            const avBox = el('span', { class: 'lv-chip-av' });
            const btn = el('button', { type: 'button', class: 'lv-chip lv-chip-pop', title: '눌러서 내보내기', onClick: async () => {
              if (await KQ.confirm(`'${p.nickname}' 학생을 게임에서 내보낼까요?`, '내보내기', true)) act('kick', null, { playerId: p.id });
            } }, avBox, el('span', { class: 'lv-chip-name' }, p.nickname || ''));
            btn.setAttribute('aria-label', `${p.nickname} 내보내기`);
            c = { btn, avBox, avk: null };
            chips.set(p.id, c);
            if (ready) later(() => fxCall('stars', btn), 120);
          }
          const k = avKey(p.avatar);
          if (k !== c.avk || !c.avBox.firstChild) { c.avk = k; c.avBox.replaceChildren(avatarNode(p.avatar, 38, p.nickname)); }
          c.btn.classList.toggle('off', p.connected === false);
          const parent = teamCols ? (teamCols[p.team] || teamCols[0]).body : flat;
          if (c.btn.parentNode !== parent) parent.append(c.btn);
        }
        for (const [id, c] of chips) if (!seen.has(id)) { c.btn.remove(); chips.delete(id); }
        if (teamCols) teamCols.forEach((t, i) => { t.cnt.textContent = (vv.players || []).filter(p => p.team === i).length + '명'; });
        ready = true;
      }
      const node = el('div', { class: 'lv-lobby' },
        el('div', { class: 'lv-join-band has-qr' },
          el('div', { class: 'lv-join-qr' }, qrNode(qrUrl, 220), el('span', { class: 'lv-join-qr-cap' }, '카메라로 찍으면 바로 입장')),
          el('div', { class: 'lv-join-info' },
            el('div', { class: 'lv-join-url' }, el('span', { class: 'lv-join-label' }, '참여하려면 접속'), el('strong', { class: 'lv-join-addr' }, urlShort)),
            el('div', { class: 'lv-join-pin' }, el('span', { class: 'lv-join-label' }, '게임 PIN:'), el('strong', { class: 'lv-join-pin-num', 'aria-label': `게임 PIN ${pin.split('').join(' ')}` }, fmtPin(pin))))),
        el('div', { class: 'lv-lobby-bar' },
          el('div', { class: 'lv-count-box', 'aria-live': 'polite' }, count, el('span', {}, '명 참가')),
          el('div', { class: 'lv-lobby-title' }, el('h1', {}, v.quizTitle || '반짝퀴즈'), el('p', {}, v.modeName || ''), v.locked ? el('span', { class: 'badge orange' }, '잠김: 새 참가 불가') : null),
          startBtn),
        chipsArea,
        el('p', { class: 'lv-lobby-hint' }, '닉네임을 누르면 그 학생을 내보낼 수 있어요. 상단의 설정에서 자동 넘김과 음악을 바꿀 수 있어요.'));
      update(v);
      return { node, update: vv => {
        update(vv);
        const lockBadge = node.querySelector('.lv-lobby-title .badge');
        if (vv.locked && !lockBadge) node.querySelector('.lv-lobby-title').append(el('span', { class: 'badge orange' }, '잠김: 새 참가 불가'));
        else if (!vv.locked && lockBadge) lockBadge.remove();
      } };
    }

    // --- 카운트다운 ---
    function hostCountdown(v) {
      const big = el('div', { class: 'lv-hcount', 'aria-hidden': 'true' });
      let lastN = null;
      const tick = vv => {
        const n = Math.max(1, KQ.secondsLeft(vv.endsAt) || 1);
        if (n !== lastN) { lastN = n; big.replaceChildren(el('span', { class: 'lv-hcount-num' }, String(n))); KQ.sound.play('countdown'); }
      };
      tick(v);
      const host = v.pacing !== 'player' && v.questionCount;
      const node = el('div', { class: 'lv-hcountdown' },
        el('h1', { class: 'lv-hcount-title' }, v.quizTitle || ''),
        host ? el('p', { class: 'lv-hcount-sub' }, `${(v.questionIndex ?? 0) + 1}번 문제 / 총 ${v.questionCount}문제`) : el('p', { class: 'lv-hcount-sub' }, v.modeName || ''),
        big,
        attachStage(el('div', { class: 'lv-stage-slot small' })));
      return { node, tick, update: tick };
    }

    // --- 문제 ---
    function hostQuestion(v) {
      const q = v.question || { type: 'quiz', text: '', choices: [] };
      const classic = v.mode === 'classic';
      const R = 54, C = 2 * Math.PI * R;
      const ring = el('circle', { cx: 60, cy: 60, r: R, fill: 'none', stroke: '#fff', 'stroke-width': 10, 'stroke-linecap': 'round', 'stroke-dasharray': C.toFixed(1), 'stroke-dashoffset': '0', transform: 'rotate(-90 60 60)' });
      const secs = el('text', { x: 60, y: 60, 'text-anchor': 'middle', 'dominant-baseline': 'central', class: 'lv-timer-text' }, '');
      const timer = el('div', { class: 'lv-timer', role: 'timer', 'aria-label': '남은 시간' },
        el('svg', { viewBox: '0 0 120 120', width: '100%', height: '100%' }, el('circle', { cx: 60, cy: 60, r: 58, fill: 'var(--purple-deep)' }), el('circle', { cx: 60, cy: 60, r: R, fill: 'none', stroke: 'rgba(255,255,255,.25)', 'stroke-width': 10 }), ring, secs));
      const answered = el('div', { class: 'lv-answered-num' }, '0');
      const expected = el('div', { class: 'lv-answered-of' }, '');
      let lastS = null;
      const total = Math.max(1, (q.timeLimit || 20) * 1000);
      const tick = vv => {
        const rem = Math.max(0, (vv.endsAt || 0) - KQ.now());
        const s = KQ.secondsLeft(vv.endsAt);
        secs.textContent = String(s);
        ring.setAttribute('stroke-dashoffset', (C * (1 - Math.min(1, rem / total))).toFixed(1));
        timer.classList.toggle('hurry', s <= 5 && s > 0);
        timer.setAttribute('aria-label', `남은 시간 ${s}초`);
        if (s !== lastS) { if (lastS !== null && s <= 5 && s > 0) snd('tick'); lastS = s; }
        setTense(s <= 5 && s > 0);
      };
      const update = vv => { answered.textContent = num(vv.answeredCount); expected.textContent = `/ ${num(vv.expectedCount)}`; tick(vv); };
      const center = el('div', { class: 'lv-hq-center' });
      if (imgOk(q.image)) center.append(el('img', { class: 'lv-hq-img', src: q.image, alt: '문제 그림' }));
      else center.append(el('div', { class: 'lv-hq-noimg', 'aria-hidden': 'true' }, shape(0, 40), shape(1, 40), shape(2, 40), shape(3, 40)));
      const bottom = el('div', { class: 'lv-hq-bottom' });
      if (q.type === 'quiz' || q.type === 'truefalse' || q.type === 'poll') bottom.append(hostTiles(q, false));
      else if (q.type === 'type') bottom.append(el('div', { class: 'lv-hq-guide' }, el('strong', {}, '주관식'), ' 학생 기기에 답을 입력하세요'));
      else if (q.type === 'slider') { const sl = q.slider || {}; bottom.append(el('div', { class: 'lv-hq-guide' }, el('strong', {}, '숫자 슬라이더'), ` 학생 기기에서 ${sl.min ?? 0} ~ ${sl.max ?? 100} 사이 숫자를 골라요`)); }
      else if (q.type === 'puzzle') bottom.append(el('div', { class: 'lv-hq-guide' }, el('strong', {}, '순서 맞추기'), ' 아래 항목을 올바른 순서로 맞춰요'), el('ol', { class: 'lv-hq-puzzle' }, (q.choices || []).map((c, i) => el('li', { class: `shape-${i % 4}` }, c.text || ''))));
      const skipBtn = KQ.btn('건너뛰기', () => act('skip', skipBtn), 'lv-white-btn');
      const node = el('div', { class: 'lv-hq' + (classic ? '' : ' with-stage') },
        el('div', { class: 'lv-hq-main' },
          el('div', { class: 'lv-q-band' },
            el('div', { class: 'lv-q-meta' },
              el('span', { class: 'badge purple' }, `${(v.questionIndex ?? 0) + 1} / ${v.questionCount || '?'}`),
              el('span', { class: 'badge' }, KQ.typeNames?.[q.type] || q.type),
              q.points === 'double' ? el('span', { class: 'badge orange' }, '점수 두 배') : null,
              q.authorName ? el('span', { class: 'badge green' }, '학생 출제: ' + q.authorName) : null),
            el('h1', { class: 'lv-q-band-text' }, q.text || '')),
          el('div', { class: 'lv-hq-mid' },
            timer, center,
            el('div', { class: 'lv-hq-side' }, el('div', { class: 'lv-answered', 'aria-live': 'off' }, answered, expected, el('div', { class: 'lv-answered-label' }, '답변')), skipBtn)),
          bottom),
        classic ? null : attachStage(el('aside', { class: 'lv-stage-slot side' })));
      update(v);
      return { node, tick, update };
    }

    function hostTiles(q, reveal) {
      const n = Math.min(4, (q.choices || []).length);
      const grid = el('div', { class: 'lv-htiles lv-htiles-' + n });
      for (let i = 0; i < n; i++) {
        const c = q.choices[i] || {};
        const isCorrect = reveal && c.correct === true;
        const dim = reveal && q.type !== 'poll' && c.correct === false;
        grid.append(el('div', { class: `answer-tile shape-${i} lv-htile` + (dim ? ' dim' : '') + (isCorrect ? ' correct' : '') }, shape(i, 40), el('span', { class: 'lv-htile-text' }, c.text || ''), isCorrect ? el('span', { class: 'lv-htile-check', 'aria-label': '정답' }, checkIcon(36)) : null));
      }
      return grid;
    }

    // --- 정답 공개 ---
    function hostReveal(v) {
      const q = v.question || { type: 'quiz', text: '', choices: [] };
      const rv = v.reveal || {};
      const classic = v.mode === 'classic';
      const res = el('div', { class: 'lv-rv-body' });
      const barCounts = [], fxTargets = [];
      if (q.type === 'quiz' || q.type === 'truefalse' || q.type === 'poll') {
        const dist = rv.distribution || [];
        const n = Math.min(4, (q.choices || []).length);
        const max = Math.max(1, ...dist.slice(0, n).map(x => +x || 0));
        const bars = el('div', { class: 'lv-bars', role: 'img', 'aria-label': '보기별 응답 수: ' + Array.from({ length: n }, (_, i) => `${SHAPE_NAMES[i]} ${dist[i] || 0}명`).join(', ') });
        let topCol = null, topCnt = -1;
        for (let i = 0; i < n; i++) {
          const c = q.choices[i] || {};
          const cnt = +dist[i] || 0;
          const cntEl = el('div', { class: 'lv-bar-count' }, String(cnt));
          barCounts.push([cntEl, cnt]);
          const col = el('div', { class: 'lv-bar-col' + (q.type !== 'poll' && c.correct === false ? ' dim' : '') + (q.type !== 'poll' && c.correct === true ? ' good' : '') },
            cntEl,
            el('div', { class: `lv-bar shape-${i}`, style: { height: Math.max(4, cnt / max * 100) + '%', animationDelay: (i * 0.08) + 's' } }),
            el('div', { class: `lv-bar-foot shape-${i}` }, shape(i, 26), c.correct === true && q.type !== 'poll' ? checkIcon(24) : null));
          if (cnt > topCnt) { topCnt = cnt; topCol = col; }
          bars.append(col);
        }
        const tiles = hostTiles(q, true);
        res.append(bars, tiles);
        if (q.type === 'poll') { if (topCol) fxTargets.push(topCol); }
        else tiles.querySelectorAll('.lv-htile.correct').forEach(t => fxTargets.push(t));
      } else if (q.type === 'type') {
        const typed = rv.typed || [];
        const acc = el('div', { class: 'lv-rv-accepted' }, el('span', {}, '정답: '), el('strong', {}, (q.accepted || []).join(', ') || '-'));
        const ul = el('ul', { class: 'lv-typed' }, typed.length ? typed.slice(0, 8).map(t => el('li', { class: t.correct ? 'ok' : '' }, el('span', { class: 'lv-typed-text' }, t.text || ''), el('span', { class: 'lv-typed-count' }, `${t.count || 0}명`), t.correct ? checkIcon(22) : null)) : el('li', {}, '입력된 답이 없어요'));
        res.append(acc, ul);
        fxTargets.push(acc);
      } else if (q.type === 'slider') {
        const sl = q.slider || {};
        const span = (+sl.max - +sl.min) || 1;
        const pos = x => Math.max(0, Math.min(100, ((+x - +sl.min) / span) * 100)) + '%';
        const scale = el('div', { class: 'lv-slider-scale', 'aria-hidden': 'true' },
          sl.tolerance ? el('div', { class: 'lv-slider-tol', style: { left: pos(+sl.answer - +sl.tolerance), width: `calc(${pos(+sl.answer + +sl.tolerance)} - ${pos(+sl.answer - +sl.tolerance)})` } }) : null,
          sl.answer !== undefined ? el('div', { class: 'lv-slider-mark ans', style: { left: pos(sl.answer) } }, el('span', {}, '정답')) : null,
          rv.sliderAverage !== undefined && rv.sliderAverage !== null ? el('div', { class: 'lv-slider-mark avg', style: { left: pos(rv.sliderAverage) } }, el('span', {}, '평균')) : null);
        const big = el('div', { class: 'lv-rv-big' }, el('span', {}, '정답 '), el('strong', {}, String(sl.answer ?? '-')), sl.tolerance ? el('small', {}, ` (±${sl.tolerance} 인정)`) : null);
        res.append(el('div', { class: 'lv-rv-slider' },
          big,
          el('div', { class: 'lv-rv-avg' }, '반 평균 ', el('strong', {}, rv.sliderAverage === null || rv.sliderAverage === undefined ? '-' : String(Math.round(rv.sliderAverage * 100) / 100))),
          scale, el('div', { class: 'lv-slider-ends' }, el('span', {}, String(sl.min ?? 0)), el('span', {}, String(sl.max ?? 100)))));
        fxTargets.push(big);
      } else if (q.type === 'puzzle') {
        const order = q.puzzleOrder || (q.choices || []).map(c => c.text);
        const ol = el('ol', { class: 'lv-hq-puzzle answer' }, order.map((t, i) => el('li', { class: `shape-${i % 4}` }, String(t || ''))));
        res.append(el('p', { class: 'lv-rv-label' }, '정답 순서'), ol);
        fxTargets.push(ol);
      }
      const poll = q.type === 'poll';
      const answered = Number(rv.answered) || 0;
      const pct = answered ? Math.round((Number(rv.correctCount) || 0) / answered * 100) : 0;
      const summary = el('div', { class: 'lv-rv-summary' }, poll ? `응답 ${num(rv.answered)}명` : `정답 ${num(rv.correctCount)}명 / 응답 ${num(rv.answered)}명` + (answered ? ` · 정답률 ${pct}%` : ''));
      const last = (v.questionIndex ?? 0) + 1 >= (v.questionCount || 0);
      const baseLabel = classic ? '다음' : (last ? '결과 보기' : '다음');
      const nextBtn = KQ.btn(baseLabel, () => act('next', nextBtn), 'big lv-white-btn lv-next-btn');
      const auto = autoPanel(nextBtn, baseLabel);
      const node = el('div', { class: 'lv-rv' + (classic ? '' : ' with-stage') },
        el('div', { class: 'lv-q-band small' },
          el('div', { class: 'lv-q-meta' }, el('span', { class: 'badge purple' }, `${(v.questionIndex ?? 0) + 1} / ${v.questionCount || '?'}`), q.authorName ? el('span', { class: 'badge green' }, '학생 출제: ' + q.authorName) : null),
          el('h1', { class: 'lv-q-band-text' }, q.text || '')),
        el('div', { class: 'lv-rv-grid' },
          el('div', { class: 'lv-rv-left' }, res, el('div', { class: 'lv-rv-actions' }, summary, auto.node, nextBtn)),
          classic ? null : attachStage(el('div', { class: 'lv-stage-slot big' }))));
      auto.tick(v);
      return { node, tick: auto.tick, update: auto.tick, barCounts, fxTargets };
    }

    // --- 점수판 (클래식) ---
    function hostLeaderboard(v) {
      const rows = (v.leaderboard || []).slice(0, 5);
      const max = Math.max(1, ...rows.map(r => +r.score || 0));
      const qi = v.questionIndex ?? 0;
      const usePre = !!(preRanks && preRanksQi === qi && qi > 0);
      const list = el('ol', { class: 'lv-lb' });
      let first = null;
      const ups = [];
      rows.forEach((r, i) => {
        const rank = r.rank || i + 1;
        let up = 0;
        if (usePre) { const pr = preRanks.get(r.nickname); if (pr && pr > rank) up = pr - rank; }
        else if (qi > 0 && Number(r.prevRank) > rank) up = Number(r.prevRank) - rank;
        const isFirst = rank === 1;
        const delay = 0.2 + i * 0.28;
        const row = el('li', { class: 'lv-lb-row' + (isFirst ? ' lv-lb-first' : '') + (up ? ' lv-lb-up' : ''), style: { animationDelay: delay + 's', '--lv-rd': delay + 's' } },
          el('span', { class: 'lv-lb-rank' }, String(rank)),
          el('span', { class: 'lv-lb-avwrap' }, isFirst ? el('span', { class: 'lv-lb-crown' }, crownIcon(34)) : null, avatarNode(r.avatar, 46, r.nickname, 'lv-lb-av')),
          el('span', { class: 'lv-lb-name' }, r.nickname || ''),
          up ? el('span', { class: 'lv-lb-upbadge' }, arrowUpIcon(18), el('span', {}, `${up}계단`)) : null,
          r.streak >= 2 ? el('span', { class: 'lv-lb-streak' }, el('span', { class: 'lv-flame', 'aria-hidden': 'true' }), `연속 정답 ${r.streak}`) : null,
          r.delta ? el('span', { class: 'lv-lb-delta' }, '+' + num(r.delta)) : null,
          el('span', { class: 'lv-lb-score' }, num(r.score)),
          el('span', { class: 'lv-lb-fill', style: { width: Math.max(8, (+r.score || 0) / max * 100) + '%' }, 'aria-hidden': 'true' }));
        if (isFirst && !first) first = row;
        if (up) ups.push({ row, idx: i });
        list.append(row);
      });
      if (!rows.length) list.append(el('li', { class: 'lv-lb-row' }, el('span', { class: 'lv-lb-name' }, '아직 점수가 없어요')));
      const last = (v.questionIndex ?? 0) + 1 >= (v.questionCount || 0);
      const baseLabel = last ? '결과 보기' : '다음 문제';
      const nextBtn = KQ.btn(baseLabel, () => act('next', nextBtn), 'big lv-white-btn lv-next-btn');
      const auto = autoPanel(nextBtn, baseLabel);
      auto.tick(v);
      const node = el('div', { class: 'lv-hlb' },
        el('div', { class: 'lv-title-band' }, el('h1', {}, '점수판')),
        list,
        el('p', { class: 'sr-only' }, rows.map(r => `${r.rank}위 ${r.nickname} ${r.score}점`).join(', ')),
        el('div', { class: 'lv-rv-actions' }, el('span', { class: 'lv-rv-summary' }, `${(v.questionIndex ?? 0) + 1} / ${v.questionCount || '?'} 문제 완료`), auto.node, nextBtn));
      return { node, tick: auto.tick, update: auto.tick, first, ups };
    }

    // --- 각자 속도 진행 중 ---
    function hostRunning(v) {
      const clock = el('div', { class: 'lv-run-clock', role: 'timer' }, '');
      const count = el('span', {}, '');
      const feed = el('ul', { class: 'lv-feed', 'aria-live': 'polite', 'aria-label': '실시간 소식' });
      const finishBtn = KQ.btn('게임 끝내기', async () => { if (await KQ.confirm('지금 게임을 끝내고 시상대로 갈까요?', '게임 끝내기', true)) act('end', finishBtn); }, 'lv-white-btn');
      let lastFeedKey = '';
      const tick = vv => { const s = KQ.secondsLeft(vv.endsAt); setTense(s <= 5 && s > 0); clock.textContent = fmtClock(s); clock.classList.toggle('hurry', s <= 10); clock.setAttribute('aria-label', `남은 시간 ${fmtClock(s)}`); };
      const update = vv => {
        tick(vv);
        count.textContent = `참가자 ${num(vv.playerCount)}명`;
        const items = (vv.feed || []).slice(0, 8);
        const key = items.map(f => `${f.at}|${f.nickname}|${f.text}`).join('#');
        if (key === lastFeedKey) return;
        lastFeedKey = key;
        feed.replaceChildren(...(items.length ? items.map(f => el('li', { class: 'lv-feed-item ' + (f.good ? 'good' : 'bad') }, el('strong', {}, f.nickname || ''), ' ', el('span', {}, f.text || ''))) : [el('li', { class: 'lv-feed-item' }, '곧 소식이 올라와요')]));
      };
      const node = el('div', { class: 'lv-run' },
        el('div', { class: 'lv-run-top' }, el('div', { class: 'lv-run-clock-box' }, el('span', { class: 'lv-run-label' }, '남은 시간'), clock), el('div', { class: 'lv-run-info' }, el('h1', {}, v.modeName || ''), count), finishBtn),
        el('div', { class: 'lv-run-grid' }, attachStage(el('div', { class: 'lv-stage-slot big' })), el('aside', { class: 'lv-feed-box' }, el('h2', {}, '실시간 소식'), feed)));
      update(v);
      return { node, tick, update };
    }

    // --- 시상대 ---
    function podTeamColor(v, p) {
      if (!v.teamsEnabled || p.team === undefined || p.team === null) return null;
      if (typeof p.team === 'number') return teamInfo(v.teams, p.team).color;
      const t = (v.teams || []).find(x => x && x.name === p.team) || TEAM_DEFAULT.find(x => x.name === p.team);
      return t ? t.color : null;
    }
    function hostFinished(v) {
      const pod = (v.podium || []).slice().sort((a, b) => (a.rank || 99) - (b.rank || 99)).slice(0, 5);
      const parts = [el('div', { class: 'lv-spotlight', 'aria-hidden': 'true' }), el('div', { class: 'lv-title-band' }, el('h1', {}, v.quizTitle || '최종 결과'), el('p', {}, (v.modeName || '') + ' · 시상식'))];
      let banner = null, bannerWin = false, teamWin = null;
      if (COOP.has(v.mode) && v.modeState && v.modeState.status) {
        const st = v.modeState.status;
        const win = st === 'success' || st === 'victory', lose = st === 'failed' || st === 'defeat';
        if (win || lose) {
          banner = el('div', { class: 'lv-coop-banner ' + (win ? 'good' : 'bad') + ' pop-in', role: 'status' }, win ? '반 전체 미션 성공!' : '아쉽게 미션 실패', el('small', {}, win ? '모두 힘을 모아 해냈어요' : '다음엔 꼭 성공해요'));
          bannerWin = win;
          parts.push(banner);
        }
      }
      const teamsSorted = v.teamsEnabled && Array.isArray(v.teams) ? v.teams.slice().sort((a, b) => (b.score || 0) - (a.score || 0)) : [];
      if (teamsSorted.length) {
        const res = teamsSorted.map((t, i) => el('div', { class: 'lv-team-res pop-in' + (i === 0 ? ' win' : ''), style: { '--lv-team': t.color || teamInfo(null, t.index).color, animationDelay: (i * 0.15) + 's' } },
          i === 0 ? el('span', { class: 'lv-team-crown' }, crownIcon(30)) : null,
          el('span', { class: 'lv-team-res-rank' }, `${i + 1}위`), el('span', { class: 'lv-team-res-name' }, t.name || teamInfo(null, t.index).name), el('span', { class: 'lv-team-res-score' }, num(t.score))));
        teamWin = res[0];
        parts.push(el('div', { class: 'lv-team-result' }, res));
      }
      const delayBase = teamsSorted.length ? 0.8 : 0;
      const pods = {};
      const block = (p, place) => {
        const delay = delayBase + POD_DELAY[place];
        if (!p) return el('div', { class: `lv-pod lv-pod-${place} empty` });
        const tc = podTeamColor(v, p);
        const who = el('div', { class: 'lv-pod-who' },
          el('span', { class: 'lv-pod-avwrap' }, place === 1 ? el('span', { class: 'lv-pod-crown' }, crownIcon(60)) : null, avatarNode(p.avatar, 112, p.nickname, 'lv-pod-av')),
          el('span', { class: 'lv-pod-name' }, p.nickname || ''), el('span', { class: 'lv-pod-score' }, num(p.score) + '점'), tc ? el('span', { class: 'lv-pod-team', style: { background: tc } }) : null);
        pods[place] = who;
        return el('div', { class: `lv-pod lv-pod-${place}`, style: { '--lv-delay': delay + 's' } }, who, el('div', { class: 'lv-pod-block' }, el('span', { class: 'lv-pod-rank' }, String(place))));
      };
      parts.push(el('div', { class: 'lv-podium', 'aria-hidden': 'true' }, block(pod[1], 2), block(pod[0], 1), block(pod[2], 3)));
      if (pod.length > 3) parts.push(el('ol', { class: 'lv-pod-rest', start: 4 }, pod.slice(3).map((p, i) => el('li', { style: { animationDelay: (delayBase + POD_DELAY[1] + 1.2 + i * 0.2) + 's' } }, el('span', { class: 'lv-lb-rank' }, String(p.rank || i + 4)), avatarNode(p.avatar, 36, p.nickname, 'lv-rest-av'), el('span', { class: 'lv-lb-name' }, p.nickname || ''), el('span', { class: 'lv-lb-score' }, num(p.score))))));
      if (!pod.length) parts.push(el('p', { class: 'lv-lobby-empty' }, '참가한 학생이 없어요.'));
      // 시상 순서를 화면 낭독기에도 전달
      parts.push(el('p', { class: 'sr-only' }, pod.map(p => `${p.rank}위 ${p.nickname} ${p.score}점`).join(', ')));
      if (v.mode !== 'classic') parts.push(el('details', { class: 'lv-final-stage' }, el('summary', {}, '게임 무대 다시 보기'), attachStage(el('div', { class: 'lv-stage-slot medium' }))));
      let quizId = null;
      try { quizId = v.quizId || sessionStorage.getItem('lv-quiz-' + pin); } catch { quizId = v.quizId || null; }
      parts.push(el('div', { class: 'lv-fin-actions' },
        KQ.btn('리포트 보기', () => KQ.go(v.reportId ? '/teacher/reports/' + encodeURIComponent(v.reportId) : '/teacher/reports'), 'lv-white-btn'),
        KQ.btn('같은 퀴즈로 다시', () => KQ.go(quizId ? '/teacher/host/' + encodeURIComponent(quizId) : '/teacher'), 'lv-white-btn'),
        KQ.btn('게임 닫기', closeGame, 'danger')));
      const node = el('div', { class: 'lv-fin' }, parts);
      return { node, pods, banner, bannerWin, teamWin, delayBase };
    }

    function onGone(status) {
      if (ended) return;
      ended = true;
      clearLater(); bgmCall('stop'); fxCall('stop');
      if (settingsUI) KQ.closeModal(true);
      if (stageUsed) modeCall(m, 'dispose', stage);
      if (status === 401 || status === 403) { KQ.go('/teacher', true); return; }
      footConn.textContent = '연결 끊김';
      main.replaceChildren(el('div', { class: 'lv-center-msg' }, el('h1', {}, '게임이 끝났거나 없어요'), el('p', {}, 'PIN ' + fmtPin(pin) + ' 게임을 찾을 수 없어요.'), KQ.btn('대시보드로', () => KQ.go('/teacher'), 'big lv-white-btn')));
    }

    const timer = setInterval(() => { if (view && !ended && screen && screen.tick) screen.tick(view); }, 250);
    const stream = watchStream(pin, 'host', apply, onGone, st => {
      conn = st;
      footConn.textContent = st === 'ok' ? '연결됨' : st === 'reconnecting' ? '다시 연결 중…' : st === 'gone' ? '연결 끊김' : '연결 중…';
      footConn.className = 'lv-conn ' + (st === 'ok' ? 'ok' : 'bad');
    });
    KQ.onLeave(() => {
      ended = true;
      clearInterval(timer); clearLater(); stream.close();
      bgmCall('stop'); fxCall('stop');
      settingsUI = null;
      document.removeEventListener('fullscreenchange', onFs);
      if (stageUsed) modeCall(m, 'dispose', stage);
    });
  });

  // 테스트용 내부 노출 (기능에는 영향 없음)
  KQ._live = { fmtPin, fmtClock, probeGame };
})();
