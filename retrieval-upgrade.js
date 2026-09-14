(function(){
  'use strict';

  const SHARED='phiShared:collection:v1';
  const STORIES='phiShared:storyIndex:v2';
  const CONFIG='controlPhi:searchConfig:v1';
  const VERSION='multi-source-20260913';
  const STOP=new Set(['about','after','again','also','and','are','because','before','being','from','have','into','more','news','post','shared','source','that','their','these','they','this','through','what','when','where','which','with','would','your','infinity','phi']);

  const get=(key,fallback)=>{try{return JSON.parse(localStorage.getItem(key))??fallback}catch{return fallback}};
  const set=(key,value)=>{try{localStorage.setItem(key,JSON.stringify(value));return true}catch{return false}};
  const clean=(value)=>String(value||'').replace(/<[^>]+>/g,' ').replace(/\s+/g,' ').trim();
  const keyOf=(card)=>card.storyKey||card.url||card.id||clean(card.title).toLowerCase().replace(/[^a-z0-9]+/g,'-');
  const timeout=(promise,ms)=>Promise.race([promise,new Promise((_,reject)=>setTimeout(()=>reject(new Error('timeout')),ms))]);
  const words=(value)=>clean(value).toLowerCase().replace(/https?:\/\/\S+/g,' ').replace(/[^a-z0-9'-]+/g,' ').split(/\s+/).filter(word=>word.length>2&&!STOP.has(word)&&!/^\d+$/.test(word));
  const overlap=(a,b)=>{const right=new Set(words(b));return words(a).reduce((score,word)=>score+(right.has(word)?1:0),0)};
  const needsReadableContext=(card)=>{
    const text=clean(card.extract||card.body||'');
    return text.length<90||/\b(was shared|share points to|news phi prepared|research starting point|completed share)\b/i.test(text);
  };

  async function wikipedia(query){
    const url=`https://en.wikipedia.org/w/api.php?action=query&generator=search&gsrsearch=${encodeURIComponent(query)}&gsrlimit=7&prop=extracts|info|pageimages&exintro=1&explaintext=1&inprop=url&pithumbsize=900&format=json&origin=*`;
    const response=await timeout(fetch(url,{cache:'no-store'}),4500);
    if(!response.ok)return [];
    const data=await response.json();
    return Object.values(data?.query?.pages||{}).flatMap(page=>{
      const title=clean(page.title),excerpt=clean(page.extract);
      if(!title||!excerpt)return [];
      return [{title,url:page.fullurl||'',excerpt,image:page.thumbnail?.source||'',provider:'Wikipedia'}];
    });
  }

  async function duckDuckGo(query){
    const url=`https://api.duckduckgo.com/?q=${encodeURIComponent(query)}&format=json&no_html=1&skip_disambig=0`;
    const response=await timeout(fetch(url,{cache:'no-store'}),3500);
    if(!response.ok)return [];
    const data=await response.json();
    const out=[];
    if(data.AbstractText)out.push({title:clean(data.Heading||query),url:data.AbstractURL||'',excerpt:clean(data.AbstractText),provider:'DuckDuckGo'});
    (data.RelatedTopics||[]).flatMap(item=>item.Topics||[item]).forEach(item=>{
      if(item.Text)out.push({title:clean(item.Text).split(' - ')[0],url:item.FirstURL||'',excerpt:clean(item.Text),provider:'DuckDuckGo'});
    });
    return out;
  }

  async function crossref(query){
    const url=`https://api.crossref.org/works?query=${encodeURIComponent(query)}&rows=8`;
    const response=await timeout(fetch(url,{cache:'no-store'}),3500);
    if(!response.ok)return [];
    const data=await response.json();
    return (data?.message?.items||[]).flatMap(item=>{
      const title=clean(item.title?.[0]);
      if(!title)return [];
      const excerpt=clean(item.abstract)||clean(`${title}. Scholarly work indexed by Crossref${item.publisher?` from ${item.publisher}`:''}.`);
      return [{title,url:item.URL||(item.DOI?`https://doi.org/${item.DOI}`:''),excerpt,provider:'Crossref'}];
    });
  }

  async function searxng(query){
    const config=get(CONFIG,{});
    const endpoint=clean(config?.endpoints?.searxng||config?.searxng||'').replace(/\/$/,'');
    if(!endpoint)return [];
    const url=`${endpoint}/search?${new URLSearchParams({q:query,format:'json'})}`;
    const response=await timeout(fetch(url,{cache:'no-store'}),4500);
    if(!response.ok)return [];
    const data=await response.json();
    return (Array.isArray(data?.results)?data.results:[]).slice(0,12).flatMap(item=>{
      const title=clean(item.title),target=clean(item.url),excerpt=clean(item.content||item.snippet);
      return title&&target&&excerpt?[{title,url:target,excerpt,provider:'SearXNG'}]:[];
    });
  }

  function dedupeRank(query,sources){
    const seen=new Set();
    return sources.filter(source=>{
      const key=source.url||`${source.provider}:${source.title}`;
      if(!source.title||!source.excerpt||seen.has(key))return false;
      seen.add(key);return true;
    }).map(source=>({...source,_score:overlap(`${source.title} ${source.excerpt}`,query)+(source.provider==='SearXNG'?2:0)}))
      .filter(source=>source._score>0)
      .sort((a,b)=>b._score-a._score)
      .map(({_score,...source})=>source);
  }

  function readableExtract(card,sources){
    const original=clean(card.extract||card.body||'');
    if(!needsReadableContext(card))return original;
    const lines=sources.slice(0,3).map(source=>{
      const excerpt=clean(source.excerpt);
      const clipped=excerpt.length>330?`${excerpt.slice(0,327).trim()}…`:excerpt;
      return clipped;
    }).filter(Boolean);
    return lines.join(' ')||original;
  }

  async function upgradeCard(card,stories){
    if(card.retrievalVersion===VERSION)return false;
    const query=clean(card.searchQuery||`${card.title||''} ${card.extract||''}`).slice(0,520);
    if(query.length<3)return false;
    const settled=await Promise.allSettled([wikipedia(query),duckDuckGo(query),crossref(query),searxng(query)]);
    const sources=dedupeRank(query,settled.flatMap(result=>result.status==='fulfilled'?result.value:[])).slice(0,8);
    card.retrievalVersion=VERSION;
    if(!sources.length)return true;
    const key=keyOf(card);
    const story=stories[key]||{};
    const extracted=readableExtract(card,sources);
    if(extracted)card.extract=extracted;
    stories[key]={...story,sources,enriched:true,retrievalVersion:VERSION,image:story.image||sources.find(source=>source.image)?.image||''};
    return true;
  }

  async function run(){
    const cards=get(SHARED,[]);
    if(!Array.isArray(cards)||!cards.length)return;
    const stories=get(STORIES,{});
    let changed=false;
    for(const card of cards.slice(0,8)){
      try{changed=(await upgradeCard(card,stories))||changed}catch{}
    }
    if(!changed)return;
    set(SHARED,cards);
    set(STORIES,stories);
    window.dispatchEvent(new CustomEvent('newsphi:retrieval-upgraded',{detail:{version:VERSION}}));
    document.getElementById('refreshFeed')?.click();
  }

  setTimeout(()=>void run(),180);
})();
