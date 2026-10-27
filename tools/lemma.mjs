// 共用的查字與詞形還原（與 js/app.js 相同規則）
import fs from 'node:fs';
const dict = JSON.parse(fs.readFileSync('data/dict.json', 'utf8'));
const F = fs.existsSync('data/forms.json') ? JSON.parse(fs.readFileSync('data/forms.json', 'utf8')) : {};
export const D = Object.fromEntries(Object.entries(dict).map(([k, v]) => [k.toLowerCase(), v]));
const IRR = {was:'be',were:'be',is:'be',are:'be',am:'be',been:'be',said:'say',ate:'eat',brought:'bring',took:'take',got:'get',went:'go',done:'do',did:'do',does:'do',has:'have',had:'have',heard:'hear',found:'find',made:'make',came:'come',ran:'run',caught:'catch',woke:'wake',spent:'spend'};
const RULES = [[/ily$/,'y'],[/ies$/,'y'],[/ied$/,'y'],[/iest$/,'y'],[/ier$/,'y'],[/s$/,''],[/es$/,''],[/d$/,''],[/ed$/,''],[/ing$/,''],[/ing$/,'e'],[/est$/,''],[/er$/,''],[/ly$/,'']];
const CONTR = {"can't": 'can', "cannot": 'can', "won't": 'will', "shan't": 'shall', "let's": 'let', "ain't": 'be'};
function contract(w) {
  if (CONTR[w]) return CONTR[w];
  let m = w.match(/^(.+?)n't$/); if (m) return IRR[m[1]] || m[1];
  m = w.match(/^(.+?)'(s|m|re|ll|ve|d)$/); if (m) return m[1];
  m = w.match(/^(.+?s)'$/); if (m) return m[1];
  return w;
}
export function lemma(raw) {
  let w = raw.toLowerCase().replace(/’/g, "'");
  if (D[w]) return w;
  w = contract(w);
  if (D[w]) return w; if (F[w]) return F[w]; if (IRR[w]) return IRR[w];
  for (const [re, rep] of RULES) {
    if (!re.test(w)) continue;
    const c = w.replace(re, rep); if (c.length < 2) continue;
    if (D[c]) return c;
    if (/([b-df-hj-np-tv-z])\1$/.test(c) && D[c.slice(0, -1)]) return c.slice(0, -1);
  }
  if (w.includes('-') && D[w.replace(/-/g, '')]) return w.replace(/-/g, '');
  return w;
}
export const WORD_RE = /[A-Za-z]+(?:['’-][A-Za-z]+)*/g;
