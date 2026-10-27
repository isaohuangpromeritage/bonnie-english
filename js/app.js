const ICON_SPK='<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M11 5 6 9H2v6h4l5 4V5z"/><path d="M15.5 8.5a5 5 0 0 1 0 7"/><path d="M19 5a10 10 0 0 1 0 14"/></svg>';
const ICON_STOP='<svg viewBox="0 0 24 24" fill="currentColor"><rect x="6" y="6" width="12" height="12" rx="2"/></svg>';

/* 字典與文章從 data/*.json 載入（見 init） */
let D={},F={},JY=[],EXAMS=[];  // D：字典；F：詞形變化 → 原形（data/forms.json）
const IRR={was:'be',were:'be',is:'be',are:'be',am:'be',been:'be',said:'say',ate:'eat',brought:'bring',took:'take',got:'get',went:'go',done:'do',did:'do',does:'do',has:'have',had:'have',heard:'hear',found:'find',made:'make',came:'come',ran:'run',caught:'catch',woke:'wake',spent:'spend'};
const RULES=[[/ies$/,'y'],[/ied$/,'y'],[/iest$/,'y'],[/ier$/,'y'],[/s$/,''],[/es$/,''],[/d$/,''],[/ed$/,''],[/ing$/,''],[/ing$/,'e'],[/est$/,''],[/er$/,''],[/ly$/,'']];
// 縮寫與所有格：can't → can、didn't → do、I'm → I、Tom's → tom、let's → let
const CONTR={"can't":'can',"cannot":'can',"won't":'will',"shan't":'shall',"let's":'let',"ain't":'be'};
function contract(w){
  if(CONTR[w])return CONTR[w];
  let m=w.match(/^(.+?)n't$/); if(m)return IRR[m[1]]||m[1];
  m=w.match(/^(.+?)'(s|m|re|ll|ve|d)$/); if(m)return m[1];
  m=w.match(/^(.+?s)'$/); if(m)return m[1];
  return w;
}
function lemma(raw){
  let w=raw.toLowerCase().replace(/’/g,"'");
  if(D[w])return w;
  w=contract(w); if(F[w])return F[w]; if(IRR[w])return IRR[w];
  for(const [re,rep] of RULES){
    if(!re.test(w))continue;
    const c=w.replace(re,rep); if(c.length<2)continue;
    if(D[c])return c;
    if(/([b-df-hj-np-tv-z])\1$/.test(c)&&D[c.slice(0,-1)])return c.slice(0,-1);
  }
  if(w.includes('-')&&D[w.replace(/-/g,'')])return w.replace(/-/g,'');
  return w;
}

let ARTICLES=[];

/* 儲存 */
const KEY='kaoEng.v1';
let store={vocab:{},scores:{}};
try{const s=JSON.parse(localStorage.getItem(KEY)||'null');if(s&&s.vocab)store=Object.assign(store,s);}catch(e){}
function save(){try{localStorage.setItem(KEY,JSON.stringify(store));}catch(e){}}

const DAY=86400000, STEPS=[1,3,7,14,30];
const state={view:'list',aid:null,answers:{},submitted:false,review:null,reading:false,fLevel:'',fGenre:'',fTag:''};
let NAMES=new Set();  // 目前文章的人名、地名（articles.json 的 names）
const app=document.getElementById('app');
const esc=s=>String(s).replace(/[&<>"]/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;'}[c]));

function tok(text){
  return text.split(/([A-Za-z]+(?:['’-][A-Za-z]+)*)/).map((part,i)=>{
    if(i%2===0)return esc(part);
    if(/^[A-Z]$/.test(part)&&part!=='I')return esc(part);
    if(NAMES.has(part))return `<span class="w name" data-l="${esc(part)}" data-r="${esc(part)}" data-name="1" tabindex="0">${esc(part)}</span>`;
    const l=lemma(part),e=D[l],cls=['w'];
    if(e&&e.lv===0)cls.push('off');
    if(store.vocab[l])cls.push('saved');
    return `<span class="${cls.join(' ')}" data-l="${esc(l)}" data-r="${esc(part)}" tabindex="0">${esc(part)}</span>`;
  }).join('');
}
/* 文章區塊：p 段落、h 小標題、notice 公告／圖表、chat 對話訊息、email 電子郵件 */
function blockTexts(b){
  if(b.t==='p'||b.t==='h')return [b.x];
  if(b.t==='chat')return b.lines.map(l=>l.x);
  if(b.t==='email')return [b.subject||'',...(b.body||[])];
  return [b.title,b.sub,...(b.rows||[]).slice(1).map(r=>r.join(', ')),...(b.items||[]),b.foot].filter(Boolean);
}
function plainText(a){return a.blocks.flatMap(blockTexts).join(' ');}
function wordCount(a){return (plainText(a).match(/[A-Za-z]+(?:['’-][A-Za-z]+)*/g)||[]).length;}
function offWords(a){const set=new Set();(plainText(a).match(/[A-Za-z]+(?:['’-][A-Za-z]+)*/g)||[]).forEach(w=>{const l=lemma(w);if(D[l]&&D[l].lv===0)set.add(l);});return [...set];}
function dueList(){const now=Date.now();return Object.keys(store.vocab).filter(w=>store.vocab[w].due<=now);}
function lvLabel(lv){return lv===1?'基本 1200 字':lv===2?'常用 2000 字':lv===0?'超出 2000 字':'專有名詞';}

/* 發音 */
let voice=null;
function pickVoice(){try{const vs=speechSynthesis.getVoices();voice=vs.find(v=>/en[-_]US/i.test(v.lang))||vs.find(v=>/^en/i.test(v.lang))||null;}catch(e){}}
try{pickVoice();speechSynthesis.onvoiceschanged=pickVoice;}catch(e){}
function speak(text,onend){
  try{speechSynthesis.cancel();const u=new SpeechSynthesisUtterance(text);u.lang='en-US';u.rate=.9;if(voice)u.voice=voice;if(onend)u.onend=u.onerror=onend;speechSynthesis.speak(u);}catch(e){if(onend)onend();}
}
function stopSpeak(){try{speechSynthesis.cancel();}catch(e){}state.reading=false;}

/* 畫面 */
function go(view,aid){stopSpeak();closeSheet();state.view=view;if(aid!==undefined)state.aid=aid;render();window.scrollTo(0,0);}
function render(){
  document.getElementById('tab-read').setAttribute('aria-pressed',!['vocab','exams'].includes(state.view));
  document.getElementById('tab-exams').setAttribute('aria-pressed',state.view==='exams');
  document.getElementById('tab-vocab').setAttribute('aria-pressed',state.view==='vocab');
  const n=dueList().length,b=document.getElementById('dueBadge');b.textContent=n;b.hidden=!n;
  ({list:renderList,read:renderRead,quiz:renderQuiz,vocab:renderVocab,exams:renderExams})[state.view]();
}
function levelChip(a){return `<span class="chip lv${a.level}">${a.level==='A'?'A 基礎':'B 進階'}</span>`;}

function shown(){return ARTICLES.filter(a=>(!state.fLevel||a.level===state.fLevel)&&(!state.fGenre||a.genre===state.fGenre)&&(!state.fTag||(a.tags||[]).includes(state.fTag)));}
/* 歷屆試題：只連到心測中心官方檔案，不複製試題內容 */
function renderExams(){
  const sim=ARTICLES.filter(a=>(a.tags||[]).includes('會考模擬')).length;
  const L=(u,t)=>u?`<a href="${esc(u)}" target="_blank" rel="noopener">${t} ↗</a>`:'';
  app.innerHTML=`
  <div class="sec-title"><h2>會考英語歷屆試題</h2></div>
  <p class="intro">以下連到國立臺灣師範大學心理與教育測驗研究發展中心（心測中心）公布的官方檔案，試題著作權屬於心測中心。英語閱讀測驗作答時間 60 分鐘，建議印出題本、計時作答，再對照參考答案。</p>
  ${sim?`<div class="due-banner"><span>想先暖身？本站有 <b>${sim}</b> 篇仿照會考題型的原創練習。</span><button class="btn primary" data-act="go-sim">做會考模擬題</button></div>`:''}
  <div class="vlist exams">${EXAMS.map(e=>`
    <div class="exam-row"><b>${e.year} 年</b>
      <div class="exam-links">${L(e.reading,'閱讀題本')}${L(e.listening,'聽力題本')}${L(e.answers,'參考答案')}${L(e.analysis,'試題分析')}${L(e.page,'該年完整資料')}</div></div>`).join('')}</div>
  <p class="intro" style="margin-top:12px;font-size:13px">資料來源：<a href="https://cap.rcpet.edu.tw/examination.html" target="_blank" rel="noopener">國中教育會考－歷屆試題</a>。少數年份的題本連結名稱不同，請從「該年完整資料」進入。</p>`;
}
function renderList(){
  const n=dueList().length;
  app.innerHTML=`
  ${n?`<div class="due-banner"><span>今天有 <b>${n}</b> 個生字該複習了</span><button class="btn primary" data-act="go-vocab">去複習</button></div>`:''}
  <p class="intro">挑一篇讀讀看。讀的時候點任何單字就能看中文、聽發音，讀完再做題目。</p>
  <div class="filters">
    <div class="seg">${[['','全部'],['A','A 基礎'],['B','B 進階']].map(([v,t])=>`<button data-flevel="${v}" aria-pressed="${state.fLevel===v}">${t}</button>`).join('')}</div>
    <select id="fGenre" aria-label="文體"><option value="">所有文體</option>${[...new Set(ARTICLES.map(a=>a.genre))].map(g=>`<option ${state.fGenre===g?'selected':''}>${g}</option>`).join('')}</select>
    ${(()=>{const tags=[...new Set(ARTICLES.flatMap(a=>a.tags||[]))];return tags.length?`<select id="fTag" aria-label="專題"><option value="">所有專題</option>${tags.map(t=>`<option ${state.fTag===t?'selected':''}>${esc(t)}</option>`).join('')}</select>`:'';})()}
    <span class="count">${shown().length} 篇</span>
  </div>
  <div class="list">${shown().map(a=>{const s=store.scores[a.id];const wc=wordCount(a);return `
    <button class="card" data-open="${a.id}">
      <div class="chips">${levelChip(a)}<span class="chip">${a.genre}</span>${a.topic?`<span class="chip">${esc(a.topic)}</span>`:''}${(a.tags||[]).map(t=>`<span class="chip tag">${esc(t)}</span>`).join('')}</div>
      <h3>${esc(a.title)}</h3><div class="zh">${a.zh}</div>
      <div class="meta"><span>約 ${wc} 字・${a.questions.length} 題・約 ${Math.max(2,Math.round(wc/70))} 分鐘</span>
      <span class="score ${s!=null?'done':''}">${s!=null?`最佳 ${s} / ${a.questions.length}`:'尚未作答'}</span></div>
    </button>`;}).join('')}</div>`;
}

function renderBlocks(a){
  NAMES=new Set(a.names||[]);
  return a.blocks.map(b=>{
    if(b.t==='p')return `<p>${tok(b.x)}</p>`;
    if(b.t==='h')return `<h4 class="bh">${tok(b.x)}</h4>`;
    if(b.t==='chat')return `<div class="chat">${b.lines.map(l=>`<div class="msg${l.me?' me':''}"><b>${esc(l.who)}</b><span>${tok(l.x)}</span></div>`).join('')}</div>`;
    if(b.t==='email')return `<div class="email"><div class="ehead"><div><i>From</i>${esc(b.from||'')}</div><div><i>To</i>${esc(b.to||'')}</div><div><i>Subject</i>${tok(b.subject||'')}</div></div>
      ${(b.body||[]).map(x=>`<p>${tok(x)}</p>`).join('')}</div>`;
    return `<div class="notice">${b.title?`<h4>${tok(b.title)}</h4>`:''}${b.sub?`<div class="sub">${tok(b.sub)}</div>`:''}
      ${b.rows?`<div class="tscroll"><table><thead><tr>${b.rows[0].map(c=>`<th>${tok(c)}</th>`).join('')}</tr></thead>
      <tbody>${b.rows.slice(1).map(r=>`<tr>${r.map(c=>`<td>${tok(c)}</td>`).join('')}</tr>`).join('')}</tbody></table></div>`:''}
      ${b.items?`<ul>${b.items.map(i=>`<li>${tok(i)}</li>`).join('')}</ul>`:''}${b.foot?`<div>${tok(b.foot)}</div>`:''}</div>`;
  }).join('');
}
function renderRead(){
  const a=ARTICLES.find(x=>x.id===state.aid),offs=offWords(a);
  app.innerHTML=`
  <button class="back" data-act="home">← 文章列表</button>
  <div class="read-head"><div class="chips">${levelChip(a)}<span class="chip">${a.genre}</span><span class="chip">約 ${wordCount(a)} 字</span></div>
    <h2>${esc(a.title)}</h2></div>
  <div class="toolbar">
    <button class="btn" id="readAll">${state.reading?ICON_STOP+'停止朗讀':ICON_SPK+'朗讀全文'}</button>
    <button class="btn primary" data-act="quiz">開始作答</button>
  </div>
  <article class="paper" id="paper">${renderBlocks(a)}</article>
  <div class="hint"><span>點單字查中文</span><i><span class="legend-saved">畫線</span>＝已在生字本</i><i><span class="legend-off">虛線</span>＝超出 2000 字</i></div>
  ${offs.length?`<section class="notes"><h3>超綱字註解</h3>${offs.map(w=>`<div><b>${w}</b><span>${D[w].p} ${D[w].z}</span></div>`).join('')}</section>`:''}
  <button class="btn primary wide" data-act="quiz">讀完了，開始作答（${a.questions.length} 題）</button>`;
  document.getElementById('readAll').onclick=()=>{
    if(state.reading){stopSpeak();renderRead();return;}
    state.reading=true;renderRead();speak(plainText(a),()=>{state.reading=false;if(state.view==='read')renderRead();});
  };
}

function renderQuiz(){
  const a=ARTICLES.find(x=>x.id===state.aid),qs=a.questions,ans=state.answers,sub=state.submitted;
  const correct=qs.filter((q,i)=>ans[i]===q.a).length,left=qs.length-Object.keys(ans).length;
  app.innerHTML=`
  <button class="back" data-act="read">← 回到文章</button>
  <div class="read-head"><div class="chips">${levelChip(a)}<span class="chip">${a.genre}</span></div><h2>${esc(a.title)}</h2></div>
  ${sub?`<div class="result"><div><div class="big">${correct} / ${qs.length}</div><div style="color:var(--muted);margin-top:4px">${correct===qs.length?'全對！這篇你完全讀懂了。':correct>=qs.length/2?'不錯，看一下錯的題目解析。':'回文章再讀一次，對照解析找答案的位置。'}</div></div>
    <div class="chips"><button class="btn" data-act="retry">重做</button><button class="btn primary" data-act="home">換一篇</button></div></div>`:''}
  ${qs.map((q,i)=>{
    const pick=ans[i];
    return `<div class="qcard"><div class="qtop"><span class="qnum">${i+1}.</span><span class="chip">${q.type}</span></div>
    <div class="qtext">${esc(q.q)}</div>
    <div class="opts">${q.opts.map((o,j)=>{
      let cls='opt';if(sub){if(j===q.a)cls+=' right';else if(j===pick)cls+=' wrong';}
      return `<button class="${cls}" data-q="${i}" data-o="${j}" aria-pressed="${pick===j}" ${sub?'disabled':''}><span class="k">${'ABCD'[j]}</span><span>${esc(o)}</span></button>`;}).join('')}</div>
    ${sub?`<div class="ex ${pick===q.a?'ok':'no'}"><b>${pick===q.a?'答對了':'正確答案是 '+'ABCD'[q.a]}</b>${esc(q.ex)}</div>`:''}
    </div>`;}).join('')}
  ${sub?'':`<button class="btn primary wide" data-act="submit" ${left?'disabled style="opacity:.5;cursor:not-allowed"':''}>送出答案</button>
  ${left?`<div class="pending">還有 ${left} 題沒作答</div>`:''}`}`;
}

function fmtDue(t){const d=Math.ceil((t-Date.now())/DAY);return d<=0?'今天複習':d===1?'明天複習':`${d} 天後複習`;}
function renderVocab(){
  if(state.review)return renderReview();
  const words=Object.keys(store.vocab).sort((a,b)=>store.vocab[a].due-store.vocab[b].due),due=dueList();
  app.innerHTML=`
  <div class="sec-title"><h2>生字本（${words.length}）</h2>${due.length?`<button class="btn primary" data-act="review">開始複習 ${due.length} 個</button>`:''}</div>
  ${words.length?`<div class="vlist">${words.map(w=>{const e=D[w]||{p:'',z:''},v=store.vocab[w],now=v.due<=Date.now();return `
    <div class="vrow"><div style="min-width:0"><b>${esc(w)}</b> <span class="pos">${e.p}</span><div class="d">${e.z}</div></div>
    <span class="due ${now?'now':''}">${fmtDue(v.due)}</span><button class="x" data-del="${esc(w)}" aria-label="從生字本移除 ${esc(w)}">×</button></div>`;}).join('')}</div>
    <p class="intro" style="margin-top:12px;font-size:13px">記得的字會在 1、3、7、14、30 天後再出現；忘記的字隔天重來。</p>`
  :`<div class="empty">生字本還是空的。<br>在文章裡點單字，按「加入生字本」就會出現在這裡。<div style="margin-top:14px"><button class="btn primary" data-act="home">去讀文章</button></div></div>`}`;
}
function renderReview(){
  const r=state.review;
  if(r.i>=r.list.length){
    app.innerHTML=`<div class="flash"><div class="big">${r.ok} / ${r.list.length}</div><div>這輪複習完成了</div><button class="btn primary" data-act="end-review">回生字本</button></div>`;return;
  }
  const w=r.list[r.i],e=D[w]||{p:'',z:''};
  app.innerHTML=`<button class="back" data-act="end-review">← 結束複習</button>
  <div class="flash"><div class="count">${r.i+1} / ${r.list.length}</div><div class="hw">${esc(w)}</div>
    <button class="iconbtn" data-say="${esc(w)}" aria-label="播放發音">${ICON_SPK}</button>
    ${r.show?`<div class="zhdef"><span class="pos">${e.p}</span>${e.z}</div>
      <div class="flash-actions"><button class="btn forgot" data-grade="0">忘記了</button><button class="btn know" data-grade="1">記得</button></div>`
    :`<div style="color:var(--muted)">先想想看它的意思</div><button class="btn primary" data-act="flip">看答案</button>`}
  </div>`;
  if(!r.show)speak(w);
}

/* 單字面板 */
const sheet=document.getElementById('sheet'),sheetIn=document.getElementById('sheetIn');
let cur=null;
function openSheet(l,r,el,isName){
  document.querySelectorAll('.w.on').forEach(x=>x.classList.remove('on'));
  if(el)el.classList.add('on');
  let e=D[l];
  if(isName){const d=D[lemma(r)];e={p:'',z:'專有名詞（人名、地名或作品名）'+(d?`；單字本身的意思：${d.z}`:''),lv:null};}
  cur=l;const saved=!!store.vocab[l];
  sheetIn.innerHTML=`
   <div class="sheet-row"><div><div class="hw">${esc(l)}</div>${r.toLowerCase()!==l?`<div class="form">文中：${esc(r)}</div>`:''}</div>
     <div class="chips"><button class="iconbtn" data-say="${esc(r)}" aria-label="播放發音">${ICON_SPK}</button><button class="iconbtn" data-act="close" aria-label="關閉">✕</button></div></div>
   ${e?`<div class="zhdef"><span class="pos">${e.p}</span>${e.z}</div><div><span class="lvtag l${e.lv==null?'n':e.lv}">${lvLabel(e.lv)}</span>${e.t?` <span class="lvtag topic">${esc(e.t)}</span>`:''}${e.wk?` <span class="lvtag topic">單字王</span>`:''}</div>`
      :`<div class="zhdef" style="color:var(--muted)">這個字還沒收進字典。</div>`}
   ${junyiLinks(e)}
   <a class="more" href="https://dictionary.cambridge.org/dictionary/english-chinese-traditional/${encodeURIComponent(l)}" target="_blank" rel="noopener">到劍橋英漢字典看更多解釋與例句 ↗</a>
   <div class="sheet-actions">${e&&e.lv!==null?`<button class="btn ${saved?'':'primary'}" data-act="toggle-save">${saved?'已在生字本（點此移除）':'加入生字本'}</button>`:''}</div>`;
  sheet.hidden=false;speak(r);
}
function junyiLinks(e){
  const g=e&&e.jy&&JY.find(x=>x.g===e.jy); if(!g)return '';
  return `<div class="jy"><span>均一 2000 單 第 ${g.g} 組（${esc(g.first)}–${esc(g.last)}）</span>
    <a href="https://www.junyiacademy.org/video/${encodeURIComponent(g.v)}?parent-topic-id=eng-junior-2000vocab" target="_blank" rel="noopener">看教學影片 ↗</a>
    <a href="https://www.junyiacademy.org/sequential-quiz/eng-junior2000g${g.g}?parent-topic-id=eng-junior-2000vocab" target="_blank" rel="noopener">做練習 ↗</a></div>`;
}
function closeSheet(){sheet.hidden=true;cur=null;document.querySelectorAll('.w.on').forEach(x=>x.classList.remove('on'));}
function refreshMarks(){document.querySelectorAll('.w').forEach(x=>x.classList.toggle('saved',!!store.vocab[x.dataset.l]));}

/* 事件 */
document.addEventListener('click',ev=>{
  const t=ev.target.closest('[data-act],[data-open],[data-q],[data-del],[data-say],[data-grade],[data-flevel],.w');
  if(!t){if(!sheet.hidden&&!ev.target.closest('#sheet'))closeSheet();return;}
  if(t.classList.contains('w')){openSheet(t.dataset.l,t.dataset.r,t,!!t.dataset.name);return;}
  if(t.dataset.flevel!==undefined){state.fLevel=t.dataset.flevel;renderList();return;}
  if(t.dataset.open){state.answers={};state.submitted=false;go('read',t.dataset.open);return;}
  if(t.dataset.say){speak(t.dataset.say);return;}
  if(t.dataset.q!==undefined){state.answers[+t.dataset.q]=+t.dataset.o;renderQuiz();return;}
  if(t.dataset.del){delete store.vocab[t.dataset.del];save();render();return;}
  if(t.dataset.grade!==undefined){
    const r=state.review,w=r.list[r.i],v=store.vocab[w];
    if(+t.dataset.grade){v.stage=Math.min(v.stage+1,STEPS.length);v.due=Date.now()+STEPS[v.stage-1]*DAY;r.ok++;}
    else{v.stage=0;v.due=Date.now()+DAY;}
    save();r.i++;r.show=false;render();return;
  }
  const act=t.dataset.act;
  if(act==='home')go('list');
  else if(act==='go-vocab')go('vocab');
  else if(act==='go-sim'){state.fTag='會考模擬';state.fLevel='';state.fGenre='';go('list');}
  else if(act==='read')go('read');
  else if(act==='quiz'){state.submitted=false;go('quiz');}
  else if(act==='submit'){const a=ARTICLES.find(x=>x.id===state.aid);if(Object.keys(state.answers).length<a.questions.length)return;state.submitted=true;
    const c=a.questions.filter((q,i)=>state.answers[i]===q.a).length;store.scores[a.id]=Math.max(store.scores[a.id]??0,c);save();renderQuiz();window.scrollTo(0,0);}
  else if(act==='retry'){state.answers={};state.submitted=false;renderQuiz();window.scrollTo(0,0);}
  else if(act==='close')closeSheet();
  else if(act==='toggle-save'){if(store.vocab[cur])delete store.vocab[cur];else store.vocab[cur]={added:Date.now(),stage:0,due:Date.now()};save();refreshMarks();
    const el=document.querySelector('.w.on');openSheet(cur,el?el.dataset.r:cur,el);render2badge();}
  else if(act==='review'){state.review={list:dueList(),i:0,show:false,ok:0};render();}
  else if(act==='flip'){state.review.show=true;render();}
  else if(act==='end-review'){state.review=null;render();}
});
function render2badge(){const n=dueList().length,b=document.getElementById('dueBadge');b.textContent=n;b.hidden=!n;}
document.addEventListener('keydown',ev=>{
  if(ev.key==='Escape'&&!sheet.hidden)closeSheet();
  if((ev.key==='Enter'||ev.key===' ')&&ev.target.classList&&ev.target.classList.contains('w')){ev.preventDefault();openSheet(ev.target.dataset.l,ev.target.dataset.r,ev.target);}
});
document.addEventListener('change',ev=>{if(ev.target.id==='fGenre'){state.fGenre=ev.target.value;renderList();}if(ev.target.id==='fTag'){state.fTag=ev.target.value;renderList();}});
document.getElementById('tab-read').onclick=()=>{state.review=null;go('list');};
document.getElementById('tab-vocab').onclick=()=>{state.review=null;go('vocab');};
document.getElementById('tab-exams').onclick=()=>go('exams');
// 版本號：index.html 用 app.js?v=版本 載入；資料檔也帶同一個版本號，確保程式和資料一定是同一版
const VERSION=(document.currentScript&&new URL(document.currentScript.src).searchParams.get('v'))||'dev';
async function loadJSON(p){const r=await fetch(p+'?v='+VERSION,VERSION==='dev'?{cache:'no-cache'}:{});if(!r.ok)throw new Error(p+' '+r.status);return r.json();}
async function init(){
  try{
    const [dict,arts,forms,jy,exams]=await Promise.all([loadJSON('data/dict.json'),loadJSON('data/articles.json'),loadJSON('data/forms.json').catch(()=>({})),loadJSON('data/junyi.json').catch(()=>[]),loadJSON('data/exams.json').catch(()=>[])]);
    F=forms;JY=jy;EXAMS=exams;
    D={};for(const [w,e] of Object.entries(dict))D[w.toLowerCase()]={p:e.pos,z:e.zh,lv:e.level,t:e.topic||'',jy:e.jy,wk:!!e.wk};
    ARTICLES=arts.map(a=>({...a,questions:a.questions.map(q=>({type:q.type,q:q.question,opts:q.options,a:'ABCD'.indexOf(q.answer),ex:q.explanation}))}));
    render();
  }catch(err){
    console.error(err);
    app.innerHTML=location.protocol==='file:'
      ?'<div class="empty">資料載入失敗。<br>直接雙擊開啟 index.html 時，瀏覽器會擋住讀取 data 資料夾，請改用本機伺服器開啟（見 README）。</div>'
      :`<div class="empty">資料載入失敗，可能是網站剛更新、瀏覽器還留著舊版檔案。<br>請按 <b>Ctrl+F5</b>（Mac：<b>Cmd+Shift+R</b>）強制重新整理。<div style="margin-top:10px;font-size:12px">${esc(String(err&&err.message||err))}</div></div>`;
  }
}
init();
