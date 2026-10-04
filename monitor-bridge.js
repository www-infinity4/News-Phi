(function(){
  'use strict';
  const COLLECTION='phiShared:collection:v1';
  const QUANTA='newsPhi:quantaCloudCards:v1';
  const OMNI_PROFILE='omniPhi:profile:v1';
  const OMNI_RESEARCH='omniPhi:lastResearch:v1';
  const CONTROL_SHARES='controlPhi:shareFeed:v1';
  const ENDPOINT_KEY='newsPhi:monitorEndpoint:v1';
  const MONITOR_CARDS='newsPhi:monitorCards:v1';
  const MONITOR_STATUS='newsPhi:monitorStatus:v1';
  const clean=v=>String(v??'').replace(/\s+/g,' ').trim();
  const read=(key,fallback)=>{try{return JSON.parse(localStorage.getItem(key))??fallback}catch{return fallback}};
  const write=(key,value)=>{try{localStorage.setItem(key,JSON.stringify(value));return true}catch{return false}};

  function chosenTopics(){
    const profile=read(OMNI_PROFILE,{collected:[]});
    const research=read(OMNI_RESEARCH,null);
    const cards=[
      ...read(QUANTA,[]),
      ...read(CONTROL_SHARES,[]),
      ...read(COLLECTION,[]),
      ...(profile.collected||[]),
      ...(research?.sources||[])
    ];
    const out=[];
    for(const card of cards){
      const topic=clean(card.searchQuery||card.sourceTitle||card.title);
      if(topic&&!out.includes(topic))out.push(topic);
    }
    return out.slice(0,24);
  }

  function publish(payload){
    const stories=(payload?.stories||[]).map((story,index)=>({
      id:'monitor-news-'+index+'-'+Date.now(),
      storyKey:'monitor:'+clean(story.url),
      title:clean(story.title),
      extract:clean(story.excerpt),
      url:clean(story.url),
      image:clean(story.image),
      imageVerified:Boolean(story.image),
      domain:clean(story.source)||'Monitor News',
      provider:clean(story.source)||'Monitor News',
      publishedAt:clean(story.publishedAt),
      collectedAt:new Date().toISOString(),
      searchQuery:clean(story.topic),
      sourceBacked:true,
      generatedBy:'monitor-news',
      quantWhy:story.why||null
    })).filter(card=>card.title&&card.url&&card.extract);
    // Empty successful retrievals must clear old headlines, not masquerade as fresh news.
    write(MONITOR_CARDS,stories);
    write(MONITOR_STATUS,{state:stories.length?'fresh':'empty',retrievedAt:clean(payload?.generatedAt)||new Date().toISOString(),count:stories.length,source:'Monitor / SearXNG',seeds:(payload?.seeds||[]).length});
    return stories;
  }

  async function refreshFromMonitor(){
    const endpoint=clean(localStorage.getItem(ENDPOINT_KEY)||'https://monitor-phi.marvaseater.workers.dev');
    if(!endpoint)return null;
    const seeds=chosenTopics();
    // Always call Monitor. When browser-local subjects are empty, the Worker falls back to its persisted D1 Quant graph.
    try{
      const response=await fetch(endpoint.replace(/\/$/,'')+'/p/news/feed',{
        method:'POST',cache:'no-store',headers:{'content-type':'application/json','cache-control':'no-cache'},
        body:JSON.stringify({seeds,depth:2})
      });
      if(!response.ok)throw new Error('Monitor HTTP '+response.status);
      const payload=await response.json();
      const cards=publish(payload);
      window.dispatchEvent(new CustomEvent('newsphi:monitor-feed',{detail:{...payload,cards}}));
      return payload;
    }catch(error){
      write(MONITOR_STATUS,{state:'error',checkedAt:new Date().toISOString(),message:clean(error?.message),source:'Monitor / SearXNG'});
      window.dispatchEvent(new CustomEvent('newsphi:monitor-error',{detail:{message:clean(error?.message)}}));
      throw error;
    }
  }

  window.NewsPhiMonitor={chosenTopics,refresh:refreshFromMonitor,endpointKey:ENDPOINT_KEY,cardsKey:MONITOR_CARDS};
  window.addEventListener('newsphi:refresh-monitor',()=>void refreshFromMonitor().catch(()=>{}));
})();
