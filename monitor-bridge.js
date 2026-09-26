(function(){
  'use strict';
  const COLLECTION='phiShared:collection:v1';
  const ENDPOINT_KEY='newsPhi:monitorEndpoint:v1';
  const clean=v=>String(v??'').replace(/\s+/g,' ').trim();
  const read=(key,fallback)=>{try{return JSON.parse(localStorage.getItem(key))??fallback}catch{return fallback}};

  function chosenTopics(){
    const cards=read(COLLECTION,[]);
    const out=[];
    for(const card of Array.isArray(cards)?cards:[]){
      const topic=clean(card.searchQuery||card.sourceTitle||card.title);
      if(topic&&!out.includes(topic))out.push(topic);
    }
    return out.slice(0,24);
  }

  async function refreshFromMonitor(){
    const endpoint=clean(localStorage.getItem(ENDPOINT_KEY));
    if(!endpoint)return null;
    const seeds=chosenTopics();
    if(!seeds.length)return null;
    const response=await fetch(endpoint.replace(/\/$/,'')+'/p/news/feed',{
      method:'POST',
      headers:{'content-type':'application/json'},
      body:JSON.stringify({seeds,depth:2})
    });
    if(!response.ok)throw new Error('Monitor News feed failed');
    const payload=await response.json();
    window.dispatchEvent(new CustomEvent('newsphi:monitor-feed',{detail:payload}));
    return payload;
  }

  window.NewsPhiMonitor={chosenTopics,refresh:refreshFromMonitor,endpointKey:ENDPOINT_KEY};
  window.addEventListener('newsphi:refresh-monitor',()=>void refreshFromMonitor());
})();
