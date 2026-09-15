(function(){
  'use strict';

  const SHARED='phiShared:collection:v1';
  const STORIES='phiShared:storyIndex:v2';
  const OMNI_PROFILE='omniPhi:profile:v1';
  const OMNI_RESEARCH='omniPhi:lastResearch:v1';

  const read=(key,fallback)=>{try{return JSON.parse(localStorage.getItem(key))??fallback}catch{return fallback}};
  const write=(key,value)=>{try{localStorage.setItem(key,JSON.stringify(value));return true}catch{return false}};
  const clean=value=>String(value??'').replace(/<[^>]+>/g,' ').replace(/\s+/g,' ').trim();
  const keyOf=(card)=>card?.storyKey||card?.url||card?.id||String(card?.title||'card').toLowerCase().replace(/[^a-z0-9]+/g,'-');

  // Repair source metadata BEFORE masking Omni reads on News Phi. This restores
  // images immediately and, when current Omni research still has the original
  // evidence, replaces generated card prose with the actual source extract.
  const research=read(OMNI_RESEARCH,null);
  const liveSources=Array.isArray(research?.sources)?research.sources:[];
  const byUrl=new Map(liveSources.filter(source=>source?.url).map(source=>[source.url,source]));
  const byId=new Map(liveSources.filter(source=>source?.id).map(source=>[source.id,source]));
  const beforeRepair=read(SHARED,[]);
  let repaired=false;
  beforeRepair.forEach(card=>{
    const live=byUrl.get(card?.url)||byId.get(card?.id)||null;
    if(card?.image&&!card.imageVerified){card.imageVerified=true;repaired=true}
    if(card?.url&&!card.sourceBacked){card.sourceBacked=true;repaired=true}
    if(live){
      const sourceTitle=clean(live.sourceTitle||live.title);
      const sourceExtract=clean(live.sourceExtract||(!live.aiGenerated?live.extract:''));
      if(sourceTitle&&card.sourceTitle!==sourceTitle){card.sourceTitle=sourceTitle;repaired=true}
      if(sourceExtract){
        card.sourceExtract=sourceExtract;
        if(card.extract!==sourceExtract){card.aiCardExtract=card.aiCardExtract||card.extract||'';card.extract=sourceExtract;repaired=true}
      }
      if(live.image){card.image=live.image;card.imageVerified=true;repaired=true}
      card.sourceBacked=true;
      card.aiGenerated=Boolean(live.aiGenerated);
    }else if(card?.sourceExtract&&card.extract!==card.sourceExtract){
      card.aiCardExtract=card.aiCardExtract||card.extract||'';
      card.extract=card.sourceExtract;
      repaired=true;
    }
  });
  if(repaired)write(SHARED,beforeRepair);

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

  window.NewsPhiManualStoryGate=Object.freeze({enabled:true,rule:'explicit-add-only+source-truth+preserve-images'});
})();
