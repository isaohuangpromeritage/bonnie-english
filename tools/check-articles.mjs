// 檢查 data/articles.json：
//   1. 找出字典(data/dict.json)裡查不到的字 → 需要補進字典
//   2. 列出超出 2000 字(level 0)的字 → 文章下方會自動附註解，確認是否真的要用
//   3. 檢查題目格式（4 個選項、答案是 A–D、有解析）
// 用法：在專案根目錄執行  node tools/check-articles.mjs
import fs from 'node:fs';

const dict = JSON.parse(fs.readFileSync('data/dict.json', 'utf8'));
const articles = JSON.parse(fs.readFileSync('data/articles.json', 'utf8'));
const D = Object.fromEntries(Object.entries(dict).map(([k, v]) => [k.toLowerCase(), v]));

// 與 js/app.js 相同的詞形還原規則（改一邊記得改另一邊）
const IRR = {was:'be',were:'be',is:'be',are:'be',am:'be',been:'be',said:'say',ate:'eat',brought:'bring',took:'take',got:'get',went:'go',done:'do',did:'do',does:'do',has:'have',had:'have',heard:'hear',found:'find',made:'make',came:'come',ran:'run',caught:'catch',woke:'wake',spent:'spend'};
const RULES = [[/ies$/,'y'],[/ied$/,'y'],[/iest$/,'y'],[/ier$/,'y'],[/s$/,''],[/es$/,''],[/d$/,''],[/ed$/,''],[/ing$/,''],[/ing$/,'e'],[/est$/,''],[/er$/,''],[/ly$/,'']];
function lemma(raw) {
  const w = raw.toLowerCase().replace(/’/g, "'");
  if (D[w]) return w; if (IRR[w]) return IRR[w];
  for (const [re, rep] of RULES) {
    if (!re.test(w)) continue;
    const c = w.replace(re, rep); if (c.length < 2) continue;
    if (D[c]) return c;
    if (/([b-df-hj-np-tv-z])\1$/.test(c) && D[c.slice(0, -1)]) return c.slice(0, -1);
  }
  return w;
}
const textOf = b => b.t === 'p' ? b.x : [b.title, b.sub, ...b.rows.flat(), ...b.items, b.foot].join(' ');

let problems = 0;
for (const a of articles) {
  const words = a.blocks.map(textOf).join(' ').match(/[A-Za-z]+(?:['’][A-Za-z]+)*/g) || [];
  const missing = new Set(), off = new Set();
  for (const w of words) {
    const l = lemma(w);
    if (!D[l]) missing.add(w); else if (D[l].level === 0) off.add(l);
  }
  console.log(`\n[${a.id}] ${a.title}（${a.level} 級，${words.length} 字）`);
  if (missing.size) { problems++; console.log('  ✗ 字典查不到：', [...missing].join(', ')); }
  if (off.size) console.log('  ! 超出 2000 字：', [...off].join(', '));
  a.questions.forEach((q, i) => {
    const errs = [];
    if (!Array.isArray(q.options) || q.options.length !== 4) errs.push('選項不是 4 個');
    if (!['A','B','C','D'].includes(q.answer)) errs.push('answer 要是 A–D');
    if (!q.explanation) errs.push('缺少解析');
    if (errs.length) { problems++; console.log(`  ✗ 第 ${i + 1} 題：${errs.join('、')}`); }
  });
  if (!missing.size) console.log('  ✓ 所有單字都查得到');
}
console.log(problems ? `\n共 ${problems} 個問題要修正。` : '\n全部通過。');
process.exit(problems ? 1 : 0);
