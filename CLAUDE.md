# CLAUDE.md

給 AI 助理（Claude 等）的專案說明。開始工作前請先讀 `docs/DEVLOG.md`。

## 專案

會考英閱小站：給國中生練習會考英文閱讀的純前端網頁，部署在 GitHub Pages。
使用者以繁體中文溝通，介面、解析和文件都用繁體中文。

## 規則

- 純 HTML、CSS、JS，不加建置工具或框架，除非使用者要求
- 文章與題目只改 `data/articles.json`；寫作規格見 `docs/WRITING-GUIDE.md`
- `data/dict.json`、`data/forms.json` 是產生出來的，不要手動改：修正單字改 `data-src/curated.json`，再執行 `python tools/build_dict.py`
- 新增或修改文章後，執行 `node tools/check-articles.mjs`，修到全部通過
- 單題練習在 `data/singles.json`，改完執行 `node tools/check-singles.mjs`；題目必須原創，不可抄錄會考或其他考卷
- 文章用字以教育部 2000 字為範圍；超綱字在 `data-src/curated.json` 標 `"level": 0`
- 題目：4 個選項，`answer` 填 A～D，必附中文解析並引用原文句子
- 新文章建議做「盲測」：把答案拿掉，請另一個人（或另一個 AI）只看文章作答，對照答案找出有歧義的題目
- 詞形還原：先查 `data/forms.json`，再用 `IRR`、`RULES`；後兩者同時存在於 `js/app.js`、`tools/check-articles.mjs`、`tools/lemma.mjs`，三處要一致
- 推上 GitHub 前執行 `node tools/bump-version.mjs` 更新 index.html 的 `?v=` 版本號；app.js 讀取資料檔時會帶同一個版本號，避免瀏覽器快取造成新舊檔案混用
- localStorage key 是 `kaoEng.v1`；改資料結構時要相容舊資料或換新 key
- 每次完成一項工作，在 `docs/DEVLOG.md` 的「目前狀態」、「待辦事項」、「變更紀錄」更新

## 預覽

`python -m http.server 8000` → http://localhost:8000
