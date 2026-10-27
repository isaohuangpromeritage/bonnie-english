// 檢查單題練習（data/singles.json 或指定檔案）
// 用法：node tools/check-singles.mjs [檔案] [-q]
import fs from 'node:fs';
import { D, lemma, WORD_RE } from './lemma.mjs';
const args = process.argv.slice(2);
const QUIET = args.includes('-q');
const FILE = args.find(a => !a.startsWith('-')) || 'data/singles.json';
const items = JSON.parse(fs.readFileSync(FILE, 'utf8'));
const others = FILE === 'data/singles.json' || !fs.existsSync('data/singles.json') ? [] :
  JSON.parse(fs.readFileSync('data/singles.json', 'utf8')).map(x => x.id);
const POINTS = {
  文法: ['現在簡單式', '過去簡單式', '進行式', '未來式', '現在完成式', '助動詞', '被動語態', '比較級與最高級', '代名詞', '關係子句', '附加問句', '不定詞與動名詞', '連接詞', '間接問句', '介系詞', '名詞與冠詞', '感官與使役動詞', '句型'],
  字彙: ['名詞', '動詞', '形容詞', '副詞', '片語與搭配', '情境對話'],
};
const ids = new Set(others), ans = { A: 0, B: 0, C: 0, D: 0 }, byPoint = {};
let problems = 0;
for (const q of items) {
  const errs = [];
  for (const k of ['id', 'level', 'cat', 'point', 'question', 'options', 'answer', 'explanation']) if (q[k] === undefined || q[k] === '') errs.push(`缺少 ${k}`);
  if (ids.has(q.id)) errs.push(`id 重複`); ids.add(q.id);
  if (!['A', 'B'].includes(q.level)) errs.push('level 要是 A 或 B');
  if (!POINTS[q.cat]) errs.push('cat 要是 文法 或 字彙');
  else if (!POINTS[q.cat].includes(q.point)) errs.push(`point 要是：${POINTS[q.cat].join('、')}`);
  if (!/_{4,}/.test(q.question || '')) errs.push('題目要有空格 ____');
  if (!Array.isArray(q.options) || q.options.length !== 4 || new Set(q.options).size !== 4) errs.push('要有 4 個不重複的選項');
  if (!['A', 'B', 'C', 'D'].includes(q.answer)) errs.push('answer 要是 A–D'); else ans[q.answer]++;
  const names = new Set(q.names || []);
  const words = [q.question, ...(q.options || [])].join(' ').match(WORD_RE) || [];
  const missing = new Set(), off = new Set();
  for (const w of words) {
    if (names.has(w) || names.has(w.replace(/['’]s?$/, '')) || /^[A-Z]$/.test(w)) continue;
    const l = lemma(w);
    if (!D[l]) missing.add(w); else if (D[l].level === 0) off.add(l);
  }
  if (missing.size) errs.push(`字典查不到：${[...missing].join(', ')}`);
  const lim = q.level === 'A' ? 0 : 1;
  if (off.size > lim) errs.push(`超綱字 ${[...off].join(', ')}（${q.level} 級上限 ${lim}）`);
  byPoint[`${q.cat}/${q.point}`] = (byPoint[`${q.cat}/${q.point}`] || 0) + 1;
  if (errs.length) { problems += errs.length; console.log(`✗ [${q.id}] ${q.question.replace(/\n/g, ' / ')}\n    ${errs.join('\n    ')}`); }
  else if (!QUIET) console.log(`✓ [${q.id}] ${q.cat}/${q.point}`);
}
console.log(`\n${items.length} 題；答案分布 A ${ans.A}／B ${ans.B}／C ${ans.C}／D ${ans.D}`);
console.log('考點：' + Object.entries(byPoint).map(([k, v]) => `${k} ${v}`).join('、'));
console.log(problems ? `共 ${problems} 個問題要修正。` : '全部通過。');
process.exit(problems ? 1 : 0);
