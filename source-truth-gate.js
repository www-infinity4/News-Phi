(function(){
  'use strict';

  const SHARED='phiShared:collection:v1';
  const STORIES='phiShared:storyIndex:v2';
  const RESEARCH='omniPhi:lastResearch:v1';

  const read=(key,fallback)=>{try{return JSON.parse(localStorage.getItem(key))??fallback}catch{return fallback}};
  const write=(key,value)=>{try{localStorage.setItem(key,JSON.stringify(value));return true}catch{return false}};
  const clean=value=>String(value??'').replace(/<[^>]+>/g,' ').replace(/\s+/g,' ').trim();
  const keyOf=card=>card?.storyKey||card?.url||card?.id||String(card?.title||'card').toLowerCase().replace(/[^a-z0-9]+/g,'-');
  const sentences=text=>clean(text).split(/(?<=[.!?])\s+/).map(clean).filter(Boolean);

  const shared=read(SHARED,[]);
  const research=read(RESEARCH,null);
  const sources=Array.isArray(research?.sources)?research.sources:[];
  const byUrl=new Map(sources.filter(source=>source?.url).map(source=>[source.url,source]));
  const byId=new Map(sources.filter(source=>source?.id).map(source=>[source.id,source]));
  let changed=false;

  shared.forEach(card=>{
    const live=byUrl.get(card.url)||byId.get(card.id)||null;

    // Any image that came in on a collected source remains attached to the card.
    // Do not make News Phi depend on a later enrichment pass to display it.
    if(card.image&&!card.imageVerified){card.imageVerified=true;changed=true}

    if(card.url&&!card.sourceBacked){card.sourceBacked=true;changed=true}

    // Current Omni research still has the original source text/title even when
    // GPT produced a cleaner orange-card rewrite. For News Phi, factual copy is
    // rebuilt from that source evidence rather than from generated prose.
    if(live){
      const sourceTitle=clean(live.sourceTitle||live.title);
      const sourceExtract=clean(live.sourceExtract||(!live.aiGenerated?live.extract:''));
      if(sourceTitle&&card.sourceTitle!==sourceTitle){card.sourceTitle=sourceTitle;changed=true}
      if(sourceExtract){
        if(card.sourceExtract!==sourceExtract){card.sourceExtract=sourceExtract;changed=true}
        if(card.extract!==sourceExtract){
          card.aiCardExtract=card.aiCardExtract||card.extract||'';
          card.extract=sourceExtract;
          changed=true;
        }
      }
      if(live.image&&card.image!==live.image){card.image=live.image;card.imageVerified=true;changed=true}
      card.sourceBacked=true;
      card.aiGenerated=Boolean(live.aiGenerated);
    }else if(card.sourceExtract&&card.extract!==card.sourceExtract){
      card.aiCardExtract=card.aiCardExtract||card.extract||'';
      card.extract=card.sourceExtract;
      changed=true;
    }
  });

  if(changed)write(SHARED,shared);

  // Repair already-built story bodies from the evidence now stored on cards.
  const stories=read(STORIES,{});
  let storyChanged=false;
  shared.forEach(card=>{
    const key=keyOf(card),story=stories[key];
    const evidence=clean(card.sourceExtract||'');
    if(!story||!evidence)return;
    const facts=sentences(evidence).filter(sentence=>sentence.length>=32).slice(0,8);
    if(!facts.length)return;
    const standfirst=facts.slice(0,2).join(' ');
    const paragraphs=[];
    for(let i=2;i<facts.length;i+=2){const p=facts.slice(i,i+2).join(' ');if(p)paragraphs.push(p)}
    story.standfirst=standfirst;
    story.paragraphs=paragraphs.length?paragraphs:[standfirst];
    story.image=card.image||story.image||'';
    story.imageVerified=Boolean(story.image);
    story.enriched=true;
    story.sourceFingerprint=evidence;
    storyChanged=true;
  });
  if(storyChanged)write(STORIES,stories);

  window.NewsPhiSourceTruth=Object.freeze({enabled:true,rule:'source-copy+preserve-images'});
})();
