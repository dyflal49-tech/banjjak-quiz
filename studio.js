'use strict';
// 반짝퀴즈 스튜디오: 교사 로그인/설정, 대시보드, 퀴즈 편집기, 표 붙여넣기, 학생 출제 관리, 리포트, 학생 문제 내기
(() => {
  const KQ = window.KQ;
  if (!KQ) return;
  const el = KQ.el;
  const btn = KQ.btn;

  // ---------- 상수 ----------
  const TYPES = ['quiz', 'truefalse', 'type', 'poll', 'puzzle', 'slider'];
  const STUDENT_TYPES = ['quiz', 'truefalse', 'type', 'puzzle', 'slider'];
  const LIST_TYPES = ['quiz', 'poll', 'puzzle'];
  const TYPE_NAMES = Object.assign({ quiz: '퀴즈', truefalse: '참/거짓', type: '주관식', poll: '설문', puzzle: '순서 맞추기', slider: '숫자 슬라이더' }, KQ.typeNames || {});
  const TIMES = [5, 10, 20, 30, 45, 60, 90, 120, 240];
  const POINTS = [['standard', '표준'], ['double', '두 배'], ['none', '점수 없음']];
  const THEMES = [['#46178f', '보라'], ['#1368ce', '파랑'], ['#26890c', '초록'], ['#e21b3c', '빨강'], ['#d89e00', '노랑'], ['#0aa3a3', '청록'], ['#864cbf', '연보라'], ['#333333', '검정']];
  const PHASES = { lobby: '대기실', countdown: '시작 중', question: '문제 진행 중', reveal: '정답 공개', leaderboard: '순위 발표', running: '진행 중', finished: '끝남' };
  const TEAM_NAMES = ['빨강 팀', '파랑 팀', '노랑 팀', '초록 팀'];
  const STATUS = { pending: ['검토 대기', 'orange'], approved: ['채택됨', 'green'], rejected: ['거절됨', ''] };
  const IMG_TYPES = ['image/jpeg', 'image/png', 'image/gif', 'image/webp'];
  const MAX_IMG = 2 * 1024 * 1024;

  let uidN = 0;
  const uid = p => `st-${p || 'x'}-${++uidN}`;
  const timeLabel = t => t < 60 ? `${t}초` : `${t}초 (${Math.floor(t / 60)}분${t % 60 ? ` ${t % 60}초` : ''})`;
  const pct = v => (v === null || v === undefined || !Number.isFinite(+v)) ? null : Math.round(+v * 100);
  const studentBase = () => (KQ.me && Array.isArray(KQ.me.addresses) && KQ.me.addresses[0]) || location.origin;
  const enc = encodeURIComponent;
  // DOM append/replaceChildren 은 null 을 'null' 글자로 넣으므로 걸러서 사용
  const clean = kids => kids.flat(Infinity).filter(k => k !== null && k !== undefined && k !== false);
  const put = (node, ...kids) => { node.replaceChildren(...clean(kids)); return node; };
  const add = (node, ...kids) => { node.append(...clean(kids)); return node; };

  // ---------- 공통 도우미 ----------
  function lifecycle() { const s = { alive: true }; KQ.onLeave(() => { s.alive = false; }); return s; }

  // 교사용 API: 401 이면 로그인 화면으로 (noRedirect 면 그냥 던짐)
  async function tapi(url, method = 'GET', data, opts = {}) {
    try { return await KQ.api(url, method, data); }
    catch (e) {
      if (e.status === 401 && !opts.noRedirect) {
        e.handled = true;
        if (KQ.me) KQ.me.teacher = null;
        KQ.toast('로그인이 필요해요. 다시 로그인해 주세요.', true);
        KQ.go('/teacher');
      }
      throw e;
    }
  }
  const fail = e => { if (!e || e.handled) return; KQ.toast(e.message || String(e), true); };

  function teacherRoute(pattern, handler) {
    KQ.route(pattern, async (params, query) => {
      if (!KQ.me || !KQ.me.teacher) { KQ.go('/teacher', true); return; }
      try { await handler(params, query); } catch (e) { if (e && e.handled) return; throw e; }
    });
  }

  function selectEl(options, value, attrs = {}) {
    const s = el('select', { class: 'input', ...attrs }, options.map(([v, t]) => el('option', { value: String(v) }, t)));
    s.value = String(value);
    return s;
  }
  function field(labelText, control, hint) {
    if (!control.id) control.id = uid('f');
    return el('div', { class: 'field' }, el('label', { for: control.id }, labelText), control, hint ? el('small', {}, hint) : null);
  }
  const ICONS = {
    up: [['polyline', { points: '6,15 12,9 18,15' }]],
    down: [['polyline', { points: '6,9 12,15 18,9' }]],
    copy: [['rect', { x: 8, y: 8, width: 12, height: 12, rx: 2 }], ['path', { d: 'M16 8V5a1 1 0 0 0-1-1H5a1 1 0 0 0-1 1v10a1 1 0 0 0 1 1h3' }]],
    trash: [['path', { d: 'M4 7h16M10 11v6M14 11v6M6 7l1 13h10l1-13M9 7V4h6v3' }]],
    plus: [['path', { d: 'M12 5v14M5 12h14' }]],
    check: [['polyline', { points: '5,12 10,17 19,7' }]],
    x: [['path', { d: 'M6 6l12 12M18 6L6 18' }]],
    image: [['rect', { x: 3, y: 5, width: 18, height: 14, rx: 2 }], ['circle', { cx: 9, cy: 10, r: 2 }], ['polyline', { points: '21,16 15,11 5,19' }]],
    back: [['polyline', { points: '15,5 8,12 15,19' }]]
  };
  function icon(name, size = 18) {
    return el('svg', { viewBox: '0 0 24 24', width: size, height: size, 'aria-hidden': 'true', fill: 'none', stroke: 'currentColor', 'stroke-width': 2.4, 'stroke-linecap': 'round', 'stroke-linejoin': 'round', class: 'st-icon' }, (ICONS[name] || []).map(([t, a]) => el(t, a)));
  }
  function iconBtn(name, label, onClick, cls = '', attrs = {}) {
    return el('button', { type: 'button', class: ('st-icon-btn ' + cls).trim(), 'aria-label': label, title: label, onClick, ...attrs }, icon(name));
  }
  const loadingNode = (text = '불러오는 중…') => el('div', { class: 'st-loading', role: 'status' }, el('span', { class: 'st-spinner', 'aria-hidden': 'true' }), text);

  async function copyText(text, label = '주소') {
    const prev = document.activeElement;
    let ok = false;
    try { if (navigator.clipboard && window.isSecureContext) { await navigator.clipboard.writeText(text); ok = true; } } catch {}
    if (!ok) {
      const ta = el('textarea', { style: { position: 'fixed', left: '-9999px', top: '0' }, readOnly: true });
      ta.value = text; add(document.body, ta); ta.select();
      try { ok = document.execCommand('copy'); } catch {}
      ta.remove();
      if (prev && prev.isConnected) prev.focus();
    }
    if (ok) KQ.toast(`${label}를 복사했어요.`);
    else KQ.toast(`복사하지 못했어요. 직접 선택해서 복사하세요: ${text}`, true);
  }

  function teacherTopbar(active) {
    const items = [];
    if (active !== 'dash') items.push(btn('내 퀴즈', () => KQ.go('/teacher'), 'ghost small'));
    if (active !== 'reports') items.push(btn('리포트', () => KQ.go('/teacher/reports'), 'ghost small'));
    items.push(btn('로그아웃', logout, 'ghost small'), KQ.soundButton());
    return KQ.topbar(...items);
  }
  async function logout() {
    try { await KQ.api('/api/logout', 'POST', {}); } catch {}
    try { await KQ.refreshMe(); } catch { if (KQ.me) KQ.me.teacher = null; }
    KQ.toast('로그아웃했어요.');
    KQ.go('/teacher');
  }

  // 편집 중 세션이 만료됐을 때 화면을 떠나지 않고 다시 로그인
  function reloginModal() {
    return new Promise(resolve => {
      let ok = false;
      const m = KQ.modal('다시 로그인', { onClose: () => resolve(ok) });
      const pw = el('input', { type: 'password', class: 'input', autocomplete: 'current-password', required: true });
      const go = async () => {
        if (!pw.value) { pw.focus(); return; }
        try {
          await KQ.api('/api/login', 'POST', { password: pw.value });
          await KQ.refreshMe();
          ok = true; KQ.closeModal(true);
        } catch (e) { KQ.toast(e.message, true); pw.select(); }
      };
      pw.addEventListener('keydown', e => { if (e.key === 'Enter') { e.preventDefault(); go(); } });
      add(m.body, el('p', {}, '로그인이 만료됐어요. 작업 중인 내용은 그대로 있어요. 비밀번호를 다시 입력하면 이어서 저장해요.'), field('비밀번호', pw));
      add(m.foot, btn('취소', () => KQ.closeModal(), 'ghost'), btn('로그인하고 저장', go, 'primary'));
    });
  }

  // ---------- 문제 모델 ----------
  const defaultSlider = () => ({ min: 0, max: 100, step: 1, answer: 50, tolerance: 0 });
  const blankChoices = (n = 4) => Array.from({ length: n }, () => ({ text: '', correct: false }));
  const num = v => (v === '' || v === null || v === undefined) ? NaN : Number(v);

  function newQuestion(type = 'quiz') {
    const q = { _k: uid('q'), id: null, type: 'quiz', text: '', image: null, timeLimit: 20, points: 'standard', choices: blankChoices(4), accepted: [], slider: null, authorName: null };
    if (type !== 'quiz') setType(q, type);
    return q;
  }
  function ensureQ(src = {}) {
    const q = {
      _k: uid('q'), id: src.id || null,
      type: TYPES.includes(src.type) ? src.type : 'quiz',
      text: String(src.text || ''), image: src.image || null,
      timeLimit: TIMES.includes(+src.timeLimit) ? +src.timeLimit : 20,
      points: ['standard', 'double', 'none'].includes(src.points) ? src.points : 'standard',
      choices: Array.isArray(src.choices) ? src.choices.map(c => ({ text: String((c && c.text) ?? ''), correct: !!(c && c.correct) })) : [],
      accepted: Array.isArray(src.accepted) ? src.accepted.map(String) : [],
      slider: src.slider ? { ...defaultSlider(), ...src.slider } : null,
      authorName: src.authorName || null
    };
    if (q.type === 'truefalse') { const t = !!(q.choices[0] && q.choices[0].correct); q.choices = [{ text: '참', correct: t }, { text: '거짓', correct: !t && !!(q.choices[1] && q.choices[1].correct) }]; }
    if (LIST_TYPES.includes(q.type)) { if (q.choices.length < 2) q.choices.push(...blankChoices(2 - q.choices.length)); q.choices = q.choices.slice(0, 4); }
    if (q.type === 'type' && !q.accepted.length) q.accepted = [''];
    if (q.type === 'slider' && !q.slider) q.slider = defaultSlider();
    if (q.type === 'poll') q.points = 'none';
    return q;
  }
  function copyQ(q) { const c = ensureQ(cleanQ(q, true)); c.id = null; return c; }
  function setType(q, type) {
    const prev = q.type;
    if (prev === type) return;
    if (LIST_TYPES.includes(type)) {
      if (!LIST_TYPES.includes(prev)) q.choices = q._stash || blankChoices(4);
      q.choices = q.choices.map(c => ({ text: c.text, correct: type === 'quiz' ? !!c.correct : false }));
      if (q.choices.length < 2) q.choices.push(...blankChoices(2 - q.choices.length));
    } else {
      if (LIST_TYPES.includes(prev)) q._stash = q.choices.map(c => ({ ...c }));
      q.choices = type === 'truefalse' ? [{ text: '참', correct: false }, { text: '거짓', correct: false }] : [];
    }
    if (type === 'type' && !q.accepted.length) q.accepted = [''];
    if (type === 'slider' && !q.slider) q.slider = defaultSlider();
    if (type === 'poll') q.points = 'none'; else if (prev === 'poll') q.points = 'standard';
    q.type = type;
  }
  // 저장용 정리 (빈 보기 제거, 유형별 필드만)
  function cleanQ(q, keepEmpty = false) {
    const out = { type: q.type, text: String(q.text || '').trim(), image: q.image || null, timeLimit: +q.timeLimit || 20, points: q.type === 'poll' ? 'none' : (q.points || 'standard'), choices: [], accepted: [], slider: null, authorName: q.authorName || null };
    if (q.id) out.id = q.id;
    if (LIST_TYPES.includes(q.type)) out.choices = q.choices.map(c => ({ text: String(c.text || '').trim(), correct: q.type === 'quiz' && !!c.correct })).filter(c => keepEmpty || c.text || c.correct);
    else if (q.type === 'truefalse') out.choices = [{ text: '참', correct: !!(q.choices[0] && q.choices[0].correct) }, { text: '거짓', correct: !!(q.choices[1] && q.choices[1].correct) }];
    else if (q.type === 'type') out.accepted = q.accepted.map(a => String(a).trim()).filter(a => keepEmpty || a);
    else if (q.type === 'slider') { const s = q.slider || defaultSlider(); out.slider = { min: num(s.min), max: num(s.max), step: num(s.step), answer: num(s.answer), tolerance: num(s.tolerance) }; }
    return out;
  }
  // 정리된 문제 검사 → {msg, field} 또는 null
  function problem(q) {
    if (!q.text) return { msg: '질문을 입력하세요.', field: 'text' };
    if (q.text.length > 240) return { msg: '질문은 240자 이하로 써 주세요.', field: 'text' };
    if (!TIMES.includes(q.timeLimit)) return { msg: '제한 시간을 골라 주세요.', field: 'time' };
    if (LIST_TYPES.includes(q.type)) {
      if (q.choices.some(c => !c.text)) return { msg: '정답으로 표시한 보기에 내용을 입력하세요.', field: 'choice' };
      if (q.choices.length < 2) return { msg: q.type === 'puzzle' ? '순서를 맞출 항목을 2개 이상 입력하세요.' : '보기를 2개 이상 입력하세요.', field: 'choice' };
      if (q.choices.length > 4) return { msg: '보기는 4개까지 넣을 수 있어요.', field: 'choice' };
      if (q.choices.some(c => c.text.length > 75)) return { msg: '보기는 75자 이하로 써 주세요.', field: 'choice' };
      if (q.type === 'quiz' && !q.choices.some(c => c.correct)) return { msg: '정답 보기를 하나 이상 골라 주세요. 보기 오른쪽의 동그라미를 누르면 정답이 돼요.', field: 'correct' };
    } else if (q.type === 'truefalse') {
      if (!q.choices.some(c => c.correct)) return { msg: '참과 거짓 중 정답을 골라 주세요.', field: 'correct' };
    } else if (q.type === 'type') {
      if (!q.accepted.length) return { msg: '인정할 정답을 하나 이상 입력하세요.', field: 'accepted' };
      if (q.accepted.length > 5) return { msg: '정답은 5개까지 넣을 수 있어요.', field: 'accepted' };
      if (q.accepted.some(a => a.length > 20)) return { msg: '정답은 각각 20자 이하로 써 주세요.', field: 'accepted' };
    } else if (q.type === 'slider') {
      const s = q.slider;
      if (['min', 'max', 'step', 'answer', 'tolerance'].some(k => !Number.isFinite(s[k]))) return { msg: '슬라이더 숫자(최솟값, 최댓값, 간격, 정답, 허용 오차)를 모두 입력하세요.', field: 'slider' };
      if (s.min >= s.max) return { msg: '최솟값은 최댓값보다 작아야 해요.', field: 'slider' };
      if (s.step <= 0) return { msg: '간격은 0보다 커야 해요.', field: 'slider' };
      if ((s.max - s.min) / s.step > 100000) return { msg: '간격이 너무 작아요. 간격을 크게 하거나 범위를 줄여 주세요.', field: 'slider' };
      if (s.answer < s.min || s.answer > s.max) return { msg: '정답은 최솟값과 최댓값 사이여야 해요.', field: 'slider' };
      if (s.tolerance < 0 || s.tolerance > s.max - s.min) return { msg: '허용 오차는 0 이상, 범위(최댓값-최솟값) 이하여야 해요.', field: 'slider' };
    }
    return null;
  }
  function isBlankQ(q) { return !q.text.trim() && !q.image && q.choices.every(c => !c.text.trim() && !c.correct) && !q.accepted.some(a => a.trim()); }

  // ---------- 이미지 업로드 ----------
  const readDataUrl = blob => new Promise((res, rej) => { const r = new FileReader(); r.onload = () => res(r.result); r.onerror = () => rej(new Error('파일을 읽지 못했어요.')); r.readAsDataURL(blob); });
  async function shrinkImage(file) {
    const url = URL.createObjectURL(file);
    try {
      const img = await new Promise((res, rej) => { const i = new Image(); i.onload = () => res(i); i.onerror = () => rej(new Error('이미지를 열 수 없어요.')); i.src = url; });
      const scale = Math.min(1, 1600 / Math.max(img.naturalWidth || 1, img.naturalHeight || 1));
      const c = document.createElement('canvas');
      c.width = Math.max(1, Math.round(img.naturalWidth * scale)); c.height = Math.max(1, Math.round(img.naturalHeight * scale));
      const g = c.getContext('2d'); g.fillStyle = '#fff'; g.fillRect(0, 0, c.width, c.height); g.drawImage(img, 0, 0, c.width, c.height);
      return await new Promise(res => c.toBlob(res, 'image/jpeg', 0.85));
    } finally { URL.revokeObjectURL(url); }
  }
  async function uploadImage(file, code) {
    if (!IMG_TYPES.includes(file.type)) throw new Error('JPG, PNG, GIF, WEBP 이미지만 올릴 수 있어요.');
    let blob = file, type = file.type, name = file.name || 'image';
    if (file.size > MAX_IMG) {
      // 휴대폰 사진처럼 큰 이미지는 자동으로 줄여 봄 (GIF 제외)
      const big = new Error('이미지가 2MB보다 커요. 더 작은 이미지를 골라 주세요.');
      if (file.type === 'image/gif') throw big;
      blob = await shrinkImage(file).catch(() => null);
      if (!blob || blob.size > MAX_IMG) throw big;
      type = 'image/jpeg'; name = name.replace(/\.[^.]+$/, '') + '.jpg';
    }
    const dataUrl = String(await readDataUrl(blob));
    const body = { name, type, data: dataUrl.slice(dataUrl.indexOf(',') + 1) };
    if (code) body.code = code;
    const r = code ? await KQ.api('/api/uploads', 'POST', body) : await tapi('/api/uploads', 'POST', body, { noRedirect: true });
    return r.url;
  }

  // ---------- 문제 편집 부품 (편집기, 고쳐서 승인, 학생 문제 내기에서 공유) ----------
  // ctx = { changed(kind), rerender(), uploadCode }
  function buildTextField(q, ctx, opts = {}) {
    const id = uid('qt');
    const counter = el('span', { class: 'st-counter', 'aria-hidden': 'true' }, `${q.text.length}/240`);
    const ta = el('textarea', { id, class: 'st-q-text' + (opts.compact ? ' compact' : ''), rows: 2, maxlength: 240, placeholder: '질문을 입력하세요', 'data-field': 'text', value: q.text,
      onInput: () => { q.text = ta.value; counter.textContent = `${ta.value.length}/240`; ctx.changed('text'); } });
    return el('div', { class: 'st-q-text-wrap' }, el('label', { for: id, class: opts.compact ? 'field-label' : 'sr-only' }, '질문'), ta, counter);
  }

  function buildImageField(q, ctx) {
    const wrap = el('div', { class: 'st-image' });
    let busy = false;
    const input = el('input', { type: 'file', accept: IMG_TYPES.join(','), class: 'sr-only', tabindex: '-1', 'aria-hidden': 'true', onChange: () => { const f = input.files[0]; input.value = ''; if (f) handle(f); } });
    const pick = () => { if (!busy) input.click(); };
    async function handle(f) {
      busy = true; draw('올리는 중…');
      try { q.image = await uploadImage(f, ctx.uploadCode); ctx.changed('image'); KQ.toast('이미지를 올렸어요.'); }
      catch (e) { if (e.status === 401) KQ.toast('로그인이 만료됐어요. 저장 버튼을 눌러 다시 로그인한 뒤 이미지를 올려 주세요.', true); else fail(e); }
      finally { busy = false; if (wrap.isConnected) draw(); }
    }
    function draw(msg) {
      put(wrap, input);
      if (msg) { add(wrap, el('div', { class: 'st-image-drop busy', role: 'status' }, el('span', { class: 'st-spinner', 'aria-hidden': 'true' }), msg)); return; }
      if (q.image) {
        add(wrap, el('figure', { class: 'st-image-preview' },
          el('img', { src: q.image, alt: '문제 이미지 미리보기' }),
          el('figcaption', { class: 'row' }, btn('이미지 바꾸기', pick, 'ghost small'), btn('이미지 제거', () => { q.image = null; ctx.changed('image'); draw(); }, 'ghost small'))));
      } else {
        add(wrap, el('button', { type: 'button', class: 'st-image-drop', onClick: pick, 'aria-label': '이미지 추가 (JPG, PNG, GIF, WEBP, 2MB 이하)' },
          icon('image', 40), el('strong', {}, '이미지 추가'), el('span', { class: 'small' }, '눌러서 고르거나 여기로 끌어다 놓으세요 · 2MB 이하')));
      }
    }
    wrap.addEventListener('dragover', e => { e.preventDefault(); wrap.classList.add('drag'); });
    wrap.addEventListener('dragleave', () => wrap.classList.remove('drag'));
    wrap.addEventListener('drop', e => { e.preventDefault(); wrap.classList.remove('drag'); const f = e.dataTransfer && e.dataTransfer.files[0]; if (f && !busy) handle(f); });
    draw();
    return wrap;
  }

  function buildAnswers(q, ctx) {
    if (q.type === 'quiz' || q.type === 'poll') return choiceTiles(q, ctx);
    if (q.type === 'truefalse') return trueFalseTiles(q, ctx);
    if (q.type === 'type') return acceptedEditor(q, ctx);
    if (q.type === 'puzzle') return puzzleEditor(q, ctx);
    if (q.type === 'slider') return sliderEditor(q, ctx);
    return el('div');
  }

  function choiceTiles(q, ctx) {
    const isQuiz = q.type === 'quiz';
    const grid = el('div', { class: 'st-choices', role: 'group', 'aria-label': isQuiz ? '보기와 정답' : '설문 보기' });
    q.choices.forEach((c, i) => {
      const id = uid('c');
      const tile = el('div', { class: `st-choice ${KQ.shapes[i].cls}` + (c.correct ? ' is-correct' : '') + (c.text.trim() ? ' filled' : '') });
      const inp = el('input', { id, class: 'st-choice-input', maxlength: 75, autocomplete: 'off', placeholder: `보기 ${i + 1} 추가` + (i >= 2 ? ' (선택)' : ''), 'data-field': 'choice', value: c.text,
        onInput: () => { c.text = inp.value; tile.classList.toggle('filled', !!inp.value.trim()); ctx.changed('choice'); } });
      add(tile, el('span', { class: 'st-choice-shape' }, KQ.shapeIcon(i, 24)), el('label', { for: id, class: 'sr-only' }, `보기 ${i + 1} (${KQ.shapes[i].name})`), inp);
      if (isQuiz) {
        const cid = uid('ok');
        const cb = el('input', { type: 'checkbox', id: cid, class: 'st-correct-input', checked: c.correct, 'data-field': i === 0 ? 'correct' : null, title: '정답으로 표시',
          onChange: () => { c.correct = cb.checked; tile.classList.toggle('is-correct', cb.checked); ctx.changed('correct'); } });
        add(tile, el('label', { class: 'sr-only', for: cid }, `보기 ${i + 1} 정답`), el('span', { class: 'st-correct-box' }, cb, el('span', { class: 'st-correct-mark', 'aria-hidden': 'true' }, icon('check', 20))));
      }
      if (q.choices.length > 2) add(tile, iconBtn('x', `보기 ${i + 1} 삭제`, () => { q.choices.splice(i, 1); ctx.changed('struct'); ctx.rerender(); }, 'st-choice-del'));
      add(grid, tile);
    });
    const wrap = el('div', { class: 'st-answers' }, grid);
    const row = el('div', { class: 'row st-answers-foot' });
    if (q.choices.length < 4) add(row, btn([icon('plus'), '보기 추가'], () => { q.choices.push({ text: '', correct: false }); ctx.changed('struct'); ctx.rerender(); }, 'ghost small'));
    add(row, el('span', { class: 'small muted' }, isQuiz ? '정답은 여러 개 고를 수 있어요. 빈 보기는 저장할 때 빠져요.' : '설문은 정답과 점수가 없어요. 학생들의 생각을 모아 보여 줘요.'));
    add(wrap, row);
    return wrap;
  }

  function trueFalseTiles(q, ctx) {
    const name = uid('tf');
    const grid = el('div', { class: 'st-choices tf', role: 'radiogroup', 'aria-label': '정답 고르기' });
    q.choices.forEach((c, i) => {
      const id = uid('tfo');
      const r = el('input', { type: 'radio', name, id, class: 'st-correct-input', checked: c.correct, 'data-field': i === 0 ? 'correct' : null, title: '정답으로 표시',
        onChange: () => { q.choices.forEach((x, j) => { x.correct = j === i; }); ctx.changed('correct'); ctx.rerender(); } });
      add(grid, el('div', { class: `st-choice filled ${KQ.shapes[i].cls}` + (c.correct ? ' is-correct' : '') },
        el('span', { class: 'st-choice-shape' }, KQ.shapeIcon(i, 24)),
        el('span', { class: 'st-choice-fixed' }, i === 0 ? '참' : '거짓'),
        el('label', { class: 'sr-only', for: id }, `${i === 0 ? '참' : '거짓'}이 정답`),
        el('span', { class: 'st-correct-box' }, r, el('span', { class: 'st-correct-mark', 'aria-hidden': 'true' }, icon('check', 20)))));
    });
    return el('div', { class: 'st-answers' }, grid, el('p', { class: 'small muted st-answers-foot' }, '정답인 쪽의 동그라미를 누르세요.'));
  }

  function acceptedEditor(q, ctx) {
    const list = el('div', { class: 'st-accepted' });
    q.accepted.forEach((a, i) => {
      const id = uid('acc');
      const inp = el('input', { id, class: 'input', maxlength: 20, autocomplete: 'off', placeholder: `정답 ${i + 1}`, value: a, 'data-field': i === 0 ? 'accepted' : null, onInput: () => { q.accepted[i] = inp.value; ctx.changed('accepted'); } });
      add(list, el('div', { class: 'st-accepted-row' }, el('label', { for: id, class: 'st-accepted-num' }, `정답 ${i + 1}`), inp,
        q.accepted.length > 1 ? iconBtn('x', `정답 ${i + 1} 삭제`, () => { q.accepted.splice(i, 1); ctx.changed('struct'); ctx.rerender(); }) : null));
    });
    const foot = el('div', { class: 'row st-answers-foot' });
    if (q.accepted.length < 5) add(foot, btn([icon('plus'), '다른 정답 추가'], () => { q.accepted.push(''); ctx.changed('struct'); ctx.rerender(); }, 'ghost small'));
    return el('div', { class: 'st-answers' }, el('p', { class: 'notice' }, '학생이 답을 직접 입력해요. 인정할 정답을 1~5개 적어 주세요 (각 20자 이하). 비슷한 표현을 여러 개 넣어 두면 좋아요.'), list, foot);
  }

  function puzzleEditor(q, ctx) {
    const list = el('ol', { class: 'st-puzzle' });
    q.choices.forEach((c, i) => {
      const id = uid('pz');
      const inp = el('input', { id, class: 'st-choice-input', maxlength: 75, autocomplete: 'off', placeholder: `${i + 1}번째 항목`, value: c.text, 'data-field': 'choice', onInput: () => { c.text = inp.value; ctx.changed('choice'); } });
      const swap = (a, b) => { [q.choices[a], q.choices[b]] = [q.choices[b], q.choices[a]]; ctx.changed('struct'); ctx.rerender(); const t = document.querySelector(`[aria-label="${b + 1}번째 항목 ${b < a ? '위로' : '아래로'}"]`); if (t && !t.disabled) t.focus(); };
      add(list, el('li', { class: `st-puzzle-item ${KQ.shapes[i].cls}` },
        el('span', { class: 'st-puzzle-num', 'aria-hidden': 'true' }, String(i + 1)),
        el('label', { for: id, class: 'sr-only' }, `${i + 1}번째 항목`), inp,
        el('span', { class: 'st-puzzle-acts' },
          iconBtn('up', `${i + 1}번째 항목 위로`, () => swap(i, i - 1), '', { disabled: i === 0 }),
          iconBtn('down', `${i + 1}번째 항목 아래로`, () => swap(i, i + 1), '', { disabled: i === q.choices.length - 1 }),
          q.choices.length > 2 ? iconBtn('x', `${i + 1}번째 항목 삭제`, () => { q.choices.splice(i, 1); ctx.changed('struct'); ctx.rerender(); }) : null)));
    });
    const foot = el('div', { class: 'row st-answers-foot' });
    if (q.choices.length < 4) add(foot, btn([icon('plus'), '항목 추가'], () => { q.choices.push({ text: '', correct: false }); ctx.changed('struct'); ctx.rerender(); }, 'ghost small'));
    return el('div', { class: 'st-answers' }, el('p', { class: 'notice' }, '올바른 순서대로 위에서부터 적어 주세요 (2~4개). 게임에서는 순서가 섞여 나오고, 학생이 바른 순서로 다시 맞춰요.'), list, foot);
  }

  function sliderEditor(q, ctx) {
    const s = q.slider || (q.slider = defaultSlider());
    const preview = el('p', { class: 'st-slider-preview', 'aria-live': 'polite' });
    const upd = () => {
      const c = cleanQ(q).slider;
      if (['min', 'max', 'step', 'answer', 'tolerance'].some(k => !Number.isFinite(c[k]))) { preview.textContent = '숫자를 모두 입력하세요.'; return; }
      preview.textContent = `학생은 ${c.min}부터 ${c.max}까지 ${c.step} 간격으로 골라요. 정답은 ${c.answer}${c.tolerance ? ` (±${c.tolerance} 안이면 정답)` : ''}.`;
    };
    const mk = (k, label, hint) => {
      const inp = el('input', { type: 'number', class: 'input', step: 'any', inputmode: 'decimal', value: String(s[k] ?? ''), 'data-field': k === 'min' ? 'slider' : null, onInput: () => { s[k] = inp.value; upd(); ctx.changed('slider'); } });
      return field(label, inp, hint);
    };
    upd();
    return el('div', { class: 'st-answers st-slider-ed' }, el('div', { class: 'st-slider-grid' }, mk('min', '최솟값'), mk('max', '최댓값'), mk('step', '간격'), mk('answer', '정답'), mk('tolerance', '허용 오차', '0이면 정확히 맞혀야 해요')), preview);
  }

  function buildSettings(q, ctx, opts = {}) {
    const types = opts.types || TYPES;
    const typeSel = selectEl(types.map(t => [t, TYPE_NAMES[t]]), q.type, { onChange: () => { setType(q, typeSel.value); ctx.changed('struct'); ctx.rerender(); } });
    const timeSel = selectEl(TIMES.map(t => [t, timeLabel(t)]), q.timeLimit, { 'data-field': 'time', onChange: () => { q.timeLimit = +timeSel.value; ctx.changed('time'); } });
    const box = el('div', { class: 'st-settings-fields' }, field('문제 유형', typeSel), field('제한 시간', timeSel));
    if (opts.showPoints !== false) {
      const isPoll = q.type === 'poll';
      const ptSel = selectEl(isPoll ? [['none', '점수 없음']] : POINTS, isPoll ? 'none' : q.points, { disabled: isPoll, onChange: () => { q.points = ptSel.value; ctx.changed('points'); } });
      add(box, field('점수', ptSel, isPoll ? '설문은 점수가 없어요.' : (q.points === 'double' ? '이 문제는 점수가 두 배예요.' : null)));
    }
    return box;
  }

  // 한 덩어리 문제 폼 (고쳐서 승인, 학생 문제 내기)
  function buildMiniForm(q, opts = {}) {
    const wrap = el('div', { class: 'st-mini' });
    const ctx = { changed: k => { if (opts.onChange) opts.onChange(k); }, rerender: draw, uploadCode: opts.uploadCode || null };
    function draw() {
      put(wrap, 
        el('div', { class: 'st-mini-settings' }, buildSettings(q, ctx, opts)),
        buildTextField(q, ctx, { compact: true }),
        buildImageField(q, ctx),
        el('div', { class: 'field-label' }, q.type === 'type' ? '정답' : q.type === 'slider' ? '숫자 범위와 정답' : q.type === 'puzzle' ? '순서 항목' : '보기와 정답'),
        buildAnswers(q, ctx));
    }
    draw();
    return { node: wrap, focusField(f) { const t = wrap.querySelector(`[data-field="${f}"]`); if (t) t.focus(); } };
  }

  // 읽기 전용 미리보기
  function questionPreview(q, opts = {}) {
    q = q || {};
    const box = el('div', { class: 'st-preview' + (opts.compact ? ' compact' : '') },
      el('div', { class: 'row' }, el('span', { class: 'badge purple' }, TYPE_NAMES[q.type] || String(q.type || '')), q.timeLimit ? el('span', { class: 'badge' }, `${q.timeLimit}초`) : null, q.points === 'double' ? el('span', { class: 'badge orange' }, '점수 두 배') : null),
      el('p', { class: 'st-preview-q' }, q.text || '(질문 없음)'));
    if (q.image) add(box, el('img', { src: q.image, alt: '문제 이미지', class: 'st-preview-img', loading: 'lazy' }));
    const choices = Array.isArray(q.choices) ? q.choices : [];
    if (['quiz', 'truefalse', 'poll'].includes(q.type)) {
      add(box, el('ul', { class: 'st-preview-choices' }, choices.map((c, i) => el('li', { class: `${KQ.shapes[i % 4].cls}` + (q.type !== 'poll' && !c.correct ? ' dim' : '') },
        KQ.shapeIcon(i % 4, 16), el('span', {}, c.text || ''), q.type !== 'poll' && c.correct ? el('strong', { class: 'st-preview-ok' }, '정답') : null))));
    } else if (q.type === 'puzzle') {
      add(box, el('ol', { class: 'st-preview-order', 'aria-label': '올바른 순서' }, choices.map(c => el('li', {}, c.text || ''))));
    } else if (q.type === 'type') {
      add(box, el('div', { class: 'row' }, el('span', { class: 'small muted' }, '정답:'), (q.accepted || []).map(a => el('span', { class: 'badge green' }, a))));
    } else if (q.type === 'slider' && q.slider) {
      const s = q.slider;
      add(box, el('p', { class: 'small' }, `범위 ${s.min} ~ ${s.max} (간격 ${s.step}) · 정답 ${s.answer}${+s.tolerance ? ` (±${s.tolerance})` : ''}`));
    }
    return box;
  }

  // ---------- 로그인 / 최초 설정 ----------
  function renderLogin() {
    const me = KQ.me || {};
    const card = el('div', { class: 'card st-login-card' });
    const page = el('div', { class: 'purple-bg st-login' }, KQ.topbar(KQ.soundButton()), el('main', { class: 'page center st-login-main' }, card,
      el('a', { href: '/', 'data-link': '', class: 'st-login-student' }, '학생인가요? 게임 PIN 입력하러 가기')));
    if (me.setupNeeded) {
      const port = me.port || location.port || 80;
      const local = !!me.isLocal;
      const name = el('input', { class: 'input', maxlength: 30, autocomplete: 'name', placeholder: '예: 김하늘', disabled: !local });
      const pw = el('input', { type: 'password', class: 'input', autocomplete: 'new-password', disabled: !local });
      const pw2 = el('input', { type: 'password', class: 'input', autocomplete: 'new-password', disabled: !local });
      const go = btn('설정 완료', null, 'primary big', { type: 'submit', disabled: !local });
      const form = el('form', { class: 'stack', onSubmit: async e => {
        e.preventDefault();
        if (!local) return;
        if (!name.value.trim()) { KQ.toast('이름을 입력하세요.', true); name.focus(); return; }
        if (pw.value.length < 8) { KQ.toast('비밀번호는 8자 이상이어야 해요.', true); pw.focus(); return; }
        if (pw.value !== pw2.value) { KQ.toast('비밀번호 확인이 일치하지 않아요.', true); pw2.focus(); return; }
        go.disabled = true;
        try {
          await KQ.api('/api/setup', 'POST', { name: name.value.trim(), password: pw.value });
          await KQ.refreshMe();
          if (!KQ.me.teacher) { await KQ.api('/api/login', 'POST', { password: pw.value }); await KQ.refreshMe(); }
          KQ.toast('설정을 마쳤어요. 환영해요!');
          KQ.go('/teacher', true);
        } catch (err) { KQ.toast(err.message, true); go.disabled = false; }
      } },
        field('선생님 이름', name, '대시보드에 표시돼요.'),
        field('비밀번호', pw, '8자 이상'),
        field('비밀번호 확인', pw2), go);
      add(card, el('h1', {}, '반짝퀴즈 처음 설정'), el('p', { class: 'muted' }, '선생님 계정을 만들어요. 이 비밀번호로 퀴즈를 만들고 게임을 진행해요.'));
      if (!local) add(card, el('p', { class: 'notice warn', role: 'alert' }, `처음 설정은 서버 컴퓨터에서 http://localhost:${port} 로 접속해 진행하세요. 다른 기기에서는 설정할 수 없어요.`));
      add(card, form);
    } else {
      const pw = el('input', { type: 'password', class: 'input', autocomplete: 'current-password', required: true });
      const go = btn('로그인', null, 'primary big', { type: 'submit' });
      add(card, el('h1', {}, '선생님 로그인'), el('p', { class: 'muted' }, me.firebase ? `우리반 보드와 같은 선생님 계정(${me.teacherEmail})의 비밀번호로 로그인하세요.` : '퀴즈를 만들고 게임을 진행하려면 로그인하세요.'),
        el('form', { class: 'stack', onSubmit: async e => {
          e.preventDefault();
          if (!pw.value) { pw.focus(); return; }
          go.disabled = true;
          try { await KQ.api('/api/login', 'POST', { password: pw.value }); await KQ.refreshMe(); KQ.go('/teacher', true); }
          catch (err) { KQ.toast(err.message, true); go.disabled = false; pw.select(); }
        } }, field('비밀번호', pw), go));
    }
    KQ.render(page);
  }

  // ---------- 대시보드 ----------
  KQ.route('/teacher', async () => {
    try {
      if (!KQ.me || !KQ.me.teacher) { renderLogin(); return; }
      await renderDashboard();
    } catch (e) { if (e && e.handled) return; throw e; }
  });

  async function renderDashboard() {
    const life = lifecycle();
    const grid = el('div', { class: 'st-quiz-grid', 'aria-live': 'polite' }, loadingNode());
    const gamesBox = el('section', { class: 'st-games card', hidden: true, 'aria-labelledby': 'st-games-h' });
    const fileInput = el('input', { type: 'file', accept: '.json,application/json', class: 'sr-only', tabindex: '-1', 'aria-hidden': 'true', onChange: () => { const f = fileInput.files[0]; fileInput.value = ''; if (f) importFile(f); } });
    const addr = studentBase();
    const others = ((KQ.me && KQ.me.addresses) || []).slice(1);
    const addressCard = el('section', { class: 'st-address card', 'aria-label': '학생 접속 주소' },
      el('div', { class: 'st-address-main' },
        el('span', { class: 'st-address-label' }, '학생은 이 주소로 접속'),
        el('div', { class: 'st-address-url' }, addr),
        others.length ? el('div', { class: 'small muted' }, '다른 주소: ' + others.join(', ')) : null,
        el('p', { class: 'small muted' }, (KQ.me && KQ.me.firebase ? '인터넷이 되는 기기라면 어디서든 접속할 수 있어요. 게임을 시작하면 나오는 PIN을 입력해요.' : '같은 Wi-Fi에 연결된 기기에서 접속하고, 게임을 시작하면 나오는 PIN을 입력해요.'))),
      btn([icon('copy'), '주소 복사'], () => copyText(addr), 'ghost small'));
    KQ.render(el('div', { class: 'st-dash' }, teacherTopbar('dash'),
      el('main', { class: 'page stack' },
        el('div', { class: 'st-dash-head' },
          el('h1', {}, `${KQ.me.teacher.name || '선생님'}의 퀴즈`),
          el('div', { class: 'row' },
            btn([icon('plus'), '새 퀴즈 만들기'], () => KQ.go('/teacher/quiz/new'), 'accent big'),
            btn('퀴즈 파일 가져오기', () => fileInput.click(), 'ghost'), fileInput)),
        addressCard, gamesBox,
        el('h2', { class: 'st-section-title' }, '내 퀴즈'), grid)));

    async function importFile(f) {
      if (f.size > 30 * 1024 * 1024) { KQ.toast('파일이 너무 커요.', true); return; }
      let data;
      try { data = JSON.parse(await f.text()); } catch { KQ.toast('JSON 파일을 읽을 수 없어요. 반짝퀴즈에서 내보낸 파일인지 확인하세요.', true); return; }
      try { const r = await tapi('/api/quizzes/import', 'POST', { data }); KQ.toast(`"${(r.quiz && r.quiz.title) || '퀴즈'}"를 가져왔어요.`); loadQuizzes(); }
      catch (e) { fail(e); }
    }
    async function loadQuizzes() {
      let r;
      try { r = await tapi('/api/quizzes'); } catch (e) { if (life.alive && !e.handled) put(grid, el('p', { class: 'notice warn' }, e.message)); return; }
      if (!life.alive) return;
      const list = r.quizzes || [];
      if (!list.length) { put(grid, el('div', { class: 'empty card st-empty-wide' }, el('h3', {}, '아직 퀴즈가 없어요'), el('p', {}, '"새 퀴즈 만들기"를 눌러 첫 퀴즈를 만들어 보세요.'))); return; }
      put(grid, ...list.map(quizCard));
    }
    function quizCard(q) {
      const pending = +q.pendingSubmissions || 0;
      const count = +q.questionCount || 0;
      const openSubs = () => openSubmissionsModal(q.id, { title: q.title, onClose: () => { if (life.alive) loadQuizzes(); } });
      return el('article', { class: 'st-quiz-card card' },
        el('div', { class: 'st-cover', style: { background: q.theme || '#46178f' } },
          el('span', { class: 'st-cover-count' }, `${count}문제`),
          pending ? el('button', { type: 'button', class: 'st-pending-badge', onClick: openSubs, 'aria-label': `학생 출제 대기 ${pending}개 검토하기` }, `학생 출제 대기 ${pending}`) : null,
          q.acceptSubmissions ? el('span', { class: 'st-cover-open' }, '문제 받는 중') : null),
        el('div', { class: 'st-quiz-body' },
          el('h3', { class: 'st-quiz-title' }, q.title || '(제목 없음)'),
          q.description ? el('p', { class: 'st-quiz-desc muted small' }, q.description) : null,
          el('p', { class: 'small muted' }, q.updatedAt ? `수정 ${KQ.fmtDate(q.updatedAt)}` : '')),
        el('div', { class: 'st-quiz-actions' },
          el('div', { class: 'row' },
            btn('게임 시작', () => KQ.go('/teacher/host/' + enc(q.id)), 'accent', { disabled: !count, title: count ? null : '문제가 없어요' }),
            btn('편집', () => KQ.go('/teacher/quiz/' + enc(q.id)), 'primary')),
          el('div', { class: 'row st-quiz-more' },
            btn(pending ? `학생 출제 (${pending})` : '학생 출제', openSubs, 'ghost small'),
            btn('복제', async () => { try { await tapi(`/api/quizzes/${enc(q.id)}/duplicate`, 'POST', {}); KQ.toast('퀴즈를 복제했어요.'); loadQuizzes(); } catch (e) { fail(e); } }, 'ghost small'),
            el('a', { class: 'btn ghost small', href: `/api/quizzes/${enc(q.id)}/export`, download: '', 'aria-label': `${q.title || '퀴즈'} 파일로 내보내기` }, '내보내기'),
            btn('삭제', async () => {
              if (!(await KQ.confirm(`"${q.title || '제목 없음'}" 퀴즈를 삭제할까요? 되돌릴 수 없어요.`, '삭제', true))) return;
              try { await tapi(`/api/quizzes/${enc(q.id)}`, 'DELETE'); KQ.toast('삭제했어요.'); loadQuizzes(); } catch (e) { fail(e); }
            }, 'ghost small st-danger-text'))));
    }
    async function loadGames() {
      let r;
      try { r = await tapi('/api/games'); } catch { return; }
      if (!life.alive) return;
      const games = r.games || [];
      gamesBox.hidden = !games.length;
      put(gamesBox, el('h2', { id: 'st-games-h', class: 'st-section-title' }, `진행 중인 게임 ${games.length}개`),
        el('div', { class: 'st-game-list' }, games.map(g => el('button', { type: 'button', class: 'st-game', onClick: () => KQ.go('/host/' + enc(g.pin)), 'aria-label': `PIN ${g.pin} ${g.quizTitle || ''} 진행 화면 열기` },
          el('span', { class: 'st-game-pin' }, String(g.pin)),
          el('span', { class: 'st-game-info' }, el('strong', {}, g.quizTitle || '퀴즈'), el('span', { class: 'small muted' }, `${KQ.modeMeta(g.mode).name || g.mode} · ${PHASES[g.phase] || g.phase} · ${g.playerCount || 0}명`))))));
    }
    loadQuizzes(); loadGames();
    const timer = setInterval(loadGames, 10000);
    KQ.onLeave(() => clearInterval(timer));
  }

  // ---------- 학생 출제 관리 모달 ----------
  function openSubmissionsModal(quizId, opts = {}) {
    let changed = false, quiz = null, subs = [], confirmNew = false;
    const m = KQ.modal('학생 출제 관리', { wide: true, onClose: () => { if (opts.onClose) opts.onClose(changed); } });
    add(m.body, loadingNode());
    add(m.foot, btn('닫기', () => KQ.closeModal(), 'primary'));
    const alive = () => m.root.isConnected;
    (async () => {
      try {
        const [a, b] = await Promise.all([tapi(`/api/quizzes/${enc(quizId)}`), tapi(`/api/quizzes/${enc(quizId)}/submissions`)]);
        quiz = a.quiz; subs = b.submissions || [];
        if (alive()) draw();
      } catch (e) { if (alive() && !e.handled) put(m.body, el('p', { class: 'notice warn' }, e.message)); }
    })();

    function draw() {
      if (!alive()) return;
      const scroll = m.body.scrollTop;
      const code = quiz.submissionCode || '';
      const url = `${studentBase()}/submit/${code}`;
      const swId = uid('sw');
      const sw = el('input', { type: 'checkbox', role: 'switch', id: swId, class: 'st-switch-input', checked: !!quiz.acceptSubmissions, onChange: () => toggle(sw) });
      const pending = subs.filter(s => s.status === 'pending');
      const done = subs.filter(s => s.status !== 'pending');
      const codeBox = el('div', { class: 'st-code-box' },
        el('div', {}, el('span', { class: 'st-address-label' }, '출제 코드'), el('div', { class: 'st-code', 'aria-label': `출제 코드 ${code.split('').join(' ')}` }, code || '-')),
        el('div', { class: 'st-code-url' }, el('span', { class: 'st-address-label' }, '학생용 주소'), el('div', { class: 'st-url-text' }, url),
          el('div', { class: 'row' }, btn([icon('copy'), '주소 복사'], () => copyText(url), 'ghost small'), btn('코드 복사', () => copyText(code, '코드'), 'ghost small'),
            confirmNew
              ? el('span', { class: 'row st-inline-confirm', role: 'group', 'aria-label': '코드 새로 발급 확인' }, el('span', { class: 'small' }, '기존 코드는 더 이상 쓸 수 없어요.'), btn('새로 발급', newCode, 'danger small'), btn('취소', () => { confirmNew = false; draw(); }, 'ghost small'))
              : btn('코드 새로 발급', () => { confirmNew = true; draw(); }, 'ghost small'))));
      put(m.body, 
        opts.title || quiz.title ? el('p', { class: 'st-modal-sub' }, quiz.title || opts.title) : null,
        el('div', { class: 'st-switch-row' },
          el('label', { class: 'st-switch' }, sw, el('span', { class: 'st-switch-track', 'aria-hidden': 'true' }), el('strong', {}, '학생 문제 받기')),
          el('span', { class: 'small muted' }, quiz.acceptSubmissions ? '지금 학생들이 아래 주소로 문제를 낼 수 있어요.' : '꺼져 있어요. 켜면 학생들이 아래 주소로 문제를 낼 수 있어요.')),
        codeBox,
        el('p', { class: 'small muted' }, `학생은 위 주소로 접속하거나 ${studentBase()}/submit 에서 출제 코드를 입력해 문제를 내요. 승인한 문제는 퀴즈 맨 뒤에 "학생 출제" 표시와 함께 추가돼요.`),
        el('h3', { class: 'st-sub-h' }, `검토 대기 ${pending.length}개`),
        pending.length ? el('div', { class: 'st-sub-list' }, pending.map(subCard)) : el('p', { class: 'empty' }, '아직 검토할 문제가 없어요.'),
        done.length ? el('details', { class: 'st-done' }, el('summary', {}, `처리한 문제 ${done.length}개 보기`),
          el('ul', { class: 'st-done-list' }, done.map(s => el('li', {}, statusBadge(s.status), el('span', { class: 'st-done-text' }, (s.question && s.question.text) || ''), el('span', { class: 'small muted' }, s.authorName || ''))))) : null);
      m.body.scrollTop = scroll;
    }
    function subCard(s) {
      const card = el('article', { class: 'st-sub card' });
      const head = el('div', { class: 'st-sub-head' }, el('span', { class: 'badge orange' }, `작성자: ${s.authorName || '이름 없음'}`), el('span', { class: 'small muted' }, KQ.fmtDate(s.createdAt)));
      const showView = () => {
        put(card, head, questionPreview(s.question),
          el('div', { class: 'row st-sub-acts' },
            btn([icon('check'), '승인'], () => approve(s), 'accent small'),
            btn('고쳐서 승인', showEdit, 'ghost small'),
            btn('거절', () => reject(s), 'ghost small st-danger-text')));
      };
      const showEdit = () => {
        const q = ensureQ(s.question || {});
        q.authorName = s.authorName || q.authorName;
        const form = buildMiniForm(q, { types: TYPES, showPoints: true });
        put(card, head, el('p', { class: 'small muted' }, '고친 내용으로 퀴즈에 추가돼요.'), form.node,
          el('div', { class: 'row st-sub-acts' },
            btn('고친 내용으로 승인', () => {
              const c = cleanQ(q); delete c.id;
              const p = problem(c);
              if (p) { KQ.toast(p.msg, true); form.focusField(p.field); return; }
              approve(s, c);
            }, 'accent small'),
            btn('취소', showView, 'ghost small')));
        const t = card.querySelector('textarea'); if (t) t.focus();
      };
      showView();
      return card;
    }
    async function approve(s, question) {
      try {
        const r = await tapi(`/api/submissions/${enc(s.id)}/approve`, 'POST', question ? { question } : {});
        if (r.quiz) quiz = r.quiz;
        s.status = 'approved'; if (question) s.question = question;
        changed = true; KQ.sound.play('pop'); KQ.toast('퀴즈 맨 뒤에 추가했어요.');
        draw();
      } catch (e) { fail(e); }
    }
    async function reject(s) {
      try { await tapi(`/api/submissions/${enc(s.id)}/reject`, 'POST', {}); s.status = 'rejected'; KQ.toast('거절했어요.'); draw(); }
      catch (e) { fail(e); }
    }
    async function toggle(sw) {
      const want = sw.checked;
      sw.disabled = true;
      try {
        const fresh = (await tapi(`/api/quizzes/${enc(quizId)}`)).quiz;
        const r = await tapi(`/api/quizzes/${enc(quizId)}`, 'PUT', { title: fresh.title, description: fresh.description || '', theme: fresh.theme, questions: fresh.questions || [], acceptSubmissions: want });
        quiz = r.quiz || { ...fresh, acceptSubmissions: want };
        changed = true;
        KQ.toast(want ? '학생 문제 받기를 켰어요.' : '학생 문제 받기를 껐어요.');
      } catch (e) { fail(e); sw.checked = !want; }
      draw();
    }
    async function newCode() {
      try { const r = await tapi(`/api/quizzes/${enc(quizId)}/code`, 'POST', {}); quiz = r.quiz || quiz; changed = true; confirmNew = false; KQ.toast('새 출제 코드를 발급했어요.'); draw(); }
      catch (e) { fail(e); }
    }
  }
  function statusBadge(status) { const [t, c] = STATUS[status] || [status, '']; return el('span', { class: ('badge ' + c).trim() }, t); }

  // ---------- 표 붙여넣기 ----------
  function csvSplit(line) {
    const out = []; let cur = '', inQ = false;
    for (let i = 0; i < line.length; i++) {
      const ch = line[i];
      if (inQ) { if (ch === '"') { if (line[i + 1] === '"') { cur += '"'; i++; } else inQ = false; } else cur += ch; }
      else if (ch === '"' && !cur.trim()) { inQ = true; cur = ''; }
      else if (ch === ',') { out.push(cur); cur = ''; }
      else cur += ch;
    }
    out.push(cur);
    return out;
  }
  const isAns = s => /^[1-4](\s*[;/]\s*[1-4])*$/.test(s);
  function snapTime(v) { const n = parseInt(String(v).replace(/[^\d]/g, ''), 10); if (!Number.isFinite(n)) return 20; return TIMES.reduce((a, b) => Math.abs(b - n) < Math.abs(a - n) ? b : a, 20); }
  function parsePasteLine(line) {
    let cells;
    if (line.includes('\t')) { const t = line.split('\t'); cells = t.length >= 4 ? t : [t[0], ...csvSplit(t.slice(1).join(','))]; }
    else cells = csvSplit(line);
    cells = cells.map(c => c.trim());
    while (cells.length && cells[cells.length - 1] === '') cells.pop();
    const text = cells[0] || '';
    let ans, time = 20, opts;
    if (cells.length >= 7) { opts = cells.slice(1, 5); ans = cells[5]; time = cells[6] ? snapTime(cells[6]) : 20; }
    else {
      const rest = cells.slice(1);
      if (rest.length && /^\d+\s*초?$/.test(rest[rest.length - 1]) && parseInt(rest[rest.length - 1], 10) >= 5) time = snapTime(rest.pop());
      ans = rest.length ? rest.pop() : '';
      opts = rest;
    }
    if (!text) return { error: '질문이 비어 있어요.' };
    if (text.length > 240) return { error: '질문이 240자를 넘어요.' };
    if (!isAns(ans || '')) return { error: '정답 번호(1~4, 여러 개면 1;3)를 찾을 수 없어요.', header: /질문|문제/.test(text) };
    const set = new Set(ans.split(/[;/]/).map(s => +s.trim()));
    const choices = [];
    for (let i = 0; i < Math.min(4, opts.length); i++) if (opts[i]) choices.push({ text: opts[i].slice(0, 75), correct: set.has(i + 1) });
    for (const n of set) if (!opts[n - 1]) return { error: `정답 번호 ${n}에 해당하는 보기가 없어요.` };
    if (choices.length < 2) return { error: '보기를 2개 이상 넣어 주세요.' };
    const tf = choices.length === 2 && choices[0].text === '참' && choices[1].text === '거짓';
    const q = newQuestion(tf ? 'truefalse' : 'quiz');
    q.text = text; q.timeLimit = time;
    q.choices = tf ? [{ text: '참', correct: choices[0].correct }, { text: '거짓', correct: choices[1].correct && !choices[0].correct }] : choices;
    return { q };
  }
  function openPasteModal(onAdd) {
    const m = KQ.modal('표 붙여넣기로 문제 추가', { wide: true });
    let parsed = [];
    const ta = el('textarea', { class: 'input st-paste', rows: 8, spellcheck: 'false', placeholder: '지구에서 가장 큰 바다는?,태평양,대서양,인도양,북극해,1,20\n소수를 모두 고르세요,2,4,5,9,1;3,30\n물은 100도에서 끓는다,참,거짓,,,1,10' });
    const preview = el('div', { class: 'st-paste-preview', 'aria-live': 'polite' });
    const addBtn = btn('추가하기', () => { const ok = parsed.filter(p => p.q).map(p => p.q); if (!ok.length) return; onAdd(ok); KQ.closeModal(true); }, 'accent', { disabled: true });
    const run = () => {
      const lines = ta.value.split(/\r?\n/).map(l => l.replace(/\s+$/, '')).filter(l => l.trim());
      parsed = lines.map((l, i) => ({ line: i + 1, raw: l, ...parsePasteLine(l) })).filter((p, i) => !(i === 0 && p.header));
      const okN = parsed.filter(p => p.q).length;
      addBtn.disabled = !okN; addBtn.textContent = okN ? `문제 ${okN}개 추가` : '추가하기';
      if (!parsed.length) { put(preview, el('p', { class: 'muted small' }, '붙여넣으면 여기에 미리보기가 나와요.')); return; }
      put(preview, el('table', { class: 'st-table' },
        el('thead', {}, el('tr', {}, el('th', { scope: 'col' }, '줄'), el('th', { scope: 'col' }, '질문'), el('th', { scope: 'col' }, '보기 (정답 굵게)'), el('th', { scope: 'col' }, '시간'), el('th', { scope: 'col' }, '상태'))),
        el('tbody', {}, parsed.map(p => el('tr', { class: p.q ? '' : 'st-row-error' },
          el('td', {}, String(p.line)),
          el('td', {}, p.q ? p.q.text : el('span', { class: 'muted small' }, p.raw.length > 60 ? p.raw.slice(0, 60) + '…' : p.raw)),
          el('td', {}, p.q ? p.q.choices.map((c, i) => el(c.correct ? 'strong' : 'span', { class: 'st-paste-choice' + (c.correct ? ' ok' : '') }, `${i + 1}. ${c.text}`)) : ''),
          el('td', {}, p.q ? `${p.q.timeLimit}초` : ''),
          el('td', {}, p.q ? el('span', { class: 'badge green' }, p.q.type === 'truefalse' ? '참/거짓' : '좋아요') : el('span', { class: 'st-err-text' }, p.error)))))));
    };
    ta.addEventListener('input', run);
    add(m.body, 
      el('p', {}, '엑셀·구글 시트에서 칸을 복사해 붙여넣거나, 쉼표로 구분해 한 줄에 문제 하나씩 적으세요.'),
      el('p', { class: 'notice small' }, '형식: 질문, 보기1, 보기2, 보기3, 보기4, 정답 번호(1~4, 여러 개면 1;3), 제한 시간(초). 보기는 2~4개, 비워 둔 보기는 빠져요. 보기가 "참, 거짓"이면 참/거짓 문제가 돼요.'),
      field('붙여넣을 내용', ta), preview);
    add(m.foot, btn('취소', () => KQ.closeModal(), 'ghost'), addBtn);
    run();
  }

  // ---------- 퀴즈 편집기 ----------
  teacherRoute('/teacher/quiz/:id', async ({ id }) => {
    const life = lifecycle();
    if (id === 'new') { openEditor({ id: null, title: '', description: '', theme: THEMES[0][0], questions: [], acceptSubmissions: false }, life); return; }
    KQ.render(teacherTopbar('editor'), el('main', { class: 'page' }, loadingNode()));
    const r = await tapi(`/api/quizzes/${enc(id)}`);
    if (!life.alive) return;
    openEditor(r.quiz, life);
  });

  function openEditor(src, life) {
    const toModel = s => ({ id: s.id || null, title: s.title || '', description: s.description || '', theme: THEMES.some(t => t[0] === s.theme) ? s.theme : THEMES[0][0], acceptSubmissions: !!s.acceptSubmissions, submissionCode: s.submissionCode || '', questions: (s.questions || []).map(ensureQ) });
    const st = { quiz: toModel(src), sel: 0, dirty: false, saving: false, pending: 0, thumbs: [] };
    if (!st.quiz.questions.length && !st.quiz.id) st.quiz.questions.push(newQuestion());

    const statusId = uid('status');
    const status = el('span', { class: 'st-save-status', id: statusId, role: 'status' }, st.quiz.id ? '' : '새 퀴즈');
    const saveBtn = btn('저장', () => save(), 'primary', { 'aria-describedby': statusId, title: '저장 (Ctrl+S)' });
    const startBtn = btn('저장하고 게임 시작', () => save(true), 'accent');
    const subBtn = btn('학생 출제', () => openSubs(), 'ghost small');
    const exitBtn = btn([icon('back'), '나가기'], exit, 'ghost small');
    const bar = KQ.topbar(exitBtn, subBtn, status, saveBtn, startBtn);
    bar.classList.add('st-ed-topbar');

    // 제목·설명·테마
    const titleInput = el('input', { class: 'input st-title-input', maxlength: 80, placeholder: '퀴즈 제목을 입력하세요', value: st.quiz.title, onInput: () => { st.quiz.title = titleInput.value; markDirty(); } });
    const descInput = el('input', { class: 'input', maxlength: 400, placeholder: '설명 (선택)', value: st.quiz.description, onInput: () => { st.quiz.description = descInput.value; markDirty(); } });
    const themeName = uid('theme');
    const themes = el('div', { class: 'st-themes', role: 'radiogroup', 'aria-label': '테마 색' }, THEMES.map(([color, name]) => {
      const r = el('input', { type: 'radio', name: themeName, value: color, class: 'st-theme-input', checked: st.quiz.theme === color, 'aria-label': `${name} 테마`, onChange: () => { st.quiz.theme = color; root.style.setProperty('--st-theme', color); markDirty(); } });
      return el('label', { class: 'st-theme', title: name }, r, el('span', { class: 'st-theme-dot', style: { background: color }, 'aria-hidden': 'true' }));
    }));
    const meta = el('section', { class: 'st-ed-meta', 'aria-label': '퀴즈 정보' },
      el('div', { class: 'st-ed-meta-title' }, field('퀴즈 제목', titleInput)),
      el('div', { class: 'st-ed-meta-desc' }, field('설명', descInput)),
      el('div', { class: 'field' }, el('span', { class: 'field-label', id: themeName + '-l' }, '테마 색'), themes));
    themes.setAttribute('aria-labelledby', themeName + '-l');

    const side = el('aside', { class: 'st-ed-side', 'aria-label': '문제 목록' });
    const main = el('section', { class: 'st-ed-main', 'aria-label': '문제 편집' });
    const settings = el('aside', { class: 'st-ed-settings', 'aria-label': '문제 설정' });
    const root = el('div', { class: 'st-editor' }, bar, meta, el('div', { class: 'st-ed-layout' }, side, main, settings));
    root.style.setProperty('--st-theme', st.quiz.theme);

    const ctx = { changed, rerender: () => { renderMain(); }, uploadCode: null };
    function changed(kind) {
      markDirty();
      if (kind === 'text') { const t = st.thumbs[st.sel]; const q = st.quiz.questions[st.sel]; if (t && q) t.textContent = q.text.trim() || '(질문 없음)'; }
      else renderSide();
    }
    function markDirty() { st.dirty = true; saveBtn.classList.add('st-dirty'); status.textContent = '저장 안 됨'; }
    function setClean() { st.dirty = false; saveBtn.classList.remove('st-dirty'); status.textContent = '저장됨'; }

    function renderSide() {
      const qs = st.quiz.questions;
      st.thumbs = [];
      const scroll = side.querySelector('.st-qlist') ? side.querySelector('.st-qlist').scrollTop : 0;
      const list = el('ol', { class: 'st-qlist' }, qs.map((q, i) => {
        const thumb = el('span', { class: 'st-qthumb-text' }, q.text.trim() || '(질문 없음)');
        st.thumbs[i] = thumb;
        const mini = LIST_TYPES.includes(q.type) || q.type === 'truefalse'
          ? el('span', { class: 'st-mini-choices', 'aria-hidden': 'true' }, q.choices.map((c, j) => el('span', { class: `st-mini-c ${KQ.shapes[j].cls}` + (c.correct ? ' ok' : '') })))
          : null;
        return el('li', { class: 'st-qitem' + (i === st.sel ? ' active' : '') },
          el('button', { type: 'button', class: 'st-qselect', 'aria-current': i === st.sel ? 'true' : null, onClick: () => select(i), 'aria-label': `${i + 1}번 문제, ${TYPE_NAMES[q.type]}: ${q.text.trim() || '질문 없음'}` },
            el('span', { class: 'st-qnum' }, String(i + 1)),
            el('span', { class: 'st-qbody' },
              el('span', { class: 'st-qtype' }, TYPE_NAMES[q.type] + (q.image ? ' · 이미지' : '')),
              thumb, mini,
              q.authorName ? el('span', { class: 'badge orange st-author' }, `학생 출제: ${q.authorName}`) : null)),
          el('div', { class: 'st-qacts' },
            iconBtn('up', `${i + 1}번 문제 위로`, () => move(i, -1), '', { disabled: i === 0 }),
            iconBtn('down', `${i + 1}번 문제 아래로`, () => move(i, 1), '', { disabled: i === qs.length - 1 }),
            iconBtn('copy', `${i + 1}번 문제 복제`, () => dup(i)),
            iconBtn('trash', `${i + 1}번 문제 삭제`, () => del(i), 'st-danger-text')));
      }));
      put(side, 
        el('div', { class: 'st-side-head' }, el('strong', {}, `문제 ${qs.length}개`)),
        list,
        el('div', { class: 'st-side-actions' },
          btn([icon('plus'), '문제 추가'], addQuestion, 'primary'),
          btn('표 붙여넣기로 추가', () => openPasteModal(addMany), 'ghost small')));
      list.scrollTop = scroll;
    }
    function renderMain() {
      const qs = st.quiz.questions;
      if (!qs.length) {
        put(main, el('div', { class: 'empty st-main-empty' }, el('h2', {}, '문제가 없어요'), el('p', {}, '문제를 1개 이상 추가해야 저장할 수 있어요.'), el('div', { class: 'row', style: { justifyContent: 'center' } }, btn([icon('plus'), '문제 추가'], addQuestion, 'primary'), btn('표 붙여넣기로 추가', () => openPasteModal(addMany), 'ghost'))));
        put(settings, el('p', { class: 'muted small' }, '문제를 고르면 여기에서 유형과 시간을 바꿀 수 있어요.'));
        return;
      }
      st.sel = Math.max(0, Math.min(st.sel, qs.length - 1));
      const q = qs[st.sel];
      put(main, 
        el('div', { class: 'st-main-head' }, el('span', { class: 'badge purple' }, `${st.sel + 1}번 문제 · ${TYPE_NAMES[q.type]}`), q.authorName ? el('span', { class: 'badge orange' }, `학생 출제: ${q.authorName}`) : null),
        buildTextField(q, ctx), buildImageField(q, ctx), buildAnswers(q, ctx));
      put(settings, 
        el('h2', { class: 'st-panel-title' }, '문제 설정'),
        buildSettings(q, ctx, { types: TYPES, showPoints: true }),
        el('div', { class: 'stack st-settings-acts' },
          btn([icon('copy'), '이 문제 복제'], () => dup(st.sel), 'ghost small'),
          btn([icon('trash'), '이 문제 삭제'], () => del(st.sel), 'ghost small st-danger-text')),
        el('p', { class: 'small muted' }, '저장 단축키: Ctrl+S'));
    }
    function renderAll() { renderSide(); renderMain(); }
    function select(i) {
      st.sel = i; renderAll();
      if (window.matchMedia && window.matchMedia('(max-width: 900px)').matches) main.scrollIntoView({ block: 'start' });
    }
    function addQuestion() {
      const prev = st.quiz.questions[st.sel];
      const q = newQuestion();
      if (prev) q.timeLimit = prev.timeLimit;
      st.quiz.questions.splice(st.sel + 1, 0, q);
      st.sel = st.quiz.questions.length === 1 ? 0 : st.sel + 1;
      markDirty(); renderAll();
      const t = main.querySelector('[data-field="text"]'); if (t) t.focus();
    }
    function addMany(list) {
      const qs = st.quiz.questions;
      if (qs.length === 1 && isBlankQ(qs[0])) qs.splice(0, 1);
      const start = qs.length;
      qs.push(...list);
      st.sel = start; markDirty(); renderAll();
      KQ.toast(`문제 ${list.length}개를 추가했어요. 저장을 잊지 마세요.`);
    }
    function move(i, d) {
      const qs = st.quiz.questions, j = i + d;
      if (j < 0 || j >= qs.length) return;
      [qs[i], qs[j]] = [qs[j], qs[i]];
      if (st.sel === i) st.sel = j; else if (st.sel === j) st.sel = i;
      markDirty(); renderAll();
      const b = side.querySelectorAll('.st-qitem')[j]; const f = b && b.querySelector(`[aria-label^="${j + 1}번 문제 ${d < 0 ? '위로' : '아래로'}"]`);
      if (f && !f.disabled) f.focus();
    }
    function dup(i) {
      const c = copyQ(st.quiz.questions[i]);
      st.quiz.questions.splice(i + 1, 0, c); st.sel = i + 1;
      markDirty(); renderAll(); KQ.toast(`${i + 1}번 문제를 복제했어요.`);
    }
    async function del(i) {
      const q = st.quiz.questions[i];
      if (!q) return;
      if (!isBlankQ(q) && !(await KQ.confirm(`${i + 1}번 문제를 삭제할까요?`, '삭제', true))) return;
      st.quiz.questions.splice(i, 1);
      if (st.sel >= st.quiz.questions.length) st.sel = st.quiz.questions.length - 1;
      if (st.sel < 0) st.sel = 0;
      markDirty(); renderAll();
    }
    function goTo(i, p) {
      st.sel = i; renderAll();
      KQ.toast(`${i + 1}번 문제: ${p.msg}`, true);
      const t = main.querySelector(`[data-field="${p.field}"]`) || settings.querySelector(`[data-field="${p.field}"]`);
      if (t) t.focus();
    }

    async function save(andStart = false) {
      if (st.saving) return false;
      const q = st.quiz;
      if (!q.title.trim()) { KQ.toast('퀴즈 제목을 입력하세요.', true); titleInput.focus(); return false; }
      if (!q.questions.length) { KQ.toast('문제가 하나도 없어요. 문제를 1개 이상 추가해야 저장할 수 있어요.', true); return false; }
      const cleaned = [];
      for (let i = 0; i < q.questions.length; i++) {
        const c = cleanQ(q.questions[i]); const p = problem(c);
        if (p) { goTo(i, p); return false; }
        cleaned.push(c);
      }
      const body = { title: q.title.trim(), description: q.description.trim(), theme: q.theme, questions: cleaned, acceptSubmissions: !!q.acceptSubmissions };
      st.saving = true; saveBtn.disabled = startBtn.disabled = true; status.textContent = '저장 중…';
      let r;
      try {
        r = q.id ? await tapi(`/api/quizzes/${enc(q.id)}`, 'PUT', body, { noRedirect: true }) : await tapi('/api/quizzes', 'POST', body, { noRedirect: true });
      } catch (e) {
        st.saving = false; saveBtn.disabled = startBtn.disabled = false; status.textContent = '저장 실패';
        if (e.status === 401) { if (await reloginModal()) return save(andStart); return false; }
        const mm = /(\d+)번 문제/.exec(e.message || '');
        if (mm && q.questions[+mm[1] - 1]) { st.sel = +mm[1] - 1; renderAll(); }
        KQ.toast(e.message, true);
        return false;
      }
      st.saving = false; saveBtn.disabled = startBtn.disabled = false;
      if (!life.alive) return true;
      const sq = r.quiz || {};
      const wasNew = !q.id;
      q.id = sq.id || q.id; q.submissionCode = sq.submissionCode || q.submissionCode; q.acceptSubmissions = !!sq.acceptSubmissions;
      const serverQs = sq.questions || [];
      if (serverQs.length === q.questions.length) serverQs.forEach((s, i) => { q.questions[i].id = s.id || q.questions[i].id; });
      else { q.questions = serverQs.map(ensureQ); renderAll(); }
      if (wasNew && q.id) KQ.replacePath(`/teacher/quiz/${enc(q.id)}`);
      setClean();
      if (andStart) { KQ.go('/teacher/host/' + enc(q.id)); return true; }
      KQ.toast('저장했어요.');
      return true;
    }
    async function exit() {
      if (st.dirty && !(await KQ.confirm('저장하지 않은 변경이 있어요. 저장하지 않고 나갈까요?', '저장하지 않고 나가기', true))) return;
      st.dirty = false; KQ.go('/teacher');
    }
    async function openSubs() {
      if (!st.quiz.id || st.dirty) {
        const ok = await KQ.confirm(st.quiz.id ? '학생 출제 관리를 열기 전에 지금까지 바꾼 내용을 먼저 저장할게요.' : '학생 출제를 받으려면 먼저 퀴즈를 저장해야 해요. 지금 저장할까요?', '저장하고 열기');
        if (!ok || !(await save())) return;
      }
      openSubmissionsModal(st.quiz.id, { title: st.quiz.title, onClose: wasChanged => { if (!life.alive) return; if (wasChanged) reload(); else refreshPending(); } });
    }
    async function reload() {
      try {
        const r = await tapi(`/api/quizzes/${enc(st.quiz.id)}`);
        if (!life.alive) return;
        const before = st.quiz.questions.length;
        st.quiz = toModel(r.quiz);
        titleInput.value = st.quiz.title; descInput.value = st.quiz.description;
        if (st.quiz.questions.length > before) st.sel = before; // 새로 들어온 학생 문제로 이동
        setClean(); renderAll(); refreshPending();
        if (st.quiz.questions.length > before) KQ.toast(`학생 문제 ${st.quiz.questions.length - before}개가 퀴즈에 들어왔어요.`);
      } catch (e) { fail(e); }
    }
    async function refreshPending() {
      if (!st.quiz.id) { put(subBtn, '학생 출제'); return; }
      try {
        const r = await tapi(`/api/quizzes/${enc(st.quiz.id)}/submissions`);
        if (!life.alive) return;
        st.pending = (r.submissions || []).filter(s => s.status === 'pending').length;
        put(subBtn, '학생 출제', st.pending ? el('span', { class: 'st-count' }, `대기 ${st.pending}`) : null);
        subBtn.setAttribute('aria-label', st.pending ? `학생 출제 검토, 대기 ${st.pending}개` : '학생 출제 관리');
      } catch {}
    }

    // 나가기 보호: 브라우저 닫기/새로고침, 화면 안 링크, Ctrl+S
    const onBU = e => { if (st.dirty) { e.preventDefault(); e.returnValue = ''; } };
    const onLink = async e => {
      const a = e.target.closest && e.target.closest('a[data-link]');
      if (!a || !st.dirty || e.ctrlKey || e.metaKey) return;
      e.preventDefault(); e.stopPropagation();
      if (await KQ.confirm('저장하지 않은 변경이 있어요. 저장하지 않고 나갈까요?', '저장하지 않고 나가기', true)) { st.dirty = false; KQ.go(a.getAttribute('href')); }
    };
    const onKey = e => { if ((e.ctrlKey || e.metaKey) && (e.key === 's' || e.key === 'S')) { e.preventDefault(); if (!document.body.classList.contains('modal-open')) save(); } };
    window.addEventListener('beforeunload', onBU);
    document.addEventListener('click', onLink, true);
    document.addEventListener('keydown', onKey);
    KQ.onLeave(() => { window.removeEventListener('beforeunload', onBU); document.removeEventListener('click', onLink, true); document.removeEventListener('keydown', onKey); });

    KQ.render(root);
    renderAll();
    refreshPending();
    if (!st.quiz.id) titleInput.focus();
  }

  // ---------- 리포트 ----------
  teacherRoute('/teacher/reports', async () => {
    const life = lifecycle();
    const box = el('div', { class: 'card' }, loadingNode());
    KQ.render(el('div', { class: 'st-dash' }, teacherTopbar('reports'), el('main', { class: 'page stack' }, el('h1', {}, '게임 리포트'), el('p', { class: 'muted' }, '끝난 게임의 결과가 여기에 쌓여요. 누가 어떤 문제를 어려워했는지 확인해 보세요.'), box)));
    const draw = async () => {
      const r = await tapi('/api/reports');
      if (!life.alive) return;
      const list = r.reports || [];
      if (!list.length) { put(box, el('p', { class: 'empty' }, '아직 끝난 게임이 없어요. 게임을 진행하면 리포트가 만들어져요.')); return; }
      put(box, el('div', { class: 'st-table-wrap' }, el('table', { class: 'st-table' },
        el('thead', {}, el('tr', {}, ['퀴즈', '모드', '참가자', '날짜', ''].map(h => el('th', { scope: 'col' }, h)))),
        el('tbody', {}, list.map(rep => el('tr', {},
          el('td', {}, el('a', { href: `/teacher/reports/${enc(rep.id)}`, 'data-link': '', class: 'st-strong-link' }, rep.quizTitle || '퀴즈')),
          el('td', {}, rep.modeName || KQ.modeMeta(rep.mode).name || rep.mode || ''),
          el('td', {}, `${rep.playerCount || 0}명`),
          el('td', {}, KQ.fmtDate(rep.createdAt)),
          el('td', { class: 'st-td-acts' },
            btn('보기', () => KQ.go(`/teacher/reports/${enc(rep.id)}`), 'ghost small'),
            btn('삭제', async () => {
              if (!(await KQ.confirm(`"${rep.quizTitle || '퀴즈'}" 리포트를 삭제할까요?`, '삭제', true))) return;
              try { await tapi(`/api/reports/${enc(rep.id)}`, 'DELETE'); KQ.toast('삭제했어요.'); draw().catch(fail); } catch (e) { fail(e); }
            }, 'ghost small st-danger-text'))))))));
    };
    await draw();
  });

  teacherRoute('/teacher/reports/:id', async ({ id }) => {
    const life = lifecycle();
    KQ.render(el('div', { class: 'st-dash' }, teacherTopbar('report'), el('main', { class: 'page' }, loadingNode())));
    const { report: rep } = await tapi(`/api/reports/${enc(id)}`);
    if (!life.alive) return;
    const players = [...(rep.players || [])].sort((a, b) => (a.rank || 999) - (b.rank || 999));
    const questions = rep.questions || [];
    const teamLabel = t => (t === null || t === undefined || t === '') ? '-' : (typeof t === 'number' ? (TEAM_NAMES[t] || `${t + 1}팀`) : String(t));
    const hasTeams = players.some(p => p.team !== null && p.team !== undefined && p.team !== '');
    const totals = questions.reduce((a, q) => { if (q.accuracy !== null && q.accuracy !== undefined) { a.c += +q.correct || 0; a.n += +q.answered || 0; } return a; }, { c: 0, n: 0 });
    const avg = totals.n ? Math.round(totals.c / totals.n * 100) : null;
    const bar = v => { const p = pct(v); return p === null ? el('span', { class: 'muted small' }, '-') : el('div', { class: 'st-bar-wrap' }, el('div', { class: 'st-bar' + (p < 50 ? ' low' : ''), role: 'img', 'aria-label': `정답률 ${p}%` }, el('span', { style: { width: p + '%' } })), el('span', { class: 'st-bar-num' }, `${p}%`)); };
    const low = questions.map((q, i) => ({ ...q, n: i + 1 })).filter(q => pct(q.accuracy) !== null && pct(q.accuracy) < 50).sort((a, b) => a.accuracy - b.accuracy);

    KQ.render(el('div', { class: 'st-dash' }, teacherTopbar('report'), el('main', { class: 'page stack' },
      el('div', { class: 'st-dash-head' },
        el('div', {}, el('a', { href: '/teacher/reports', 'data-link': '', class: 'small' }, '리포트 목록'), el('h1', {}, rep.quizTitle || '퀴즈'),
          el('p', { class: 'muted' }, `${rep.modeName || KQ.modeMeta(rep.mode).name || rep.mode || ''} · ${KQ.fmtDate(rep.createdAt)}`)),
        el('a', { class: 'btn primary', href: `/api/reports/${enc(rep.id || id)}/csv`, download: '' }, 'CSV 다운로드')),
      el('div', { class: 'st-stats' },
        el('div', { class: 'card st-stat' }, el('span', { class: 'st-stat-num' }, String(players.length)), el('span', { class: 'muted small' }, '참가자')),
        el('div', { class: 'card st-stat' }, el('span', { class: 'st-stat-num' }, String(questions.length)), el('span', { class: 'muted small' }, '문제')),
        el('div', { class: 'card st-stat' }, el('span', { class: 'st-stat-num' }, avg === null ? '-' : `${avg}%`), el('span', { class: 'muted small' }, '평균 정답률'))),
      el('section', { class: 'card st-review', 'aria-labelledby': 'st-review-h' },
        el('h2', { id: 'st-review-h' }, '다시 짚어볼 문제'),
        low.length
          ? el('ol', { class: 'st-review-list' }, low.slice(0, 5).map(q => el('li', {}, el('strong', {}, `${q.n}번`), ' ', el('span', {}, q.text || ''), ' ', el('span', { class: 'badge orange' }, `정답률 ${pct(q.accuracy)}%`))))
          : el('p', { class: 'muted' }, '정답률이 50%보다 낮은 문제가 없어요. 잘했어요!')),
      el('section', { class: 'card', 'aria-labelledby': 'st-players-h' },
        el('h2', { id: 'st-players-h' }, '참가자'),
        players.length ? el('div', { class: 'st-table-wrap' }, el('table', { class: 'st-table' },
          el('thead', {}, el('tr', {}, ['순위', '닉네임', hasTeams ? '팀' : null, '점수', '정답 / 응답', '정답률'].filter(Boolean).map(h => el('th', { scope: 'col' }, h)))),
          el('tbody', {}, players.map(p => el('tr', {},
            el('td', { class: 'st-rank' }, String(p.rank || '')),
            el('td', {}, p.nickname || ''),
            hasTeams ? el('td', {}, teamLabel(p.team)) : null,
            el('td', { class: 'st-num' }, (+p.score || 0).toLocaleString('ko-KR')),
            el('td', { class: 'st-num' }, `${p.correct || 0} / ${p.answered || 0}`),
            el('td', {}, bar(p.answered ? (p.correct || 0) / p.answered : null))))))) : el('p', { class: 'empty' }, '참가자가 없어요.')),
      el('section', { class: 'card', 'aria-labelledby': 'st-qs-h' },
        el('h2', { id: 'st-qs-h' }, '문제별 정답률'),
        questions.length ? el('div', { class: 'st-table-wrap' }, el('table', { class: 'st-table' },
          el('thead', {}, el('tr', {}, ['번호', '질문', '유형', '정답 / 응답', '정답률'].map(h => el('th', { scope: 'col' }, h)))),
          el('tbody', {}, questions.map((q, i) => {
            const p = pct(q.accuracy);
            return el('tr', { class: p !== null && p < 50 ? 'st-row-low' : '' },
              el('td', { class: 'st-rank' }, String(i + 1)),
              el('td', {}, q.text || '', p !== null && p < 50 ? el('span', { class: 'badge orange st-low-badge' }, '다시 짚어볼 문제') : null),
              el('td', {}, TYPE_NAMES[q.type] || q.type || ''),
              el('td', { class: 'st-num' }, q.type === 'poll' ? `응답 ${q.answered || 0}` : `${q.correct || 0} / ${q.answered || 0}`),
              el('td', {}, q.type === 'poll' ? el('span', { class: 'muted small' }, '설문') : bar(q.accuracy)));
          })))) : el('p', { class: 'empty' }, '문제 기록이 없어요.')))));
  });

  // ---------- 학생 문제 내기 ----------
  KQ.route('/submit', (params, query) => {
    if (query.code) { KQ.go('/submit/' + enc(String(query.code).toUpperCase()), true); return; }
    const inp = el('input', { class: 'input big st-code-input', maxlength: 12, autocomplete: 'off', autocapitalize: 'characters', spellcheck: 'false', placeholder: '출제 코드', 'aria-label': '출제 코드',
      onInput: () => { const p = inp.selectionStart; inp.value = inp.value.toUpperCase().replace(/[^A-Z0-9]/g, ''); try { inp.setSelectionRange(p, p); } catch {} } });
    KQ.render(el('div', { class: 'purple-bg st-submit' }, KQ.topbar(),
      el('main', { class: 'page center st-submit-entry' },
        el('h1', { class: 'st-submit-h' }, '문제 내기'),
        el('form', { class: 'card center-card stack', onSubmit: e => {
          e.preventDefault();
          const v = inp.value.trim().toUpperCase();
          if (!/^[A-Z0-9]{4,12}$/.test(v)) { KQ.toast('선생님이 알려 준 출제 코드를 정확히 입력하세요.', true); inp.focus(); return; }
          KQ.go('/submit/' + enc(v));
        } }, el('p', {}, '선생님이 알려 준 출제 코드를 입력하세요.'), inp, btn('들어가기', null, 'primary big', { type: 'submit' })),
        el('a', { href: '/', 'data-link': '', class: 'st-login-student' }, '게임 PIN 입력하러 가기'))));
    inp.focus();
  });

  KQ.route('/submit/:code', async ({ code }) => {
    const life = lifecycle();
    code = String(code).toUpperCase();
    const shell = (...kids) => el('div', { class: 'purple-bg st-submit' }, KQ.topbar(), el('main', { class: 'page st-submit-main' }, ...kids));
    KQ.render(shell(loadingNode()));
    let data;
    try { data = await KQ.api(`/api/submit/${enc(code)}`); }
    catch (e) {
      if (!life.alive) return;
      const msg = e.status === 404 ? '출제 코드를 찾을 수 없어요. 선생님이 알려 준 코드를 다시 확인하세요.' : e.status === 403 ? '지금은 이 퀴즈에 문제를 낼 수 없어요. 선생님께 문제 받기를 켜 달라고 말씀드리세요.' : e.message;
      KQ.render(shell(el('div', { class: 'card center-card st-submit-err' }, el('h1', {}, '앗!'), el('p', {}, msg), el('div', { class: 'row', style: { justifyContent: 'center' } }, btn('코드 다시 입력', () => KQ.go('/submit'), 'primary'), btn('다시 시도', () => KQ.go(location.pathname, true), 'ghost')))));
      return;
    }
    if (!life.alive) return;
    const NICK_KEY = 'kq-submit-nick';
    let mine = data.mine || [];
    const nick = el('input', { class: 'input', maxlength: 15, autocomplete: 'off', placeholder: '예: 용감한 고래', value: data.nickname || localStorage.getItem(NICK_KEY) || '' });
    const nickRow = el('div', { class: 'field' }, el('label', { for: (nick.id = uid('nick')) }, '닉네임'),
      el('div', { class: 'st-nick-row' }, nick, btn('랜덤 닉네임', () => { nick.value = KQ.randomNickname(); nick.focus(); }, 'ghost small')),
      el('small', {}, '실명 대신 닉네임을 쓰세요. 선생님께 보이고, 퀴즈에 문제가 들어가면 "학생 출제: 닉네임"으로 표시돼요.'));
    let q = newQuestion('quiz');
    const formBox = el('div');
    let form;
    const drawForm = () => { form = buildMiniForm(q, { types: STUDENT_TYPES, showPoints: false, uploadCode: code }); put(formBox, form.node); };
    drawForm();
    const sendBtn = btn('문제 보내기', send, 'accent big st-send');
    const mineBox = el('section', { class: 'card stack', 'aria-labelledby': 'st-mine-h' });

    function drawMine() {
      const counts = mine.reduce((a, s) => { a[s.status] = (a[s.status] || 0) + 1; return a; }, {});
      put(mineBox, el('h2', { id: 'st-mine-h' }, `내가 낸 문제 ${mine.length}개`),
        mine.length ? el('p', { class: 'small muted' }, `검토 대기 ${counts.pending || 0} · 채택됨 ${counts.approved || 0} · 거절됨 ${counts.rejected || 0}`) : el('p', { class: 'muted' }, '아직 낸 문제가 없어요. 첫 문제를 만들어 보세요!'),
        el('ul', { class: 'st-mine-list' }, mine.map(s => el('li', { class: 'st-mine' },
          el('div', { class: 'st-sub-head' }, statusBadge(s.status), el('span', { class: 'small muted' }, KQ.fmtDate(s.createdAt)),
            s.status === 'pending' ? btn('삭제', async () => {
              if (!(await KQ.confirm('이 문제를 삭제할까요?', '삭제', true))) return;
              try { await KQ.api(`/api/submit/${enc(code)}/${enc(s.id)}`, 'DELETE'); mine = mine.filter(x => x.id !== s.id); drawMine(); KQ.toast('삭제했어요.'); } catch (e) { fail(e); }
            }, 'ghost small st-danger-text', { 'aria-label': '이 문제 삭제' }) : null),
          el('details', {}, el('summary', {}, (s.question && s.question.text) || '(질문 없음)'), questionPreview(s.question, { compact: true }))))));
    }
    async function send() {
      const n = nick.value.trim();
      if (!n) { KQ.toast('닉네임을 입력하세요.', true); nick.focus(); return; }
      const c = cleanQ(q); delete c.id; delete c.authorName; c.points = 'standard';
      const p = problem(c);
      if (p) { KQ.toast(p.msg, true); form.focusField(p.field); return; }
      sendBtn.disabled = true;
      try {
        const r = await KQ.api(`/api/submit/${enc(code)}`, 'POST', { nickname: n, question: c });
        localStorage.setItem(NICK_KEY, n);
        KQ.sound.play('pop');
        KQ.toast('문제를 보냈어요! 선생님이 검토하면 퀴즈에 들어가요.');
        const keep = { type: q.type, timeLimit: q.timeLimit };
        q = newQuestion(keep.type); q.timeLimit = keep.timeLimit;
        drawForm();
        if (r && r.submission) mine = [r.submission, ...mine.filter(x => x.id !== r.submission.id)];
        try { const fresh = await KQ.api(`/api/submit/${enc(code)}`); if (fresh.mine) mine = fresh.mine; } catch {}
        if (life.alive) { drawMine(); const t = formBox.querySelector('[data-field="text"]'); if (t) t.focus(); }
      } catch (e) {
        if (e.status === 403) KQ.toast('지금은 선생님이 문제를 받지 않고 있어요. 나중에 다시 시도해 주세요.', true);
        else if (e.status === 404) KQ.toast('출제 코드가 바뀌었거나 없어졌어요. 선생님께 새 코드를 물어보세요.', true);
        else fail(e);
      } finally { sendBtn.disabled = false; }
    }

    drawMine();
    KQ.render(shell(
      el('header', { class: 'st-submit-head' },
        el('span', { class: 'st-address-label' }, '문제 내기'),
        el('h1', {}, (data.quiz && data.quiz.title) || '퀴즈'),
        data.quiz && data.quiz.description ? el('p', {}, data.quiz.description) : null),
      data.quiz && data.quiz.accepting === false ? el('p', { class: 'notice warn st-privacy', role: 'alert' }, '지금은 선생님이 문제를 받지 않고 있어요. 문제를 미리 만들어 두고, 선생님이 문제 받기를 켜면 보내 주세요.') : null,
      el('p', { class: 'notice st-privacy' }, '이름, 전화번호, 주소 같은 개인정보나 친구의 실명은 쓰지 마세요. 친구를 놀리는 문제도 안 돼요. 선생님이 검토한 뒤 퀴즈에 넣어요.'),
      el('section', { class: 'card stack', 'aria-label': '닉네임' }, nickRow),
      el('section', { class: 'card stack', 'aria-labelledby': 'st-form-h' }, el('h2', { id: 'st-form-h' }, '새 문제 만들기'), formBox, sendBtn),
      mineBox));
  });
})();
