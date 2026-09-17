(function(){
  'use strict';

  const SHARED='phiShared:collection:v1';
  const STORIES='phiShared:storyIndex:v2';
  const CACHE='newsPhi:cardImageCache:v2';
  const BAD=/\b(logo|icon|favicon|sprite|avatar|emoji|badge|tracking|pixel|spinner|placeholder|banner-ad|advert)\b/i;
  const GENERIC=/infinity-phi-share|omni-phi-index-wide|og-image|c13b0-preview/i;
  let running=false;
  let timer=0;

  const read=(key,fallback)=>{try{return JSON.parse(localStorage.getItem(key))??fallback}catch{return fallback}};
  const write=(key,value)=>{try{localStorage.setItem(key,JSON.stringify(value));return true}catch{return false}};
  const clean=(value,max=2200)=>String(value??'').replace(/<[^>]+>/g,' ').replace(/\s+/g,' ').trim().slice(0,max);
  const keyOf=card=>card?.storyKey||card?.url||card?.id||clean(card?.title,160).toLowerCase().replace(/[^a-z0-9]+/g,'-');
  const words=value=>[...new Set(clean(value).toLowerCase().replace(/https?:\/\/\S+/g,' ').replace(/[^a-z0-9'-]+/g,' ').split(/\s+/).filter(word=>word.length>2&&!/^(the|and|for|with|from|into|about|this|that|news|card|story|source|image|images|phi|infinity)$/.test(word)))];
  const overlap=(left,right)=>{const r=new Set(words(right));return words(left).reduce((n,w)=>n+(r.has(w)?1:0),0)};
  const timeout=(promise,ms=6500)=>Promise.race([promise,new Promise((_,reject)=>setTimeout(()=>reject(new Error('timeout')),ms))]);

  function topic(card){
    const anchors=(card?.semanticMatchedAnchors||card?.semanticAnchors||[]).slice(0,8).map(a=>a?.term).filter(Boolean).join(' ');
    return clean(`${card?.title||''} ${card?.searchQuery||''} ${anchors} ${(card?.extract||card?.body||'').slice(0,650)}`,1700);
  }

  function safeImage(url){
    const value=clean(url,1800);
    if(!/^https?:\/\//i.test(value)||BAD.test(value))return '';
    return value;
  }

  function candidateScore(card,candidate){
    const target=topic(card);
    const descriptor=clean(`${candidate.alt||''} ${candidate.url||''}`,2200);
    const originBase={
      'card-source':120,
      'source-page':80,
      'wikipedia':52,
      'openverse':46,
      'source-preview':18
    }[candidate.origin]||0;
    let score=originBase+overlap(descriptor,target)*10;
    const title=clean(card?.title,220);
    if(title&&descriptor.toLowerCase().includes(title.toLowerCase()))score+=28;
    if(GENERIC.test(candidate.url||''))score-=80;
    if(BAD.test(descriptor))score-=60;
    return score;
  }

  function directCandidates(card){
    const out=[];
    const push=(url,alt,origin='card-source')=>{url=safeImage(url);if(url)out.push({url,alt:clean(alt,500),origin})};
    push(card?.image,card?.title);
    push(card?.imageUrl,card?.title);
    (Array.isArray(card?.sources)?card.sources:[]).forEach(source=>{
      push(source?.image||source?.imageUrl,`${source?.title||''} ${source?.excerpt||source?.extract||''}`);
    });
    return out;
  }

  async function sourcePageCandidates(card){
    const sourceUrl=clean(card?.url||card?.sourceUrl,1800);
    if(!/^https?:\/\//i.test(sourceUrl))return [];
    try{
      const response=await timeout(fetch(`https://r.jina.ai/${sourceUrl}`,{cache:'no-store',headers:{Accept:'text/plain'}}),6500);
      if(!response.ok)return [];
      const text=await response.text();
      const out=[];
      const seen=new Set();
      for(const match of text.matchAll(/!\[([^\]]*)\]\((https?:\/\/[^)\s]+)(?:\s+"[^"]*")?\)/g)){
        const url=safeImage(match[2]);
        if(!url||seen.has(url))continue;
        seen.add(url);
        out.push({url,alt:clean(match[1],500),origin:'source-page'});
        if(out.length>=18)break;
      }
      return out;
    }catch{return []}
  }

  async function wikipediaCandidates(card){
    const q=clean(card?.title||card?.searchQuery,220);
    if(!q)return [];
    try{
      const endpoint=new URL('https://en.wikipedia.org/w/api.php');
      endpoint.search=new URLSearchParams({action:'query',generator:'search',gsrsearch:q,gsrlimit:'8',prop:'pageimages|extracts',exintro:'1',explaintext:'1',piprop:'thumbnail',pithumbsize:'1200',format:'json',origin:'*'}).toString();
      const response=await timeout(fetch(endpoint,{cache:'no-store'}),5500);
      if(!response.ok)return [];
      const data=await response.json();
      return Object.values(data?.query?.pages||{}).flatMap(page=>{
        const url=safeImage(page?.thumbnail?.source||'');
        return url?[{url,alt:clean(`${page?.title||''} ${page?.extract||''}`,900),origin:'wikipedia'}]:[];
      });
    }catch{return []}
  }

  async function openverseCandidates(card){
    const q=clean(card?.title||card?.searchQuery,220);
    if(!q)return [];
    try{
      const endpoint=new URL('https://api.openverse.org/v1/images/');
      endpoint.search=new URLSearchParams({q,page_size:'12'}).toString();
      const response=await timeout(fetch(endpoint,{cache:'no-store'}),5500);
      if(!response.ok)return [];
      const data=await response.json();
      return (data?.results||[]).flatMap(item=>{
        const url=safeImage(item?.thumbnail||item?.url||'');
        if(!url)return [];
        const tags=Array.isArray(item?.tags)?item.tags.map(tag=>tag?.name).filter(Boolean).join(' '):'';
        return [{url,alt:clean(`${item?.title||''} ${tags} ${item?.creator||''}`,900),origin:'openverse'}];
      });
    }catch{return []}
  }

  function sourcePreview(card){
    const sourceUrl=clean(card?.url||card?.sourceUrl,1800);
    if(!/^https?:\/\//i.test(sourceUrl))return [];
    return [{url:`https://image.thum.io/get/width/1200/crop/675/noanimate/${sourceUrl}`,alt:card?.title||'',origin:'source-preview'}];
  }

  function cacheKey(card){return keyOf(card)}

  async function resolveCard(card,used){
    const key=cacheKey(card);if(!key)return null;
    const cache=read(CACHE,{});
    const cached=safeImage(cache[key]?.image||'');
    if(cached&&!used.has(cached))return {url:cached,origin:cache[key]?.origin||'cache'};

    const existing=directCandidates(card).filter(c=>!GENERIC.test(c.url));
    const page=await sourcePageCandidates(card);
    const [wiki,openverse]=await Promise.all([wikipediaCandidates(card),openverseCandidates(card)]);
    const candidates=[...existing,...page,...wiki,...openverse,...sourcePreview(card)]
      .filter(candidate=>candidate.url&&!used.has(candidate.url))
      .map(candidate=>({...candidate,score:candidateScore(card,candidate)}))
      .sort((a,b)=>b.score-a.score);
    const winner=candidates.find(candidate=>candidate.score>8);
    if(!winner)return null;
    cache[key]={image:winner.url,origin:winner.origin,score:winner.score,at:Date.now()};
    write(CACHE,cache);
    return winner;
  }

  function visible(card){return card&&!card.ingestType&&!card.seedOnly&&clean(card.title)&&clean(card.extract||card.body)}

  async function run(){
    if(running)return;
    running=true;
    try{
      const cards=read(SHARED,[]);
      const stories=read(STORIES,{});
      if(!Array.isArray(cards)||!cards.length)return;
      const used=new Set(cards.map(card=>safeImage(card?.image)).filter(Boolean));
      let changed=false;
      let processed=0;

      for(const card of cards){
        if(!visible(card)||processed>=8)continue;
        const current=safeImage(card.image);
        if(current&&!GENERIC.test(current)){
          card.imageVerified=true;
          card.imageLocked=true;
          card.imageBinding=card.imageBinding||'source-record';
          continue;
        }
        processed+=1;
        const winner=await resolveCard(card,used);
        if(!winner)continue;
        used.add(winner.url);
        card.image=winner.url;
        card.imageUrl=winner.url;
        card.imageVerified=true;
        card.imageLocked=true;
        card.imageOrigin=winner.origin;
        card.imageBinding=winner.origin==='source-page'?'source-topic-weighted':winner.origin;
        const key=keyOf(card);
        if(stories[key]){
          stories[key].image=winner.url;
          stories[key].imageVerified=true;
          stories[key].imageLocked=true;
          stories[key].imageOrigin=winner.origin;
        }
        changed=true;
      }

      if(changed){
        write(SHARED,cards);
        write(STORIES,stories);
        window.dispatchEvent(new CustomEvent('controlphi:shared',{detail:{source:'news-card-image-resolver'}}));
        setTimeout(()=>document.getElementById('refreshFeed')?.click(),40);
      }
    }finally{running=false}
  }

  function schedule(delay=120){clearTimeout(timer);timer=setTimeout(()=>void run(),delay)}
  window.addEventListener('controlphi:shared',()=>schedule(180));
  window.addEventListener('phi:ingested',()=>schedule(180));
  document.getElementById('refreshFeed')?.addEventListener('click',()=>schedule(80));
  schedule(80);
  setTimeout(()=>schedule(0),1800);
})();
