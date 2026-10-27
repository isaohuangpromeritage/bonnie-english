# 會考英閱小站

給國中生準備會考英文閱讀的練習網頁：讀一篇短文 → 點單字查中文、聽發音 → 做題目看解析 → 生字本間隔複習。

純前端（HTML + CSS + JavaScript），不需要後端，可直接用 GitHub Pages 免費架設。

## 功能

- **點字查義**：點文章裡任何單字，顯示中文、詞性、字級（基本 1200／進階 2000／超綱），並自動唸出發音
- **超綱字標示**：超出 2000 字的單字加虛線，文章下方自動附註解
- **朗讀全文**：使用瀏覽器內建語音（Web Speech API）
- **題目與解析**：主旨、細節、推論、字義猜測、指涉、圖表判讀等會考題型
- **生字本**：記得的字隔 1、3、7、14、30 天再出現；忘記的字隔天重來
- 生字本與成績存在使用者自己的瀏覽器（localStorage），不會上傳

## 專案結構

```
bonnie-english/
├── index.html              頁面骨架
├── css/style.css           樣式（含深色模式）
├── js/app.js               程式邏輯
├── data/
│   ├── articles.json       文章與題目 ← 新增文章改這裡
│   └── dict.json           字典 ← 新單字加這裡
├── tools/check-articles.mjs 檢查文章用字與題目格式
└── .nojekyll               讓 GitHub Pages 直接提供檔案
```

## 部署到 GitHub Pages

1. 在 GitHub 建立新的 **Public** repository（例如 `bonnie-english`）
2. 把這個資料夾裡的所有檔案上傳到 repository 根目錄（含 `.nojekyll`）
3. 到 **Settings → Pages**，Source 選 `Deploy from a branch`，Branch 選 `main`、資料夾選 `/ (root)`，按 **Save**
4. 等 1～2 分鐘，網址會是 `https://<你的帳號>.github.io/bonnie-english/`

用 git 指令的話：

```bash
git init
git add .
git commit -m "會考英閱小站 初版"
git branch -M main
git remote add origin https://github.com/<你的帳號>/bonnie-english.git
git push -u origin main
```

## 在自己電腦預覽

因為資料放在 `data/*.json`，**直接雙擊 index.html 會讀不到資料**（瀏覽器的安全限制）。請在專案資料夾開一個本機伺服器：

```bash
python -m http.server 8000
# 然後打開 http://localhost:8000
```

或用 VS Code 的 Live Server 外掛。

## 新增一篇文章

在 `data/articles.json` 的陣列裡加一個物件：

```json
{
  "id": "my-article",
  "level": "A",
  "genre": "記敘文",
  "title": "English Title",
  "zh": "中文標題",
  "blocks": [
    { "t": "p", "x": "第一段英文……" },
    { "t": "p", "x": "第二段英文……" }
  ],
  "questions": [
    {
      "type": "主旨",
      "question": "What is the reading mainly about?",
      "options": ["選項 A", "選項 B", "選項 C", "選項 D"],
      "answer": "B",
      "explanation": "中文解析，說明答案在文中哪一句。"
    }
  ]
}
```

- `id`：英文小寫、不重複（用來記錄成績）
- `level`：`A`（基礎）或 `B`（進階）
- `blocks`：段落用 `{"t":"p","x":"…"}`；公告／圖表題用 `"t":"notice"`，格式參考 `swim` 那篇（`title`、`sub`、`rows` 表格、`items` 條列、`foot` 結尾）
- `answer`：`A`～`D`

加完後執行檢查：

```bash
node tools/check-articles.mjs
```

它會列出字典查不到的字（要補進 `dict.json`）、超出 2000 字的字，以及題目格式錯誤。

## 字典格式

`data/dict.json` 以單字原形為鍵：

```json
"carry": { "pos": "v.", "zh": "搬運、攜帶", "level": 1 }
```

`level`：`1` = 基本 1200 字、`2` = 進階 2000 字、`0` = 超出 2000 字、`null` = 人名或專有名詞。

變化形（carried、tomatoes、swimming、was…）會自動還原成原形查詢，不用另外加。不規則動詞寫在 `js/app.js` 的 `IRR` 表（`tools/check-articles.mjs` 裡也有一份，兩邊要一起改）。

> 注意：目前的字級是暫定的，正式使用前應以教育部「國民中小學英語文常用 2000 字」字表校對。

## 之後可以加的功能

- 全文中文翻譯切換
- 匯入完整 2000 字表
- PWA（加到手機主畫面、離線使用）
- 錯題本、閱讀時間統計
