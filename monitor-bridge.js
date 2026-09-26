(function(){
  'use strict';
  const COLLECTION='phiShared:collection:v1';
  const ENDPOINT_KEY='newsPhi:monitorEndpoint:v1';
  const MONITOR_CARDS='newsPhi:monitorCards:v1';
  const clean=v=>String(v??'').replace(/\s+/g,' ').trim();
  const read=(key,fallback)=>{try{return JSON.parse(localStorage.getItem(key))??fallback}catch{return fallback}};
  const write=(key,value)=>{try{localStorage.setItem(key,JSON.stringify(value));return true}catch{return false}};

  function chosenTopics(){
    const cards=read(COLLECTION,[]);
    const out=[];
    for(const card of Array.isArray(cards)?cards:[]){
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
    if(stories.length)write(MONITOR_CARDS,stories);
    return stories;
  }

  async function refreshFromMonitor(){
    const endpoint=clean(localStorage.getItem(ENDPOINT_KEY));
    if(!endpoint)return null;
    const seeds=chosenTopics();
    if(!seeds.length)return null;
    const response=await fetch(endpoint.replace(/\/$/,'')+'/p/news/feed',{
      method:'POST',headers:{'content-type':'application/json'},
      body:JSON.stringify({seeds,depth:2})
    });
    if(!response.ok)throw new Error('Monitor News feed failed');
    const payload=await response.json();
    const cards=publish(payload);
    window.dispatchEvent(new CustomEvent('newsphi:monitor-feed',{detail:{...payload,cards}}));
    return payload;
  }

  window.NewsPhiMonitor={chosenTopics,refresh:refreshFromMonitor,endpointKey:ENDPOINT_KEY,cardsKey:MONITOR_CARDS};
  window.addEventListener('newsphi:refresh-monitor',()=>void refreshFromMonitor());
  setTimeout(()=>void refreshFromMonitor().catch(()=>{}),300);
})();
