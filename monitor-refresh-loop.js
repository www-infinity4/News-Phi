(function(){
  'use strict';
  const ENDPOINT='https://orange-brook-a2ac.marvaseater.workers.dev/search';
  const CARDS='newsPhi:monitorCards:v1',STATUS='newsPhi:monitorStatus:v1',INDEX='newsPhi:subjectIndex:v1';
  const SOURCES=['infinityPhi:searchTokens:v1','omniPhi:history:v1','quantaPhiBuildHistoryV1','quantaPhiCollected','phiShared:collection:v1','controlPhi:shareFeed:v1','phiShared:interestSignals:v1','newsPhi:retrievalQueue:v2','newsPhi:cloudSubjects:v1'];
  const read=(key,fallback)=>{try{return JSON.parse(localStorage.getItem(key))??fallback}catch{return fallback}};
  const write=(key,value)=>{try{localStorage.setItem(key,JSON.stringify(value));return true}catch{return false}};
  const clean=value=>String(value??'').replace(/<[^>]+>/g,' ').replace(/\s+/g,' ').trim();
  const subject=value=>clean(value).replace(/\.(?:jpe?g|png|webp|gif)$/i,'').replace(/\s*\(\d{7,}\)\s*$/,'').slice(0,180);
  const topicFrom=item=>subject(item?.query||item?.searchQuery||item?.topic||item?.subject||item?.sourceTitle||item?.title||item?.program||'');
  const at=item=>Date.parse(item?.createdAt||item?.created_at||item?.lastAt||item?.updatedAt||item?.collectedAt||item?.publishedAt||'')||Number(item?.lastAt)||0;
  function topics(){
    const rows=[];
    for(const key of SOURCES){
      const items=read(key,[]);if(!Array.isArray(items))continue;
      for(const item of items){
        if(!item||item.generatedBy==='monitor-news'||item.generatedBy==='news-phi-semantic-index'||(item.retrievalVersion&&!item.seedOnly))continue;
        const topic=topicFrom(item);if(topic)rows.push({topic,at:at(item)});
        for(const anchor of (item.semanticAnchors||[]).filter(x=>x.kind==='phrase').slice(0,2)){const term=subject(anchor.term);if(term)rows.push({topic:term,at:at(item)-1})}
      }
    }
    const semantic=read('newsPhi:semanticSeedIndex:v1',{});
    for(const seed of Object.values(semantic.seeds||{})){const topic=topicFrom(seed);if(topic)rows.push({topic,at:at(seed)})}
    const research=read('omniPhi:lastResearch:v1',null);if(research?.query)rows.push({topic:subject(research.query),at:at(research)});
    const newest=new Map(),now=Date.now();
    for(const row of rows){
      if(row.topic.length<3||!/[a-z]/i.test(row.topic))continue;
      const key=row.topic.toLowerCase(),prior=newest.get(key);
      if(!prior)newest.set(key,{topic:row.topic,at:row.at,count:1});else{prior.count++;if(row.at>prior.at)prior.at=row.at}
    }
    const feedback=read('newsPhi:topicFeedback:v1',{});
    const weight=x=>Math.max(-2,(Number(feedback[x.topic.toLowerCase()])||0)*0.2)+(x.at?Math.max(0,1-(now-x.at)/(30*86400000)):0)*3+Math.min(x.count,5)*0.4;
    const indexed=[...newest.values()].sort((a,b)=>weight(b)-weight(a)||b.at-a.at).slice(0,60);write(INDEX,indexed);
    return indexed.map(x=>x.topic).slice(0,12);
  }
  function publication(result,now=Date.now()){
    const explicit=result.publishedDate||result.published_at||result.pubDate||result.date;
    const parsed=Date.parse(String(explicit||''));if(Number.isFinite(parsed)&&parsed<=now+300000)return {at:parsed,label:new Date(parsed).toLocaleString()};
    const metadata=clean(result.metadata),relative=metadata.match(/(\d+)\s+(minute|hour|day|week)s?\s+ago/i);
    if(relative){const duration={minute:60000,hour:3600000,day:86400000,week:604800000}[relative[2].toLowerCase()];return {at:now-Number(relative[1])*duration,label:relative[0]}}
    if(/just now/i.test(metadata))return {at:now,label:'Just now'};
    const dated=String(result.url||'').match(/\/(20\d{2})[/-](\d{2})[/-](\d{2})(?:\/|[-_])/);
    if(dated){const value=Date.parse(dated.slice(1).join('-')+'T00:00:00Z');if(value<=now)return {at:value,label:dated.slice(1).join('-')}}
    return {at:0,label:''};
  }
  function normalize(result,topic,now=Date.now()){
    const title=clean(result.title),url=clean(result.url),extract=clean(result.content||result.description||result.snippet);
    if(!title||!/^https?:\/\//i.test(url)||!extract)return null;
    const published=publication(result,now);let domain='';try{domain=new URL(url).hostname.replace(/^www\./,'')}catch{return null}
    return {id:'direct-news:'+url,storyKey:'news:'+url,title,extract,url,image:clean(result.img_src||result.thumbnail_src||result.thumbnail||result.image),imageVerified:Boolean(result.img_src||result.thumbnail_src||result.thumbnail||result.image),domain,provider:domain,publishedAt:new Date(published.at||now).toISOString(),publishedLabel:published.label||'Publication time unavailable',publicationVerified:Boolean(published.at),retrievedAt:new Date(now).toISOString(),collectedAt:published.at?new Date(published.at).toISOString():new Date(now).toISOString(),searchQuery:topic,sourceBacked:true,generatedBy:'monitor-news',retrievalVersion:'indexed-fresh-news-v4'};
  }
  const STOP=/^(the|and|for|with|from|into|about|this|that|news|new|how|what|why|who|are|was|vs)$/;
  const terms=value=>[...new Set(clean(value).toLowerCase().replace(/[^a-z0-9' ]+/g,' ').split(/\s+/).filter(w=>w.length>2&&!STOP.test(w)))];
  function relevance(card,topic){
    const t=terms(topic);if(!t.length)return 1;
    const head=(card.title+' '+card.domain).toLowerCase(),body=card.extract.toLowerCase();
    return t.reduce((n,w)=>n+(head.includes(w)?2:body.includes(w)?1:0),0)/(t.length*2);
  }
  const isEra=topic=>/\b(1[89]\d\d|20[01]\d|19\d0s|20[01]0s|history|era|vintage|retro|classic|legacy)\b/i.test(topic);
  async function requestTopic(topic,range,page=1){
    const url=new URL(ENDPOINT);const params={q:topic,format:'json',categories:'news',safesearch:'1',_fresh:String(Date.now()),pageno:String(page)};if(range)params.time_range=range;url.search=new URLSearchParams(params);
    const ctl=new AbortController(),timer=setTimeout(()=>ctl.abort(),18000);
    try{const response=await fetch(url,{cache:'no-store',signal:ctl.signal});if(!response.ok)throw Error('News search '+response.status);const payload=await response.json();return (payload.results||[]).map(x=>normalize(x,topic)).filter(Boolean).filter(c=>{const at=Date.parse(c.publishedAt);return Number.isFinite(at)&&at<=Date.now()+300000&&(!c.publicationVerified||Date.now()-at<=7*86400000)&&relevance(c,topic)>=0.34}).map(c=>{c.relevance=Math.round(relevance(c,topic)*100)/100;return c})}finally{clearTimeout(timer)}
  }
  async function searchTopic(topic,page=1){
    const results=await Promise.allSettled(['day','week'].map(range=>requestTopic(topic,range,page)));
    if(results.every(x=>x.status==='rejected'))throw Error('Fresh news retrieval unavailable');
    return results.filter(x=>x.status==='fulfilled').flatMap(x=>x.value);
  }
  async function cloudSubjects(){
    try{const bridge=window.QuantaCloudConnection||window.StarQuestCloudLedger;if(!bridge?.authenticatedFetch)return;
      const response=await bridge.authenticatedFetch('https://quanta-phi-ledger.marvaseater.workers.dev/v1/quants/history');if(!response.ok)return;
      const data=await response.json();write('newsPhi:cloudSubjects:v1',(data.searches||[]).map(x=>({query:x.query_text,created_at:new Date(x.created_at).toISOString()})));
    }catch(_){}
  }
  function merge(batches){
    const seenUrl=new Set(),seenTitle=new Set(),cards=[];
    const all=batches.flat().sort((a,b)=>(Date.parse(b.publishedAt)||0)-(Date.parse(a.publishedAt)||0)||Number(Boolean(b.image))-Number(Boolean(a.image))||(b.relevance||0)-(a.relevance||0)||String(b.retrievedAt).localeCompare(String(a.retrievedAt)));
    const perTopic=new Map();
    for(const card of all){const used=perTopic.get(card.searchQuery)||0;if(used>=8)continue;const titleKey=card.title.toLowerCase().replace(/[^a-z0-9]+/g,' ').trim();if(seenUrl.has(card.url)||seenTitle.has(titleKey))continue;seenUrl.add(card.url);seenTitle.add(titleKey);perTopic.set(card.searchQuery,used+1);cards.push(card);if(cards.length>=40)break}
    return cards;
  }
  const HIDDEN='newsPhi:hiddenStories:v1',MODE='newsPhi:feedMode:v1',WIPED='newsPhi:feedWipedAt:v1';
  const DAY=86400000,TTL=7*DAY,BATCH=20,MAX_FEED=200,INTERVALS={daily:DAY,weekly:7*DAY};
  const cardKey=card=>card?.storyKey||card?.url||card?.id||'';
  function hiddenMap(now=Date.now()){
    const map=read(HIDDEN,{}),out={};
    for(const [key,time] of Object.entries(map&&typeof map==='object'?map:{}))if(now-Number(time)<30*DAY)out[key]=Number(time);
    return out;
  }
  function hide(key){const card=read(CARDS,[]).find(c=>cardKey(c)===key);if(card?.searchQuery){const weights=read('newsPhi:topicFeedback:v1',{});weights[card.searchQuery.toLowerCase()]=(Number(weights[card.searchQuery.toLowerCase()])||0)-1;write('newsPhi:topicFeedback:v1',weights)}const map=hiddenMap();map[key]=Date.now();write(HIDDEN,map);write(CARDS,read(CARDS,[]).filter(c=>cardKey(c)!==key));window.dispatchEvent(new CustomEvent('newsphi:monitor-feed',{detail:{hidden:key}}))}
  function setMode(mode){write(MODE,INTERVALS[mode]?mode:'off');if(!read(WIPED,0))write(WIPED,Date.now())}
  function applyPolicy(now=Date.now()){
    const interval=INTERVALS[read(MODE,'off')],last=Number(read(WIPED,0))||0;
    if(interval&&last&&now-last>=interval){write(CARDS,[]);write(WIPED,now)}
    else if(interval&&!last)write(WIPED,now);
  }
  function recency(card,now){const t=Date.parse(card.publishedAt)||Date.parse(card.firstSeenAt)||now;return Math.max(0,1-(now-t)/TTL)}
  const baseRank=(card,now)=>Math.round(((card.relevance||0)*50+recency(card,now)*50)*100)/100;
  function stack(stored,found,now=Date.now()){
    const hidden=hiddenMap(now),stack=new Map();
    for(const card of stored){const key=cardKey(card);if(!key||hidden[key])continue;stack.set(key,card)}
    const fresh=[];
    for(const card of found.flat()){
      const key=cardKey(card);if(!key||hidden[key])continue;
      const prior=stack.get(key);
      if(prior){stack.set(key,{...prior,relevance:Math.max(prior.relevance||0,card.relevance||0),retrievedAt:card.retrievedAt,revisitedAt:card.retrievedAt});continue}
      if(!fresh.some(c=>cardKey(c)===key))fresh.push({...card,firstSeenAt:new Date(now).toISOString()});
    }
    const titles=new Set([...stack.values()].map(c=>String(c.title).toLowerCase().replace(/[^a-z0-9]+/g,' ').trim()));
    const accepted=fresh.filter(c=>{const t=String(c.title).toLowerCase().replace(/[^a-z0-9]+/g,' ').trim();if(titles.has(t))return false;titles.add(t);return true});
    accepted.forEach(c=>{c.rank=baseRank(c,now)});
    accepted.sort((a,b)=>(Date.parse(b.publishedAt)||0)-(Date.parse(a.publishedAt)||0)||b.rank-a.rank);
    const added=accepted.slice(0,BATCH);
    added.forEach((c,i)=>{c.rank=Math.round((c.rank+1000-i*0.001)*1000)/1000;c.isNew=true});
    const older=[...stack.values()].map(c=>({...c,isNew:false,rank:baseRank(c,now)})).sort((a,b)=>b.rank-a.rank);
    return {cards:[...added,...older].slice(0,MAX_FEED),added:added.length};
  }
  let running=null;
  function refresh(){
    if(running)return running;
    running=(async()=>{
      applyPolicy();
      await cloudSubjects();const seeds=topics();if(!seeds.length){window.dispatchEvent(new CustomEvent('newsphi:refresh-monitor'));return {stories:read(CARDS,[]),seeds};}
      write(STATUS,{state:'loading',checkedAt:new Date().toISOString(),seeds:seeds.length});
      const stored=read(CARDS,[]),known=new Set(stored.map(cardKey)),hidden=hiddenMap();
      const results=await Promise.allSettled(seeds.slice(0,8).map(t=>searchTopic(t))); 
      if(results.every(x=>x.status==='rejected')){write(STATUS,{state:'error',checkedAt:new Date().toISOString(),message:'Direct news search unavailable; trying Monitor fallback'});window.dispatchEvent(new CustomEvent('newsphi:refresh-monitor'));return {stories:stored,seeds}}
      let found=results.filter(x=>x.status==='fulfilled').map(x=>x.value);
      const unseen=()=>found.flat().filter(c=>!known.has(cardKey(c))&&!hidden[cardKey(c)]).length;
      for(const page of [2,3]){
        if(unseen()>=BATCH)break;
        const older=await Promise.allSettled(seeds.slice(0,8).map(t=>searchTopic(t,page)));
        found=found.concat(older.filter(x=>x.status==='fulfilled').map(x=>x.value));
      }
      if(!found.flat().length){window.dispatchEvent(new CustomEvent('newsphi:refresh-monitor'))}
      const {cards,added}=stack(stored,found);
      write(CARDS,cards);write(STATUS,{state:added?'fresh':cards.length?'no-new':'empty',retrievedAt:new Date().toISOString(),count:cards.length,added,seeds:seeds.length,windowDays:7});
      window.dispatchEvent(new CustomEvent('newsphi:monitor-feed',{detail:{stories:cards,seeds,direct:true}}));return {stories:cards,seeds};
    })().finally(()=>running=null);return running;
  }
  window.NewsPhiDirect={refresh,hide,setMode,applyPolicy,stack,topics,publication,normalize,merge,requestTopic};
  let timer=0;const schedule=(delay=180)=>{clearTimeout(timer);timer=setTimeout(()=>void refresh().catch(()=>{}),delay)};
  for(const event of ['focus','controlphi:shared','phi:ingested','newsphi:run-retrieval','quantaPhiHistoryAdded','phiShared:collection-change'])window.addEventListener(event,()=>schedule());
  window.addEventListener('storage',event=>{if(SOURCES.includes(event.key||''))schedule()});
  document.addEventListener('starquest:ledger-connected',()=>schedule());
  setInterval(()=>{if(!document.hidden)schedule(0)},300000);schedule(350);
})();

