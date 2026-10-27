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
│   ├── dict.json           字典（由 tools/build_dict.py 產生，不要手動改）
│   ├── forms.json          詞形變化 → 原形（同上，自動產生）
│   └── junyi.json          均一 2000 單分組（同上，自動產生）
├── data-src/
│   ├── curated.json        人工校對的單字 ← 要修正中文解釋改這裡
│   ├── moe-2000.csv        教育部 2000 字表（官方）
│   ├── wordking-2000.csv   國中單字王 2000 單字題庫表（114 年版）：詞性與中文
│   ├── junyi-groups.csv    均一「國英 2000 單」101 組的首尾字與影片 ID
│   └── moe-2000.example.csv 簡化格式範例
├── tools/
│   ├── build_dict.py       產生 dict.json、forms.json
│   └── check-articles.mjs  檢查文章用字與題目格式
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

它會列出字典查不到的字（要補進 `data-src/curated.json` 再重建字典）、超出 2000 字的字，以及題目格式錯誤。

## 字典

`data/dict.json` 與 `data/forms.json` 是用 `tools/build_dict.py` 產生的，資料來源：

| 來源 | 用途 | 優先順序 |
|---|---|---|
| `data-src/curated.json` | 人工校對過的單字（詞性、中文、字級） | 最高 |
| `data-src/moe-2000.csv` | 教育部 2000 字表：字級（基本／其他常用）、中文、主題 | 中 |
| `data-src/wordking-2000.csv` | 國中單字王 2000 單字題庫表（114 年版）：詞性、依詞性分開的中文 | 中（詞性與中文優先用這份） |
| [ECDICT](https://github.com/skywind3000/ECDICT)（MIT 授權） | 中文解釋（簡轉繁、台灣用語）與詞形變化 | 補其餘 |

字典收錄：2000 字表的字，加上字表以外約 2,400 個常用字（標為超綱，讓學生點得到）。

### 重建字典

```bash
pip install opencc-python-reimplemented
python tools/build_dict.py
```

第一次執行會自動下載 ECDICT（約 66 MB）到 `tools/.cache/`，這個資料夾不會進 git。

### 修正某個字的中文解釋

字表內的字用教育部提供的中文；字表外的字用 ECDICT，解釋有時太多或不理想。要修正任何字，在 `data-src/curated.json` 加上那個字（字級仍以官方字表為準），再重建字典：

```json
"kite": {"pos": "n.", "zh": "風箏", "level": 0}
```

`level`：`1` = 基本 1200 字、`2` = 進階 2000 字、`0` = 超出 2000 字、`null` = 人名或專有名詞。

### 教育部官方字表

`data-src/moe-2000.csv` 是教育部「國民中小學英語文參考字彙」2000 字，欄位：`#, 英文, 中文, 級別, 字母, 主題（課綱表三）`。

- `級別`：「基本」＝ level 1、「其他常用」＝ level 2
- 字表的中文解釋和主題會直接用在字典裡（主題會顯示在單字面板）
- `英文` 欄括號內的寫法會自動處理：
  - 縮寫或同義字另外收一筆，例如 `bicycle (bike)`、`television (TV)`
  - 代名詞與 be／do／have／助動詞的變化形，還原成原形，例如 him → he、was → be、might → may
- 簡化格式 `word,level` 也可以用（見 `moe-2000.example.csv`）

字表以外的字標為超綱（level 0）；字表內單字的變化形（used、swimming…）會還原成原形，不會被誤判為超綱。

### 國中單字王題庫

`data-src/wordking-2000.csv` 由「國中單字王 2000 單字題庫表（字母版，114 年版）」PDF 轉出，欄位 `no, word, pos, zh`，同一個字不同詞性各一列（例如 back 名詞「背部」、形容詞「後面的」）。

- 字典的詞性與中文優先採用這份；教育部字表有、單字王沒列的意思放在「（另：…）」
- 字級仍以教育部字表為準；單字王裡的片語（in front of、bus stop）若每個字都在字表內，取最高字級
- 單字面板會標「單字王」，表示這個字在題庫內
- 原 PDF 的 dragon-boatfestival 已更正為 Dragon Boat Festival

### 均一教育平台連結

字表內的字，單字面板會顯示它在均一「國英 2000 單」（https://www.junyiacademy.org/topics/eng-junior-2000vocab）的第幾組，並連到該組的教學影片和練習。

- 只存分組資訊（組別、首尾字、影片 ID），不複製均一的內容
- 組別是依字母範圍推算的；均一的字表（2,027 字）和教育部字表不完全相同，少數字可能不在該組影片裡
- 均一網址或分組改變時，更新 `data-src/junyi-groups.csv` 再重建字典

### 詞形還原

點到 carried、children、went 這類變化形時，程式會先查 `forms.json` 還原成原形；查不到才用 `js/app.js` 裡的 `IRR` 表與字尾規則（`tools/check-articles.mjs` 也有一份，兩邊要一致）。

## 之後可以加的功能

- 全文中文翻譯切換
- 匯入完整 2000 字表
- PWA（加到手機主畫面、離線使用）
- 錯題本、閱讀時間統計
