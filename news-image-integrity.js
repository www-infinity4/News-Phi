(function(){
  'use strict';

  const SHARED='phiShared:collection:v1';
  const STORIES='phiShared:storyIndex:v2';
  let repairing=false;
  let timer=0;

  const read=(key,fallback)=>{try{return JSON.parse(localStorage.getItem(key))??fallback}catch{return fallback}};
  const write=(key,value)=>{try{localStorage.setItem(key,JSON.stringify(value));return true}catch{return false}};
  const clean=value=>String(value??'').trim();
  const keyOf=card=>card?.storyKey||card?.url||card?.id||String(card?.title||'card').toLowerCase().replace(/[^a-z0-9]+/g,'-');

  function repair(){
    if(repairing)return;
    repairing=true;
    try{
      const cards=read(SHARED,[]);
      const stories=read(STORIES,{});
      let changed=false;

      cards.forEach(card=>{
        const image=clean(card?.image);
        if(!image)return;
        const key=keyOf(card);
        const story=stories[key];
        if(!story)return;
        if(clean(story.image)===image&&story.imageOrigin==='collected-card')return;
        story.image=image;
        story.imageVerified=Boolean(card.imageVerified);
        story.imageOrigin='collected-card';
        changed=true;
      });

      if(changed){
        write(STORIES,stories);
        setTimeout(()=>document.getElementById('refreshFeed')?.click(),0);
      }
    }finally{
      repairing=false;
    }
  }

  function schedule(){
    clearTimeout(timer);
    timer=setTimeout(repair,80);
  }

  const feed=document.getElementById('feed');
  if(feed)new MutationObserver(schedule).observe(feed,{childList:true,subtree:true,attributes:true,attributeFilter:['src']});
  window.addEventListener('storage',event=>{if(event.key===SHARED||event.key===STORIES)schedule()});
  window.addEventListener('controlphi:shared',schedule);
  window.addEventListener('phi:ingested',schedule);
  document.getElementById('refreshFeed')?.addEventListener('click',()=>setTimeout(repair,40));
  setTimeout(repair,50);
  setTimeout(repair,900);
})();
