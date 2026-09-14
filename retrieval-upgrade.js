(function(){
  'use strict';
  const KEYS={shared:'phiShared:collection:v1',stories:'phiShared:storyIndex:v2',queue:'newsPhi:retrievalQueue:v2',ingest:'controlPhi:ingestQueue:v1',controlShares:'controlPhi:shareFeed:v1',config:'controlPhi:searchConfig:v1'};
  const VERSION='source-publish-20260914';
  const STOP=new Set(['about','after','again','also','and','are','because','before','being','from','have','into','more','news','post','shared','source','that','their','these','they','this','through','what','when','where','which','with','would','your','infinity','phi','http','https','www','com']);
  const get=(key,fallback)=>{try{return JSON.parse(localStorage.getItem(key))??fallback}catch{return fallback}};
  const set=(key,value)=>{try{localStorage.setItem(key,JSON.stringify(value));return true}catch{return false}};
  const clean=value=>String(value??'').replace(/<[^>]+>/g,' ').replace(/\s+/g,' ').trim();
  const hash=value=>{let h=2166136261;for(let i=0;i<value.length;i++){h^=value.charCodeAt(i);h=Math.imul(h,16777619)}return(h>>>0).toString(36)};
  const timeout=(promise,ms)=>Promise.race([promise,new Promise((_,reject)=>setTimeout(()=>reject(new Error('timeout')),ms))]);
  const words=value=>clean(value).toLowerCase().replace(/https?:\/\/\S+/g,' ').replace(/[^a-z0-9'-]+/g,' ').split(/\s+/).filter(word=>word.length>2&&!STOP.has(word)&&!/^\d+$/.test(word));
  const overlap=(a,b)=>{const right=new Set(words(b));return [...new Set(words(a))].reduce((n,word)=>n+(right.has(word)?1:0),0)};
  const clip=(value,size=430)=>{const text=clean(value);return text.length>size?`${text.slice(0,size-1).trim()}…`:text};

  function searchTerms(job){
    const counts=new Map();
    words(`${job.subject||''} ${job.query||''} ${job.indexedText||''} ${job.sourceUrl||''}`).forEach((word,index)=>counts.set(word,(counts.get(word)||0)+(index<18?2:1)));
    return [...counts].sort((a,b)=>b[1]-a[1]||b[0].length-a[0].length).slice(0,10).map(([word])=>word);
  }

  async function wikipedia(query){
    const response=await timeout(fetch(`https://en.wikipedia.org/w/api.php?action=query&generator=search&gsrsearch=${encodeURIComponent(query)}&gsrlimit=7&prop=extracts|info|pageimages&exintro=1&explaintext=1&inprop=url&pithumbsize=900&format=json&origin=*`,{cache:'no-store'}),5000);if(!response.ok)return [];
    const data=await response.json();return Object.values(data?.query?.pages||{}).flatMap(page=>page.title&&page.extract?[{title:clean(page.title),url:page.fullurl||'',excerpt:clean(page.extract),image:page.thumbnail?.source||'',provider:'Wikipedia'}]:[]);
  }
  async function duckDuckGo(query){
    const response=await timeout(fetch(`https://api.duckduckgo.com/?q=${encodeURIComponent(query)}&format=json&no_html=1&skip_disambig=0`,{cache:'no-store'}),4000);if(!response.ok)return [];
    const data=await response.json(),out=[];if(data.AbstractText)out.push({title:clean(data.Heading||query),url:data.AbstractURL||'',excerpt:clean(data.AbstractText),image:data.Image||'',provider:'DuckDuckGo'});
    (data.RelatedTopics||[]).flatMap(item=>item.Topics||[item]).forEach(item=>{if(item.Text)out.push({title:clean(item.Text).split(' - ')[0],url:item.FirstURL||'',excerpt:clean(item.Text),provider:'DuckDuckGo'})});return out;
  }
  async function crossref(query){
    const response=await timeout(fetch(`https://api.crossref.org/works?query=${encodeURIComponent(query)}&rows=8`,{cache:'no-store'}),4000);if(!response.ok)return [];
    const data=await response.json();return (data?.message?.items||[]).flatMap(item=>{const title=clean(item.title?.[0]),excerpt=clean(item.abstract);if(!title||!excerpt)return [];const parts=item.published?.['date-parts']?.[0]||item.issued?.['date-parts']?.[0]||[];return [{title,url:item.URL||(item.DOI?`https://doi.org/${item.DOI}`:''),excerpt,provider:item.publisher||'Crossref',publishedAt:parts.length?parts.join('-'):''}]});
  }
  async function searxng(query){
    const config=get(KEYS.config,{}),endpoint=clean(config?.endpoints?.searxng||config?.searxng||'').replace(/\/$/,'');if(!endpoint)return [];
    const response=await timeout(fetch(`${endpoint}/search?${new URLSearchParams({q:query,format:'json'})}`,{cache:'no-store'}),5000);if(!response.ok)return [];
    const data=await response.json();return (data?.results||[]).slice(0,12).flatMap(item=>item.title&&item.url&&(item.content||item.snippet)?[{title:clean(item.title),url:clean(item.url),excerpt:clean(item.content||item.snippet),image:clean(item.img_src||item.thumbnail),provider:'Web result',publishedAt:clean(item.publishedDate)}]:[]);
  }

  function rankSources(job,sources){
    const target=searchTerms(job).join(' '),seen=new Set();
    const minimum=searchTerms(job).length>1?2:1;
    return sources.flatMap(source=>{const key=source.url||`${source.provider}:${source.title}`;if(!source.title||!source.excerpt||seen.has(key)||Boolean(job.excludedSourceUrl&&source.url===job.excludedSourceUrl))return [];seen.add(key);const score=overlap(`${source.title} ${source.excerpt}`,target);return score>=minimum?[{...source,_score:score}]:[]}).sort((a,b)=>b._score-a._score).map(({_score,...source})=>source);
  }
  const rawSignalCard=card=>!card||card.generatedBy==='news-phi-interest-bridge'||Boolean(card.ingestType)||(/^phi-/.test(card.storyKey||'')&&!card.sourceBacked);

  function collectJobs(){
    const queued=get(KEYS.queue,[]),byKey=new Map(queued.map(job=>[job.jobKey||job.id,job]));
    [...get(KEYS.ingest,[]),...get(KEYS.controlShares,[])].forEach(record=>{const query=clean(record.searchText||record.query||record.text||record.extract||record.title||record.url);if(!query)return;const jobKey=`share:${hash(`${record.url||''}|${query}`)}`;if(!byKey.has(jobKey))byKey.set(jobKey,{jobKey,kind:'share',subject:clean(record.title),query,sourceUrl:clean(record.url),indexedText:clean(record.text||record.extract),collectedAt:record.collectedAt||new Date().toISOString(),status:'indexed'})});
    const jobs=[...byKey.values()].slice(0,500);set(KEYS.queue,jobs);return jobs;
  }

  async function resolveJob(job){
    const terms=searchTerms(job),query=terms.join(' ');if(query.length<3)return null;
    const settled=await Promise.allSettled([wikipedia(query),duckDuckGo(query),crossref(query),searxng(query)]),sources=rankSources(job,settled.flatMap(result=>result.status==='fulfilled'?result.value:[])).slice(0,5);if(!sources.length)return null;
    const lead=sources[0],imageSource=sources.find(source=>source.image&&overlap(`${source.title} ${source.excerpt}`,query)>=Math.min(2,terms.length));
    return {id:`retrieved-${hash(job.jobKey||query)}`,storyKey:`retrieved:${hash(job.jobKey||query)}`,kind:job.kind,title:lead.title,extract:sources.slice(0,3).map(source=>clip(source.excerpt)).filter(Boolean).join(' '),url:lead.url,domain:lead.provider,provider:lead.provider,publishedAt:lead.publishedAt||'',collectedAt:job.collectedAt||new Date().toISOString(),searchQuery:query,originQuery:job.originQuery||'',sources,image:imageSource?.image||'',imageVerified:Boolean(imageSource),sourceBacked:true,retrievalVersion:VERSION};
  }

  let running=false;
  async function run(){
    if(running)return;running=true;
    try{
      const jobs=collectJobs(),before=get(KEYS.shared,[]),shared=before.filter(card=>!rawSignalCard(card)),stories=get(KEYS.stories,{}),visible=new Map(shared.map(card=>[card.storyKey||card.url||card.id,card]));let changed=shared.length!==before.length;
      for(const job of jobs.filter(item=>item.status!=='published').slice(0,8)){try{const card=await resolveJob(job);if(!card)continue;visible.set(card.storyKey,card);job.status='published';job.publishedStoryKey=card.storyKey;job.publishedAt=new Date().toISOString();changed=true;stories[card.storyKey]={...(stories[card.storyKey]||{}),headline:card.title,title:card.title,standfirst:card.extract,paragraphs:[card.extract],sources:card.sources,image:card.image,imageVerified:card.imageVerified,enriched:true,retrievalVersion:VERSION}}catch{}}
      if(!changed)return;set(KEYS.shared,[...visible.values()].sort((a,b)=>String(b.collectedAt).localeCompare(String(a.collectedAt))).slice(0,500));set(KEYS.queue,jobs);set(KEYS.stories,stories);window.dispatchEvent(new CustomEvent('newsphi:retrieval-upgraded',{detail:{version:VERSION}}));document.getElementById('refreshFeed')?.click();
    }finally{running=false}
  }
  setTimeout(()=>void run(),120);window.addEventListener('newsphi:run-retrieval',()=>void run());window.addEventListener('phi:ingested',()=>void run());
})();
