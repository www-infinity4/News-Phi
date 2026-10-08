/* ---- quanta-cloud-bridge.js ---- */
(function(){
  'use strict';

  const ENDPOINT='https://quanta-phi-ledger.marvaseater.workers.dev/v1/quants/collects';
  const COLLECTION='phiShared:collection:v1';
  const QUEUE='newsPhi:retrievalQueue:v2';
  const CACHE='newsPhi:quantaCloudCards:v1';
  const REFRESH_MS=60000;

  const clean=(value,max=4000)=>String(value??'').replace(/\s+/g,' ').trim().slice(0,max);
  const read=(key,fallback)=>{try{return JSON.parse(localStorage.getItem(key))??fallback}catch{return fallback}};
  const write=(key,value)=>{try{localStorage.setItem(key,JSON.stringify(value));return true}catch{return false}};

  function normalize(card){
    const key=clean(card?.key,700);
    const title=clean(card?.title,500);
    if(!key||!title)return null;
    const story=clean(card?.story,4000);
    const media=clean(card?.media,2000);
    const sourceUrl=clean(card?.sourceUrl,2000);
    const type=clean(card?.type,40);
    return {
      id:'collect:'+key,
      storyKey:'collect:'+key,
      title,
      extract:story||('Collected in Quanta Phi: '+title),
      body:story,
      url:sourceUrl,
      sourceUrl,
      image:type.toLowerCase()==='image'?media:'',
      media,
      imageVerified:type.toLowerCase()==='image'&&/^https:\/\//i.test(media),
      provider:'Quanta Phi',
      domain:'Quanta Phi cloud collection',
      searchQuery:title,
      collectedAt:clean(card?.collectedAt,80)||new Date().toISOString(),
      generatedBy:'news-phi-interest-bridge',
      ingestType:'quanta-cloud-collect',
      sourceBacked:Boolean(sourceUrl),
      type:'collect'
    };
  }

  function merge(incoming){
    // Cloud records plus earlier copies; never replace the collection with one page.
    const prior=read(CACHE,[]);
    const byStory=new Map();
    for(const card of [...(Array.isArray(prior)?prior:[]),...incoming]){
      if(!card?.storyKey)continue;
      const old=byStory.get(card.storyKey);
      byStory.set(card.storyKey,old?{...old,...card,
        collectedAt:old.collectedAt||card.collectedAt,
        extract:card.body||card.extract||old.body||old.extract}:card);
    }
    const cards=[...byStory.values()].sort((a,b)=>String(b.collectedAt||'').localeCompare(String(a.collectedAt||'')));
    // The complete cloud ledger remains authoritative; browser copies are a read cache.
    write(CACHE,cards.slice(0,2000));
    const jobs=read(QUEUE,[]),byKey=new Map((Array.isArray(jobs)?jobs:[]).map(job=>[job.jobKey,job]));
    incoming.forEach(card=>{
      const jobKey='quanta:'+card.storyKey;
      const previous=byKey.get(jobKey)||{};
      byKey.set(jobKey,{...previous,jobKey,kind:'collect',subject:card.title,
        query:card.searchQuery||card.title,sourceUrl:card.sourceUrl||'',
        indexedText:card.body||card.extract||'',collectedAt:card.collectedAt,status:'indexed'});
    });
    write(QUEUE,[...byKey.values()].sort((a,b)=>String(b.collectedAt||'').localeCompare(String(a.collectedAt||''))).slice(0,1000));
    window.dispatchEvent(new CustomEvent('newsphi:quanta-cloud-ready',
      {detail:{count:cards.length,received:incoming.length}}));
    window.dispatchEvent(new Event('newsphi:run-retrieval'));
    window.dispatchEvent(new CustomEvent('storybook:updated',{detail:{count:cards.length}}));
    return cards;
  }

  let inFlight=null;
  async function refresh(){
    if(inFlight)return inFlight;
    inFlight=(async()=>{
      const bridge=window.QuantaCloudConnection||window.StarQuestCloudLedger;
      if(typeof bridge?.authenticatedFetch!=='function'){
        window.dispatchEvent(new CustomEvent('newsphi:quanta-cloud-error',{detail:{reason:'signed_out'}}));
        return {ok:false,reason:'signed_out',cached:read(CACHE,[]).length};
      }
      const found=new Map();
      let offset=0,pages=0,hasMore=true;
      while(hasMore&&pages<30){
        const url=ENDPOINT+'?limit=200&offset='+offset;
        const response=await bridge.authenticatedFetch(url,{cache:'no-store'});
        const payload=await response.json().catch(()=>({}));
        if(!response.ok)throw new Error(payload.error||'quanta_collect_feed_failed');
        const batch=(Array.isArray(payload.cards)?payload.cards:[]).map(normalize).filter(Boolean);
        for(const card of batch)found.set(card.storyKey,card);
        pages++;
        const next=Number(payload.nextOffset);
        if(Number.isSafeInteger(next)&&next>offset){offset=next;hasMore=true}
        else if(payload.nextOffset===null||payload.nextOffset===undefined){
          // Compatible with the old 50-card endpoint until the ledger pagination deploys.
          hasMore=payload.hasMore===true&&batch.length>0;
          offset+=batch.length;
        }else hasMore=false;
        if(!batch.length)hasMore=false;
        if(found.size>=6000)break;
      }
      const cards=merge([...found.values()]);
      return {ok:true,count:cards.length,received:found.size,pages};
    })().finally(()=>{inFlight=null});
    return inFlight;
  }

  function schedule(){
    refresh().catch(()=>{});
    setInterval(()=>refresh().catch(()=>{}),REFRESH_MS);
  }

  window.NewsPhiQuantaCloud={refresh,cacheKey:CACHE,endpoint:ENDPOINT,getCached:()=>read(CACHE,[])};
  if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',schedule,{once:true});
  else schedule();
})();
/* ---- monitor-bridge.js ---- */
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
      extract:clean(story.excerpt)||clean(story.title),
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
    })).filter(card=>card.title&&card.url);
    const now=Date.now(),direct=window.NewsPhiDirect;
    const dated=stories.map(card=>direct?.normalize?{...direct.normalize({title:card.title,url:card.url,content:card.extract,publishedDate:card.publishedAt,image:card.image},card.searchQuery,now),quantWhy:card.quantWhy}:card).filter(card=>card?.title&&card.publishedAt&&Date.parse(card.publishedAt)<=now+300000&&now-Date.parse(card.publishedAt)<=7*86400000);
    const stored=read(MONITOR_CARDS,[]),result=direct?.stack?direct.stack(stored,[dated],now):{cards:dated.length?dated:stored,added:dated.length};
    write(MONITOR_CARDS,result.cards);
    write(MONITOR_STATUS,{state:result.added?'fresh':result.cards.length?'no-new':'empty',retrievedAt:clean(payload?.generatedAt)||new Date().toISOString(),count:result.cards.length,added:result.added,source:'Monitor / SearXNG',seeds:(payload?.seeds||[]).length});
    return result.cards;
  }

  async function refreshFromMonitor(){
    const endpoint=clean(localStorage.getItem(ENDPOINT_KEY)||'https://monitor-phi.marvaseater.workers.dev');
    if(!endpoint)return null;
    const seeds=chosenTopics();
    // Always call Monitor. When browser-local subjects are empty, the Worker falls back to its persisted D1 Quant graph.
    try{
      const response=await fetch(endpoint.replace(/\/$/,'')+'/p/news/feed',{
        method:'POST',cache:'no-store',headers:{'content-type':'application/json'},
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
