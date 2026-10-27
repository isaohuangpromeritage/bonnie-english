// 更新網站版本號：把 index.html 裡 css/style.css?v=… 與 js/app.js?v=… 改成目前時間
// 每次要推上 GitHub 前執行一次，瀏覽器就會載入新版程式與資料，不會新舊混用
// 用法：node tools/bump-version.mjs
import fs from 'node:fs';
const d = new Date();
const p = n => String(n).padStart(2, '0');
const v = `${d.getFullYear()}${p(d.getMonth() + 1)}${p(d.getDate())}-${p(d.getHours())}${p(d.getMinutes())}`;
const html = fs.readFileSync('index.html', 'utf8');
const out = html.replace(/(css\/style\.css|js\/app\.js)\?v=[^"]*/g, `$1?v=${v}`);
if (out === html) { console.error('index.html 裡找不到 ?v= 版本號'); process.exit(1); }
fs.writeFileSync('index.html', out);
console.log(`版本號已更新為 ${v}`);
