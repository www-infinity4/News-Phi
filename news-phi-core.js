/* ---- news-wallet-bridge.js ---- */
(function(){
'use strict';
const GUEST_KEY='starquest_guest_profile_v1',SESSION_KEY='starquest_session',USERS_KEY='starquest_users',DUPLICATE_WINDOW_MS=5000;const read=(k,f)=>{try{return JSON.parse(localStorage.getItem(k))??f}catch{return f}},write=(k,v)=>{try{localStorage.setItem(k,JSON.stringify(v));return true}catch{return false}};
function walletStore(){const s=read(SESSION_KEY,null),u=read(USERS_KEY,{});if(s&&s.key&&u&&u[s.key])return{profile:u[s.key],save(p){u[s.key]=p;write(USERS_KEY,u)}};const g=read(GUEST_KEY,{key:'__guest__',username:'Guest',tokens:0,shareCount:0,pendingShareCredits:0,shareEvents:[],ledger:[]});return{profile:g,save:p=>write(GUEST_KEY,p)}}function normalize(p){p=p&&typeof p==='object'?p:{};p.tokens=Math.max(0,Number(p.tokens)||0);p.shareCount=Math.max(0,Number(p.shareCount)||0);p.pendingShareCredits=Math.max(0,Number(p.pendingShareCredits)||0);p.shareEvents=Array.isArray(p.shareEvents)?p.shareEvents:[];p.ledger=Array.isArray(p.ledger)?p.ledger:[];return p}function refreshNetworkWallet(){const w=normalize(walletStore().profile);document.querySelectorAll('[data-news-star-wallet]').forEach(n=>n.innerHTML=`<strong>★ ${w.tokens} Star Coin${w.tokens===1?'':'s'}</strong><small>${w.pendingShareCredits}/10 shares toward next coin · ${w.shareCount} total shares</small>`)}
function ensureShareCredit(reference='',method='web_share_api'){const s=walletStore(),w=normalize(s.profile),now=Date.now(),ref=String(reference||location.href);if(w.shareEvents.some(e=>String(e?.contentId||'')===ref&&Math.abs(now-Number(e?.createdAt||0))<DUPLICATE_WINDOW_MS&&e.confirmed!==false&&e.verified!==false)){refreshNetworkWallet();return{progressToNextCoin:w.pendingShareCredits,awarded:0,balance:w.tokens,shareCount:w.shareCount,alreadyRecorded:true}}const id=`newsphi-share-${now.toString(36)}-${Math.random().toString(36).slice(2,8)}`;w.shareCount++;w.pendingShareCredits++;w.shareEvents.push({id,attemptId:id,contentId:ref,method,confirmed:true,verified:true,createdAt:now,source:'news-phi-wallet-bridge'});let awarded=0;while(w.pendingShareCredits>=10){w.pendingShareCredits-=10;w.tokens++;awarded++}w.ledger.push({id:`tx-${id}`,type:awarded?'share_reward':'share_credit',amount:awarded,balance:w.tokens,pendingShareCredits:w.pendingShareCredits,createdAt:now,source:'news-phi-wallet-bridge'});w.shareEvents=w.shareEvents.slice(-250);w.ledger=w.ledger.slice(-500);s.save(w);const detail={progressToNextCoin:w.pendingShareCredits,awarded,balance:w.tokens,shareCount:w.shareCount,source:'news-phi-wallet-bridge'};window.dispatchEvent(new CustomEvent('starquest:share-progress',{detail}));window.dispatchEvent(new CustomEvent('controlphi:wallet-change',{detail}));refreshNetworkWallet();return detail}
function installNetworkMenu(){if(document.querySelector('[data-news-network-menu]')||document.getElementById('controlPhiButton')){refreshNetworkWallet();return}const topbar=document.querySelector('.topbar');if(!topbar)return;const style=document.createElement('style');style.textContent='.news-network-button{width:44px;height:44px;border:1px solid rgba(255,255,255,.16);border-radius:13px;background:rgba(12,8,30,.72);color:#fff;font-size:22px;font-weight:900;cursor:pointer;display:grid;place-items:center}.news-network-backdrop{position:fixed;inset:0;background:rgba(3,2,12,.58);z-index:998;opacity:0;pointer-events:none}.news-network-drawer{position:fixed;top:0;right:0;width:min(88vw,360px);height:100dvh;z-index:999;padding:20px;background:linear-gradient(180deg,#12092c,#080515);transform:translateX(104%);transition:.2s;color:#fff;overflow:auto}.news-network-backdrop.open{opacity:1;pointer-events:auto}.news-network-drawer.open{transform:none}.news-network-head{display:flex;justify-content:space-between;align-items:center;margin-bottom:16px}.news-network-close{width:42px;height:42px;border:1px solid #ffffff26;border-radius:12px;background:#ffffff12;color:#fff;font-size:24px}.news-network-nav{display:grid;gap:8px}.news-network-nav a{padding:13px 14px;border:1px solid #ffffff1c;border-radius:13px;background:#ffffff0b;color:#fff;text-decoration:none;font-weight:800}.news-network-label{margin-top:10px;padding-top:14px;border-top:1px solid #ffffff20;font-size:.68rem;font-weight:950;letter-spacing:.14em;text-transform:uppercase;opacity:.6}.news-star-wallet{display:grid;gap:3px;padding:13px 14px;border:1px solid #f0bd554d;border-radius:14px;background:#f0bd5517;color:#f6d77e}.news-star-wallet small{color:#ffffff99}';document.head.appendChild(style);const button=document.createElement('button');button.type='button';button.className='news-network-button';button.dataset.newsNetworkMenu='1';button.setAttribute('aria-label','Open News Phi menu');button.textContent='☰';topbar.appendChild(button);const backdrop=document.createElement('div');backdrop.className='news-network-backdrop';const drawer=document.createElement('aside');drawer.className='news-network-drawer';drawer.innerHTML='<div class="news-network-head"><strong>News Phi</strong><button class="news-network-close" type="button">×</button></div><nav class="news-network-nav"><a href="https://www-infinity4.github.io/News-Phi/">News Phi</a><a href="https://quantaphi.org/">QuantaPhi</a><a href="https://www-infinity4.github.io/C13b0/">Infinity Phi</a><a href="https://www-infinity4.github.io/Omni-Phi/">Omni Phi</a><a href="https://www-infinity4.github.io/Web-Phi/">Web Phi · build websites</a><a href="https://www-infinity4.github.io/Builder-Reserve/">Builder Reserve</a><div class="news-network-label">Wallets</div><a href="https://www-infinity4.github.io/C13b0/wallet/">Infinity + Star Coin wallets</a><div class="news-star-wallet" data-news-star-wallet></div></nav>';document.body.append(backdrop,drawer);const set=o=>{backdrop.classList.toggle('open',o);drawer.classList.toggle('open',o);document.body.style.overflow=o?'hidden':''};button.addEventListener('click',e=>{e.preventDefault();e.stopPropagation();set(!drawer.classList.contains('open'))});backdrop.addEventListener('click',()=>set(false));drawer.querySelector('.news-network-close').addEventListener('click',()=>set(false));drawer.addEventListener('click',e=>e.stopPropagation());refreshNetworkWallet()}
window.ControlPhi=window.ControlPhi||{};window.ControlPhi.ensureShareCredit=ensureShareCredit;if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',installNetworkMenu,{once:true});else installNetworkMenu();addEventListener('storage',refreshNetworkWallet);addEventListener('starquest:share-progress',refreshNetworkWallet);addEventListener('controlphi:wallet-change',refreshNetworkWallet);
})();

/* ---- phi-ingest.js ---- */
(function (global) {
  'use strict';

  const KEYS = {
    queue: 'controlPhi:ingestQueue:v1',
    retrieval: 'newsPhi:retrievalQueue:v2',
    config: 'controlPhi:searchConfig:v1'
  };

  const clean = (value) => String(value || '').replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim();
  const safeJson = (key, fallback) => {
    try { return JSON.parse(localStorage.getItem(key)) ?? fallback; } catch { return fallback; }
  };
  const saveJson = (key, value) => {
    try { localStorage.setItem(key, JSON.stringify(value)); return true; } catch { return false; }
  };
  const hash = (value) => {
    let h = 2166136261;
    for (let i = 0; i < value.length; i += 1) { h ^= value.charCodeAt(i); h = Math.imul(h, 16777619); }
    return (h >>> 0).toString(36);
  };

  function xPostText(html) {
    try {
      const doc = new DOMParser().parseFromString(String(html || ''), 'text/html');
      return clean(doc.querySelector('blockquote p')?.textContent || doc.querySelector('p')?.textContent || '')
        .replace(/https?:\/\/t\.co\/\S+/gi, ' ')
        .replace(/pic\.twitter\.com\/\S+/gi, ' ')
        .replace(/\s+/g, ' ')
        .trim();
    } catch { return ''; }
  }

  function fetchXPost(url) {
    return new Promise((resolve, reject) => {
      const callback = `__phiX${Date.now().toString(36)}${Math.random().toString(36).slice(2, 8)}`;
      const script = document.createElement('script');
      const cleanup = () => {
        clearTimeout(timer);
        script.remove();
        try { delete global[callback]; } catch { global[callback] = undefined; }
      };
      const timer = setTimeout(() => { cleanup(); reject(new Error('X post lookup timed out.')); }, 12000);
      global[callback] = (data) => { cleanup(); resolve(data || {}); };
      script.onerror = () => { cleanup(); reject(new Error('X post could not be read.')); };
      script.src = `https://publish.x.com/oembed?${new URLSearchParams({ url, omit_script: 'true', dnt: 'true', callback })}`;
      document.head.appendChild(script);
    });
  }

  function urlsFrom(value) {
    return clean(value).match(/https?:\/\/[^\s<>'\"]+/gi) || [];
  }

  function xIdentity(url) {
    const match = String(url || '').match(/^https?:\/\/(?:www\.)?(?:x|twitter)\.com\/([^/?#]+)\/status\/(\d+)/i);
    return match ? { network: 'x', author: match[1], statusId: match[2] } : null;
  }

  function removeUrls(value) {
    return clean(value).replace(/https?:\/\/[^\s<>'\"]+/gi, ' ').replace(/\s+/g, ' ').trim();
  }

  function urlTopic(value) {
    try {
      const url = new URL(value);
      return decodeURIComponent(`${url.hostname.replace(/^www\./, '')} ${url.pathname}`)
        .replace(/[^a-z0-9]+/gi, ' ')
        .replace(/\s+/g, ' ')
        .trim();
    } catch { return ''; }
  }

  function titleFor(input, body, identity) {
    const supplied = clean(input.title);
    if (supplied && !/^https?:\/\//i.test(supplied) && supplied.length > 5) return supplied.slice(0, 180);
    const sentence = body.split(/(?<=[.!?])\s+/)[0] || '';
    if (sentence.length >= 12) return sentence.slice(0, 180);
    if (identity) return `Post by @${identity.author}`;
    return 'Shared research item';
  }

  function termsFrom(value, limit) {
    const stop = new Set(['about','after','again','also','and','are','because','before','being','from','have','into','more','news','post','shared','source','that','their','these','they','this','through','what','when','where','which','with','would','your','https','http']);
    const counts = new Map();
    (clean(value).toLowerCase().match(/[a-z0-9][a-z0-9'-]{2,}/g) || []).forEach((word, index) => {
      if (stop.has(word) || /^\d+$/.test(word)) return;
      counts.set(word, (counts.get(word) || 0) + (index < 16 ? 2 : 1));
    });
    return [...counts].sort((a, b) => b[1] - a[1] || b[0].length - a[0].length).slice(0, limit || 8).map(([word]) => word);
  }

  function questionsFor(title, body) {
    const terms = termsFrom(`${title} ${body}`, 6);
    const subject = terms.slice(0, 3).join(' ') || clean(title) || 'this subject';
    return [
      `What exactly is being reported or claimed about ${subject}?`,
      `What primary or independent sources support the main points about ${subject}?`,
      `What background is needed to understand ${subject}?`,
      `What has changed recently about ${subject}?`,
      `What related questions or developments should be researched next?`
    ];
  }

  function normalize(input) {
    const rawText = clean(input && input.text);
    const suppliedUrl = clean(input && input.url);
    const foundUrls = [...new Set([suppliedUrl, ...urlsFrom(rawText)].filter(Boolean))];
    const sourceUrl = foundUrls[0] || '';
    const identity = xIdentity(sourceUrl);
    const body = removeUrls(rawText);
    const title = titleFor(input || {}, body, identity);
    const meaningful = body.length >= 24;
    return {
      id: `phi-${Date.now().toString(36)}-${hash(`${title}|${body}|${sourceUrl}`)}`,
      type: (input && input.type) || (identity ? 'x-post' : sourceUrl ? 'url' : 'text'),
      title,
      text: body,
      url: sourceUrl,
      urls: foundUrls,
      x: identity,
      source: clean(input && input.source) || 'share',
      collectedAt: new Date().toISOString(),
      terms: termsFrom(`${title} ${body}`, 10),
      questions: questionsFor(title, body),
      searchText: clean(`${title} ${body} ${urlTopic(sourceUrl)}`),
      needsResolution: Boolean(sourceUrl && !meaningful),
      readyForCard: meaningful || Boolean(sourceUrl && !identity)
    };
  }

  function publishCard(record) {
    if (!record || !record.readyForCard) return false;
    const jobs = safeJson(KEYS.retrieval, []);
    const job = {
      id: record.id,
      jobKey: `share:${hash(`${record.url}|${record.text}`)}`,
      kind: 'share',
      subject: record.title,
      query: record.searchText,
      sourceUrl: record.url,
      collectedAt: record.collectedAt,
      indexedText: record.text,
      status: 'indexed'
    };
    const existing = jobs.findIndex((item) => item.jobKey === job.jobKey);
    if (existing >= 0) jobs[existing] = { ...jobs[existing], ...job };
    else jobs.unshift(job);
    saveJson(KEYS.retrieval, jobs.slice(0, 500));
    global.dispatchEvent(new CustomEvent('phi:ingested', { detail: job }));
    return job;
  }

  function enqueue(record) {
    const queue = safeJson(KEYS.queue, []);
    const existing = queue.findIndex((item) => item.id === record.id || (item.url && record.url && item.url === record.url && item.text === record.text));
    if (existing >= 0) queue[existing] = { ...queue[existing], ...record };
    else queue.unshift(record);
    saveJson(KEYS.queue, queue.slice(0, 500));
    return record;
  }

  async function resolveRecord(record) {
    if (!record || !record.needsResolution || !record.x || !record.url) return record;
    const post = await fetchXPost(record.url);
    const body = xPostText(post.html);
    if (!body) return record;
    record.text = body;
    record.body = body;
    record.title = titleFor({}, body, record.x);
    record.authorName = clean(post.author_name);
    record.url = clean(post.url) || record.url;
    record.terms = termsFrom(`${record.title} ${body}`, 10);
    record.questions = questionsFor(record.title, body);
    record.searchText = clean(`${record.authorName} ${record.title} ${body}`);
    record.needsResolution = false;
    record.readyForCard = true;
    record.resolvedAt = new Date().toISOString();
    return record;
  }

  function ingest(input) {
    const record = normalize(input || {});
    enqueue(record);
    if (record.readyForCard) publishCard(record);
    return record;
  }

  async function ingestResolved(input) {
    const record = normalize(input || {});
    try { await resolveRecord(record); } catch (error) { record.resolutionError = error?.message || 'Source resolution failed.'; }
    enqueue(record);
    if (record.readyForCard) publishCard(record);
    return record;
  }

  async function ingestClipboard() {
    if (!navigator.clipboard || !navigator.clipboard.readText) throw new Error('Clipboard read is unavailable in this browser.');
    const text = await navigator.clipboard.readText();
    if (!clean(text)) throw new Error('Clipboard is empty.');
    return ingestResolved({ text, source: 'clipboard' });
  }

  async function ingestShareTarget(search) {
    const params = search instanceof URLSearchParams ? search : new URLSearchParams(search || location.search);
    if (!params.has('shareTarget') && !params.has('text') && !params.has('url')) return null;
    return ingestResolved({
      title: params.get('title') || '',
      text: [params.get('text') || '', params.get('url') || ''].filter(Boolean).join(' '),
      url: params.get('url') || '',
      source: 'android-share-target'
    });
  }

  function pending() { return safeJson(KEYS.queue, []).filter((item) => item.needsResolution); }

  async function resolvePending(limit) {
    const queue = safeJson(KEYS.queue, []);
    let resolved = 0;
    for (const record of queue.filter((item) => item.needsResolution && item.x).slice(0, limit || 12)) {
      try {
        await resolveRecord(record);
        if (record.readyForCard) { publishCard(record); resolved += 1; }
      } catch (error) { record.resolutionError = error?.message || 'Source resolution failed.'; }
    }
    saveJson(KEYS.queue, queue.slice(0, 500));
    return resolved;
  }

  global.PhiIngest = Object.freeze({
    normalize,
    ingest,
    ingestResolved,
    ingestClipboard,
    ingestShareTarget,
    publishCard,
    pending,
    resolvePending,
    xIdentity,
    keys: { ...KEYS }
  });
})(window);

/* ---- interest-feed-bridge.js ---- */
(function(){
  'use strict';
  const SIGNAL_KEY='phiShared:interestSignals:v1',QUEUE_KEY='newsPhi:retrievalQueue:v2';
  const read=(key,fallback)=>{try{return JSON.parse(localStorage.getItem(key))??fallback}catch{return fallback}};
  const write=(key,value)=>{try{localStorage.setItem(key,JSON.stringify(value));return true}catch{return false}};
  const clean=value=>String(value??'').replace(/\s+/g,' ').trim();
  const slug=value=>clean(value).toLowerCase().replace(/[^a-z0-9]+/g,'-').replace(/^-|-$/g,'').slice(0,140)||'interest';

  function indexSignals(){
    const jobs=read(QUEUE_KEY,[]),byKey=new Map(jobs.map(job=>[job.jobKey,job]));
    read(SIGNAL_KEY,[]).filter(Boolean).forEach(signal=>{
      const signalKind=clean(signal.kind)||'view';
      if(!['search','share','store','collect','view'].includes(signalKind))return;
      const subject=signalKind==='search'?clean(signal.query):clean(signal.program||signal.title||signal.topic||signal.query||signal.channel);
      if(!subject)return;
      const kind=signalKind,jobKey=`${kind}:${slug(signal.topicKey||subject)}`;
      const previous=byKey.get(jobKey)||{},at=Number(signal.lastAt||Date.parse(signal.collectedAt||signal.createdAt||'')||Date.now());
      byKey.set(jobKey,{...previous,jobKey,kind,subject,query:clean(signal.query||`${subject} ${signal.channel||''}`),sourceUrl:clean(signal.url),collectedAt:new Date(at).toISOString(),signalCount:(Number(previous.signalCount)||0)+Math.max(1,Number(signal.hits)||1),status:at>Number(Date.parse(previous.publishedAt||'')||0)?'indexed':(previous.status||'indexed')});
    });
    const indexed=[...byKey.values()].sort((a,b)=>String(b.collectedAt).localeCompare(String(a.collectedAt))).slice(0,500);
    write(QUEUE_KEY,indexed);return indexed;
  }

  indexSignals();
  window.addEventListener('storage',event=>{if(event.key===SIGNAL_KEY){indexSignals();window.dispatchEvent(new Event('newsphi:run-retrieval'))}});
  window.addEventListener('newsphi:interest',()=>{indexSignals();window.dispatchEvent(new Event('newsphi:run-retrieval'))});
})();

/* ---- background-enrichment-gate.js ---- */
(function(){
  'use strict';

  // app.js historically schedules background enrichStory() calls about 80 ms
  // after rendering every unenriched card. That rewrites older cards and then
  // rebuilds the whole feed, which is the source of the visible card bouncing.
  // Keep explicit actions available, but block only those automatic timers.
  const nativeSetTimeout=window.setTimeout.bind(window);
  const nativeToString=Function.prototype.toString;

  window.setTimeout=function(callback,delay){
    const args=Array.prototype.slice.call(arguments,2);
    if(typeof callback==='function' && Number(delay)<=120){
      let source='';
      try{source=nativeToString.call(callback)}catch(_){}
      if(/\benrichStory\s*\(/.test(source)) return 0;
    }
    return nativeSetTimeout(callback,delay,...args);
  };
})();

/* ---- source-truth-gate.js ---- */
(function(){
  'use strict';

  const SHARED='phiShared:collection:v1';
  const STORIES='phiShared:storyIndex:v2';
  const RESEARCH='omniPhi:lastResearch:v1';

  const read=(key,fallback)=>{try{return JSON.parse(localStorage.getItem(key))??fallback}catch{return fallback}};
  const write=(key,value)=>{try{localStorage.setItem(key,JSON.stringify(value));return true}catch{return false}};
  const clean=value=>String(value??'').replace(/<[^>]+>/g,' ').replace(/\s+/g,' ').trim();
  const keyOf=card=>card?.storyKey||card?.url||card?.id||String(card?.title||'card').toLowerCase().replace(/[^a-z0-9]+/g,'-');
  const sentences=text=>clean(text).split(/(?<=[.!?])\s+/).map(clean).filter(Boolean);

  const shared=read(SHARED,[]);
  const research=read(RESEARCH,null);
  const sources=Array.isArray(research?.sources)?research.sources:[];
  const byUrl=new Map(sources.filter(source=>source?.url).map(source=>[source.url,source]));
  const byId=new Map(sources.filter(source=>source?.id).map(source=>[source.id,source]));
  let changed=false;

  shared.forEach(card=>{
    const live=byUrl.get(card.url)||byId.get(card.id)||null;

    // Any image that came in on a collected source remains attached to the card.
    // Do not make News Phi depend on a later enrichment pass to display it.
    if(card.image&&!card.imageVerified){card.imageVerified=true;changed=true}

    if(card.url&&!card.sourceBacked){card.sourceBacked=true;changed=true}

    // Current Omni research still has the original source text/title even when
    // GPT produced a cleaner orange-card rewrite. For News Phi, factual copy is
    // rebuilt from that source evidence rather than from generated prose.
    if(live){
      const sourceTitle=clean(live.sourceTitle||live.title);
      const sourceExtract=clean(live.sourceExtract||(!live.aiGenerated?live.extract:''));
      if(sourceTitle&&card.sourceTitle!==sourceTitle){card.sourceTitle=sourceTitle;changed=true}
      if(sourceExtract){
        if(card.sourceExtract!==sourceExtract){card.sourceExtract=sourceExtract;changed=true}
        if(card.extract!==sourceExtract){
          card.aiCardExtract=card.aiCardExtract||card.extract||'';
          card.extract=sourceExtract;
          changed=true;
        }
      }
      if(live.image&&card.image!==live.image){card.image=live.image;card.imageVerified=true;changed=true}
      card.sourceBacked=true;
      card.aiGenerated=Boolean(live.aiGenerated);
    }else if(card.sourceExtract&&card.extract!==card.sourceExtract){
      card.aiCardExtract=card.aiCardExtract||card.extract||'';
      card.extract=card.sourceExtract;
      changed=true;
    }
  });

  if(changed)write(SHARED,shared);

  // Repair already-built story bodies from the evidence now stored on cards.
  const stories=read(STORIES,{});
  let storyChanged=false;
  shared.forEach(card=>{
    const key=keyOf(card),story=stories[key];
    const evidence=clean(card.sourceExtract||'');
    if(!story||!evidence)return;
    const facts=sentences(evidence).filter(sentence=>sentence.length>=32).slice(0,8);
    if(!facts.length)return;
    const standfirst=facts.slice(0,2).join(' ');
    const paragraphs=[];
    for(let i=2;i<facts.length;i+=2){const p=facts.slice(i,i+2).join(' ');if(p)paragraphs.push(p)}
    story.standfirst=standfirst;
    story.paragraphs=paragraphs.length?paragraphs:[standfirst];
    story.image=card.image||story.image||'';
    story.imageVerified=Boolean(story.image);
    story.enriched=true;
    story.sourceFingerprint=evidence;
    storyChanged=true;
  });
  if(storyChanged)write(STORIES,stories);

  window.NewsPhiSourceTruth=Object.freeze({enabled:true,rule:'source-copy+preserve-images'});
})();

/* ---- app.js ---- */
(function(){
  'use strict';

  const KEYS={
    shared:'phiShared:collection:v1',
    stories:'phiShared:storyIndex:v2',
    legacyStories:'phiShared:storyIndex:v1',
    omniProfile:'omniPhi:profile:v1',
    omniResearch:'omniPhi:lastResearch:v1',
    controlShares:'controlPhi:shareFeed:v1'
  };

  const STOP=new Set([
    'about','after','again','against','also','and','are','because','before','being','between','built','card','channel',
    'could','every','from','have','into','itself','more','news','open','other','over','points','prepared','research',
    'same','share','shared','sharing','source','story','such','than','that','their','these','they','this','through',
    'under','user','watch','what','when','where','which','while','with','would','your','infinity','phi','live','page',
    'completed','synchronized','starting','point','available','moment','information','read','generate'
  ]);

  const BOILERPLATE=[
    /\bwas shared\b/i,
    /\bthe share points to\b/i,
    /\bnews phi prepared\b/i,
    /\bopen this card\b/i,
    /\bresearch starting point\b/i,
    /\bcompleted share\b/i,
    /\bstarcoin\b/i,
    /\bshare reward\b/i
  ];

  const get=(key,fallback)=>{try{return JSON.parse(localStorage.getItem(key))??fallback}catch{return fallback}};
  const set=(key,value)=>{try{localStorage.setItem(key,JSON.stringify(value));return true}catch{return false}};
  const clean=(value)=>String(value??'').replace(/<[^>]+>/g,' ').replace(/\s+/g,' ').trim();
  const esc=(value)=>String(value??'').replace(/[&<>'"]/g,(char)=>({'&':'&amp;','<':'&lt;','>':'&gt;',"'":'&#39;','"':'&quot;'}[char]));
  const keyOf=(card)=>card.storyKey||card.url||card.id||String(card.title||'card').toLowerCase().replace(/[^a-z0-9]+/g,'-');
  const sentenceList=(text)=>clean(text).split(/(?<=[.!?])\s+/).map(clean).filter(Boolean);
  const genericTitle=(title)=>/^(shared|collected|news|story|orange card|shared story|collected story)$/i.test(clean(title));

  function words(text){
    return clean(text).toLowerCase().replace(/https?:\/\/\S+/g,' ').replace(/[^a-z0-9'-]+/g,' ').split(/\s+/)
      .filter(word=>word.length>2&&!STOP.has(word)&&!/^\d+$/.test(word));
  }

  function importantTerms(text,limit=8){
    const counts=new Map();
    words(text).forEach((word,index)=>{
      const weight=index<14?2:1;
      counts.set(word,(counts.get(word)||0)+weight);
    });
    return [...counts].sort((a,b)=>b[1]-a[1]||b[0].length-a[0].length).map(([word])=>word).slice(0,limit);
  }

  function overlap(a,b){
    const left=new Set(words(a));
    const right=new Set(words(b));
    let hit=0;
    left.forEach(word=>{if(right.has(word))hit++});
    return hit;
  }

  function usefulSentences(text){
    const seen=new Set();
    return sentenceList(text).filter(sentence=>{
      if(sentence.length<38)return false;
      if(BOILERPLATE.some(pattern=>pattern.test(sentence)))return false;
      const key=sentence.toLowerCase();
      if(seen.has(key))return false;
      seen.add(key);
      return true;
    });
  }

  function titleFromCard(card){
    let title=clean(card.title||'');
    title=title
      .replace(/\.(?:jpe?g|png|webp|gif)$/i,'')
      .replace(/\s*\(\d{7,}\)\s*$/,'')
      .replace(/\s*[·|—-]\s*(Infinity Channel|Infinity TV)$/i,'')
      .replace(/\s*[·|—-]\s*(USA Up All Night|AMC Classic Movies|Motor TV|Comedy Central)$/i,'')
      .replace(/^Shared\s+(orange\s+)?card\s*[:—-]?\s*/i,'')
      .trim();
    if(!title||genericTitle(title)){
      const q=clean(card.searchQuery||'');
      if(q)title=q.replace(/\b(related|research|news)\b.*$/i,'').trim()||q;
    }
    return title||'A story worth following';
  }

  function detectKind(card,headline){
    const text=`${headline} ${card.searchQuery||''} ${card.extract||''} ${card.channel||''} ${card.domain||''}`.toLowerCase();
    if(/\b(movie|film|cinema|episode|actor|actress|director|screenplay|box office|cast|television|tv show)\b/.test(text))return 'screen';
    if(/\b(physics|chemistry|element|atom|research|study|science|engineering|technology|space|nasa)\b/.test(text))return 'science';
    if(/\b(game|nfl|nba|mlb|nhl|nascar|race|sports|football|baseball|basketball)\b/.test(text))return 'sports';
    if(/\b(election|government|president|congress|policy|court|law)\b/.test(text))return 'public-affairs';
    return 'general';
  }

  function similarQueryFor(card,headline,kind){
    const terms=importantTerms(`${headline} ${card.searchQuery||''} ${card.extract||''}`,6).join(' ');
    if(kind==='screen')return clean(`${headline} film plot cast production reception ${terms}`);
    if(kind==='science')return clean(`${headline} latest research evidence applications ${terms}`);
    if(kind==='sports')return clean(`${headline} latest results history analysis ${terms}`);
    if(kind==='public-affairs')return clean(`${headline} latest developments background analysis ${terms}`);
    return clean(`${headline} latest developments background context ${terms}`);
  }

  function paragraphize(sentences,limit=4){
    const out=[];
    for(let i=0;i<sentences.length&&out.length<limit;i+=2){
      const paragraph=sentences.slice(i,i+2).join(' ');
      if(paragraph)out.push(paragraph);
    }
    return out;
  }

  function makeBaseStory(card,previous={}){
    const headline=titleFromCard(card);
    const kind=detectKind(card,headline);
    const facts=usefulSentences(card.extract||card.body||'');
    const standfirst=facts.slice(0,2).join(' ');
    const paragraphs=paragraphize(facts.length?facts:[standfirst],4);
    return {
      ...previous,
      storyVersion:2,
      storyKey:keyOf(card),
      title:headline,
      headline,
      kind,
      image:card.imageVerified?(card.image||previous.image||''):'',
      url:card.url||previous.url||'',
      domain:card.domain||card.provider||card.channel||previous.domain||'Infinity interest signal',
      channel:card.channel||previous.channel||'',
      searchQuery:card.searchQuery||previous.searchQuery||'',
      publishedAt:card.publishedAt||'',
      publishedLabel:card.publishedLabel||'',
      discoveredNews:card.generatedBy==='monitor-news'||Boolean(card.retrievalVersion),
      collectedAt:card.collectedAt||previous.collectedAt||new Date().toISOString(),
      standfirst,
      paragraphs,
      similarQuery:similarQueryFor(card,headline,kind),
      sources:Array.isArray(card.sources)?card.sources:(Array.isArray(previous.sources)?previous.sources:[]),
      enriched:Boolean(card.sourceBacked||previous.enriched),
      sourceFingerprint:card.extract||previous.sourceFingerprint||''
    };
  }

  function isVisibleCard(card){
    if(!card)return false;
    if((card.generatedBy==='news-phi-interest-bridge'||card.ingestType)&&!card.sourceBacked)return false;
    if(card.kind==='share'&&!card.sourceBacked)return false;
    return Boolean(clean(card.title)&&clean(card.extract||card.body));
  }

  function synchronize(){
    const shared=get(KEYS.shared,[]);
    const profile=get(KEYS.omniProfile,{collected:[]});
    const research=get(KEYS.omniResearch,null);
    const currentSources=new Map((research?.sources||[]).map(card=>[keyOf(card),card]));
    const hiddenStories=get('newsPhi:hiddenStories:v1',{});
    // News Phi is NEWS, never the saved-Quant archive. Old reporting expires on
    // the screen even if all upstream network feeds temporarily fail.
    const ageLimit=48*60*60*1000,now=Date.now();
    const unsafe=/\b(?:porn|pornography|xxx|hardcore|explicit\s+sex|adult\s+video|onlyfans|nude\s+leak|escort\s+service|sex\s+tape)\b/i;
    const monitor=get('newsPhi:monitorCards:v1',[]).filter(card=>{
      if(hiddenStories[card.storyKey||card.url||card.id])return false;
      const when=Date.parse(card.publishedAt||'');
      if(!Number.isFinite(when)||when>now+300000||now-when>ageLimit)return false;
      if(unsafe.test([card.title,card.extract,card.domain,card.url].join(' ')))return false;
      return Boolean(card.url&&/^https?:\/\//.test(card.url));
    });
    const quanta=get('newsPhi:quantaCloudCards:v1',[]);
    const localQuanta=get('quantaPhiCollected',[]).map(card=>({id:'quanta:'+card.key,storyKey:'quanta:'+card.key,title:card.title,extract:card.story,url:card.sourceUrl,image:card.type==='Image'?card.media:'',imageVerified:card.type==='Image',sourceBacked:Boolean(card.sourceUrl),collectedAt:card.collectedAt,domain:'QuantaPhi'}));
    const all=monitor.filter(card=>card&&card.sourceBacked).filter(isVisibleCard);
    const merged=new Map();

    all.forEach(card=>{
      const key=keyOf(card);
      const enriched=currentSources.get(key)||{};
      const previous=merged.get(key)||{};
      merged.set(key,{
        ...previous,...card,...enriched,
        storyKey:key,
        searchQuery:card.searchQuery||previous.searchQuery||research?.query||'',
        collectedAt:card.collectedAt||previous.collectedAt||new Date().toISOString()
      });
    });

    const ordered=[...merged.values()].sort((a,b)=>Number(Boolean(b.isNew))-Number(Boolean(a.isNew))||(Date.parse(b.publishedAt)||0)-(Date.parse(a.publishedAt)||0)||(b.rank||0)-(a.rank||0));
    const readStories=get('newsPhi:readStories:v1',{});
    const fresh=ordered.filter(c=>c.isNew),older=ordered.filter(c=>!c.isNew&&!readStories[keyOf(c)]),read=ordered.filter(c=>!c.isNew&&readStories[keyOf(c)]),cards=[];
    while(fresh.length||older.length){cards.push(...fresh.splice(0,3));if(older.length)cards.push(older.shift());}
    cards.push(...read);
    const legacy={};
    const storyIndex=get(KEYS.stories,{});
    cards.forEach(card=>{
      const key=keyOf(card);
      storyIndex[key]=makeBaseStory(card,storyIndex[key]||{});
    });
    set(KEYS.stories,storyIndex);
    return {cards,storyIndex};
  }

  async function wikiSearch(query){
    const url=`https://en.wikipedia.org/w/api.php?action=query&generator=search&gsrsearch=${encodeURIComponent(query)}&gsrlimit=5&prop=extracts|info|pageimages&exintro=1&explaintext=1&inprop=url&pithumbsize=1000&format=json&origin=*`;
    const response=await fetch(url,{cache:'no-store'});
    if(!response.ok)throw new Error('Wikipedia search failed');
    const data=await response.json();
    return Object.values(data?.query?.pages||{}).map(page=>({
      title:clean(page.title),
      url:page.fullurl||'',
      excerpt:clean(page.extract),
      image:page.thumbnail?.source||'',
      provider:'Wikipedia'
    })).filter(item=>item.title&&item.excerpt);
  }

  function rankSources(story,sources){
    return [...sources].sort((a,b)=>{
      const target=`${story.headline} ${story.searchQuery} ${story.similarQuery}`;
      return overlap(`${b.title} ${b.excerpt}`,target)-overlap(`${a.title} ${a.excerpt}`,target);
    });
  }

  async function enrichStory(key){
    const story=state.storyIndex[key];
    if(!story||story.enriching)return story;
    story.enriching=true;
    renderStoryCardState(key);
    try{
      const query=story.kind==='screen'?`${story.headline} film`:story.similarQuery||story.headline;
      const target=`${story.headline} ${story.searchQuery}`;
      const minimum=importantTerms(target).length>1?2:1;
      const found=rankSources(story,await wikiSearch(query)).filter(source=>overlap(`${source.title} ${source.excerpt}`,target)>=minimum);
      if(found.length){
        const sourceSentences=[];
        found.slice(0,3).forEach(source=>{
          usefulSentences(source.excerpt).slice(0,4).forEach(sentence=>{
            if(!sourceSentences.some(existing=>overlap(existing,sentence)>=Math.min(5,words(sentence).length)))sourceSentences.push(sentence);
          });
        });
        const standfirst=sourceSentences.slice(0,2).join(' ')||story.standfirst;
        const paragraphs=paragraphize(sourceSentences.slice(2),4);
        story.standfirst=standfirst;
        story.paragraphs=paragraphs.length?paragraphs:[standfirst];
        story.sources=found.slice(0,4);
        const imageSource=found.find(source=>source.image&&overlap(`${source.title} ${source.excerpt}`,target)>=minimum);
        story.image=imageSource?.image||'';
        story.imageVerified=Boolean(imageSource);
        story.enriched=true;
      }
    }catch(_){}
    story.enriching=false;
    set(KEYS.stories,state.storyIndex);
    render();
    if(dialog.open&&dialog.dataset.storyKey===key)openStory(key,true);
    return story;
  }

  function excerpt(story){
    const text=clean(story.standfirst||(story.paragraphs||[]).join(' '));
    return text.length>520?`${text.slice(0,517).trim()}…`:text;
  }

  function awardStarCoinShare(reference){
    if(window.ControlPhi?.ensureShareCredit)return window.ControlPhi.ensureShareCredit(reference,'web_share_api');
    return {progressToNextCoin:0,awarded:0,balance:0};
  }

  function preferenceSignal(story,delta,reason){
    const topic=clean(story?.searchQuery||story?.similarQuery||story?.headline||story?.title).toLowerCase();
    if(!topic)return;
    const weights=get('newsPhi:topicFeedback:v1',{});
    weights[topic]=(Number(weights[topic])||0)+Number(delta||0);
    set('newsPhi:topicFeedback:v1',weights);
    const log=get('newsPhi:preferenceEvents:v1',[]);
    log.push({topic,delta:Number(delta||0),reason:String(reason||'engagement'),storyKey:story?.storyKey||'',at:Date.now()});
    set('newsPhi:preferenceEvents:v1',log.slice(-2000));
    window.dispatchEvent(new Event('newsphi:run-retrieval'));
  }

  async function shareStory(key){
    const story=state.storyIndex[key];
    if(!story)return;
    const params=new URLSearchParams({
      sharedTitle:story.headline||story.title,
      sharedBody:[story.standfirst,...(story.paragraphs||[])].join(' ').slice(0,1800),
      sharedUrl:story.url||'',
      sharedImage:story.image||'',
      sharedDomain:story.domain||'',
      sharedQuery:story.similarQuery||story.searchQuery||''
    });
    const shareUrl=`${location.origin}/news-phi/?${params}#story=${encodeURIComponent(key)}`;
    if(!navigator.share){
      try{await navigator.clipboard.writeText(shareUrl);alert('Story link copied.')}catch{}
      return;
    }
    try{
      let shared=false;
      if(story.image){
        try{
          const response=await fetch(story.image,{mode:'cors'});
          if(response.ok){
            const blob=await response.blob();
            const ext=(blob.type?.split('/')[1]||'jpg').replace('jpeg','jpg');
            const file=new File([blob],`news-phi-story.${ext}`,{type:blob.type||'image/jpeg'});
            if(!navigator.canShare||navigator.canShare({files:[file]})){
              await navigator.share({title:story.headline||story.title,text:excerpt(story),url:shareUrl,files:[file]});
              shared=true;
            }
          }
        }catch(_){}
      }
      if(!shared)await navigator.share({title:story.headline||story.title,text:excerpt(story),url:shareUrl});
      preferenceSignal(story,3,'share');
      const reward=awardStarCoinShare(shareUrl);
      if(reward&&typeof reward.then==='function'){
        const resolved=await reward;
        alert(resolved.awarded?'Shared — 1 StarCoin completed!':`Shared — StarCoin progress ${resolved.progressToNextCoin}/10`);
      }else{
        alert(reward.awarded?'Shared — 1 StarCoin completed!':`Shared — StarCoin progress ${reward.progressToNextCoin}/10`);
      }
    }catch(error){
      if(!error||error.name!=='AbortError')alert('Share did not complete.');
    }
  }

  function importSharedCard(){
    const params=new URLSearchParams(location.search);
    const title=params.get('sharedTitle');
    if(!title)return '';
    const card={
      title,
      extract:params.get('sharedBody')||'',
      url:params.get('sharedUrl')||'',
      image:params.get('sharedImage')||'',
      domain:params.get('sharedDomain')||'Shared story',
      searchQuery:params.get('sharedQuery')||'',
      collectedAt:new Date().toISOString()
    };
    card.storyKey=keyOf(card);
    const shared=get(KEYS.shared,[]);
    const existing=shared.find(item=>keyOf(item)===card.storyKey);
    if(existing)Object.assign(existing,card);else shared.unshift(card);
    set(KEYS.shared,shared);
    state=synchronize();
    state.storyIndex[card.storyKey]=makeBaseStory({...card,sourceBacked:true,enriched:true});
    set(KEYS.stories,state.storyIndex);
    return card.storyKey;
  }

  const feed=document.getElementById('feed');
  const count=document.getElementById('cardCount');
  const syncLabel=document.getElementById('syncLabel');
  const search=document.getElementById('feedSearch');
  const dialog=document.getElementById('storyDialog');
  const storyContent=document.getElementById('storyContent');
  let state=synchronize();

  function storyHandoff(story,target){
    const body=[story.standfirst,...(story.paragraphs||[])].filter(Boolean).join(' ').replace(/\s+/g,' ').trim();
    const sources=(story.sources||[]).map(source=>({title:clean(source.title),url:clean(source.url),provider:clean(source.provider),excerpt:clean(source.excerpt||source.extract)})).filter(source=>source.title||source.url);
    return {version:1,target,source:'news-phi',storyKey:story.storyKey,title:story.headline||story.title||'',body,image:story.image||'',url:story.url||sources[0]?.url||'',domain:story.domain||'',searchQuery:story.searchQuery||'',similarQuery:story.similarQuery||'',sources,createdAt:new Date().toISOString()};
  }
  function saveStoryHandoff(story,target){
    const packet=storyHandoff(story,target);
    try{localStorage.setItem('phiShared:newsStoryHandoff:v1',JSON.stringify(packet))}catch(_){}
    try{
      let shared=get(KEYS.shared,[]);const card={id:'news-handoff:'+packet.storyKey,storyKey:'news-handoff:'+packet.storyKey,title:packet.title,extract:packet.body,url:packet.url,image:packet.image,imageVerified:Boolean(packet.image),sourceBacked:Boolean(packet.url),searchQuery:packet.searchQuery||packet.title,collectedAt:packet.createdAt,domain:packet.domain||'News Phi',sources:packet.sources};
      shared=[card,...shared.filter(item=>keyOf(item)!==card.storyKey)].slice(0,1000);set(KEYS.shared,shared);
    }catch(_){}
    return packet;
  }
  function storySearchUrl(story,target){
    const packet=storyHandoff(story,target),q=packet.title||packet.searchQuery||packet.similarQuery||'';
    const params=new URLSearchParams({q,run:'1',source:'news-phi',newsStory:packet.storyKey||'',storyTitle:packet.title,storyUrl:packet.url});
    const paths={infinity:'/infinity-phi/',omni:'/omni-phi/overview/',quanta:'/'};return 'https://quantaphi.org'+paths[target]+'?'+params;
  }

  function kindLabel(kind){
    if(kind==='screen')return 'FILM & TELEVISION';
    if(kind==='science')return 'SCIENCE & DISCOVERY';
    if(kind==='sports')return 'SPORTS';
    if(kind==='public-affairs')return 'PUBLIC AFFAIRS';
    return 'PERSONALIZED NEWS';
  }

  function renderStoryCardState(key){
    const node=feed?.querySelector(`[data-story-card="${CSS.escape(key)}"]`);
    const story=state.storyIndex[key];
    if(!node||!story)return;
    node.classList.toggle('is-enriching',Boolean(story.enriching));
  }

  function render(){
    const term=(search?.value||'').trim().toLowerCase();
    const cards=state.cards.filter(card=>{
      const story=state.storyIndex[keyOf(card)];
      return `${story?.headline||card.title||''} ${story?.standfirst||card.extract||''} ${story?.similarQuery||card.searchQuery||''}`.toLowerCase().includes(term);
    });
    if(count)count.textContent=`${cards.length} stor${cards.length===1?'y':'ies'}`;
    const status=get('newsPhi:monitorStatus:v1',{});
    syncLabel.textContent=status.state==='loading'?'Checking current reporting…':status.state==='error'?'News retrieval unavailable · saved feed retained':status.retrievedAt?`${status.added||0} new · checked ${new Date(status.retrievedAt).toLocaleTimeString()}`:`${state.cards.length} sourced stories`;
    if(!cards.length){
      feed.innerHTML=`<div class="empty-feed"><h2>${state.cards.length?'No stories match that filter':'Your personalized news desk is ready'}</h2><p>${state.cards.length?'Try a broader word.':'Searches and collections choose your topics. Refresh retrieves dated reporting from the last seven days. If there is no new reporting, your saved feed remains available.'}</p>${state.cards.length?'':`<a href="https://www-infinity4.github.io/Omni-Phi/">Open Omni Phi</a>`}</div>`;
      return;
    }
    feed.innerHTML=cards.map(card=>{
      const story=state.storyIndex[keyOf(card)];
      return `<article data-news-subject="${esc(story.searchQuery)}" class="news-card${story.enriching?' is-enriching':''}" data-story-card="${esc(story.storyKey)}"><div class="card-grid">${story.image?`<img class="card-image" src="${esc(story.image)}" alt="" loading="lazy">`:`<div class="card-image fallback"><span>φ</span></div>`}<div class="card-body"><div class="card-meta"><span>${kindLabel(story.kind)}</span><span>${esc(story.domain)}</span>${story.publishedLabel?`<time>${esc(story.publishedLabel)}</time>`:""}</div><h2>${esc(story.headline)}</h2><p class="card-excerpt">${esc(excerpt(story))}</p><div class="card-actions"><button class="full" type="button" data-story="${esc(story.storyKey)}">Read story</button><a class="story-search infinity" data-handoff-target="infinity" data-story-key="${esc(story.storyKey)}" href="${storySearchUrl(story,'infinity')}">Build in Infinity Phi</a><a class="story-search omni" data-handoff-target="omni" data-story-key="${esc(story.storyKey)}" href="${storySearchUrl(story,'omni')}">Explore in Omni Phi</a><a class="story-search quanta" data-handoff-target="quanta" data-story-key="${esc(story.storyKey)}" href="${storySearchUrl(story,'quanta')}">Learn in QuantaPhi</a><button class="share-card" type="button" data-share="${esc(story.storyKey)}">Share story · +1/10 ⭐</button><button type="button" class="hide-story" data-hide="${esc(story.storyKey)}" aria-label="Dismiss story" title="Show fewer stories like this">×</button></div></div></div></article>`;
    }).join('');
    feed.querySelectorAll('[data-story]').forEach(button=>button.addEventListener('click',()=>openStory(button.dataset.story)));
    feed.querySelectorAll('[data-share]').forEach(button=>button.addEventListener('click',()=>shareStory(button.dataset.share)));
    feed.querySelectorAll('[data-handoff-target]').forEach(link=>link.addEventListener('click',()=>{const story=state.storyIndex[link.dataset.storyKey];if(story)saveStoryHandoff(story,link.dataset.handoffTarget)}));
    feed.querySelectorAll('[data-hide]').forEach(button=>button.addEventListener('click',()=>{window.NewsPhiDirect?.hide(button.dataset.hide);state=synchronize();render()}));
    cards.slice(0,6).forEach(card=>{
      const story=state.storyIndex[keyOf(card)];
      if(story&&!story.enriched&&!story.enriching)setTimeout(()=>void enrichStory(story.storyKey),80);
    });
  }

  function openStory(key,rerender=false){
    const story=state.storyIndex[key];
    if(!story)return;
    if(!rerender){const readStories=get('newsPhi:readStories:v1',{}),firstRead=!readStories[key];readStories[key]=new Date().toISOString();set('newsPhi:readStories:v1',readStories);if(firstRead)preferenceSignal(story,1,'read');}
    dialog.dataset.storyKey=key;
    const sources=(story.sources||[]).map(source=>`<li><a href="${esc(source.url)}" target="_blank" rel="noopener">${esc(source.title)}</a><span>${esc(source.provider||'Source')}</span></li>`).join('');
    storyContent.innerHTML=`${story.image?`<img class="story-hero" src="${esc(story.image)}" alt="">`:''}<div class="story-full"><div class="card-meta"><span>${kindLabel(story.kind)}</span><span>${esc(story.domain)}</span>${story.publishedLabel?`<time>${esc(story.publishedLabel)}</time>`:""}</div><h2>${esc(story.headline)}</h2><p class="lead">${esc(story.standfirst)}</p>${(story.paragraphs||[]).filter(paragraph=>clean(paragraph)!==clean(story.standfirst)).map(paragraph=>`<p>${esc(paragraph)}</p>`).join('')}${sources?`<section class="story-sources"><h3>Sources behind this story</h3><ul>${sources}</ul></section>`:''}<div class="card-actions">${story.url?`<a href="${esc(story.url)}" target="_blank" rel="noopener">Open primary source</a>`:''}<a class="story-search infinity" data-handoff-target="infinity" data-story-key="${esc(story.storyKey)}" href="${storySearchUrl(story,'infinity')}">Build in Infinity Phi</a><a class="story-search omni" data-handoff-target="omni" data-story-key="${esc(story.storyKey)}" href="${storySearchUrl(story,'omni')}">Explore in Omni Phi</a><a class="story-search quanta" data-handoff-target="quanta" data-story-key="${esc(story.storyKey)}" href="${storySearchUrl(story,'quanta')}">Learn in QuantaPhi</a><button class="share-card" type="button" data-share="${esc(story.storyKey)}">Share story · +1/10 ⭐</button></div></div>`;
    storyContent.querySelectorAll('[data-share]').forEach(button=>button.addEventListener('click',()=>shareStory(button.dataset.share)));
    storyContent.querySelectorAll('[data-handoff-target]').forEach(link=>link.addEventListener('click',()=>saveStoryHandoff(story,link.dataset.handoffTarget)));
    if(location.hash!==`#story=${encodeURIComponent(key)}`)history.replaceState(null,'',`#story=${encodeURIComponent(key)}`);
    if(!rerender)dialog.showModal();
    if(!story.enriched&&!story.enriching)void enrichStory(key);
  }

  function closeStory(){
    dialog.close();
    dialog.dataset.storyKey='';
    history.replaceState(null,'',location.pathname+location.search);
  }

  document.getElementById('closeStory').addEventListener('click',closeStory);
  dialog.addEventListener('click',event=>{if(event.target===dialog)closeStory()});
  search?.addEventListener('input',render);
  // News Phi refreshes automatically; there is no manual reset mode.

  window.addEventListener('controlphi:shared',()=>{state=synchronize();render()});
  for(const event of ['newsphi:monitor-feed','newsphi:feed-updated','newsphi:quanta-cloud-ready','phi:ingested'])window.addEventListener(event,()=>{state=synchronize();render()});

  const importedKey=importSharedCard();
  render();
  const hashKey=location.hash.startsWith('#story=')?decodeURIComponent(location.hash.slice(7)):'';
  if(hashKey)openStory(state.storyIndex[hashKey]?hashKey:importedKey);
})();

/* ---- scroll-stability.js ---- */
(function(){
  'use strict';
  // Leave scrolling to the browser and the user.
  // Card/image/source mutations must never call scrollBy, poll the feed,
  // or try to restore an old card's viewport position.
  document.documentElement.dataset.newsPhiScroll='native';
})();

