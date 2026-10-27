"""
產生 data/dict.json（字典）與 data/forms.json（詞形變化 → 原形）

資料來源（優先順序由高到低）：
  1. data-src/curated.json   人工校對過的字：詞性、中文、字級都以這裡為準
  2. data-src/moe-2000.csv   教育部「國民中小學英語文參考字彙」2000 字
                             官方格式欄位：英文, 中文, 級別（基本／其他常用）, 主題（課綱表三）
                             也接受簡化格式：word,level（1=基本、2=其他常用）
                             這個檔案不存在時，暫用 ECDICT 的國中字彙標籤（zk）加詞頻排序估計字級
  2b. data-src/wordking-2000.csv  國中單字王 2000 單字題庫表（114 年版）：提供詞性與依詞性分開的中文字義
                             （欄位：no, word, pos, zh；同一字不同詞性各一列）
  3. ECDICT（MIT 授權，https://github.com/skywind3000/ECDICT）提供中文解釋與詞形變化
     第一次執行會自動下載到 tools/.cache/ecdict.csv（約 66 MB，不進 git）

需要：Python 3.8+、pip install opencc-python-reimplemented
用法：在專案根目錄執行  python tools/build_dict.py
"""
import csv
import json
import os
import re
import sys
import urllib.request
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
CACHE = ROOT / "tools" / ".cache"
ECDICT_CSV = CACHE / "ecdict.csv"
ECDICT_URL = "https://raw.githubusercontent.com/skywind3000/ECDICT/master/ecdict.csv"
CURATED = ROOT / "data-src" / "curated.json"
MOE = ROOT / "data-src" / "moe-2000.csv"
EXTRA = ROOT / "data-src" / "extra-words.txt"   # 想額外收錄的超綱字，一行一個（會標成 level 0）
OUT_DICT = ROOT / "data" / "dict.json"
OUT_FORMS = ROOT / "data" / "forms.json"
WORDKING = ROOT / "data-src" / "wordking-2000.csv"
JUNYI = ROOT / "data-src" / "junyi-groups.csv"   # 均一「國英 2000 單」分組（只存連結用的分組資訊）
OUT_JUNYI = ROOT / "data" / "junyi.json"

MAX_POS = 3        # 每個字最多保留幾種詞性
MAX_SENSES = 3     # 每種詞性最多保留幾個意思
BASIC_COUNT = 1200 # 沒有官方字表時，詞頻前幾名估為基本字
LOOKUP_TOP = 6000  # 字表以外、詞頻前幾名的常用字也收進字典（標為超綱 level 0），讓學生點得到

try:
    from opencc import OpenCC
except ImportError:
    sys.exit("缺少 opencc：請先執行  pip install opencc-python-reimplemented")
s2t = OpenCC("s2twp")  # 簡體 → 台灣正體，並轉換台灣用詞


def load_ecdict():
    if not ECDICT_CSV.exists():
        CACHE.mkdir(parents=True, exist_ok=True)
        print("下載 ECDICT（約 66 MB）…")
        urllib.request.urlretrieve(ECDICT_URL, ECDICT_CSV)
    rows = {}
    with open(ECDICT_CSV, encoding="utf-8") as f:
        for r in csv.DictReader(f):
            w = r["word"].strip()
            if w and w.lower() not in rows:
                rows[w.lower()] = r
    return rows


POS_NORMAL = {"vt.": "v.", "vi.": "v.", "a.": "adj.", "ad.": "adv.", "interj.": "int.", "abbr.": "abbr."}


def clean_translation(text):
    """把 ECDICT 的中文解釋精簡成：詞性、前幾個常用意思（繁體）。"""
    lines = re.split(r"\\n|\n", text or "")
    groups = []  # [(pos, [senses])]
    for line in lines:
        line = line.strip()
        if not line or line.startswith("["):      # [網絡]、[醫] 等專業或網路釋義不要
            continue
        m = re.match(r"^([a-z]+\.)\s*(.*)$", line)
        pos, body = (POS_NORMAL.get(m.group(1), m.group(1)), m.group(2)) if m else ("", line)
        senses = []
        for s in re.split(r"[；;,，]", body):
            s = re.sub(r"[（(][^）)]{7,}[）)]", "", s).strip(" ，,")   # 去掉太長的括號說明
            if s and s not in senses and len(s) <= 12:
                senses.append(s)
        if not senses:
            continue
        for g in groups:
            if g[0] == pos:
                g[1].extend(x for x in senses if x not in g[1])
                break
        else:
            groups.append((pos, senses))
    groups = groups[:MAX_POS]
    if not groups:
        return "", ""
    parts = []
    for i, (pos, senses) in enumerate(groups):
        zh = "、".join(senses[:MAX_SENSES])
        parts.append(zh if i == 0 else f"{pos} {zh}".strip())
    pos_all = "/".join(p for p, _ in groups if p)
    return pos_all, s2t.convert("；".join(parts))


# 官方字表括號內是「變化形」而不是同義字的主詞（其餘括號內容視為同義或縮寫，另外收成字典條目）
INFLECTED_HEADS = {"be", "do", "have", "he", "i", "it", "she", "they", "we", "you", "may", "will"}
TOPIC_POS = {"其他動詞": "v.", "其他名詞": "n.", "其他形容詞": "adj.", "其他副詞": "adv.", "介系詞": "prep.",
             "代名詞": "pron.", "連接詞": "conj.", "感嘆詞": "int.", "冠詞與限定詞": "det.", "數字": "num.",
             "Be 動詞與助動詞": "aux.", "疑問詞": "wh-"}
MOE_FORMS = {}


def norm_key(w):
    w = w.strip().lower()
    if re.fullmatch(r"(mr|mrs|ms|dr)\.", w):   # Mr. → mr（文章斷字後不含句點）
        w = w[:-1]
    return w


def read_moe(path):
    """讀教育部字表，回傳 {單字: {level, zh, topic, pos}}；括號內的縮寫／同義字也各收一筆。"""
    result = {}
    with open(path, encoding="utf-8-sig") as f:
        rows = list(csv.DictReader(f))
    for r in rows:
        if "英文" in r:
            raw, zh, topic = r["英文"], (r.get("中文") or "").strip(), (r.get("主題（課綱表三）") or "").strip()
            level = 1 if r["級別"].strip() == "基本" else 2
        else:
            raw, zh, topic, level = r["word"], "", "", int(r["level"])
        m = re.match(r"^(.*?)\s*\((.*)\)\s*$", raw.strip())
        head, inner = (m.group(1), m.group(2)) if m else (raw.strip(), "")
        heads = [norm_key(h) for h in head.split("/") if h.strip()]
        variants = [norm_key(v) for v in re.split(r"[,/]", inner) if v.strip() and v.strip() != "s"]
        pos = "/".join(dict.fromkeys(TOPIC_POS[t] for t in re.split(r"、", topic) if t in TOPIC_POS))
        entry = {"level": level, "zh": zh, "topic": topic, "pos": pos}
        for h in heads:
            result[h] = dict(entry)
        if heads and heads[0] in INFLECTED_HEADS:
            for v in variants:
                MOE_FORMS.setdefault(v, heads[0])
        else:
            for v in variants:
                result.setdefault(v, dict(entry))
    return result


WK_POS = {"名詞": "n.", "動詞": "v.", "形容詞": "adj.", "副詞": "adv.", "介系詞": "prep.", "代名詞": "pron.",
          "限定詞": "det.", "連接詞": "conj.", "疑問詞": "wh-", "所有格": "poss.", "代名詞(主格)": "pron.",
          "代名詞(受格)": "pron.", "代名詞(主/受格)": "pron.", "副詞/連接詞": "adv./conj."}


def read_wordking(path):
    """讀單字王題庫，回傳 {單字: (pos, zh)}；同一字的多個詞性合併成「中文；adj. 中文」的格式。"""
    groups = {}
    with open(path, encoding="utf-8-sig") as f:
        for r in csv.DictReader(f):
            w = norm_key(r["word"].replace("’", "'"))
            pos = WK_POS.get(r["pos"].strip(), r["pos"].strip())
            senses = [x.strip() for x in re.split(r"[；;]", r["zh"]) if x.strip()]
            g = groups.setdefault(w, [])
            for gp in g:
                if gp[0] == pos:
                    gp[1].extend(x for x in senses if x not in gp[1])
                    break
            else:
                g.append((pos, senses))
    result = {}
    for w, g in groups.items():
        parts, seen = [], set()
        for i, (p, sn) in enumerate(g):
            if i and set(sn) <= seen:          # 不同詞性但中文一樣（any：限定詞／代名詞都是「任何」）只列一次
                continue
            parts.append("；".join(sn) if i == 0 else f"{p} {'；'.join(sn)}")
            seen.update(sn)
        result[w] = ("/".join(dict.fromkeys(p for p, _ in g)), "；".join(parts))
    return result


def rank(r):
    vals = [int(r[k]) for k in ("frq", "bnc") if r.get(k, "0").isdigit() and int(r[k]) > 0]
    return min(vals) if vals else 10**9


def main():
    ec = load_ecdict()
    curated = json.loads(CURATED.read_text(encoding="utf-8")) if CURATED.exists() else {}

    # 1) 決定字表與字級
    levels, moe = {}, {}
    if MOE.exists():
        source = "教育部 2000 字表"
        moe = read_moe(MOE)
        for w, e in moe.items():
            levels[w] = e["level"]
    else:
        source = "暫用 ECDICT 國中字彙（zk）＋詞頻估計"
        zk = sorted((w for w, r in ec.items() if "zk" in (r["tag"] or "").split() and re.fullmatch(r"[a-z]+", w)),
                    key=lambda w: rank(ec[w]))
        for i, w in enumerate(zk):
            levels[w] = 1 if i < BASIC_COUNT else 2
    # 字表以外的常用字：收進字典方便查詢，標為超綱
    common = sorted((w for w, r in ec.items() if re.fullmatch(r"[a-z]+", w) and rank(r) <= LOOKUP_TOP
                     and ("gk" in (r["tag"] or "").split() or "cet4" in (r["tag"] or "").split())), key=lambda w: rank(ec[w]))
    wk = read_wordking(WORDKING) if WORDKING.exists() else {}
    base_of = {}                                   # 字表內單字的變化形 → 原形（shoes → shoe）
    for w0 in list(levels):
        for item in ((ec.get(w0) or {}).get("exchange") or "").split("/"):
            if ":" in item and item[0] in "pdi3rts":
                base_of.setdefault(item.split(":", 1)[1].strip().lower(), w0)
    for w in wk:
        if w not in levels and w in base_of:
            levels[w] = levels[base_of[w]]
            continue                                   # 單字王有、教育部字表沒有的字：變化形用原形字級，其餘標超綱
        if w not in levels:
            parts = re.split(r"[ -]", w)
            if len(parts) > 1 and all(levels.get(x) for x in parts):   # 片語：每個字都在字表內，取最高字級
                levels[w] = max(levels[x] for x in parts)
            else:
                levels[w] = levels.get(MOE_FORMS.get(w), 0)

    # 字表內單字的變化形（used、swimming、him…）不另外收成超綱字，讓它還原成字表內的原形
    list_forms = set(MOE_FORMS)
    for w in list(levels):
        r = ec.get(w)
        for item in ((r or {}).get("exchange") or "").split("/"):
            if ":" in item and item[0] in "pdi3rts":
                list_forms.add(item.split(":", 1)[1].strip().lower())
    for w in common:
        if w in list_forms:
            continue
        # 字表內單字加 -ly 的副詞（deep → deeply、happy → happily）不另外收，讓它還原成字表內的原形
        if w.endswith("ly") and (levels.get(w[:-2]) or levels.get(w[:-3] + "y") or levels.get(w[:-2] + "e")):
            continue
        levels.setdefault(w, 0)
    if EXTRA.exists():
        for w in EXTRA.read_text(encoding="utf-8").split():
            levels.setdefault(w.lower(), 0)

    # 2) 組字典
    out, missing, forms_extra = {}, [], {}
    moe_forms = MOE_FORMS
    for w, lv in levels.items():
        if w in moe or w in wk:            # 官方字表：字級與主題；單字王：詞性與分詞性的中文
            m = moe.get(w, {})
            pos, zh = wk.get(w, (m.get("pos", ""), m.get("zh", "")))
            if w in wk and m.get("zh"):        # 教育部字表的意思單字王沒列時補上（well：身體健康的（另：好地））
                have = [x.strip() for x in re.split(r"[、；]|[a-z./-]+\.\s", zh) if x.strip()]
                core = lambda x: re.sub(r"[的地()（）…]", "", x)
                extra = [x for x in re.split(r"[、；]", m["zh"]) if x.strip()
                         and not any(core(x) in core(h) or core(h) in core(x) for h in have)]
                if extra:
                    zh += f"（另：{'、'.join(extra)}）"
            out[w] = {"pos": pos, "zh": zh, "level": lv}
            if m.get("topic"):
                out[w]["topic"] = m["topic"]
            if w in wk:
                out[w]["wk"] = 1
            continue
        r = ec.get(w)
        pos, zh = clean_translation(r["translation"]) if r else ("", "")
        if not zh:
            missing.append(w)
            continue
        out[w] = {"pos": pos, "zh": zh, "level": lv}
    for w, e in curated.items():          # 人工校對的字優先（字級仍以官方字表為準）
        w = w.lower()
        lv = levels[w] if (w in moe or w in wk) else e.get("level")
        entry = {"pos": e.get("pos") or out.get(w, {}).get("pos", ""), "zh": e["zh"], "level": lv}
        for k in ("topic", "wk"):
            if out.get(w, {}).get(k):
                entry[k] = out[w][k]
        out[w] = entry
    for form, base in moe_forms.items():  # 官方字表括號裡的變化形（him → he、was → be）
        if form not in out:
            forms_extra[form] = base

    # 3) 詞形變化表（carried → carry、children → child…）
    forms = dict(forms_extra)
    for w in sorted(out, key=lambda x: rank(ec[x]) if x in ec else 10**9):
        r = ec.get(w)
        if not r or not r["exchange"]:
            continue
        for item in r["exchange"].split("/"):
            if ":" not in item:
                continue
            t, form = item.split(":", 1)
            form = form.strip().lower()
            if t in "pdi3rts" and form and form != w and form not in out and form not in forms:
                forms[form] = w

    # 4) 均一「國英 2000 單」分組：依字母範圍標出字表內每個字在第幾組，單字面板會連到該組影片與練習
    if JUNYI.exists():
        import bisect
        key = lambda w: re.sub(r"[^a-z]", "", w.lower())
        with open(JUNYI, encoding="utf-8-sig") as f:
            groups = [{"g": int(r["group"]), "range": r["range"], "first": r["first"], "last": r["last"], "v": r["video_id"]}
                      for r in csv.DictReader(f)]
        firsts = [key(g["first"]) for g in groups]
        assert firsts == sorted(firsts), "junyi-groups.csv 的首字沒有依字母排序"
        for w, e in out.items():
            if e["level"] in (1, 2):
                e["jy"] = groups[max(0, bisect.bisect_right(firsts, key(w)) - 1)]["g"]
        OUT_JUNYI.write_text("[\n" + ",\n".join(json.dumps(g, ensure_ascii=False) for g in groups) + "\n]\n", encoding="utf-8")

    def dump(obj, path):
        lines = [f"  {json.dumps(k, ensure_ascii=False)}: {json.dumps(v, ensure_ascii=False)}" for k, v in sorted(obj.items())]
        path.write_text("{\n" + ",\n".join(lines) + "\n}\n", encoding="utf-8")

    dump(out, OUT_DICT)
    dump(forms, OUT_FORMS)
    by = {k: sum(1 for e in out.values() if e["level"] == k) for k in (1, 2, 0, None)}
    if wk:
        print(f"單字王題庫：{len(wk)} 字（{sum(1 for e in out.values() if e.get('wk'))} 字已併入），其中不在教育部字表 {sum(1 for w in wk if w not in moe)} 字")
    if moe:
        print(f"官方字表：{len(moe)} 筆（含括號內的縮寫與同義字），變化形 {len(MOE_FORMS)} 個")
    print(f"字表來源：{source}")
    print(f"dict.json：{len(out)} 字（基本 {by[1]}、進階 {by[2]}、超綱 {by[0]}、專有名詞 {by[None]}），{OUT_DICT.stat().st_size // 1024} KB")
    print(f"forms.json：{len(forms)} 個變化形，{OUT_FORMS.stat().st_size // 1024} KB")
    if JUNYI.exists():
        print(f"junyi.json：{len(groups)} 組，字典中 {sum(1 for e in out.values() if 'jy' in e)} 字已對應均一分組")
    if missing:
        print(f"ECDICT 查不到中文、未收錄的字（{len(missing)}）：{', '.join(missing[:50])}")


if __name__ == "__main__":
    main()
