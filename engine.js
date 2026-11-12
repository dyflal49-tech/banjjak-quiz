'use strict';
// 반짝퀴즈 게임 엔진 (진행자 브라우저에서 실행). server.js 의 규칙을 그대로 옮김.
(() => {
  const crypto = {
    randomInt(a, b) { if (b === undefined) { b = a; a = 0; } const r = new Uint32Array(1); globalThis.crypto.getRandomValues(r); return a + (r[0] % (b - a)); },
    randomBytes(n) { const a = new Uint8Array(n); globalThis.crypto.getRandomValues(a); return { toString: () => Array.from(a, x => x.toString(16).padStart(2, '0')).join('') }; }
  };
  const HOOKS = { report() {}, touch() {} };
  const db = { quizzes: [], reports: [] };
  const PORT = '';
  const addresses = () => [HOOKS.site || location.origin];
  function touch(g) { g.touched = Date.now(); HOOKS.touch(g); }
const id = () => crypto.randomBytes(12).toString('hex');
const now = () => Date.now();
const iso = () => new Date().toISOString();
const fail = (status, message) => { const e = new Error(message); e.status = status; throw e; };
const clean = (v, max, fb = '') => String(v ?? fb).replace(/[\u0000-\u001f\u007f]/g, ' ').replace(/\s+/g, ' ').trim().slice(0, max);
const cleanText = (v, max) => String(v ?? '').replace(/[\u0000-\u0008\u000b-\u001f\u007f]/g, '').trim().slice(0, max);
const shuffle = arr => { const a = [...arr]; for (let i = a.length - 1; i > 0; i--) { const j = crypto.randomInt(i + 1); [a[i], a[j]] = [a[j], a[i]]; } return a; };
// ---------- 문제 정규화 ----------
const THEMES = ['#46178f', '#1368ce', '#26890c', '#e21b3c', '#d89e00', '#0aa3a3', '#864cbf', '#333333'];
const TIMES = [5, 10, 20, 30, 45, 60, 90, 120, 240];
const TYPES = ['quiz', 'truefalse', 'type', 'poll', 'puzzle', 'slider'];
function normQuestion(q, i, keep) {
  const where = (i + 1) + '번 문제: ';
  if (!q || typeof q !== 'object') fail(400, where + '자료가 올바르지 않습니다.');
  const type = TYPES.includes(q.type) ? q.type : fail(400, where + '문제 유형을 선택하세요.');
  const text = cleanText(q.text, 240); if (!text) fail(400, where + '질문을 입력하세요.');
  const timeLimit = TIMES.includes(Number(q.timeLimit)) ? Number(q.timeLimit) : 20;
  let points = ['standard', 'double', 'none'].includes(q.points) ? q.points : 'standard';
  const image = typeof q.image === 'string' && /^kqimg:[a-f0-9]{24}$/.test(q.image) ? q.image : null;
  let choices = [], accepted = [], slider = null;
  const rawChoices = Array.isArray(q.choices) ? q.choices : [];
  if (type === 'quiz' || type === 'poll' || type === 'puzzle') {
    choices = rawChoices.map(c => ({ text: clean(c?.text, 75), correct: type === 'quiz' ? !!c?.correct : false })).filter(c => c.text);
    if (choices.length < 2 || choices.length > 4) fail(400, where + '보기를 2~4개 입력하세요.');
    if (type === 'quiz' && !choices.some(c => c.correct)) fail(400, where + '정답을 하나 이상 고르세요.');
    if (type === 'puzzle') choices = choices.map(c => ({ text: c.text, correct: false }));
  } else if (type === 'truefalse') {
    const trueCorrect = rawChoices[0]?.correct === true, falseCorrect = rawChoices[1]?.correct === true;
    if (trueCorrect === falseCorrect) fail(400, where + '참 또는 거짓 중 정답 하나를 고르세요.');
    choices = [{ text: '참', correct: trueCorrect }, { text: '거짓', correct: falseCorrect }];
  } else if (type === 'type') {
    accepted = [...new Set((Array.isArray(q.accepted) ? q.accepted : []).map(a => clean(a, 20)).filter(Boolean))].slice(0, 5);
    if (!accepted.length) fail(400, where + '인정할 정답을 1개 이상 입력하세요.');
  } else if (type === 'slider') {
    const s = q.slider || {}; const min = Number(s.min), max = Number(s.max), step = Number(s.step ?? 1), answer = Number(s.answer), tolerance = Number(s.tolerance ?? 0);
    if (![min, max, step, answer, tolerance].every(Number.isFinite)) fail(400, where + '슬라이더의 최솟값·최댓값·간격·정답을 숫자로 입력하세요.');
    if (min >= max || step <= 0 || (max - min) / step > 100000) fail(400, where + '슬라이더 범위와 간격을 확인하세요.');
    if (answer < min || answer > max) fail(400, where + '정답이 슬라이더 범위 안에 있어야 합니다.');
    if (tolerance < 0 || tolerance > max - min) fail(400, where + '허용 오차를 확인하세요.');
    slider = { min, max, step, answer, tolerance };
  }
  if (type === 'poll') points = 'none';
  const qid = typeof q.id === 'string' && /^[a-f0-9]{24}$/.test(q.id) ? q.id : id();
  const prev = keep?.get(qid);
  return { id: qid, type, text, image, timeLimit, points, choices, accepted, slider, authorName: prev ? prev.authorName : (q.authorName ? clean(q.authorName, 15) : null), authorKey: prev?.authorKey || null };
}
function normQuestions(list, prevQuestions = []) {
  if (!Array.isArray(list)) fail(400, '문제 목록이 올바르지 않습니다.');
  if (list.length > 200) fail(400, '한 퀴즈에는 문제를 200개까지 넣을 수 있어요.');
  const keep = new Map(prevQuestions.map(q => [q.id, q])); const seen = new Set();
  return list.map((q, i) => { const n = normQuestion(q, i, keep); if (seen.has(n.id)) n.id = id(); seen.add(n.id); return n; });
}
const publicQuestion = q => { const { authorKey, ...rest } = q; return rest; };
function code6() { const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'; let c; do { c = Array.from({ length: 6 }, () => chars[crypto.randomInt(chars.length)]).join(''); } while (db.quizzes.some(q => q.submissionCode === c)); return c; }
const quizView = q => ({ ...q, questions: q.questions.map(publicQuestion) });
const quizSummary = q => ({ id: q.id, title: q.title, description: q.description, theme: q.theme, questionCount: q.questions.length, pendingSubmissions: db.submissions.filter(s => s.quizId === q.id && s.status === 'pending').length, submissionCode: q.submissionCode, acceptSubmissions: q.acceptSubmissions, updatedAt: q.updatedAt, createdAt: q.createdAt });
function getQuiz(qid) { const q = db.quizzes.find(q => q.id === qid); if (!q) fail(404, '퀴즈를 찾을 수 없어요.'); return q; }
function quizFromInput(d, prev) {
  const title = clean(d.title, 80); if (!title) fail(400, '퀴즈 제목을 입력하세요.');
  return { title, description: cleanText(d.description, 400), theme: THEMES.includes(d.theme) ? d.theme : '#46178f', questions: normQuestions(d.questions ?? prev?.questions ?? [], prev?.questions) };
}

// ---------- 닉네임 ----------
const BAD = ['씨발', '시발', 'ㅅㅂ', 'ㅆㅂ', '병신', 'ㅂㅅ', '개새', '새끼', '좆', '지랄', '꺼져', '죽어', '미친', '닥쳐', 'fuck', 'shit', 'bitch', 'sex', '섹스', 'ass'];
const badName = n => { const t = n.toLowerCase().replace(/[\s._\-]/g, ''); return BAD.some(b => t.includes(b)); };
const ADJ = ['용감한', '반짝이는', '신나는', '똑똑한', '날쌘', '씩씩한', '빛나는', '즐거운', '느긋한', '튼튼한', '상냥한', '명랑한', '든든한', '재빠른'];
const NOUN = ['고래', '토끼', '다람쥐', '펭귄', '여우', '거북이', '수달', '부엉이', '돌고래', '판다', '참새', '고양이', '해바라기', '별똥별', '코알라', '오리'];
const randomNick = () => ADJ[crypto.randomInt(ADJ.length)] + ' ' + NOUN[crypto.randomInt(NOUN.length)];

// ---------- 게임 모드 ----------
const MODES = [
  { id: 'classic', name: '클래식', pacing: 'host', teams: false, original: false },
  { id: 'robot', name: '로봇 경주', pacing: 'player', teams: false, original: false },
  { id: 'marble', name: '마블 레이스', pacing: 'player', teams: false, original: false },
  { id: 'submarine', name: '잠수함 특공대', pacing: 'host', teams: false, original: false },
  { id: 'kingdom', name: '컬러 킹덤', pacing: 'host', teams: true, original: false },
  { id: 'space', name: '우주 정복', pacing: 'host', teams: true, original: false },
  { id: 'tower', name: '하늘 탑 쌓기', pacing: 'player', teams: false, original: true },
  { id: 'treasure', name: '행운의 보물상자', pacing: 'player', teams: false, original: true },
  { id: 'garden', name: '우리반 꽃밭', pacing: 'host', teams: false, original: true },
  { id: 'boss', name: '보스 레이드', pacing: 'host', teams: false, original: true }
];
const modeOf = mid => MODES.find(m => m.id === mid);
const TEAMS = [{ name: '빨강 팀', color: '#e21b3c' }, { name: '파랑 팀', color: '#1368ce' }, { name: '노랑 팀', color: '#d89e00' }, { name: '초록 팀', color: '#26890c' }];
const MARBLE_COLORS = ['#e21b3c', '#1368ce', '#d89e00', '#26890c', '#864cbf', '#0aa3a3', '#ff7a00', '#e84393', '#2d3436', '#6c5ce7', '#00b894', '#fdcb6e'];
const PLANETS = [['반짝성', 14, 22, 2], ['구름별', 38, 14, 1], ['얼음달', 66, 20, 2], ['불꽃성', 88, 30, 1], ['바다별', 22, 62, 1], ['숲속성', 50, 48, 3], ['무지개성', 80, 70, 2], ['모래달', 40, 82, 1], ['은하섬', 64, 86, 1]];
const BOSSES = ['심술 구름왕', '얼렁뚱땅 문어대왕', '꾸벅꾸벅 거인', '장난꾸러기 드래곤'];

// ---------- 실시간 게임 ----------
const games = new Map(); // pin → game
function newPin() { let p; do { p = String(crypto.randomInt(100000, 1000000)); } while (games.has(p)); return p; }
function readOptions(o = {}, mode) {
  const int = (v, lo, hi, d) => { const n = Math.round(Number(v)); return Number.isFinite(n) ? Math.min(hi, Math.max(lo, n)) : d; };
  return {
    randomizeQuestions: !!o.randomizeQuestions, randomizeAnswers: !!o.randomizeAnswers, showOnDevice: o.showOnDevice !== false,
    friendlyNicknames: !!o.friendlyNicknames, skipOwnQuestions: o.skipOwnQuestions !== false,
    teamCount: mode.teams ? int(o.teamCount, 2, 4, 4) : 0, duration: int(o.duration, 60, 1800, 300), goal: int(o.goal, 5, 50, 15)
  };
}
function prepareQuestion(q, opts) {
  const n = q.choices.length; let perm = [...Array(n).keys()];
  if (opts.randomizeAnswers && (q.type === 'quiz' || q.type === 'poll')) perm = shuffle(perm);
  let puzzle = null;
  if (q.type === 'puzzle') { let order = shuffle([...Array(n).keys()]); if (n > 1 && order.every((v, i) => v === i)) order = [...order.slice(1), order[0]]; puzzle = order.map(orig => ({ id: crypto.randomBytes(4).toString('hex'), orig })); }
  return { ...q, perm, puzzle };
}
function createGame(quiz, modeId, rawOpts) {
  const mode = modeOf(modeId); if (!mode) fail(400, '게임 모드를 선택하세요.');
  const options = readOptions(rawOpts, mode);
  let list = quiz.questions.filter(q => mode.pacing === 'host' || q.type !== 'poll');
  if (!list.length) fail(400, mode.pacing === 'player' ? '이 게임은 설문을 제외한 문제가 1개 이상 필요해요.' : '문제가 1개 이상 필요해요.');
  if (options.randomizeQuestions) list = shuffle(list);
  const g = {
    pin: newPin(), quizId: quiz.id, quizTitle: quiz.title, mode: mode.id, modeName: mode.name, pacing: mode.pacing, options,
    questions: list.map(q => prepareQuestion(q, options)), phase: 'lobby', locked: false, createdAt: now(), touched: now(),
    players: new Map(), kicked: new Set(), clients: new Set(), qIndex: -1, endsAt: null, startAt: null, timer: null,
    answers: new Map(), stats: [], feed: [], teams: null, ms: null, reportId: null, resultSeq: 0
  };
  if (options.teamCount) g.teams = TEAMS.slice(0, options.teamCount).map((t, i) => ({ index: i, name: t.name, color: t.color }));
  initModeState(g); games.set(g.pin, g); return g;
}
function initModeState(g) {
  const ms = {};
  if (g.mode === 'robot') ms.goal = g.options.goal;
  if (g.mode === 'marble') ms.goal = 100;
  if (g.mode === 'submarine') Object.assign(ms, { depth: 0, targetDepth: 1000, oxygen: 100, status: 'diving', lastAccuracy: null, log: ['잠수함이 출발 준비를 마쳤어요.'] });
  if (g.mode === 'kingdom') {
    ms.cols = 10; ms.rows = 6; ms.tiles = Array(60).fill(-1);
    const starts = [0, 59, 9, 50]; g.teams.forEach((t, i) => { ms.tiles[starts[i]] = i; });
  }
  if (g.mode === 'space') ms.planets = PLANETS.map(([name, x, y, size], i) => ({ id: 'p' + i, name, x, y, size, owner: -1, energy: Array(g.teams.length).fill(0) }));
  if (g.mode === 'garden') Object.assign(ms, { goal: 0, flowers: [], bloomed: 0, status: 'growing' });
  if (g.mode === 'boss') Object.assign(ms, { bossName: BOSSES[crypto.randomInt(BOSSES.length)], bossHp: 0, bossMaxHp: 0, shield: 100, status: 'fighting', hits: [] });
  if (g.mode === 'treasure') ms.events = [];
  g.ms = ms;
}
function getGame(pin) { const g = games.get(String(pin)); if (!g) fail(404, '게임을 찾을 수 없어요. PIN을 확인하세요.'); return g; }
const activePlayers = g => [...g.players.values()];
function teamFor(g) { const counts = g.teams.map((t, i) => activePlayers(g).filter(p => p.team === i).length); return counts.indexOf(Math.min(...counts)); }
function addFeed(g, nickname, text, good = true) { g.feed.unshift({ nickname, text, good, at: now() }); g.feed.length = Math.min(g.feed.length, 8); }

// 점수와 순위
function speedFactor(q, elapsed) { return Math.min(1, Math.max(0, elapsed / (q.timeLimit * 1000))); }
function basePoints(q, elapsed) { if (q.points === 'none' || q.type === 'poll') return 0; let p = Math.round(1000 * (1 - speedFactor(q, elapsed) / 2)); if (q.points === 'double') p *= 2; return p; }
const normAns = s => String(s || '').toLowerCase().normalize('NFC').replace(/[\s.,!?'"~·\-]/g, '');
function evaluate(q, answer) {
  if (q.type === 'quiz' || q.type === 'truefalse' || q.type === 'poll') {
    const idx = Number(answer); if (!Number.isInteger(idx) || idx < 0 || idx >= q.choices.length) fail(400, '보기를 선택하세요.');
    const orig = q.perm[idx]; return { correct: q.type === 'poll' ? null : !!q.choices[orig].correct, factor: 1, value: idx };
  }
  if (q.type === 'type') { const v = clean(answer, 40); if (!v) fail(400, '답을 입력하세요.'); return { correct: q.accepted.some(a => normAns(a) === normAns(v)), factor: 1, value: v }; }
  if (q.type === 'puzzle') {
    if (!Array.isArray(answer) || answer.length !== q.puzzle.length) fail(400, '모든 항목의 순서를 정하세요.');
    const order = answer.map(a => q.puzzle.find(p => p.id === a)?.orig); if (order.some(o => o === undefined) || new Set(order).size !== order.length) fail(400, '순서가 올바르지 않습니다.');
    return { correct: order.every((o, i) => o === i), factor: 1, value: order };
  }
  if (q.type === 'slider') {
    const v = Number(answer); if (!Number.isFinite(v) || v < q.slider.min || v > q.slider.max) fail(400, '범위 안의 숫자를 고르세요.');
    const diff = Math.abs(v - q.slider.answer), tol = q.slider.tolerance;
    const ok = diff <= tol + 1e-9; return { correct: ok, factor: ok ? (tol > 0 ? 1 - 0.5 * diff / tol : 1) : 0, value: v };
  }
  fail(400, '지원하지 않는 문제입니다.');
}
function answerText(q) {
  if (q.type === 'quiz' || q.type === 'truefalse') return '정답: ' + q.choices.filter(c => c.correct).map(c => c.text).join(', ');
  if (q.type === 'type') return '정답: ' + q.accepted.join(', ');
  if (q.type === 'puzzle') return '정답 순서: ' + q.choices.map(c => c.text).join(' → ');
  if (q.type === 'slider') return '정답: ' + q.slider.answer + (q.slider.tolerance ? ` (±${q.slider.tolerance})` : '');
  return '설문 문제예요. 생각을 나눠줘서 고마워요.';
}
function ranking(g) {
  const list = activePlayers(g);
  list.sort((a, b) => {
    const fa = a.finishedRank ?? Infinity, fb = b.finishedRank ?? Infinity; if (fa !== fb) return fa - fb;
    return b.score - a.score || a.reachedAt - b.reachedAt || a.joinedAt - b.joinedAt;
  });
  list.forEach((p, i) => { p.rank = i + 1; }); return list;
}
function teamSummary(g) {
  if (!g.teams) return null;
  return g.teams.map((t, i) => {
    const members = activePlayers(g).filter(p => p.team === i);
    let score = members.reduce((n, p) => n + p.score, 0);
    if (g.mode === 'kingdom') score = g.ms.tiles.filter(x => x === i).length;
    if (g.mode === 'space') score = g.ms.planets.filter(p => p.owner === i).reduce((n, p) => n + p.size, 0);
    return { index: i, name: t.name, color: t.color, score, members: members.length, tiles: g.mode === 'kingdom' ? score : undefined, planets: g.mode === 'space' ? g.ms.planets.filter(p => p.owner === i).length : undefined };
  });
}

// 단계 진행
function clearTimer(g) { clearTimeout(g.timer); g.timer = null; }
function setTimer(g, ms, fn) { clearTimer(g); g.timer = setTimeout(() => { try { fn(); } catch (e) { console.error('게임 진행 오류', e.message); } }, ms); }
function startGame(g) {
  if (g.phase !== 'lobby') return;
  if (!g.players.size) fail(400, '참가자가 1명 이상 있어야 시작할 수 있어요.');
  const n = g.players.size, qn = g.questions.length;
  if (g.mode === 'garden') g.ms.goal = Math.max(5, Math.round(n * qn * 0.6));
  if (g.mode === 'boss') { g.ms.bossMaxHp = Math.max(3000, Math.round(n * qn * 750 * 0.55)); g.ms.bossHp = g.ms.bossMaxHp; }
  g.phase = 'countdown'; g.endsAt = now() + 3000;
  if (g.pacing === 'host') { g.qIndex = 0; setTimer(g, 3000, () => startQuestion(g)); }
  else setTimer(g, 3000, () => startRun(g));
  touch(g);
}
function startQuestion(g) {
  const q = g.questions[g.qIndex];
  g.phase = 'question'; g.startAt = now(); g.endsAt = g.startAt + q.timeLimit * 1000; g.answers = new Map();
  for (const p of g.players.values()) { p.answeredNow = false; p.delta = 0; }
  setTimer(g, q.timeLimit * 1000, () => reveal(g)); touch(g);
}
function expectedPlayers(g) { const q = g.questions[g.qIndex]; return activePlayers(g).filter(p => p.joinedAt <= g.startAt && !isOwn(g, p, q)); }
const isOwn = (g, p, q) => g.options.skipOwnQuestions && q.authorKey && q.authorKey === p.deviceKey;
function reveal(g) {
  if (g.phase !== 'question') return; clearTimer(g);
  const q = g.questions[g.qIndex]; g.phase = 'reveal'; g.endsAt = null;
  const expected = expectedPlayers(g); let correctCount = 0;
  const answeredList = [...g.answers.values()];
  for (const p of activePlayers(g)) {
    const a = g.answers.get(p.id);
    g.resultSeq++;
    if (isOwn(g, p, q)) { p.result = { seq: g.resultSeq, correct: null, points: 0, streak: p.streak, answerText: answerText(q), message: '내가 낸 문제라 이번에는 쉬었어요.' }; continue; }
    if (p.joinedAt > g.startAt) { p.result = { seq: g.resultSeq, correct: null, points: 0, streak: p.streak, answerText: answerText(q), message: '다음 문제부터 참여해요.' }; continue; }
    if (!a && q.type === 'poll') { p.result = { seq: g.resultSeq, correct: null, points: 0, streak: p.streak, answerText: answerText(q), message: '설문에 답하지 못했어요. 다음 문제에서 만나요!', missed: true }; continue; }
    if (!a) { const lost = p.streak >= 2; p.streak = 0; p.result = { seq: g.resultSeq, correct: false, points: 0, streak: 0, lostStreak: lost, answerText: answerText(q), message: '시간이 끝났어요. 다음 문제는 꼭 도전해요!', missed: true }; continue; }
    if (a.correct) correctCount++;
    p.result = { seq: g.resultSeq, correct: a.correct, points: a.points, streak: p.streak, lostStreak: !!a.lostStreak, answerText: answerText(q) };
  }
  // 모드별 효과
  const accuracy = expected.length ? expected.filter(p => g.answers.get(p.id)?.correct).length / expected.length : 0;
  const questionCount = g.questions.length;
  if (q.type !== 'poll') {
    if (g.mode === 'submarine' && g.ms.status === 'diving') {
      const step = Math.round(g.ms.targetDepth / questionCount * 1.25 * accuracy);
      g.ms.depth = Math.min(g.ms.targetDepth, g.ms.depth + step);
      g.ms.oxygen = Math.max(0, g.ms.oxygen - Math.round((1 - accuracy) * (100 / questionCount) * 1.6));
      g.ms.lastAccuracy = Math.round(accuracy * 100);
      g.ms.log.unshift(`${g.qIndex + 1}번 문제: 정답률 ${g.ms.lastAccuracy}%, ${step}m 잠수`); g.ms.log.length = Math.min(g.ms.log.length, 6);
      if (g.ms.depth >= g.ms.targetDepth) { g.ms.status = 'success'; g.ms.log.unshift('바다 밑 보물에 도착했어요!'); }
      else if (g.ms.oxygen <= 0) { g.ms.status = 'failed'; g.ms.log.unshift('산소가 바닥났어요. 다음에는 더 깊이!'); }
    }
    if (g.mode === 'kingdom' || g.mode === 'space') {
      const correctOnes = answeredList.filter(a => a.correct).sort((x, y) => x.elapsed - y.elapsed);
      correctOnes.forEach((a, i) => {
        const p = g.players.get(a.playerId); if (!p) return;
        if (g.mode === 'kingdom') p.actions = { kind: 'claim', remaining: i < Math.ceil(correctOnes.length / 2) ? 2 : 1 };
        else { const third = correctOnes.length / 3; let e = i < third ? 3 : i < third * 2 ? 2 : 1; if (q.points === 'double') e *= 2; p.actions = { kind: 'launch', remaining: e }; }
      });
    }
    if (g.mode === 'garden' && g.ms.status !== 'failed') {
      for (const a of answeredList) if (a.correct) {
        const p = g.players.get(a.playerId); const count = q.points === 'double' ? 2 : 1;
        for (let k = 0; k < count; k++) { g.ms.bloomed++; g.ms.flowers.push({ x: 4 + crypto.randomInt(92), y: 30 + crypto.randomInt(64), kind: crypto.randomInt(6), by: p?.nickname || '' }); }
      }
      if (g.ms.flowers.length > 200) g.ms.flowers = g.ms.flowers.slice(-200);
      if (g.ms.bloomed >= g.ms.goal) g.ms.status = 'success';
    }
    if (g.mode === 'boss' && g.ms.status === 'fighting') {
      for (const a of answeredList.filter(a => a.correct).sort((x, y) => y.points - x.points)) {
        const p = g.players.get(a.playerId); const dmg = Math.max(100, a.points);
        g.ms.bossHp = Math.max(0, g.ms.bossHp - dmg); g.ms.hits.unshift({ nickname: p?.nickname || '', damage: dmg });
      }
      g.ms.hits.length = Math.min(g.ms.hits.length, 8);
      g.ms.shield = Math.max(0, g.ms.shield - Math.round((1 - accuracy) * 220 / questionCount));
      if (g.ms.bossHp <= 0) g.ms.status = 'victory'; else if (g.ms.shield <= 0) g.ms.status = 'defeat';
    }
  }
  const ranked = ranking(g);
  for (const p of ranked) {
    if (!p.result) continue; p.result.rank = p.rank;
    if (!p.result.message) {
      if (g.mode === 'kingdom' && p.actions) p.result.message = `땅을 ${p.actions.remaining}칸 차지할 수 있어요! 지도를 눌러요.`;
      else if (g.mode === 'space' && p.actions) p.result.message = `에너지 ${p.actions.remaining}개를 행성으로 보내요!`;
      else if (p.rank === 1) p.result.message = '지금 1위예요! 이대로 지켜요.';
      else { const above = ranked[p.rank - 2]; p.result.message = `${above.nickname} 님과 ${Math.max(0, above.score - p.score)}점 차이예요.`; }
    }
  }
  g.stats[g.qIndex] = { questionId: q.id, text: q.text, type: q.type, answered: answeredList.length, correct: correctCount, expected: expected.length };
  touch(g);
}
function advance(g) {
  clearTimer(g);
  for (const p of g.players.values()) { p.actions = null; }
  if (g.qIndex + 1 < g.questions.length) { g.qIndex++; g.phase = 'countdown'; g.endsAt = now() + 3000; setTimer(g, 3000, () => startQuestion(g)); touch(g); }
  else finish(g);
}
function hostNext(g) {
  if (g.phase === 'lobby') return startGame(g);
  if (g.phase === 'question') return reveal(g);
  if (g.phase === 'reveal') { if (g.mode === 'classic') { g.phase = 'leaderboard'; for (const p of g.players.values()) p.actions = null; touch(g); return; } return advance(g); }
  if (g.phase === 'leaderboard') return advance(g);
}
// 각자 속도로 진행하는 모드
function startRun(g) {
  g.phase = 'running'; g.startAt = now(); g.endsAt = g.startAt + g.options.duration * 1000;
  for (const p of g.players.values()) nextPersonalQuestion(g, p);
  setTimer(g, g.options.duration * 1000, () => finish(g)); touch(g);
}
function nextPersonalQuestion(g, p) {
  if (!p.queue || !p.queue.length) {
    let idx = g.questions.map((q, i) => i).filter(i => !isOwn(g, p, g.questions[i]));
    if (!idx.length) idx = g.questions.map((q, i) => i);
    p.queue = g.options.randomizeQuestions || p.round ? shuffle(idx) : idx; p.round = (p.round || 0) + 1;
    if (p.queue.length > 1 && p.queue[0] === p.lastQ) p.queue.push(p.queue.shift());
  }
  p.currentQ = p.queue.shift(); p.lastQ = p.currentQ; p.qStartedAt = now();
}
function playerAnswer(g, p, q, ev, elapsed) {
  const lostStreak = !ev.correct && p.streak >= 2;
  p.answered++; if (ev.correct) { p.correct++; p.streak++; } else p.streak = 0;
  const st = g.stats[g.questions.indexOf(q)] || (g.stats[g.questions.indexOf(q)] = { questionId: q.id, text: q.text, type: q.type, answered: 0, correct: 0 });
  st.answered++; if (ev.correct) st.correct++;
  const ms = g.ms; let message = '', points = 0;
  if (g.mode === 'robot') {
    if (ev.correct) { let step = 1; p.turbo = p.streak > 0 && p.streak % 3 === 0; if (p.turbo) { step++; addFeed(g, p.nickname, '터보 부스트!'); } p.pos = Math.min(ms.goal, p.pos + step); points = step; message = p.turbo ? '터보! 두 칸 전진!' : '한 칸 전진!'; }
    else { p.turbo = false; p.lockedUntil = now() + 3000; message = '로봇 수리 중… 3초만 기다려요.'; }
    p.score = p.pos; if (p.pos >= ms.goal && !p.finishedRank) finishLine(g, p);
  } else if (g.mode === 'marble') {
    if (ev.correct) { let boost = Math.round(4 + 6 * (1 - speedFactor(q, elapsed))); if (p.streak > 0 && p.streak % 3 === 0) boost += 2; p.dist = Math.min(ms.goal, p.dist + boost); p.lastBoost = boost; points = boost; message = `${boost}m 가속!`; }
    else { p.dist = Math.max(0, p.dist - 2); p.lastBoost = -2; message = '앗, 벽에 부딪혀 2m 밀려났어요.'; }
    p.score = p.dist; if (p.dist >= ms.goal && !p.finishedRank) finishLine(g, p);
  } else if (g.mode === 'tower') {
    if (ev.correct) { const gold = elapsed <= q.timeLimit * 1000 / 3; const block = { color: MARBLE_COLORS[crypto.randomInt(MARBLE_COLORS.length)], gold, value: gold ? 2 : 1 }; p.blocks.push(block); p.height += block.value; points = block.value; message = gold ? '황금 블록! 2층 쌓았어요.' : '블록 한 층 쌓았어요.'; if (gold && p.streak % 3 === 0) addFeed(g, p.nickname, '황금 블록 연속!'); }
    else { const top = p.blocks.pop(); if (top) { p.height -= top.value; message = '블록이 하나 무너졌어요.'; } else message = '아쉬워요! 다시 도전!'; }
    p.score = p.height; p.reachedAt = now();
  } else if (g.mode === 'treasure') {
    if (ev.correct) { p.actions = { kind: 'chest', remaining: 1 }; message = '정답! 보물상자를 하나 골라요.'; }
    else message = '아쉬워요! 다음 문제로 상자에 도전해요.';
  }
  if (g.mode !== 'tower' && points > 0) p.reachedAt = now();
  g.resultSeq++;
  p.result = { seq: g.resultSeq, correct: ev.correct, points, streak: p.streak, lostStreak, answerText: answerText(q), message };
  if (g.mode !== 'treasure' || !ev.correct) nextPersonalQuestion(g, p); else p.currentQ = null;
  ranking(g); p.result.rank = p.rank;
}
function finishLine(g, p) {
  const done = activePlayers(g).filter(x => x.finishedRank).length;
  p.finishedRank = done + 1; addFeed(g, p.nickname, `결승선 통과! ${p.finishedRank}위`);
  if (activePlayers(g).every(x => x.finishedRank)) setTimeout(() => { if (g.phase === 'running') finish(g); }, 1500);
}
function openChest(g, p, choice) {
  if (!p.actions || p.actions.kind !== 'chest') fail(400, '지금은 상자를 열 수 없어요.');
  if (![0, 1, 2].includes(Number(choice))) fail(400, '상자를 고르세요.');
  const roll = crypto.randomInt(100); let text, gain = 0;
  if (roll < 30) { gain = 100; text = '금화 100개'; }
  else if (roll < 55) { gain = 250; text = '금화 250개'; }
  else if (roll < 70) { gain = 500; text = '금화 500개!'; }
  else if (roll < 80) { gain = Math.min(Math.max(p.score, 50), 1000); text = `두 배 상자! 금화 ${gain}개`; }
  else if (roll < 90) { for (const x of g.players.values()) x.score += 30; text = '나눔 상자! 모두에게 금화 30개'; }
  else { text = '텅 빈 상자… 꽝!'; }
  p.score += gain; p.reachedAt = now(); p.actions = null;
  g.ms.events.unshift({ nickname: p.nickname, text }); g.ms.events.length = Math.min(g.ms.events.length, 10);
  if (gain >= 500 || text.startsWith('나눔')) addFeed(g, p.nickname, text);
  g.resultSeq++; ranking(g);
  p.result = { seq: g.resultSeq, correct: true, points: gain, streak: p.streak, answerText: '', message: text, rank: p.rank, chest: Number(choice) };
  nextPersonalQuestion(g, p);
}
function claimTile(g, p, target) {
  if (g.mode !== 'kingdom' || g.phase !== 'reveal' || !p.actions || p.actions.kind !== 'claim' || p.actions.remaining < 1) fail(400, '지금은 땅을 차지할 수 없어요.');
  const t = Number(target); if (!Number.isInteger(t) || t < 0 || t >= g.ms.tiles.length) fail(400, '칸을 다시 고르세요.');
  if (g.ms.tiles[t] === p.team) fail(400, '이미 우리 팀 땅이에요.');
  const stolen = g.ms.tiles[t] >= 0; g.ms.tiles[t] = p.team; p.actions.remaining--; p.score += 50;
  if (stolen) addFeed(g, p.nickname, '상대 팀 땅을 빼앗았어요!');
  if (!p.actions.remaining) p.actions = null;
}
function launchEnergy(g, p, target) {
  if (g.mode !== 'space' || g.phase !== 'reveal' || !p.actions || p.actions.kind !== 'launch' || p.actions.remaining < 1) fail(400, '지금은 에너지를 보낼 수 없어요.');
  const planet = g.ms.planets.find(x => x.id === target); if (!planet) fail(400, '행성을 다시 고르세요.');
  planet.energy[p.team]++; p.actions.remaining--; p.score += 30;
  const max = Math.max(...planet.energy); const leaders = planet.energy.map((e, i) => e === max ? i : -1).filter(i => i >= 0);
  if (leaders.length === 1 && planet.owner !== leaders[0]) { planet.owner = leaders[0]; addFeed(g, p.nickname, `${planet.name} 정복!`); }
  if (!p.actions.remaining) p.actions = null;
}
function finish(g) {
  if (g.phase === 'finished') return; clearTimer(g);
  if (g.pacing === 'host' && g.phase === 'question') reveal(g);
  g.phase = 'finished'; g.endsAt = null;
  for (const p of g.players.values()) { p.actions = null; p.currentQ = null; }
  if (g.mode === 'garden' && g.ms.status === 'growing') g.ms.status = g.ms.bloomed >= g.ms.goal ? 'success' : 'failed';
  if (g.mode === 'boss' && g.ms.status === 'fighting') g.ms.status = 'defeat';
  if (g.mode === 'submarine' && g.ms.status === 'diving') g.ms.status = g.ms.depth >= g.ms.targetDepth ? 'success' : 'failed';
  saveReport(g); touch(g);
}
function saveReport(g) {
  const ranked = ranking(g); const teams = teamSummary(g);
  const report = {
    id: id(), quizId: g.quizId, quizTitle: g.quizTitle, mode: g.mode, modeName: g.modeName, createdAt: iso(), playerCount: ranked.length,
    teams: teams ? teams.map(t => ({ name: t.name, score: t.score, members: t.members })) : null,
    players: ranked.map(p => ({ nickname: p.nickname, team: g.teams ? g.teams[p.team].name : null, score: p.score, rank: p.rank, correct: p.correct, answered: p.answered })),
    questions: g.questions.map((q, i) => { const s = g.stats[i]; const answered = s?.answered || 0; return { text: q.text, type: q.type, answered, correct: s?.correct || 0, accuracy: q.type === 'poll' || !answered ? null : (s.correct / answered) }; })
  };
  if (!ranked.length) return;
  g.reportId = report.id; HOOKS.report(g, report);
}

// 플레이어 참가와 답 제출
function joinGame(g, deviceKey, nickname) {
  if (g.kicked.has(deviceKey)) fail(403, '진행자가 이 기기를 게임에서 내보냈어요.');
  const existing = [...g.players.values()].find(p => p.deviceKey === deviceKey);
  if (existing) return existing;
  if (g.phase === 'finished') fail(409, '이미 끝난 게임이에요.');
  if (g.locked) fail(423, '진행자가 게임을 잠갔어요. 선생님께 말씀드리세요.');
  if (g.players.size >= 300) fail(409, '참가 인원이 가득 찼어요.');
  let nick;
  const taken = n => [...g.players.values()].some(p => p.nickname.toLowerCase() === n.toLowerCase());
  if (g.options.friendlyNicknames) { let tries = 0; do { nick = randomNick(); if (++tries > 30) nick = randomNick() + ' ' + crypto.randomInt(10, 100); } while (taken(nick)); }
  else {
    nick = clean(nickname, 15); if (!nick) fail(400, '닉네임을 입력하세요.');
    if (badName(nick)) fail(400, '친구들이 기분 좋게 볼 수 있는 닉네임을 써 주세요.');
    if (taken(nick)) fail(409, '이미 사용 중인 닉네임이에요. 다른 닉네임을 정해 주세요.');
  }
  const p = {
    id: crypto.randomBytes(6).toString('hex'), deviceKey, nickname: nick, team: g.teams ? teamFor(g) : null, score: 0, correct: 0, answered: 0, streak: 0, delta: 0,
    joinedAt: now(), reachedAt: now(), conns: 0, result: null, actions: null, rank: 0,
    pos: 0, dist: 0, lastBoost: 0, height: 0, blocks: [], color: MARBLE_COLORS[g.players.size % MARBLE_COLORS.length], turbo: false, lockedUntil: null, finishedRank: null, currentQ: null
  };
  g.players.set(p.id, p);
  if (g.phase === 'running') nextPersonalQuestion(g, p);
  if (g.phase !== 'lobby') addFeed(g, nick, '게임에 들어왔어요.');
  touch(g); return p;
}
function submitAnswer(g, p, questionId, answer) {
  if (g.pacing === 'host') {
    if (g.phase !== 'question') fail(409, '지금은 답을 낼 수 없어요.');
    const q = g.questions[g.qIndex]; if (q.id !== questionId) fail(409, '이미 다음 문제로 넘어갔어요.');
    if (isOwn(g, p, q)) fail(409, '내가 낸 문제는 풀지 않아요.');
    if (p.joinedAt > g.startAt) fail(409, '다음 문제부터 참여할 수 있어요.');
    if (g.answers.has(p.id)) fail(409, '이미 답을 냈어요.');
    const elapsed = now() - g.startAt; const ev = evaluate(q, answer);
    let points = 0, lostStreak = false;
    if (ev.correct === false) lostStreak = p.streak >= 2;
    if (ev.correct) { p.streak++; points = Math.round(basePoints(q, elapsed) * ev.factor); if (points > 0 && p.streak >= 2) points += Math.min(p.streak - 1, 5) * 100; p.correct++; }
    else if (ev.correct === false) p.streak = 0;
    if (q.type !== 'poll') p.answered++;
    p.score += points; p.delta = points; p.reachedAt = now();
    g.answers.set(p.id, { playerId: p.id, value: ev.value, correct: ev.correct, points, elapsed, lostStreak });
    if (g.answers.size >= expectedPlayers(g).length) reveal(g); else touch(g);
    return {};
  }
  if (g.phase !== 'running') fail(409, '지금은 답을 낼 수 없어요.');
  if (p.finishedRank && (g.mode === 'robot' || g.mode === 'marble')) fail(409, '이미 결승선을 통과했어요!');
  if (p.currentQ === null || p.currentQ === undefined) fail(409, '보물상자를 먼저 골라요.');
  if (p.lockedUntil && p.lockedUntil > now()) fail(409, '로봇을 수리하고 있어요.');
  const q = g.questions[p.currentQ]; if (q.id !== questionId) fail(409, '문제가 바뀌었어요. 화면을 확인하세요.');
  const elapsed = now() - p.qStartedAt; const ev = evaluate(q, answer);
  playerAnswer(g, p, q, ev, elapsed); touch(g);
  return { result: p.result };
}

// ---------- 화면 상태 ----------
function hostQuestion(g, q, revealed) {
  const out = { id: q.id, type: q.type, text: q.text, image: q.image, timeLimit: q.timeLimit, points: q.points, authorName: q.authorName,
    choices: q.perm.map(o => revealed ? { text: q.choices[o].text, correct: !!q.choices[o].correct } : { text: q.choices[o].text }),
    puzzleItems: q.puzzle ? q.puzzle.map(x => ({ id: x.id, text: q.choices[x.orig].text })) : [],
    slider: q.slider ? { min: q.slider.min, max: q.slider.max, step: q.slider.step } : null };
  if (q.type === 'puzzle') out.choices = [];
  if (revealed) { if (q.type === 'type') out.accepted = q.accepted; if (q.slider) Object.assign(out.slider, { answer: q.slider.answer, tolerance: q.slider.tolerance }); if (q.type === 'puzzle') out.puzzleOrder = q.choices.map(c => c.text); }
  return out;
}
function modeStateView(g) {
  const ms = g.ms, list = ranking(g);
  if (g.mode === 'robot') return { goal: ms.goal, racers: list.map(p => ({ id: p.id, nickname: p.nickname, pos: p.pos, finishedRank: p.finishedRank, turbo: p.turbo, repairing: !!(p.lockedUntil && p.lockedUntil > now()) })) };
  if (g.mode === 'marble') return { goal: ms.goal, marbles: list.map(p => ({ id: p.id, nickname: p.nickname, dist: p.dist, color: p.color, finishedRank: p.finishedRank, lastBoost: p.lastBoost })) };
  if (g.mode === 'tower') return { towers: list.map(p => ({ id: p.id, nickname: p.nickname, height: p.height, blocks: p.blocks.slice(-30).map(b => ({ color: b.color, gold: b.gold })) })) };
  if (g.mode === 'treasure') return { players: list.map(p => ({ id: p.id, nickname: p.nickname, gold: p.score })), events: ms.events };
  if (g.mode === 'kingdom') return { cols: ms.cols, rows: ms.rows, tiles: ms.tiles, teams: teamSummary(g) };
  if (g.mode === 'space') return { planets: ms.planets, teams: teamSummary(g) };
  if (g.mode === 'submarine' || g.mode === 'garden' || g.mode === 'boss') return { ...ms };
  return {};
}
function podium(g) { return ranking(g).slice(0, 5).map(p => ({ rank: p.rank, nickname: p.nickname, score: p.score, team: g.teams ? g.teams[p.team].name : null })); }
function leaderboard(g) { return ranking(g).slice(0, 5).map(p => ({ rank: p.rank, nickname: p.nickname, score: p.score, delta: p.delta || 0, streak: p.streak })); }
function hostView(g) {
  const q = g.pacing === 'host' && g.qIndex >= 0 && ['question', 'reveal', 'leaderboard'].includes(g.phase) ? g.questions[g.qIndex] : null;
  const revealed = g.phase === 'reveal' || g.phase === 'leaderboard';
  let rev = null;
  if (q && revealed) {
    const answers = [...g.answers.values()];
    rev = { correctCount: answers.filter(a => a.correct).length, answered: answers.length, distribution: null, typed: null, sliderAverage: null };
    if (['quiz', 'truefalse', 'poll'].includes(q.type)) { rev.distribution = q.perm.map(() => 0); for (const a of answers) rev.distribution[a.value]++; }
    if (q.type === 'type') { const m = new Map(); for (const a of answers) { const k = normAns(a.value); const e = m.get(k) || { text: a.value, count: 0, correct: a.correct }; e.count++; m.set(k, e); } rev.typed = [...m.values()].sort((x, y) => y.count - x.count).slice(0, 8); }
    if (q.type === 'slider' && answers.length) rev.sliderAverage = Math.round(answers.reduce((n, a) => n + a.value, 0) / answers.length * 100) / 100;
  }
  const ranked = ranking(g);
  return {
    role: 'host', pin: g.pin, quizId: g.quizId, mode: g.mode, modeName: g.modeName, pacing: g.pacing, teamsEnabled: !!g.teams, quizTitle: g.quizTitle, phase: g.phase, serverNow: now(),
    joinUrls: addresses().length ? addresses() : [`http://localhost:${PORT}`], locked: g.locked, options: g.options, reportId: g.reportId,
    players: ranked.map(p => ({ id: p.id, nickname: p.nickname, team: p.team, score: p.score, correct: p.correct, connected: p.conns > 0, answered: g.answers.has(p.id) })), playerCount: ranked.length,
    teams: teamSummary(g), questionIndex: g.qIndex, questionCount: g.questions.length,
    question: q ? hostQuestion(g, q, revealed) : null, endsAt: g.endsAt,
    answeredCount: g.phase === 'question' ? g.answers.size : (rev?.answered ?? 0), expectedCount: g.phase === 'question' ? expectedPlayers(g).length : 0,
    reveal: rev, leaderboard: ['leaderboard', 'finished'].includes(g.phase) || g.mode === 'classic' ? leaderboard(g) : [],
    podium: g.phase === 'finished' ? podium(g) : [], feed: g.feed, modeState: modeStateView(g)
  };
}
function playerView(g, deviceKey) {
  const p = [...g.players.values()].find(x => x.deviceKey === deviceKey);
  const base = { role: 'player', pin: g.pin, mode: g.mode, modeName: g.modeName, pacing: g.pacing, phase: g.phase, serverNow: now(), quizTitle: g.quizTitle, kicked: g.kicked.has(deviceKey), endsAt: g.endsAt, modeState: modeStateView(g) };
  if (!p) return { ...base, me: null, question: null, answered: false, result: null, actions: null, leaderboard: [], podium: g.phase === 'finished' ? podium(g) : [] };
  ranking(g);
  const me = { id: p.id, nickname: p.nickname, team: p.team, teamName: g.teams ? g.teams[p.team].name : null, teamColor: g.teams ? g.teams[p.team].color : null, score: p.score, rank: p.rank, streak: p.streak, correct: p.correct, answered: p.answered, playerCount: g.players.size };
  let question = null, answered = false;
  let q = null;
  if (g.pacing === 'host' && g.phase === 'question') { q = g.questions[g.qIndex]; answered = g.answers.has(p.id); }
  if (g.pacing === 'player' && g.phase === 'running' && p.currentQ !== null && p.currentQ !== undefined && !(p.finishedRank && (g.mode === 'robot' || g.mode === 'marble'))) q = g.questions[p.currentQ];
  if (q) {
    const show = g.options.showOnDevice || g.pacing === 'player';
    question = { id: q.id, type: q.type, text: show ? q.text : null, image: show ? q.image : null, timeLimit: q.timeLimit, points: q.points, choiceCount: q.perm.length,
      choices: q.perm.map(o => ({ text: show ? q.choices[o].text : null })), puzzleItems: q.puzzle ? q.puzzle.map(x => ({ id: x.id, text: q.choices[x.orig].text })) : [],
      slider: q.slider ? { min: q.slider.min, max: q.slider.max, step: q.slider.step } : null, ownQuestion: g.pacing === 'host' && (isOwn(g, p, q) || p.joinedAt > g.startAt) };
    if (q.type === 'puzzle') question.choices = [];
  }
  return { ...base, me, question, answered, endsAt: g.pacing === 'player' ? g.endsAt : g.endsAt, lockedUntil: p.lockedUntil && p.lockedUntil > now() ? p.lockedUntil : null,
    result: ['reveal', 'leaderboard', 'running', 'finished'].includes(g.phase) ? p.result : null, actions: p.actions, questionStartedAt: g.pacing === 'player' ? p.qStartedAt : g.startAt,
    leaderboard: g.mode === 'classic' && ['leaderboard', 'finished'].includes(g.phase) ? leaderboard(g) : [], podium: g.phase === 'finished' ? podium(g) : [] };
}
  window.KQEngine = { HOOKS, games, MODES, modeOf, createGame, getGame, startGame, hostNext, reveal, finish, joinGame, submitAnswer, openChest, claimTile, launchEnergy, hostView, playerView, ranking, expectedPlayers, setTimer, clearTimer, startQuestion, startRun, normQuestion, normQuestions, publicQuestion, quizFromInput, randomNick, badName, clean, cleanText, id, iso, fail, THEMES };
})();
