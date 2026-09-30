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
      id:'quanta-cloud:'+key,
      storyKey:'quanta-cloud:'+key,
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

  function merge(cards){
    write(CACHE,cards);
    const jobs=read(QUEUE,[]),byKey=new Map((Array.isArray(jobs)?jobs:[]).map(job=>[job.jobKey,job]));
    cards.forEach(card=>{
      const jobKey='quanta:'+card.storyKey;
      const previous=byKey.get(jobKey)||{};
      byKey.set(jobKey,{...previous,jobKey,kind:'collect',subject:card.title,query:card.searchQuery||card.title,sourceUrl:card.sourceUrl||'',indexedText:card.body||card.extract||'',collectedAt:card.collectedAt,status:'indexed'});
    });
    const queued=[...byKey.values()].sort((a,b)=>String(b.collectedAt||'').localeCompare(String(a.collectedAt||''))).slice(0,500);
    write(QUEUE,queued);
    window.dispatchEvent(new CustomEvent('phi:ingested',{detail:{source:'quanta-cloud',count:cards.length}}));
    window.dispatchEvent(new CustomEvent('newsphi:quanta-cloud-ready',{detail:{count:cards.length,jobs:queued.length}}));
    window.dispatchEvent(new Event('newsphi:run-retrieval'));
    return queued;
  }

  async function refresh(){
    const bridge=window.StarQuestCloudLedger;
    if(!bridge?.authenticatedFetch){window.dispatchEvent(new CustomEvent('newsphi:quanta-cloud-error',{detail:{reason:'signed_out'}}));return {ok:false,reason:'signed_out'};}
    const response=await bridge.authenticatedFetch(ENDPOINT,{cache:'no-store'});
    const payload=await response.json().catch(()=>({}));
    if(!response.ok)throw new Error(payload.error||'quanta_collect_feed_failed');
    const cards=(Array.isArray(payload.cards)?payload.cards:[]).map(normalize).filter(Boolean);
    merge(cards);
    return {ok:true,count:cards.length};
  }

  function schedule(){
    refresh().catch(()=>{});
    setInterval(()=>refresh().catch(()=>{}),REFRESH_MS);
  }

  window.NewsPhiQuantaCloud={refresh,cacheKey:CACHE,endpoint:ENDPOINT};
  if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',schedule,{once:true});
  else schedule();
})();