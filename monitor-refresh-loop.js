(function(){
  'use strict';
  const ENDPOINT='https://orange-brook-a2ac.marvaseater.workers.dev/search';
  const MONITOR_CARDS='newsPhi:monitorCards:v1';
  const MONITOR_STATUS='newsPhi:monitorStatus:v1';
  const SOURCES=[
    'infinityPhi:searchTokens:v1',
    'omniPhi:history:v1',
    'quantaPhiBuildHistoryV1',
    'phiShared:collection:v1',
    'controlPhi:shareFeed:v1',
    'phiShared:interestSignals:v1'
  ];
  const read=(key,fallback)=>{try{return JSON.parse(localStorage.getItem(key))??fallback}catch{return fallback}};
  const write=(key,value)=>{try{localStorage.setItem(key,JSON.stringify(value));return true}catch{return false}};
  const clean=value=>String(value??'').replace(/<[^>]+>/g,' ').replace(/\s+/g,' ').trim();
  const date=value=>{const n=Date.parse(String(value||''));return Number.isFinite(n)?new Date(n).toISOString():''};
  const topicFrom=item=>clean(item?.query||item?.searchQuery||item?.topic||item?.sourceTitle||item?.title||item?.program||'');

  function topics(){
    const rows=[];
    for(const key of SOURCES){
      const items=read(key,[]);
      if(!Array.isArray(items))continue;
      for(const item of items){
        const topic=topicFrom(item);if(!topic)continue;
        const at=Date.parse(item?.createdAt||item?.created_at||item?.updatedAt||item?.collectedAt||item?.publishedAt||'')||0;
        rows.push({topic,at});
      }
    }
    const research=read('omniPhi:lastResearch:v1',null);
    if(research?.query)rows.push({topic:clean(research.query),at:Date.now()});
    const newest=new Map();
    for(const row of rows){
      const key=row.topic.toLowerCase();
      if(!newest.has(key)||row.at>newest.get(key).at)newest.set(key,row);
    }
    return [...newest.values()].sort((a,b)=>b.at-a.at).map(x=>x.topic).slice(0,12);
  }

  async function searchTopic(topic){
    const u=new URL(ENDPOINT);
    u.search=new URLSearchParams({q:topic,format:'json',categories:'news',time_range:'week',safesearch:'1',_fresh:String(Date.now())});
    const ctl=new AbortController(),timer=setTimeout(()=>ctl.abort(),8000);
    try{
      const response=await fetch(u,{cache:'no-store',signal:ctl.signal,headers:{'cache-control':'no-cache'}});
      if(!response.ok)throw new Error('news search '+response.status);
      const payload=await response.json();
      return (payload?.results||[]).slice(0,5).map(result=>{
        const title=clean(result.title),url=clean(result.url),extract=clean(result.content||result.description||result.snippet||'');
        if(!title||!url||!extract)return null;
        const published=date(result.publishedDate||result.published_at||result.pubDate||result.date);
        let domain=clean(result.engine||result.source||result.provider||'');
        if(!domain){try{domain=new URL(url).hostname.replace(/^www\./,'')}catch{}}
        return {
          id:'direct-news:'+url,
          storyKey:'news:'+url,
          title,
          extract,
          url,
          image:clean(result.img_src||result.thumbnail_src||result.thumbnail||result.image||''),
          imageVerified:Boolean(result.img_src||result.thumbnail_src||result.thumbnail||result.image),
          domain:domain||'News source',
          provider:domain||'News source',
          publishedAt:published,
          collectedAt:published||new Date().toISOString(),
          searchQuery:topic,
          sourceBacked:true,
          generatedBy:'monitor-news',
          retrievalVersion:'cloudflare-news-only-20260929'
        };
      }).filter(Boolean);
    }finally{clearTimeout(timer)}
  }

  async function refresh(){
    const seeds=topics();if(!seeds.length)return {stories:read(MONITOR_CARDS,[]),seeds};
    const results=await Promise.allSettled(seeds.slice(0,8).map(searchTopic));
    const batches=results.filter(x=>x.status==='fulfilled').flatMap(x=>x.value);
    if(results.every(x=>x.status==='rejected'))return {stories:read(MONITOR_CARDS,[]),seeds};
    const seenUrl=new Set(),seenTitle=new Set(),cards=[];
    for(const card of batches){
      const titleKey=card.title.toLowerCase().replace(/[^a-z0-9]+/g,' ').trim();
      if(seenUrl.has(card.url)||seenTitle.has(titleKey))continue;
      seenUrl.add(card.url);seenTitle.add(titleKey);cards.push(card);
      if(cards.length>=30)break;
    }
    cards.sort((a,b)=>String(b.collectedAt).localeCompare(String(a.collectedAt)));
    write(MONITOR_CARDS,cards);
    write(MONITOR_STATUS,{state:cards.length?'fresh':'empty',retrievedAt:new Date().toISOString(),count:cards.length,source:'Direct fresh news',seeds:seeds.length});
    window.dispatchEvent(new CustomEvent('newsphi:monitor-feed',{detail:{stories:cards,seeds,generatedAt:new Date().toISOString(),direct:true}}));
    return {stories:cards,seeds};
  }

  
  window.NewsPhiDirect={refresh,topics};
  let timer=0,running=false;
  const schedule=(delay=120)=>{clearTimeout(timer);timer=setTimeout(async()=>{if(running)return;running=true;try{await refresh()}catch(_){}finally{running=false}},delay)};
  window.addEventListener('focus',()=>schedule(80));
  window.addEventListener('controlphi:shared',()=>schedule(160));
  window.addEventListener('phi:ingested',()=>schedule(160));
  window.addEventListener('storage',event=>{if(SOURCES.includes(event.key||''))schedule(180)});
  setInterval(()=>schedule(0),300000);
  schedule(850);
})();