// 檢查 data/articles.json：
//   1. 找出字典(data/dict.json)裡查不到的字 → 需要補進字典
//   2. 列出超出 2000 字(level 0)的字 → 文章下方會自動附註解，確認是否真的要用
//   3. 檢查題目格式（4 個選項、答案是 A–D、有解析）
//   4. 檢查欄位、字數、級別用字是否符合寫作規格（見 docs/WRITING-GUIDE.md）
// 用法：在專案根目錄執行  node tools/check-articles.mjs [文章檔案，預設 data/articles.json] [-q 只顯示問題]
import fs from 'node:fs';
const args = process.argv.slice(2);
const QUIET = args.includes('-q');
const FILE = args.find(a => !a.startsWith('-')) || 'data/articles.json';

const dict = JSON.parse(fs.readFileSync('data/dict.json', 'utf8'));
const articles = JSON.parse(fs.readFileSync(FILE, 'utf8'));
const F = fs.existsSync('data/forms.json') ? JSON.parse(fs.readFileSync('data/forms.json', 'utf8')) : {};
const D = Object.fromEntries(Object.entries(dict).map(([k, v]) => [k.toLowerCase(), v]));

// 與 js/app.js 相同的詞形還原規則（改一邊記得改另一邊）；先查 data/forms.json，查不到才用下面的規則
const IRR = {was:'be',were:'be',is:'be',are:'be',am:'be',been:'be',said:'say',ate:'eat',brought:'bring',took:'take',got:'get',went:'go',done:'do',did:'do',does:'do',has:'have',had:'have',heard:'hear',found:'find',made:'make',came:'come',ran:'run',caught:'catch',woke:'wake',spent:'spend'};
const RULES = [[/ies$/,'y'],[/ied$/,'y'],[/iest$/,'y'],[/ier$/,'y'],[/s$/,''],[/es$/,''],[/d$/,''],[/ed$/,''],[/ing$/,''],[/ing$/,'e'],[/est$/,''],[/er$/,''],[/ly$/,'']];
// 縮寫與所有格（與 js/app.js 相同）
const CONTR = {"can't": 'can', "cannot": 'can', "won't": 'will', "shan't": 'shall', "let's": 'let', "ain't": 'be'};
function contract(w) {
  if (CONTR[w]) return CONTR[w];
  let m = w.match(/^(.+?)n't$/); if (m) return IRR[m[1]] || m[1];
  m = w.match(/^(.+?)'(s|m|re|ll|ve|d)$/); if (m) return m[1];
  m = w.match(/^(.+?s)'$/); if (m) return m[1];
  return w;
}
function lemma(raw) {
  let w = raw.toLowerCase().replace(/’/g, "'");
  if (D[w]) return w;
  w = contract(w); if (F[w]) return F[w]; if (IRR[w]) return IRR[w];
  for (const [re, rep] of RULES) {
    if (!re.test(w)) continue;
    const c = w.replace(re, rep); if (c.length < 2) continue;
    if (D[c]) return c;
    if (/([b-df-hj-np-tv-z])\1$/.test(c) && D[c.slice(0, -1)]) return c.slice(0, -1);
  }
  if (w.includes('-') && D[w.replace(/-/g, '')]) return w.replace(/-/g, '');
  return w;
}

const WORD_RE = /[A-Za-z]+(?:['’-][A-Za-z]+)*/g;
function blockTexts(b) {
  if (b.t === 'p' || b.t === 'h') return [b.x];
  if (b.t === 'chat') return b.lines.map(l => l.x);
  if (b.t === 'email') return [b.subject || '', ...(b.body || [])];
  return [b.title, b.sub, ...(b.rows || []).flat(), ...(b.items || []), b.foot].filter(Boolean);
}
const GENRES = ['記敘文', '說明文', '圖表題', '書信', '對話', '多文本'];
const QTYPES = ['主旨', '細節', '推論', '字義猜測', '指涉', '圖表判讀', '計算', '整合', '作者目的'];
const SPEC = {           // 寫作規格：字數（圖表題、對話不檢查下限）、題數、非基本字、超綱字上限
  A: { min: 100, max: 200, q: [3, 4], adv: 6, off: 1 },
  B: { min: 160, max: 300, q: [4, 5], adv: 99, off: 3 },
};
const otherIds = FILE === 'data/articles.json' ? [] :
  JSON.parse(fs.readFileSync('data/articles.json', 'utf8')).map(a => a.id);

let problems = 0;
const ids = new Set(otherIds);
const ansCount = { A: 0, B: 0, C: 0, D: 0 };
for (const a of articles) {
  const errs = [], warns = [];
  for (const k of ['id', 'level', 'genre', 'title', 'zh', 'topic', 'blocks', 'questions'])
    if (a[k] === undefined || a[k] === '') errs.push(`缺少欄位 ${k}`);
  if (ids.has(a.id)) errs.push(`id 重複：${a.id}`); ids.add(a.id);
  if (!GENRES.includes(a.genre)) errs.push(`genre 要是 ${GENRES.join('／')}`);
  const spec = SPEC[a.level]; if (!spec) errs.push('level 要是 A 或 B');
  const names = new Set(a.names || []);
  const words = (a.blocks || []).flatMap(blockTexts).join(' ').match(WORD_RE) || [];
  const missing = new Set(), off = new Set(), adv = new Set();
  for (const w of words) {
    if (names.has(w) || /^[A-Z]$/.test(w)) continue;   // 人名地名、單一字母（Text A、Set B）不算
    const l = lemma(w);
    if (!D[l]) missing.add(w); else if (D[l].level === 0) off.add(l); else if (D[l].level === 2) adv.add(l);
  }
  if (missing.size) errs.push(`字典查不到（改用其他字，人名地名請列在 names）：${[...missing].join(', ')}`);
  if (spec) {
    const loose = ['圖表題', '對話'].includes(a.genre);
    if (words.length > spec.max) errs.push(`字數 ${words.length} 超過 ${spec.max}`);
    if (!loose && words.length < spec.min) errs.push(`字數 ${words.length} 少於 ${spec.min}`);
    if (adv.size > spec.adv) errs.push(`非基本字 ${adv.size} 個，A 級上限 ${spec.adv}`);
    if (off.size > spec.off) errs.push(`超綱字 ${off.size} 個（${[...off].join(', ')}），上限 ${spec.off}`);
    const n = (a.questions || []).length;
    if (n < spec.q[0] || n > spec.q[1]) errs.push(`題數 ${n}，${a.level} 級要 ${spec.q[0]}～${spec.q[1]} 題`);
  }
  (a.questions || []).forEach((q, i) => {
    const e = [];
    if (!QTYPES.includes(q.type)) e.push(`type 要是 ${QTYPES.join('／')}`);
    if (!q.question) e.push('缺少 question');
    if (!Array.isArray(q.options) || q.options.length !== 4) e.push('選項不是 4 個');
    else if (new Set(q.options).size !== 4) e.push('選項重複');
    if (!['A', 'B', 'C', 'D'].includes(q.answer)) e.push('answer 要是 A–D'); else ansCount[q.answer]++;
    if (!q.explanation) e.push('缺少解析');
    if (e.length) errs.push(`第 ${i + 1} 題：${e.join('、')}`);
  });
  const types = new Set((a.questions || []).map(q => q.type));
  if (types.size < Math.min(3, (a.questions || []).length)) warns.push('題型太集中，至少要 3 種');
  if (errs.length) problems += errs.length;
  if (QUIET && !errs.length) continue;
  console.log(`\n[${a.id}] ${a.title}（${a.level} 級・${a.genre}・${a.topic || '無主題'}，${words.length} 字）`);
  if (adv.size) console.log(`  · 常用 2000 字（非基本字）${adv.size} 個：`, [...adv].join(', '));
  if (off.size) console.log('  ! 超出 2000 字：', [...off].join(', '));
  warns.forEach(w => console.log('  ! ' + w));
  errs.forEach(e => console.log('  ✗ ' + e));
  if (!errs.length) console.log('  ✓ 通過');
}
const total = Object.values(ansCount).reduce((x, y) => x + y, 0);
console.log(`\n${articles.length} 篇、${total} 題；答案分布 A ${ansCount.A}／B ${ansCount.B}／C ${ansCount.C}／D ${ansCount.D}`);
console.log(problems ? `共 ${problems} 個問題要修正。` : '全部通過。');
process.exit(problems ? 1 : 0);
