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
    const barName = el('span', { class: 'lv-pbar-name' });
    const barScore = el('span', { class: 'lv-pbar-score' });
    const bar = el('header', { class: 'lv-pbar', hidden: true }, barTime, barName, barScore);
    const main = el('main', { class: 'lv-pmain' });
    const panel = el('section', { class: 'lv-mode-panel', 'aria-label': '게임 모드 상태' });
    const flashTitle = el('div', { class: 'lv-flash-title' });
    const flashSub = el('div', { class: 'lv-flash-sub' });
    const flash = el('div', { class: 'lv-flash', hidden: true, 'aria-hidden': 'true' }, el('div', { class: 'lv-flash-icon' }), flashTitle, flashSub);
    const shell = el('div', { class: 'lv-player lv-bg-purple' }, bar, main, panel, flash, live);
    KQ.render(shell);

    let view = null, sig = '', screen = null, m = null, mId = null, seeded = false, lastSeq = null, submitted = null, autoNamed = false, ended = false, flashTimer = null, panelOn = false, conn = 'ok';
    const sendAction = (kind, target) => KQ.api(`/api/games/${encodeURIComponent(pin)}/action`, 'POST', { kind, target }).catch(e => { KQ.toast(e.message, true); throw e; });

    function setScreen(key, built) {
      sig = key; screen = built;
      main.replaceChildren(built.node);
      shell.className = 'lv-player ' + (built.bg || 'lv-bg-purple') + (built.panelBig ? ' lv-panel-big' : '') + (built.full ? ' lv-full' : '');
      if (built.teamColor) shell.style.setProperty('--lv-team', built.teamColor); else shell.style.removeProperty('--lv-team');
    }
    setScreen('loading', { node: el('div', { class: 'lv-center-msg' }, el('div', { class: 'lv-spinner', 'aria-hidden': 'true' }), el('h1', {}, '게임에 연결하는 중…'), el('p', {}, 'PIN ' + fmtPin(pin))) });

    const isLocked = v => !!(v.lockedUntil && v.lockedUntil > KQ.now());
    const isSubmitted = v => !!(v.question && submitted && submitted.qid === v.question.id && submitted.seq === (v.result ? v.result.seq : null));

    function sigOf(v) {
      const q = v.question;
      return ['v', v.phase, q ? q.id : '-', (v.answered || isSubmitted(v)) ? 1 : 0, q?.ownQuestion ? 1 : 0, isLocked(v) ? 1 : 0, v.actions?.kind || '', v.result ? v.result.seq : '', v.me?.team ?? ''].join('|');
    }

    function noteResult(res, phase) {
      if (!res || res.seq === lastSeq) return;
      lastSeq = res.seq;
      const msg = res.correct === true ? `정답! ${num(res.points)}점 획득` : res.correct === false ? '아쉬워요, 오답이에요' + (res.answerText ? `. ${res.answerText}` : '') : '응답 고마워요';
      announce(live, msg + (res.rank ? `. 현재 ${res.rank}위` : ''));
      if (res.correct === true) { KQ.sound.play('correct'); vibrate(60); } else if (res.correct === false) { KQ.sound.play('wrong'); vibrate([80, 60, 80]); }
      if (phase === 'running') showFlash(res);
    }
    function showFlash(res) {
      clearTimeout(flashTimer);
      const good = res.correct === true, bad = res.correct === false;
      flash.className = 'lv-flash ' + (good ? 'good' : bad ? 'bad' : 'neutral');
      const icon = flash.firstChild; icon.replaceChildren(good ? checkIcon(64) : bad ? crossIcon(64) : checkIcon(64));
      flashTitle.textContent = good ? '정답!' : bad ? '아쉬워요' : '응답 고마워요';
      flashSub.textContent = good ? `+${num(res.points)}` + (res.streak >= 2 ? `  ·  연속 정답 ${res.streak}` : '') : bad ? (res.answerText || '다음 문제에서 만회해요') : '';
      flash.hidden = false;
      flashTimer = setTimeout(() => { flash.hidden = true; }, 900);
    }

    function updateBar(v) {
      const me = v.me;
      bar.hidden = !me;
      if (!me) return;
      barName.textContent = me.nickname || '';
      barScore.textContent = num(me.score);
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
      if (!seeded) { seeded = true; lastSeq = seq; } else if (v.result && (v.phase === 'running' || v.phase === 'reveal')) noteResult(v.result, v.phase);
      updateBar(v);
      const s = sigOf(v);
      if (s !== sig) setScreen(s, build(v)); else if (screen && screen.update) screen.update(v);
      renderPanel(v);
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

    // --- 닉네임 ---
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
      const okBtn = el('button', { type: 'submit', class: 'btn big lv-dark-btn' }, '확인');
      const form = el('form', { class: 'card lv-pin-card', novalidate: true, onSubmit: async e => {
        e.preventDefault();
        const nick = input.value.trim();
        if (nick.length < 1 || nick.length > 15) { err.textContent = '닉네임은 1~15자로 입력하세요.'; input.focus(); return; }
        okBtn.disabled = true; randomBtn.disabled = true;
        try {
          const r = await KQ.api(`/api/games/${encodeURIComponent(pin)}/join`, 'POST', { nickname: nick });
          if (r.me) {
            autoNamed = !!(r.me.nickname && r.me.nickname !== nick);
            if (view) { view = { ...view, me: r.me }; sig = ''; apply(view); }
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
      el('label', { class: 'sr-only', for: 'lv-nick' }, '닉네임'),
      input,
      el('p', { class: 'lv-help', id: 'lv-nick-help' }, '1~15자, 친구가 알아볼 수 있는 순한 이름으로 정해요.'),
      err, okBtn, randomBtn);
      requestAnimationFrame(() => input.focus());
      return { node: el('div', { class: 'lv-home-inner' }, el('h1', { class: 'logo-big lv-home-logo' }, '반짝퀴즈'), form), bg: 'lv-bg-purple', full: true };
    }

    // --- 로비 ---
    function lobbyScreen(v) {
      const me = v.me;
      const node = el('div', { class: 'lv-center-msg lv-p-lobby' },
        el('h1', {}, '들어왔어요!'),
        el('p', { class: 'lv-lead' }, '화면에서 내 닉네임을 확인하세요'),
        el('div', { class: 'lv-nick-big pop-in' }, me.nickname || ''),
        autoNamed ? el('p', { class: 'lv-note' }, '닉네임이 자동으로 정해졌어요') : null,
        el('p', { class: 'lv-p-mode' }, v.modeName || modeMeta(v.mode).name || ''),
        me.teamName ? el('p', { class: 'lv-team-badge' }, me.teamName) : null,
        el('div', { class: 'lv-dots', 'aria-hidden': 'true' }, el('span'), el('span'), el('span')),
        el('p', { class: 'lv-sub' }, '선생님이 곧 시작해요'));
      announce(live, `${me.nickname} 닉네임으로 들어왔어요`);
      return { node, bg: me.teamColor ? 'lv-bg-team' : 'lv-bg-purple', teamColor: me.teamColor };
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
      let bg = 'lv-bg-purple';
      const box = el('div', { class: 'lv-center-msg lv-result' + (team ? ' compact' : '') });
      if (!r) {
        if (q && q.ownQuestion) add(box, el('h1', {}, '내가 낸 문제였어요'), el('p', {}, '친구들이 잘 풀었는지 화면을 보세요.'));
        else { bg = 'lv-bg-dark'; add(box, el('div', { class: 'lv-res-icon' }, crossIcon(56)), el('h1', {}, '시간이 끝났어요'), el('p', {}, '이번 문제는 답하지 못했어요. 다음 문제를 노려 봐요!')); }
      } else if (r.correct === true) {
        bg = 'lv-bg-good';
        add(box, el('div', { class: 'lv-res-icon pop-in' }, checkIcon(64)), el('h1', { class: 'lv-res-title' }, '정답!'),
          el('div', { class: 'lv-points pop-in' }, '+' + num(r.points)),
          r.streak >= 2 ? el('div', { class: 'lv-streak' }, el('span', { class: 'lv-flame', 'aria-hidden': 'true' }), `연속 정답 ${r.streak}`) : null);
      } else if (r.correct === false) {
        bg = 'lv-bg-bad';
        add(box, el('div', { class: 'lv-res-icon' }, crossIcon(64)), el('h1', { class: 'lv-res-title' }, '아쉬워요'),
          r.answerText ? el('p', { class: 'lv-answer-text' }, r.answerText) : null,
          r.lostStreak ? el('p', { class: 'lv-sub' }, '연속 정답이 끊겼어요') : null);
      } else {
        add(box, el('div', { class: 'lv-res-icon' }, checkIcon(56)), el('h1', { class: 'lv-res-title' }, '응답 고마워요'));
      }
      const rank = (r && r.rank) || me.rank;
      if (rank) add(box, el('div', { class: 'lv-rank-pill' }, `현재 ${rank}위`));
      if (r && r.message) add(box, el('p', { class: 'lv-message' }, r.message));
      if (team && v.actions && v.actions.remaining > 0) box.append(el('p', { class: 'lv-sub' }, v.actions.kind === 'launch' ? '아래에서 에너지를 보낼 행성을 눌러요!' : '아래 지도를 눌러 땅을 차지해요!'));
      return { node: box, bg, panelBig: team };
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
          el('span', { class: 'lv-top5-name' }, row.nickname || ''),
          el('span', { class: 'lv-top5-score' }, num(row.score))));
      });
      if (!list.childNodes.length) list.append(el('li', { class: 'lv-top5-row' }, el('span', { class: 'lv-top5-name' }, '아직 순위가 없어요')));
      return list;
    }

    // --- 종료 ---
    function finishedScreen(v) {
      const me = v.me;
      const pod = (v.podium || []).slice().sort((a, b) => (a.rank || 99) - (b.rank || 99));
      const top3 = el('div', { class: 'lv-mini-podium', 'aria-hidden': 'true' },
        [1, 0, 2].map(i => pod[i] ? el('div', { class: `lv-mini-pod p${i + 1}` }, el('span', { class: 'lv-mini-name' }, pod[i].nickname || ''), el('span', { class: 'lv-mini-block' }, String(pod[i].rank || i + 1))) : el('div', { class: `lv-mini-pod p${i + 1} empty` })));
      const box = el('div', { class: 'lv-center-msg lv-finished' },
        el('p', { class: 'lv-lead' }, '게임 끝!'),
        el('h1', { class: 'lv-rank-big pop-in' }, me.rank ? `${me.rank}위` : '수고했어요'),
        el('p', { class: 'lv-final-score' }, `${num(me.score)}점` + (me.answered ? ` · ${me.answered}문제 중 ${me.correct || 0}개 정답` : '')),
        top3,
        top5List(pod, me),
        KQ.btn('다시 홈으로', () => KQ.go('/'), 'big lv-white-btn'));
      announce(live, `게임이 끝났어요. ${me.rank ? me.rank + '위' : ''}, ${num(me.score)}점`);
      return { node: box, bg: 'lv-bg-purple' };
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
      if (screen && screen.tick) screen.tick(view);
    }, 250);
    const stream = watchStream(pin, 'player', apply, onGone, st => {
      conn = st;
      shell.classList.toggle('lv-offline', conn === 'reconnecting');
    });
    KQ.onLeave(() => {
      ended = true;
      clearInterval(timer); clearTimeout(flashTimer); stream.close();
      if (panelOn) modeCall(m, 'dispose', panel);
      KQ.sound.music(false);
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
    const state = { randomizeQuestions: false, randomizeAnswers: false, showOnDevice: true, friendlyNicknames: false, skipOwnQuestions: true, teamCount: 4, durationMin: 5, goal: 15 };
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
          info.id === 'robot' ? select('goal', '결승선 문제 수', [10, 15, 20, 30], v => `${v}문제`) : null),
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

    let view = null, sig = '', screen = null, m = null, mId = null, prevIds = null, musicOn = false, ended = false, conn = 'connecting', fanfareTimer = null;
    const stage = el('div', { class: 'lv-stage', 'aria-label': '게임 무대' });
    let stageUsed = false;
    const live = el('div', { class: 'sr-only', role: 'status', 'aria-live': 'polite', 'aria-atomic': 'true' });

    const soundBtn = KQ.btn(KQ.sound.enabled ? '소리 켬' : '소리 끔', () => {
      const on = KQ.sound.toggle();
      soundBtn.textContent = on ? '소리 켬' : '소리 끔'; soundBtn.setAttribute('aria-pressed', String(on));
      musicOn = false;
      if (on && view && view.phase === 'lobby') { KQ.sound.music(true); musicOn = true; }
    }, 'ghost small', { 'aria-pressed': String(KQ.sound.enabled) });
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
    const top = el('header', { class: 'lv-htop' }, el('a', { href: '/teacher', 'data-link': '', class: 'lv-htop-brand', 'aria-label': '선생님 대시보드로' }, '반짝퀴즈'), topTitle, el('span', { class: 'spacer' }), soundBtn, lockBtn, fsBtn, endBtn, closeBtn);
    const main = el('main', { class: 'lv-hmain' });
    const footPin = el('span', { class: 'lv-hfoot-pin' }, 'PIN ' + fmtPin(pin));
    const footCount = el('span', {}, '');
    const footConn = el('span', { class: 'lv-conn' }, '연결 중…');
    const foot = el('footer', { class: 'lv-hfoot' }, footPin, footCount, el('span', { class: 'spacer' }), footConn);
    const shell = el('div', { class: 'lv-host purple-bg' }, top, main, foot, live);
    KQ.render(shell);
    main.append(el('div', { class: 'lv-center-msg' }, el('div', { class: 'lv-spinner', 'aria-hidden': 'true' }), el('h1', {}, '게임을 불러오는 중…')));

    function attachStage(slot) { slot.append(stage); stageUsed = true; return slot; }

    function updateChrome(v) {
      topTitle.textContent = [v.quizTitle, v.modeName].filter(Boolean).join(' · ');
      lockBtn.textContent = v.locked ? '잠금 해제' : '잠금';
      lockBtn.setAttribute('aria-pressed', String(!!v.locked));
      lockBtn.setAttribute('aria-label', v.locked ? '로비 잠금 해제' : '로비 잠그기');
      footCount.textContent = `참가자 ${num(v.playerCount)}명` + (v.locked ? ' · 잠김' : '');
      endBtn.hidden = v.phase === 'finished';
      shell.dataset.phase = v.phase;
      // 새 참가자 소리
      const ids = new Set((v.players || []).map(p => p.id));
      if (prevIds) { let fresh = 0; for (const id of ids) if (!prevIds.has(id)) fresh++; if (fresh) { KQ.sound.play('join'); if (v.phase !== 'lobby') announce(live, `새 참가자 ${fresh}명`); } }
      prevIds = ids;
      // 로비 음악
      if (v.phase === 'lobby') { if (!musicOn && KQ.sound.enabled) { KQ.sound.music(true); musicOn = true; } }
      else if (musicOn) { KQ.sound.music(false); musicOn = false; }
    }

    function apply(v) {
      if (ended) return;
      view = v;
      if (!m || mId !== v.mode) { if (m && stageUsed) { modeCall(m, 'dispose', stage); stage.replaceChildren(); } m = modeMeta(v.mode); mId = v.mode; }
      updateChrome(v);
      const s = [v.mode, v.teamsEnabled ? 1 : 0, v.phase, v.question ? v.question.id : '', v.questionIndex ?? ''].join('|');
      if (s !== sig) {
        sig = s; clearTimeout(fanfareTimer);
        screen = buildHost(v);
        main.replaceChildren(screen.node);
        main.scrollTop = 0;
        onEnter(v);
      } else if (screen && screen.update) screen.update(v);
      if (stage.isConnected) modeCall(m, 'renderHost', stage, v);
    }

    function onEnter(v) {
      const qn = (v.questionIndex ?? 0) + 1;
      if (v.phase === 'question') { KQ.sound.play('start'); announce(live, `${qn}번 문제. ${v.question?.text || ''}`); }
      else if (v.phase === 'reveal') { KQ.sound.play('reveal'); announce(live, `정답 공개. ${v.reveal ? `정답 ${v.reveal.correctCount}명, 응답 ${v.reveal.answered}명` : ''}`); }
      else if (v.phase === 'leaderboard') { KQ.sound.play('pop'); announce(live, '점수판'); }
      else if (v.phase === 'running') { KQ.sound.play('start'); announce(live, '게임 시작!'); }
      else if (v.phase === 'finished') { announce(live, '게임 끝! 시상식'); fanfareTimer = setTimeout(() => KQ.sound.play('fanfare'), 2300); }
      else if (v.phase === 'lobby') announce(live, '참가자를 기다리는 중');
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
      const url = (v.joinUrls && v.joinUrls[0]) || (KQ.me && KQ.me.addresses && KQ.me.addresses[0]) || location.origin;
      const urlShort = String(url).replace(/^https?:\/\//, '').replace(/\/$/, '');
      const count = el('div', { class: 'lv-count-num-host' }, '0');
      const startBtn = KQ.btn('시작', () => act('start', startBtn), 'big lv-white-btn lv-start-btn');
      const chipsArea = el('div', { class: 'lv-chips-area' });
      const empty = el('p', { class: 'lv-lobby-empty' }, '참가자를 기다리는 중…');
      const chips = new Map();
      let teamCols = null;
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
            c = el('button', { type: 'button', class: 'lv-chip pop-in', title: '눌러서 내보내기', onClick: async () => {
              if (await KQ.confirm(`'${p.nickname}' 학생을 게임에서 내보낼까요?`, '내보내기', true)) act('kick', null, { playerId: p.id });
            } }, el('span', { class: 'lv-chip-name' }, p.nickname || ''));
            c.setAttribute('aria-label', `${p.nickname} 내보내기`);
            chips.set(p.id, c);
          }
          c.classList.toggle('off', p.connected === false);
          const parent = teamCols ? (teamCols[p.team] || teamCols[0]).body : flat;
          if (c.parentNode !== parent) parent.append(c);
        }
        for (const [id, c] of chips) if (!seen.has(id)) { c.remove(); chips.delete(id); }
        if (teamCols) teamCols.forEach((t, i) => { t.cnt.textContent = (vv.players || []).filter(p => p.team === i).length + '명'; });
      }
      const node = el('div', { class: 'lv-lobby' },
        el('div', { class: 'lv-join-band' },
          el('div', { class: 'lv-join-url' }, el('span', { class: 'lv-join-label' }, '참여하려면 접속'), el('strong', { class: 'lv-join-addr' }, urlShort)),
          el('div', { class: 'lv-join-pin' }, el('span', { class: 'lv-join-label' }, '게임 PIN:'), el('strong', { class: 'lv-join-pin-num', 'aria-label': `게임 PIN ${pin.split('').join(' ')}` }, fmtPin(pin)))),
        el('div', { class: 'lv-lobby-bar' },
          el('div', { class: 'lv-count-box', 'aria-live': 'polite' }, count, el('span', {}, '명 참가')),
          el('div', { class: 'lv-lobby-title' }, el('h1', {}, v.quizTitle || '반짝퀴즈'), el('p', {}, v.modeName || '') , v.locked ? el('span', { class: 'badge orange' }, '잠김: 새 참가 불가') : null),
          startBtn),
        chipsArea,
        el('p', { class: 'lv-lobby-hint' }, '닉네임을 누르면 그 학생을 내보낼 수 있어요.'));
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
        if (s !== lastS) { if (lastS !== null && s <= 5 && s > 0) KQ.sound.play('tick'); lastS = s; }
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
      if (q.type === 'quiz' || q.type === 'truefalse' || q.type === 'poll') {
        const dist = rv.distribution || [];
        const n = Math.min(4, (q.choices || []).length);
        const max = Math.max(1, ...dist.slice(0, n).map(x => +x || 0));
        const bars = el('div', { class: 'lv-bars', role: 'img', 'aria-label': '보기별 응답 수: ' + Array.from({ length: n }, (_, i) => `${SHAPE_NAMES[i]} ${dist[i] || 0}명`).join(', ') });
        for (let i = 0; i < n; i++) {
          const c = q.choices[i] || {};
          const cnt = +dist[i] || 0;
          bars.append(el('div', { class: 'lv-bar-col' + (q.type !== 'poll' && c.correct === false ? ' dim' : '') },
            el('div', { class: 'lv-bar-count' }, String(cnt)),
            el('div', { class: `lv-bar shape-${i}`, style: { height: Math.max(4, cnt / max * 100) + '%', animationDelay: (i * 0.08) + 's' } }),
            el('div', { class: `lv-bar-foot shape-${i}` }, shape(i, 26), c.correct === true && q.type !== 'poll' ? checkIcon(24) : null)));
        }
        res.append(bars, hostTiles(q, true));
      } else if (q.type === 'type') {
        const typed = rv.typed || [];
        res.append(el('div', { class: 'lv-rv-accepted' }, el('span', {}, '정답: '), el('strong', {}, (q.accepted || []).join(', ') || '-')),
          el('ul', { class: 'lv-typed' }, typed.length ? typed.slice(0, 8).map(t => el('li', { class: t.correct ? 'ok' : '' }, el('span', { class: 'lv-typed-text' }, t.text || ''), el('span', { class: 'lv-typed-count' }, `${t.count || 0}명`), t.correct ? checkIcon(22) : null)) : el('li', {}, '입력된 답이 없어요')));
      } else if (q.type === 'slider') {
        const sl = q.slider || {};
        const span = (+sl.max - +sl.min) || 1;
        const pos = x => Math.max(0, Math.min(100, ((+x - +sl.min) / span) * 100)) + '%';
        const scale = el('div', { class: 'lv-slider-scale', 'aria-hidden': 'true' },
          sl.tolerance ? el('div', { class: 'lv-slider-tol', style: { left: pos(+sl.answer - +sl.tolerance), width: `calc(${pos(+sl.answer + +sl.tolerance)} - ${pos(+sl.answer - +sl.tolerance)})` } }) : null,
          sl.answer !== undefined ? el('div', { class: 'lv-slider-mark ans', style: { left: pos(sl.answer) } }, el('span', {}, '정답')) : null,
          rv.sliderAverage !== undefined && rv.sliderAverage !== null ? el('div', { class: 'lv-slider-mark avg', style: { left: pos(rv.sliderAverage) } }, el('span', {}, '평균')) : null);
        res.append(el('div', { class: 'lv-rv-slider' },
          el('div', { class: 'lv-rv-big' }, el('span', {}, '정답 '), el('strong', {}, String(sl.answer ?? '-')), sl.tolerance ? el('small', {}, ` (±${sl.tolerance} 인정)`) : null),
          el('div', { class: 'lv-rv-avg' }, '반 평균 ', el('strong', {}, rv.sliderAverage === null || rv.sliderAverage === undefined ? '-' : String(Math.round(rv.sliderAverage * 100) / 100))),
          scale, el('div', { class: 'lv-slider-ends' }, el('span', {}, String(sl.min ?? 0)), el('span', {}, String(sl.max ?? 100)))));
      } else if (q.type === 'puzzle') {
        const order = q.puzzleOrder || (q.choices || []).map(c => c.text);
        res.append(el('p', { class: 'lv-rv-label' }, '정답 순서'), el('ol', { class: 'lv-hq-puzzle answer' }, order.map((t, i) => el('li', { class: `shape-${i % 4}` }, String(t || '')))));
      }
      const poll = q.type === 'poll';
      const summary = el('div', { class: 'lv-rv-summary' }, poll ? `응답 ${num(rv.answered)}명` : `정답 ${num(rv.correctCount)}명 / 응답 ${num(rv.answered)}명`);
      const last = (v.questionIndex ?? 0) + 1 >= (v.questionCount || 0);
      const nextBtn = KQ.btn(classic ? '다음' : (last ? '결과 보기' : '다음'), () => act('next', nextBtn), 'big lv-white-btn lv-next-btn');
      const node = el('div', { class: 'lv-rv' + (classic ? '' : ' with-stage') },
        el('div', { class: 'lv-q-band small' },
          el('div', { class: 'lv-q-meta' }, el('span', { class: 'badge purple' }, `${(v.questionIndex ?? 0) + 1} / ${v.questionCount || '?'}`), q.authorName ? el('span', { class: 'badge green' }, '학생 출제: ' + q.authorName) : null),
          el('h1', { class: 'lv-q-band-text' }, q.text || '')),
        el('div', { class: 'lv-rv-grid' },
          el('div', { class: 'lv-rv-left' }, res, el('div', { class: 'lv-rv-actions' }, summary, nextBtn)),
          classic ? null : attachStage(el('div', { class: 'lv-stage-slot big' }))));
      return { node };
    }

    // --- 점수판 (클래식) ---
    function hostLeaderboard(v) {
      const rows = (v.leaderboard || []).slice(0, 5);
      const max = Math.max(1, ...rows.map(r => +r.score || 0));
      const list = el('ol', { class: 'lv-lb' });
      rows.forEach((r, i) => list.append(el('li', { class: 'lv-lb-row', style: { animationDelay: (0.2 + i * 0.28) + 's' } },
        el('span', { class: 'lv-lb-rank' }, String(r.rank || i + 1)),
        el('span', { class: 'lv-lb-name' }, r.nickname || ''),
        r.streak >= 2 ? el('span', { class: 'lv-lb-streak' }, el('span', { class: 'lv-flame', 'aria-hidden': 'true' }), `연속 정답 ${r.streak}`) : null,
        r.delta ? el('span', { class: 'lv-lb-delta' }, '+' + num(r.delta)) : null,
        el('span', { class: 'lv-lb-score' }, num(r.score)),
        el('span', { class: 'lv-lb-fill', style: { width: Math.max(8, (+r.score || 0) / max * 100) + '%' }, 'aria-hidden': 'true' }))));
      if (!rows.length) list.append(el('li', { class: 'lv-lb-row' }, el('span', { class: 'lv-lb-name' }, '아직 점수가 없어요')));
      const last = (v.questionIndex ?? 0) + 1 >= (v.questionCount || 0);
      const nextBtn = KQ.btn(last ? '결과 보기' : '다음 문제', () => act('next', nextBtn), 'big lv-white-btn lv-next-btn');
      return { node: el('div', { class: 'lv-hlb' }, el('div', { class: 'lv-title-band' }, el('h1', {}, '점수판')), list, el('div', { class: 'lv-rv-actions' }, el('span', { class: 'lv-rv-summary' }, `${(v.questionIndex ?? 0) + 1} / ${v.questionCount || '?'} 문제 완료`), nextBtn)) };
    }

    // --- 각자 속도 진행 중 ---
    function hostRunning(v) {
      const clock = el('div', { class: 'lv-run-clock', role: 'timer' }, '');
      const count = el('span', {}, '');
      const feed = el('ul', { class: 'lv-feed', 'aria-live': 'polite', 'aria-label': '실시간 소식' });
      const finishBtn = KQ.btn('게임 끝내기', async () => { if (await KQ.confirm('지금 게임을 끝내고 시상대로 갈까요?', '게임 끝내기', true)) act('end', finishBtn); }, 'lv-white-btn');
      let lastFeedKey = '';
      const tick = vv => { const s = KQ.secondsLeft(vv.endsAt); clock.textContent = fmtClock(s); clock.classList.toggle('hurry', s <= 10); clock.setAttribute('aria-label', `남은 시간 ${fmtClock(s)}`); };
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
    function hostFinished(v) {
      const pod = (v.podium || []).slice().sort((a, b) => (a.rank || 99) - (b.rank || 99)).slice(0, 5);
      const parts = [el('div', { class: 'lv-title-band' }, el('h1', {}, v.quizTitle || '최종 결과'), el('p', {}, (v.modeName || '') + ' · 시상식'))];
      if (COOP.has(v.mode) && v.modeState && v.modeState.status) {
        const st = v.modeState.status;
        const win = st === 'success' || st === 'victory', lose = st === 'failed' || st === 'defeat';
        if (win || lose) parts.push(el('div', { class: 'lv-coop-banner ' + (win ? 'good' : 'bad') + ' pop-in', role: 'status' }, win ? '반 전체 미션 성공!' : '아쉽게 미션 실패', el('small', {}, win ? '모두 힘을 모아 해냈어요' : '다음엔 꼭 성공해요')));
      }
      const teamsSorted = v.teamsEnabled && Array.isArray(v.teams) ? v.teams.slice().sort((a, b) => (b.score || 0) - (a.score || 0)) : [];
      if (teamsSorted.length) {
        parts.push(el('div', { class: 'lv-team-result' }, teamsSorted.map((t, i) => el('div', { class: 'lv-team-res pop-in' + (i === 0 ? ' win' : ''), style: { '--lv-team': t.color || teamInfo(null, t.index).color, animationDelay: (i * 0.15) + 's' } },
          el('span', { class: 'lv-team-res-rank' }, `${i + 1}위`), el('span', { class: 'lv-team-res-name' }, t.name || teamInfo(null, t.index).name), el('span', { class: 'lv-team-res-score' }, num(t.score))))));
      }
      const delayBase = teamsSorted.length ? 0.8 : 0;
      const block = (p, place) => {
        const delay = delayBase + ({ 3: 0.4, 2: 1.3, 1: 2.2 })[place];
        if (!p) return el('div', { class: `lv-pod lv-pod-${place} empty` });
        const tc = p.team !== undefined && p.team !== null && v.teamsEnabled ? teamInfo(v.teams, p.team).color : null;
        return el('div', { class: `lv-pod lv-pod-${place}`, style: { '--lv-delay': delay + 's' } },
          el('div', { class: 'lv-pod-who' }, el('span', { class: 'lv-pod-name' }, p.nickname || ''), el('span', { class: 'lv-pod-score' }, num(p.score) + '점'), tc ? el('span', { class: 'lv-pod-team', style: { background: tc } }) : null),
          el('div', { class: 'lv-pod-block' }, el('span', { class: 'lv-pod-rank' }, String(place))));
      };
      parts.push(el('div', { class: 'lv-podium', 'aria-hidden': 'true' }, block(pod[1], 2), block(pod[0], 1), block(pod[2], 3)));
      if (pod.length > 3) parts.push(el('ol', { class: 'lv-pod-rest', start: 4 }, pod.slice(3).map((p, i) => el('li', { style: { animationDelay: (delayBase + 3 + i * 0.2) + 's' } }, el('span', { class: 'lv-lb-rank' }, String(p.rank || i + 4)), el('span', { class: 'lv-lb-name' }, p.nickname || ''), el('span', { class: 'lv-lb-score' }, num(p.score))))));
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
      return { node: el('div', { class: 'lv-fin' }, parts) };
    }

    function onGone(status) {
      if (ended) return;
      ended = true;
      if (musicOn) { KQ.sound.music(false); musicOn = false; }
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
      clearInterval(timer); clearTimeout(fanfareTimer); stream.close();
      KQ.sound.music(false); musicOn = false;
      document.removeEventListener('fullscreenchange', onFs);
      if (stageUsed) modeCall(m, 'dispose', stage);
    });
  });

  // 테스트용 내부 노출 (기능에는 영향 없음)
  KQ._live = { fmtPin, fmtClock, probeGame };
})();
