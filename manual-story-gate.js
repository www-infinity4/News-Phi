(function(){
  'use strict';

  const SHARED='phiShared:collection:v1';
  const STORIES='phiShared:storyIndex:v2';
  const OMNI_PROFILE='omniPhi:profile:v1';
  const OMNI_RESEARCH='omniPhi:lastResearch:v1';

  const read=(key,fallback)=>{try{return JSON.parse(localStorage.getItem(key))??fallback}catch{return fallback}};
  const write=(key,value)=>{try{localStorage.setItem(key,JSON.stringify(value));return true}catch{return false}};
  const keyOf=(card)=>card?.storyKey||card?.url||card?.id||String(card?.title||'card').toLowerCase().replace(/[^a-z0-9]+/g,'-');

  // News Phi is manual-first. Searches, views, shares, and background retrievals
  // may be useful signals elsewhere, but they are not permission to create a story.
  function isAutomatic(card){
    if(!card)return true;
    if(card.generatedBy==='news-phi-interest-bridge')return true;
    if(card.ingestType)return true;
    if(card.retrievalVersion)return true;
    if(String(card.storyKey||'').startsWith('retrieved:'))return true;
    if(card.kind==='search')return true;
    return false;
  }

  const before=read(SHARED,[]);
  const kept=before.filter(card=>!isAutomatic(card));
  if(kept.length!==before.length){
    write(SHARED,kept);
    const allowed=new Set(kept.map(keyOf));
    const stories=read(STORIES,{});
    Object.keys(stories).forEach(key=>{
      const story=stories[key];
      if(story?.retrievalVersion||String(key).startsWith('retrieved:')||(!allowed.has(key)&&story?.generatedBy==='news-phi-interest-bridge'))delete stories[key];
    });
    write(STORIES,stories);
  }

  // app.js historically read Omni's profile/research collections directly and
  // converted them to News Phi stories. Mask those reads on this page only so
  // only explicitly added News Phi cards enter the feed. The underlying Omni
  // data is never modified.
  const originalGetItem=Storage.prototype.getItem;
  Storage.prototype.getItem=function(key){
    if(this===localStorage&&key===OMNI_PROFILE){
      try{
        const raw=originalGetItem.call(this,key);
        const profile=raw?JSON.parse(raw):{};
        return JSON.stringify({...profile,collected:[]});
      }catch{return JSON.stringify({collected:[]})}
    }
    if(this===localStorage&&key===OMNI_RESEARCH)return 'null';
    return originalGetItem.call(this,key);
  };

  window.NewsPhiManualStoryGate=Object.freeze({enabled:true,rule:'explicit-add-only'});
})();
