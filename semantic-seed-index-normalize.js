(function(){
  'use strict';
  const SHARED='phiShared:collection:v1';
  const INDEX='newsPhi:semanticSeedIndex:v1';
  const get=(key,fallback)=>{try{return JSON.parse(localStorage.getItem(key))??fallback}catch{return fallback}};
  const set=(key,value)=>{try{localStorage.setItem(key,JSON.stringify(value));return true}catch{return false}};
  const clean=(value,max=180)=>String(value??'').replace(/<[^>]+>/g,' ').replace(/\s+/g,' ').trim().slice(0,max);
  const keyOf=card=>card?.storyKey||card?.url||card?.id||clean(card?.title).toLowerCase().replace(/[^a-z0-9]+/g,'-');

  function rebuild(){
    const seeds=get(SHARED,[]).filter(card=>card?.ingestType==='semantic-seed'||card?.seedOnly);
    const store={version:1,terms:{},seeds:{},updatedAt:new Date().toISOString()};
    seeds.forEach(seed=>{
      const key=keyOf(seed);if(!key)return;
      const anchors=Array.isArray(seed.semanticAnchors)?seed.semanticAnchors:[];
      store.seeds[key]={key,title:seed.title||'',query:seed.searchQuery||'',url:seed.url||'',image:seed.image||'',anchors,at:seed.collectedAt||''};
      anchors.forEach(anchor=>{
        const term=clean(anchor?.term,160).toLowerCase();if(!term)return;
        const current=store.terms[term]||{term:anchor.term,weight:0,hits:0,kinds:{},seedKeys:[]};
        current.weight=Math.min(200,Number(current.weight||0)+Math.max(1,Number(anchor?.weight||1)));
        current.hits+=1;
        current.kinds[anchor?.kind||'word']=(current.kinds[anchor?.kind||'word']||0)+1;
        if(!current.seedKeys.includes(key))current.seedKeys.push(key);
        store.terms[term]=current;
      });
    });
    set(INDEX,store);
  }

  rebuild();
  window.addEventListener('controlphi:shared',()=>setTimeout(rebuild,0));
})();