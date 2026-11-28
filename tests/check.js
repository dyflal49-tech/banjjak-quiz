#!/usr/bin/env node
'use strict';
/* 반짝퀴즈 자동 점검 (설치할 것 없음, Node.js 18 이상)
   실행:          node tests/check.js
   기준값 갱신:   node tests/check.js --update   (마블 물리를 일부러 바꿨을 때만)

   점검 내용
   1. 모든 .js 파일 문법 검사
   2. index.html / 404.html 이 불러오는 파일이 실제로 있는지
   2-1. 한글 줄바꿈 규칙(띄어쓰기에서만 줄바꿈)이 지켜지는지
   3. 마블 레이스 물리(marble-physics.js)
      - 시드 난수만 쓰는지(Math.random, Date.now 등 금지)
      - 같은 입력이면 항상 같은 결과인지
      - 엔진이 쓰는 simulate() 결과와 진행자 화면이 쓰는 create()+step() 결과가 같은지
      - 모든 구슬이 한 번씩 결승에 들어오고 시간이 앞으로만 흐르는지
      - 고정 입력 결과가 저장된 기준값(tests/marble-baseline.json)과 같은지 */
const fs = require('fs'), path = require('path'), vm = require('vm'), crypto = require('crypto');

const ROOT = path.resolve(__dirname, '..');
const BASELINE = path.join(__dirname, 'marble-baseline.json');
const UPDATE = process.argv.includes('--update');
let fails = 0, passes = 0;
const ok = (cond, msg) => { if (cond) { passes++; } else { fails++; console.log('  ✗ ' + msg); } return cond; };
const section = t => console.log('\n■ ' + t);

// ---------- 1. 문법 ----------
section('JS 문법 검사');
const jsFiles = fs.readdirSync(ROOT).filter(f => f.endsWith('.js')).sort();
for (const f of jsFiles) {
  try { new vm.Script(fs.readFileSync(path.join(ROOT, f), 'utf8'), { filename: f }); ok(true); }
  catch (e) { ok(false, `${f}: ${e.message}`); }
}
console.log(`  파일 ${jsFiles.length}개 확인`);

// ---------- 2. HTML이 불러오는 파일 ----------
section('HTML이 불러오는 로컬 파일');
for (const html of ['index.html', '404.html']) {
  const p = path.join(ROOT, html);
  if (!fs.existsSync(p)) continue;
  const src = fs.readFileSync(p, 'utf8');
  const refs = [...src.matchAll(/(?:src|href)="([^"]+)"/g)].map(m => m[1]).filter(u => !/^(https?:|data:|#|\/|mailto:)/.test(u));
  for (const r of refs) ok(fs.existsSync(path.join(ROOT, r.split(/[?#]/)[0])), `${html} → ${r} 파일이 없음`);
  console.log(`  ${html}: ${refs.length}개 확인`);
}

// ---------- 2-1. 한글 줄바꿈 규칙 (docs/korean-line-break-trd.md) ----------
section('한글 줄바꿈 규칙');
{
  const style = fs.readFileSync(path.join(ROOT, 'style.css'), 'utf8');
  const body = (style.match(/(^|\n)body\{([^}]*)\}/) || [])[2] || '';
  ok(/word-break:\s*keep-all/.test(body), 'style.css의 body에 word-break:keep-all 이 없음 (한글이 단어 중간에서 줄바뀜)');
  ok(/overflow-wrap:\s*(break-word|anywhere)/.test(body), 'style.css의 body에 overflow-wrap:break-word 가 없음 (긴 말이 화면 밖으로 나갈 수 있음)');
  const cssFiles = fs.readdirSync(ROOT).filter(f => f.endsWith('.css'));
  for (const f of cssFiles) {
    const src = fs.readFileSync(path.join(ROOT, f), 'utf8');
    ok(!/word-break:\s*(normal|break-all)/.test(src), `${f}: word-break:normal/break-all 이 있음 (한글이 글자 단위로 끊김)`);
  }
  // 퀴즈 런 정답 문 글자(canvas)는 띄어쓰기 단위로 나눠야 함
  const runner = fs.readFileSync(path.join(ROOT, 'arena-runner.js'), 'utf8');
  const m = runner.match(/function wrapText\(ctx, text, maxW, lines\) \{[\s\S]*?\n  \}\n/);
  if (ok(m, 'arena-runner.js 에서 wrapText 를 찾지 못함')) {
    const wrapText = vm.runInNewContext('(' + m[0] + ')');
    const ctx = { measureText: s => ({ width: Array.from(s).length }) }; // 글자 1개 = 폭 1
    const r = wrapText(ctx, '선생님 비밀번호로 로그인하세요', 8, 3);
    ok(JSON.stringify(r) === JSON.stringify(['선생님', '비밀번호로', '로그인하세요']), `퀴즈 런 문 글자가 단어 중간에서 끊김: ${JSON.stringify(r)}`);
    const long = wrapText(ctx, '가나다라마바사아자차카타', 5, 2);
    ok(long.length === 2 && long.every(l => Array.from(l).length <= 5) && long[1].endsWith('…'), `띄어쓰기 없는 긴 말 처리 이상: ${JSON.stringify(long)}`);
  }
  console.log(`  CSS ${cssFiles.length}개 확인`);
}

// ---------- 3. 마블 물리 ----------
section('마블 레이스 물리');
const physSrc = fs.readFileSync(path.join(ROOT, 'marble-physics.js'), 'utf8');
for (const bad of ['Math.random', 'Date.now', 'performance.now', 'new Date', 'crypto.']) ok(!physSrc.includes(bad), `marble-physics.js에 ${bad} 사용 (결과가 매번 달라질 수 있음)`);

// 브라우저 없이 새로 불러오기 (매번 새 환경 → 캐시나 전역 상태가 결과에 섞이지 않는지 확인)
const load = () => { const ctx = { window: {} }; vm.runInNewContext(physSrc, ctx, { filename: 'marble-physics.js' }); return ctx.window.KQMarble; };
const P = load(), P2 = load();
ok(P && typeof P.simulate === 'function' && typeof P.create === 'function', 'window.KQMarble 를 찾지 못함');
const mapIds = P.MAPS.map(m => m.id);
ok(mapIds.length > 0, '맵 목록이 비어 있음');
console.log(`  맵: ${mapIds.join(', ')}`);

const marblesOf = n => Array.from({ length: n }, (_, i) => ({ id: 'm' + i, gold: i % 5 === 0 }));
const digest = r => crypto.createHash('sha256').update(JSON.stringify(r)).digest('hex').slice(0, 16);
const CASES = [];
for (const id of mapIds) for (const [n, seed] of [[1, 7], [24, 123456], [24, 2024]]) CASES.push({ id, n, seed });

const current = {};
for (const c of CASES) {
  const key = `${c.id}/구슬${c.n}/시드${c.seed}`, ms = marblesOf(c.n);
  const a = P.simulate(c.id, ms, c.seed);
  const b = P2.simulate(c.id, ms, c.seed);   // 다른 환경
  const a2 = P.simulate(c.id, ms, c.seed);   // 같은 환경, 맵 캐시 재사용
  ok(JSON.stringify(a) === JSON.stringify(b) && JSON.stringify(a) === JSON.stringify(a2), `${key}: 같은 입력인데 결과가 다름`);

  const ids = a.finish.map(f => f.id);
  ok(ids.length === c.n && new Set(ids).size === c.n && ms.every(m => ids.includes(m.id)), `${key}: 결승 도착 구슬 목록이 맞지 않음`);
  ok(a.finish.every((f, i) => i === 0 || f.t >= a.finish[i - 1].t), `${key}: 도착 시간이 거꾸로 흐름`);
  ok(Number.isFinite(a.duration) && a.duration > 0, `${key}: 레이스 시간이 이상함 (${a.duration})`);

  // 진행자 화면 방식: create 후 한 단계씩
  const w = P2.create(c.id, ms, c.seed); let guard = 0;
  while (!w.done && guard++ < 1e6) w.step();
  ok(JSON.stringify(w.finishList) === JSON.stringify(a.finish), `${key}: simulate()와 create()+step() 순위가 다름 (화면과 결과가 어긋남)`);
  current[key] = digest(a);
}

// 맵 고르기도 시드만으로 결정되는지
for (const s of [1, 42, 99999, 2147483645]) {
  const m = P.mapFor(s);
  ok(mapIds.includes(m) && m === P2.mapFor(s), `mapFor(${s}) 결과가 이상하거나 매번 다름`);
}
// 구슬 0개
ok(P.simulate('peg', [], 1).finish.length === 0, '구슬 0개일 때 결과가 비어 있지 않음');

// 기준값 비교
if (UPDATE || !fs.existsSync(BASELINE)) {
  fs.writeFileSync(BASELINE, JSON.stringify(current, null, 2) + '\n');
  console.log(`  기준값 저장: tests/marble-baseline.json (${Object.keys(current).length}개)`);
} else {
  const base = JSON.parse(fs.readFileSync(BASELINE, 'utf8'));
  const changed = Object.keys(current).filter(k => base[k] !== current[k]);
  ok(changed.length === 0, `기준값과 결과가 달라짐: ${changed.join(', ')}\n    물리를 일부러 바꿨다면 node tests/check.js --update 로 기준값을 새로 저장하세요.`);
  console.log(`  기준값 ${Object.keys(base).length}개와 비교`);
}

console.log(`\n${fails ? '❌ 실패' : '✅ 통과'}: 성공 ${passes}개, 실패 ${fails}개`);
process.exit(fails ? 1 : 0);
