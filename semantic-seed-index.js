(function(){
  'use strict';

  const SHARED='phiShared:collection:v1';
  const INDEX='newsPhi:semanticSeedIndex:v1';
  const PROCESSED='newsPhi:semanticSeedProcessed:v1';
  const CONFIG='controlPhi:searchConfig:v1';
  const STOP=new Set(['about','after','again','also','and','are','because','before','being','card','cards','collected','from','have','image','images','into','more','news','only','search','selected','source','that','their','these','they','this','through','what','when','where','which','with','would','your','infinity','phi','latest','background','context']);

  const get=(key,fallback)=>{try{return JSON.parse(localStorage.getItem(key))??fallback}catch{return fallback}};
  const set=(key,value)=>{try{localStorage.setItem(key,JSON.stringify(value));return true}catch{return false}};
  const clean=(value,max=4000)=>String(value??'').replace(/<[^>]+>/g,' ').replace(/\s+/g,' ').trim().slice(0,max);
  const hash=value=>{let h=2166136261;const text=String(value||'');for(let i=0;i<text.length;i++){h^=text.charCodeAt(i);h=Math.imul(h,16777619)}return(h>>>0).toString(36)};
  const keyOf=card=>card?.storyKey||card?.url||card?.id||clean(card?.title,180).toLowerCase().replace(/[^a-z0-9]+/g,'-');
  const words=value=>clean(value).toLowerCase().replace(/https?:\/\/\S+/g,' ').replace(/[^a-z0-9'’-]+/g,' ').split(/\s+/).filter(word=>word.length>2&&!STOP.has(word)&&!/^\d+$/.test(word));
  const norm=value=>clean(value,260).toLowerCase().replace(/\([^)]*\)/g,' ').replace(/[^a-z0-9]+/g,' ').trim();
  const timeout=(promise,ms=6500)=>Promise.race([promise,new Promise((_,reject)=>setTimeout(()=>reject(new Error('timeout')),ms))]);

  function fallbackAnchors(seed){
    const title=clean(seed.title||seed.sourceTitle,260);
    const query=clean(seed.searchQuery,260);
    const text=clean(`${title}. ${query}. ${seed.sourceExtract||''} ${seed.extract||''}`,3400);
    const map=new Map();
    const add=(term,weight,kind='word')=>{
      const value=clean(term,160).replace(/^[\s,;:.-]+|[\s,;:.-]+$/g,'');
      if(!value||value.length<3)return;
      const key=value.toLowerCase(),prior=map.get(key);
      if(!prior||weight>prior.weight)map.set(key,{term:value,weight,kind});
    };
    if(title)add(title,18,'title-entity');
    if(query)add(query,15,'query-entity');
    for(const match of text.matchAll(/\b(?:[A-Z][A-Za-z0-9'’.-]*(?:\s+(?:of|the|and|in|on|for|to))?\s*){2,7}\b/g))add(match[0],14,'pronoun-phrase');
    const list=words(text);
    list.slice(0,90).forEach((word,index)=>add(word,Math.max(3,7-Math.floor(index/20)),'word'));
    for(let i=0;i<Math.min(list.length-1,70);i++)add(`${list[i]} ${list[i+1]}`,6,'phrase');
    return [...map.values()].sort((a,b)=>b.weight-a.weight||b.term.length-a.term.length).slice(0,48);
  }

  function normalizeSeeds(){
    const shared=get(SHARED,[]);
    if(!Array.isArray(shared)||!shared.length)return [];
    let changed=false;
    const next=shared.map(card=>{
      const generated=clean(card?.generatedBy,120).toLowerCase();
      const candidate=Boolean(card)&&(card?.ingestType==='semantic-seed'||card?.seedOnly||card?.selectedFromImageSearch||card?.kind==='image-seed'||((card?.collectedAt||card?.tokenId||card?.collectedFrom||card?.sourceLocked)&&!generated.startsWith('news-phi-semantic')));
      if(!candidate)return card;
      const anchors=Array.isArray(card.semanticAnchors)&&card.semanticAnchors.length?card.semanticAnchors:fallbackAnchors(card);
      if(card.ingestType==='semantic-seed'&&card.seedOnly&&card.semanticAnchors===anchors)return card;
      changed=true;
      return {...card,seedOnly:true,ingestType:'semantic-seed',semanticVersion:1,semanticAnchors:anchors,generatedBy:card.generatedBy||'news-phi-semantic-seed'};
    });
    if(changed)set(SHARED,next);
    const live=next.filter(card=>card?.ingestType==='semantic-seed'||card?.seedOnly);
    const saved=get(INDEX,{seeds:{}})?.seeds||{};
    const archived=Object.values(saved).map(seed=>({
      id:seed.key,storyKey:seed.key,title:seed.title||'',sourceTitle:seed.title||'',
      searchQuery:seed.query||'',url:seed.url||'',image:seed.image||'',
      collectedAt:seed.at||'',semanticAnchors:Array.isArray(seed.anchors)?seed.anchors:[],
      seedOnly:true,ingestType:'semantic-seed',semanticVersion:1,
      generatedBy:'news-phi-index-replay'
    }));
    const infinityHistory=get('infinity_phi_context_v1',[]);
    const omniHistory=get('omniPhi:history:v1',[]);
    const searchSeeds=[
      ...(Array.isArray(infinityHistory)?infinityHistory:[]).map(item=>({
        id:`infinity-search:${norm(item?.query)}`,storyKey:`infinity-search:${norm(item?.query)}`,
        title:clean(item?.query,260),sourceTitle:clean(item?.query,260),
        searchQuery:clean(item?.resolved||item?.query,260),collectedAt:item?.at?new Date(item.at).toISOString():'',
        seedOnly:true,ingestType:'semantic-seed',semanticVersion:1,generatedBy:'news-phi-infinity-search-index'
      })),
      ...(Array.isArray(omniHistory)?omniHistory:[]).map(item=>({
        id:`omni-search:${norm(item?.query)}`,storyKey:`omni-search:${norm(item?.query)}`,
        title:clean(item?.query,260),sourceTitle:clean(item?.query,260),
        searchQuery:clean(item?.query,260),collectedAt:item?.createdAt||'',
        seedOnly:true,ingestType:'semantic-seed',semanticVersion:1,generatedBy:'news-phi-omni-search-index'
      }))
    ].filter(seed=>seed.title);
    searchSeeds.forEach(seed=>{seed.semanticAnchors=fallbackAnchors(seed)});
    const combined=new Map();
    [...live,...archived,...searchSeeds].forEach(seed=>{const key=keyOf(seed);if(key&&!combined.has(key))combined.set(key,seed)});
    return [...combined.values()];
  }

  function mergeIndex(seeds){
    const store=get(INDEX,{version:1,terms:{},seeds:{},updatedAt:''});
    store.terms=store.terms||{};store.seeds=store.seeds||{};
    seeds.forEach(seed=>{
      const key=keyOf(seed);if(!key)return;
      const anchors=Array.isArray(seed.semanticAnchors)&&seed.semanticAnchors.length?seed.semanticAnchors:fallbackAnchors(seed);
      store.seeds[key]={key,title:seed.title||'',query:seed.searchQuery||'',url:seed.url||'',image:seed.image||'',anchors,at:seed.collectedAt||new Date().toISOString()};
      anchors.forEach(anchor=>{
        const term=clean(anchor.term,160).toLowerCase();if(!term)return;
        const current=store.terms[term]||{term:anchor.term,weight:0,hits:0,kinds:{},seedKeys:[]};
        current.weight=Math.min(200,Number(current.weight||0)+Math.max(1,Number(anchor.weight||1)));
        current.hits=Number(current.hits||0)+1;
        current.kinds=current.kinds||{};current.kinds[anchor.kind||'word']=(current.kinds[anchor.kind||'word']||0)+1;
        current.seedKeys=[key,...(current.seedKeys||[]).filter(item=>item!==key)].slice(0,20);
        store.terms[term]=current;
      });
    });
    store.updatedAt=new Date().toISOString();
    set(INDEX,store);
    return store;
  }

  async function readerText(url){
    if(!/^https?:\/\//i.test(url||''))return '';
    try{
      const parsed=new URL(url);
      const target=`https://r.jina.ai/http://${parsed.host}${parsed.pathname}${parsed.search}`;
      const response=await timeout(fetch(target,{cache:'no-store',headers:{Accept:'text/plain'}}),6000);
      return response.ok?clean(await response.text(),5200):'';
    }catch{return ''}
  }

  function enrichedAnchors(seed,reader){
    const base=Array.isArray(seed.semanticAnchors)?seed.semanticAnchors:[];
    if(!reader)return base.length?base:fallbackAnchors(seed);
    const extra=fallbackAnchors({...seed,extract:`${seed.extract||''} ${reader}`});
    const map=new Map();
    [...base,...extra].forEach(anchor=>{
      const key=clean(anchor.term,160).toLowerCase();if(!key)return;
      const prior=map.get(key);if(!prior||Number(anchor.weight||0)>Number(prior.weight||0))map.set(key,anchor);
    });
    return [...map.values()].sort((a,b)=>Number(b.weight||0)-Number(a.weight||0)).slice(0,64);
  }

  function relationQueries(seed,anchors){
    const title=clean(seed.title||seed.sourceTitle||seed.searchQuery,180);
    const phraseAnchors=anchors.filter(a=>/title-entity|query-entity|pronoun-phrase|quoted-phrase/.test(a.kind||'')).slice(0,4);
    const primary=clean(phraseAnchors[0]?.term||title,180);
    const text=`${seed.semanticSourceText||''} ${seed.sourceExtract||''} ${seed.extract||''} ${anchors.map(a=>a.term).join(' ')}`.toLowerCase();
    const lanes=[];
    const push=q=>{q=clean(q,280);if(q&&!lanes.some(item=>item.toLowerCase()===q.toLowerCase()))lanes.push(q)};
    if(primary)push(`${primary} related productions people history`);
    if(/\b(cast|actor|actors|actress|actresses|starring|performer)\b/.test(text))push(`${primary} cast actors actresses starring`);
    if(/\b(director|directed|filmmaker|producer|production)\b/.test(text))push(`${primary} director producer production`);
    if(/\b(whimsical|comedy|musical|magical|fantasy|classic)\b/.test(text)){
      const style=anchors.filter(a=>/whimsical|comedy|musical|magical|fantasy|classic/i.test(a.term)).slice(0,3).map(a=>a.term).join(' ');
      push(`${primary} ${style} related films shows`);
    }
    const broad=phraseAnchors.slice(0,3).map(a=>a.term).join(' ');
    if(broad)push(`${broad} connected works creators`);
    return lanes.slice(0,4);
  }

  async function wikipedia(query){
    const url=`https://en.wikipedia.org/w/api.php?action=query&generator=search&gsrsearch=${encodeURIComponent(query)}&gsrlimit=8&prop=extracts|info|pageimages&exintro=1&explaintext=1&inprop=url&pithumbsize=1000&format=json&origin=*`;
    try{const response=await timeout(fetch(url,{cache:'no-store'}),5500);if(!response.ok)return[];const data=await response.json();return Object.values(data?.query?.pages||{}).flatMap(page=>page.title&&page.extract?[{title:clean(page.title),url:page.fullurl||'',excerpt:clean(page.extract),image:page.thumbnail?.source||'',provider:'Wikipedia'}]:[])}catch{return[]}
  }

  async function duck(query){
    try{const response=await timeout(fetch(`https://api.duckduckgo.com/?q=${encodeURIComponent(query)}&format=json&no_html=1&skip_disambig=0`,{cache:'no-store'}),4500);if(!response.ok)return[];const data=await response.json(),out=[];if(data.AbstractText)out.push({title:clean(data.Heading||query),url:data.AbstractURL||'',excerpt:clean(data.AbstractText),image:data.Image||'',provider:'DuckDuckGo'});(data.RelatedTopics||[]).flatMap(item=>item.Topics||[item]).slice(0,10).forEach(item=>{if(item.Text)out.push({title:clean(item.Text).split(' - ')[0],url:item.FirstURL||'',excerpt:clean(item.Text),image:'',provider:'DuckDuckGo'})});return out}catch{return[]}
  }

  async function searx(query){
    const config=get(CONFIG,{}),endpoint=clean(config?.endpoints?.searxng||config?.searxng||'').replace(/\/$/,'');
    if(!endpoint)return[];
    try{const response=await timeout(fetch(`${endpoint}/search?${new URLSearchParams({q:query,format:'json'})}`,{cache:'no-store'}),6000);if(!response.ok)return[];const data=await response.json();return(data?.results||[]).slice(0,12).flatMap(item=>item.title&&item.url&&(item.content||item.snippet)?[{title:clean(item.title),url:clean(item.url),excerpt:clean(item.content||item.snippet),image:clean(item.img_src||item.thumbnail),provider:'Web result',publishedAt:clean(item.publishedDate)}]:[])}catch{return[]}
  }

  function semanticScore(source,anchors,lane){
    const text=clean(`${source.title} ${source.excerpt}`,4200).toLowerCase();
    let score=0;
    anchors.slice(0,30).forEach(anchor=>{
      const term=clean(anchor.term,160).toLowerCase();if(!term)return;
      const weight=Math.max(1,Number(anchor.weight||1));
      if(text.includes(term))score+=weight*2;
      else{
        const hit=words(term).filter(word=>text.includes(word)).length;
        if(hit)score+=Math.min(weight,hit*2);
      }
    });
    words(lane).forEach(word=>{if(text.includes(word))score+=1.5});
    return score;
  }

  function fingerprintOf(seed){return `v2|${seed.collectedAt||''}|${seed.semanticVersion||1}|${clean(seed.title,160)}|${(seed.semanticAnchors||[]).slice(0,12).map(a=>`${a.term}:${a.weight}`).join('|')}`}

  async function buildFromSeed(seed,processed){
    const key=keyOf(seed);if(!key)return 0;
    const fingerprint=fingerprintOf(seed);
    if(processed[key]===fingerprint)return 0;

    const reader=await readerText(seed.url||seed.sourceUrl||'');
    const anchors=enrichedAnchors(seed,reader);
    const lanes=relationQueries(seed,anchors);
    if(!lanes.length){processed[key]=fingerprint;return 0}

    const settled=await Promise.all(lanes.map(async lane=>{
      const results=await Promise.allSettled([wikipedia(lane),duck(lane),searx(lane)]);
      return {lane,sources:results.flatMap(result=>result.status==='fulfilled'?result.value:[])};
    }));

    const shared=get(SHARED,[]);
    const existingUrls=new Set(shared.map(card=>card?.url).filter(Boolean));
    const existingTitles=new Set(shared.map(card=>norm(card?.title)).filter(Boolean));
    const seedTitle=norm(seed.title||seed.sourceTitle);
    const seedUrl=seed.url||seed.sourceUrl||'';
    const candidates=[];
    const seen=new Set();
    settled.forEach(({lane,sources})=>sources.forEach(source=>{
      const id=source.url||`${source.provider}:${source.title}`;
      if(!id||seen.has(id)||existingUrls.has(source.url)||source.url===seedUrl)return;
      const titleNorm=norm(source.title);
      if(!titleNorm||titleNorm===seedTitle||existingTitles.has(titleNorm))return;
      seen.add(id);
      const score=semanticScore(source,anchors,lane);
      if(score<=2)return;
      candidates.push({...source,_score:score,_lane:lane});
    }));
    candidates.sort((a,b)=>b._score-a._score);
    const chosen=candidates.slice(0,8);
    if(!chosen.length){processed[key]=fingerprint;return 0}

    const now=Date.now();
    const built=chosen.map((source,index)=>{
      const matched=anchors.filter(anchor=>clean(`${source.title} ${source.excerpt}`).toLowerCase().includes(clean(anchor.term,160).toLowerCase())).slice(0,8);
      return {
        id:`news-semantic-${hash(`${key}|${source.url||source.title}`)}`,
        storyKey:`semantic:${hash(source.url||`${source.provider}:${source.title}`)}`,
        title:source.title,
        extract:clean(source.excerpt,1500),
        url:source.url||'',
        domain:source.provider||'Related source',
        provider:source.provider||'Related source',
        publishedAt:source.publishedAt||'',
        collectedAt:new Date(now-(index+1)*1000).toISOString(),
        searchQuery:source._lane,
        sources:[{title:source.title,url:source.url||'',excerpt:source.excerpt,provider:source.provider}],
        image:source.image||'',
        imageVerified:Boolean(source.image),
        sourceBacked:true,
        generatedBy:'news-phi-semantic-index',
        parentStoryKey:key,
        relation:'semantic-adjacent',
        semanticSeedTitle:seed.title||'',
        semanticMatchedAnchors:matched,
        semanticScore:source._score
      };
    });
    set(SHARED,[...shared,...built]);
    processed[key]=fingerprint;
    return built.length;
  }

  let running=false;
  async function run(){
    if(running)return;
    running=true;
    try{
      const seeds=normalizeSeeds();
      if(!seeds.length)return;
      mergeIndex(seeds);
      const processed=get(PROCESSED,{});
      let built=0;
      const pending=seeds.slice().sort((a,b)=>String(b.collectedAt||'').localeCompare(String(a.collectedAt||''))).filter(seed=>processed[keyOf(seed)]!==fingerprintOf(seed)).slice(0,8);
      const label=document.getElementById('syncLabel');
      if(label&&pending.length)label.textContent=`Building news from ${pending.length} indexed selections…`;
      for(const seed of pending)built+=await buildFromSeed(seed,processed);
      set(PROCESSED,processed);
      if(label)label.textContent=built?`${built} new stories built from your index`:pending.length?'Indexed selections checked — refresh for the next batch':'Your collected index is current';
      if(built){
        setTimeout(()=>document.getElementById('refreshFeed')?.click(),50);
        window.dispatchEvent(new CustomEvent('controlphi:shared',{detail:{source:'news-phi-semantic-index',count:built}}));
      }
    }finally{running=false}
  }

  function install(){
    const seeds=normalizeSeeds();
    if(seeds.length)mergeIndex(seeds);
    document.getElementById('refreshFeed')?.addEventListener('click',()=>setTimeout(()=>void run(),80));
    addEventListener('storage',event=>{if(event.key===SHARED||event.key===INDEX)setTimeout(()=>void run(),120)});
    setTimeout(()=>void run(),350);
  }
  if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',install,{once:true});
  else install();
})();