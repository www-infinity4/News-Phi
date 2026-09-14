(function(){
  'use strict';

  const params=new URLSearchParams(location.search);
  if(params.get('phiTrack')!=='1')return;

  const SIGNAL_KEY='phiShared:interestSignals:v1';
  const CLICK_KEY='newsPhi:trackedClicks:v1';
  const read=(key,fallback)=>{try{return JSON.parse(localStorage.getItem(key))??fallback}catch{return fallback}};
  const write=(key,value)=>{try{localStorage.setItem(key,JSON.stringify(value));return true}catch{return false}};
  const clean=(value,max=900)=>String(value||'').replace(/\s+/g,' ').trim().slice(0,max);
  const slug=(value)=>clean(value,180).toLowerCase().replace(/[^a-z0-9]+/g,'-').replace(/^-|-$/g,'')||'interest';

  function safeTarget(value){
    if(!value)return '';
    try{
      const url=new URL(value,location.href);
      if(!/^https?:$/.test(url.protocol))return '';
      if(url.origin===location.origin&&url.pathname.includes('/News-Phi/')&&url.searchParams.get('phiTrack')==='1')return '';
      return url.href;
    }catch{return ''}
  }

  const target=safeTarget(params.get('target'));
  const title=clean(params.get('title')||'Shared Infinity link',180);
  const channel=clean(params.get('channel')||'',100);
  const query=clean(params.get('query')||title,420);
  const platform=clean(params.get('platform')||'external',40);
  const shareId=clean(params.get('shareId')||'',120);
  const topicKey=`program:${slug(channel||'infinity')}:${slug(title)}`;
  const now=new Date().toISOString();
  const id=`click-${Date.now().toString(36)}-${Math.random().toString(36).slice(2,8)}`;
  const signal={id,kind:'click',topicKey,program:title,channel,query,url:target,image:'',hits:1,collectedAt:now,lastAt:Date.now(),platform,shareId,source:'news-phi-tracker'};

  const signals=read(SIGNAL_KEY,[]);
  signals.unshift(signal);
  write(SIGNAL_KEY,signals.slice(0,1200));

  const clicks=read(CLICK_KEY,[]);
  clicks.unshift(signal);
  write(CLICK_KEY,clicks.slice(0,1000));

  window.dispatchEvent(new CustomEvent('newsphi:interest',{detail:signal}));

  if(target){
    setTimeout(()=>location.replace(target),25);
  }
})();
