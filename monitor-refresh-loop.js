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
    const newest=new Map();for(const row of rows){const key=row.topic.toLowerCase();if(!newest.has(key)||row.at>newest.get(key).at)newest.set(key,row)}
    const indexed=[...newest.values()].sort((a,b)=>b.at-a.at).slice(0,60);write(INDEX,indexed);
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
    return {id:'direct-news:'+url,storyKey:'news:'+url,title,extract,url,image:clean(result.img_src||result.thumbnail_src||result.thumbnail||result.image),imageVerified:Boolean(result.img_src||result.thumbnail_src||result.thumbnail||result.image),domain,provider:domain,publishedAt:published.at?new Date(published.at).toISOString():'',publishedLabel:published.label,retrievedAt:new Date(now).toISOString(),collectedAt:published.at?new Date(published.at).toISOString():new Date(now).toISOString(),searchQuery:topic,sourceBacked:true,generatedBy:'monitor-news',retrievalVersion:'indexed-fresh-news-v3'};
  }
  async function requestTopic(topic,range){
    const url=new URL(ENDPOINT);url.search=new URLSearchParams({q:topic,format:'json',categories:'news',time_range:range,safesearch:'1',_fresh:String(Date.now())});
    const ctl=new AbortController(),timer=setTimeout(()=>ctl.abort(),18000);
    try{const response=await fetch(url,{cache:'no-store',signal:ctl.signal});if(!response.ok)throw Error('News search '+response.status);const payload=await response.json();return (payload.results||[]).map(x=>normalize(x,topic)).filter(Boolean)}finally{clearTimeout(timer)}
  }
  async function searchTopic(topic){
    const today=await requestTopic(topic,'day');if(today.length>=3)return today.slice(0,8);
    const week=await requestTopic(topic,'week').catch(()=>[]);return [...today,...week].slice(0,8);
  }
  async function cloudSubjects(){
    try{const bridge=window.QuantaCloudConnection||window.StarQuestCloudLedger;if(!bridge?.authenticatedFetch)return;
      const response=await bridge.authenticatedFetch('https://quanta-phi-ledger.marvaseater.workers.dev/v1/quants/history');if(!response.ok)return;
      const data=await response.json();write('newsPhi:cloudSubjects:v1',(data.searches||[]).map(x=>({query:x.query_text,created_at:new Date(x.created_at).toISOString()})));
    }catch(_){}
  }
  function merge(batches){
    const seenUrl=new Set(),seenTitle=new Set(),cards=[];
    const all=batches.flat().sort((a,b)=>(Date.parse(b.publishedAt)||0)-(Date.parse(a.publishedAt)||0)||String(b.retrievedAt).localeCompare(String(a.retrievedAt)));
    for(const card of all){const titleKey=card.title.toLowerCase().replace(/[^a-z0-9]+/g,' ').trim();if(seenUrl.has(card.url)||seenTitle.has(titleKey))continue;seenUrl.add(card.url);seenTitle.add(titleKey);cards.push(card);if(cards.length>=40)break}
    return cards;
  }
  let running=null;
  function refresh(){
    if(running)return running;
    running=(async()=>{
      await cloudSubjects();const seeds=topics();if(!seeds.length)return {stories:read(CARDS,[]),seeds};
      write(STATUS,{state:'loading',checkedAt:new Date().toISOString(),seeds:seeds.length});
      const results=await Promise.allSettled(seeds.slice(0,8).map(searchTopic));
      const cards=merge(results.filter(x=>x.status==='fulfilled').map(x=>x.value));
      if(results.every(x=>x.status==='rejected')){write(STATUS,{state:'error',checkedAt:new Date().toISOString()});return {stories:read(CARDS,[]),seeds}}
      write(CARDS,cards);write(STATUS,{state:cards.length?'fresh':'empty',retrievedAt:new Date().toISOString(),count:cards.length,seeds:seeds.length});
      window.dispatchEvent(new CustomEvent('newsphi:monitor-feed',{detail:{stories:cards,seeds,direct:true}}));return {stories:cards,seeds};
    })().finally(()=>running=null);return running;
  }
  window.NewsPhiDirect={refresh,topics,publication,normalize,merge};
  let timer=0;const schedule=(delay=180)=>{clearTimeout(timer);timer=setTimeout(()=>void refresh().catch(()=>{}),delay)};
  for(const event of ['focus','controlphi:shared','phi:ingested','newsphi:run-retrieval','quantaPhiHistoryAdded','phiShared:collection-change'])window.addEventListener(event,()=>schedule());
  window.addEventListener('storage',event=>{if(SOURCES.includes(event.key||''))schedule()});
  document.addEventListener('starquest:ledger-connected',()=>schedule());
  setInterval(()=>{if(!document.hidden)schedule(0)},300000);schedule(350);
})();
