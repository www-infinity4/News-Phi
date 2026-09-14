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
      if(!['search','share','store'].includes(signalKind))return;
      const subject=signalKind==='search'||signalKind==='store'?clean(signal.query||(signal.terms||[]).join(' ')):clean(signal.program||signal.title||signal.channel);
      if(!subject)return;
      const kind=signalKind==='store'?'interest':signalKind==='search'?'search':'share',jobKey=`${kind}:${slug(signal.topicKey||subject)}`;
      const previous=byKey.get(jobKey)||{},at=Number(signal.lastAt||Date.parse(signal.collectedAt||signal.createdAt||'')||Date.now());
      byKey.set(jobKey,{...previous,jobKey,kind,subject,query:clean(signal.query||`${subject} ${signal.channel||''}`),sourceUrl:'',excludedSourceUrl:clean(signal.excludedSourceUrl),originQuery:clean(signal.originQuery),indexedText:'',collectedAt:new Date(at).toISOString(),signalCount:(Number(previous.signalCount)||0)+Math.max(1,Number(signal.hits)||1),status:previous.status==='published'?'published':'indexed'});
    });
    const indexed=[...byKey.values()].sort((a,b)=>String(b.collectedAt).localeCompare(String(a.collectedAt))).slice(0,500);
    write(QUEUE_KEY,indexed);return indexed;
  }

  indexSignals();
  window.addEventListener('storage',event=>{if(event.key===SIGNAL_KEY){indexSignals();window.dispatchEvent(new Event('newsphi:run-retrieval'))}});
  window.addEventListener('newsphi:interest',()=>{indexSignals();window.dispatchEvent(new Event('newsphi:run-retrieval'))});
})();
