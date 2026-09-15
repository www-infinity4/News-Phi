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

  function restoreDomImage(key,image){
    const selector=`[data-story-card="${CSS.escape(key)}"]`;
    const card=document.querySelector(selector);
    if(card){
      const current=card.querySelector('.card-image');
      if(current?.tagName==='IMG'){
        if(current.src!==image)current.src=image;
      }else if(current){
        const img=document.createElement('img');
        img.className='card-image';
        img.src=image;
        img.alt='';
        img.loading='lazy';
        current.replaceWith(img);
      }
    }

    const dialog=document.getElementById('storyDialog');
    if(dialog?.dataset.storyKey===key){
      const content=document.getElementById('storyContent');
      const hero=content?.querySelector('.story-hero');
      if(hero){
        if(hero.src!==image)hero.src=image;
      }else if(content){
        const img=document.createElement('img');
        img.className='story-hero';
        img.src=image;
        img.alt='';
        content.prepend(img);
      }
    }
  }

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
        if(story&&(clean(story.image)!==image||story.imageOrigin!=='collected-card')){
          story.image=image;
          story.imageVerified=Boolean(card.imageVerified);
          story.imageOrigin='collected-card';
          changed=true;
        }
        restoreDomImage(key,image);
      });

      if(changed)write(STORIES,stories);
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
  const dialog=document.getElementById('storyDialog');
  if(dialog)new MutationObserver(schedule).observe(dialog,{childList:true,subtree:true,attributes:true,attributeFilter:['src','open']});
  window.addEventListener('storage',event=>{if(event.key===SHARED||event.key===STORIES)schedule()});
  window.addEventListener('controlphi:shared',schedule);
  window.addEventListener('phi:ingested',schedule);
  document.getElementById('refreshFeed')?.addEventListener('click',()=>setTimeout(repair,60));
  setTimeout(repair,50);
  setTimeout(repair,900);
})();
