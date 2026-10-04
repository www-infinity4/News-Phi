/* ---- news-card-image-resolver.js ---- */
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

/* ---- news-image-integrity.js ---- */
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

/* ---- user-index-bridge.js ---- */
(() => {
  "use strict";
  const USER_INDEX = "newsPhi:userStoryIndex:v1";
  const SHARED = "phiShared:collection:v1";
  const clean = (value, max = 2400) =>
    String(value || "").replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim().slice(0, max);
  const read = (key, fallback) => {
    try { const value = JSON.parse(localStorage.getItem(key) || "null"); return value ?? fallback; }
    catch { return fallback; }
  };
  const write = (key, value) => {
    try { localStorage.setItem(key, JSON.stringify(value)); return true; }
    catch { return false; }
  };
  const storyFrom = (node) => {
    const card = node.closest("[data-story]");
    if (!card) return null;
    const link = card.querySelector("a[href]");
    const image = card.querySelector("img");
    const title = clean(card.querySelector("h1,h2,h3,h4,[data-title]")?.textContent || link?.textContent);
    const sourceUrl = clean(card.dataset.url || link?.href, 1600);
    if (!title && !sourceUrl) return null;
    return {
      id: clean(card.dataset.story || sourceUrl || title, 500),
      storyKey: sourceUrl || clean(card.dataset.story || title, 500),
      title: title || "Opened News Phi story",
      sourceTitle: title || "Opened News Phi story",
      extract: clean(card.querySelector("p,[data-extract]")?.textContent),
      url: sourceUrl,
      image: clean(image?.currentSrc || image?.src, 1600),
      domain: (() => { try { return new URL(sourceUrl).hostname.replace(/^www\./, ""); } catch { return ""; } })(),
      searchQuery: clean(card.dataset.query || title),
      collectedFrom: "News Phi story opened",
      ingestType: "semantic-seed",
      seedOnly: true,
      clickedAt: new Date().toISOString()
    };
  };
  const indexStory = (story) => {
    const index = read(USER_INDEX, []);
    const key = story.storyKey || story.id;
    const without = Array.isArray(index) ? index.filter(x => (x?.storyKey || x?.id) !== key) : [];
    write(USER_INDEX, [story, ...without].slice(0, 500));
    const shared = read(SHARED, []);
    const list = Array.isArray(shared) ? shared : [];
    const next = list.filter(x => !(x?.collectedFrom === "News Phi story opened" && (x?.storyKey || x?.id) === key));
    write(SHARED, [{ ...story, collectedAt: story.clickedAt }, ...next].slice(0, 500));
    window.dispatchEvent(new CustomEvent("phiShared:collection-change", { detail: { storyKey: key, source: "news-user-click" } }));
  };
  document.addEventListener("click", (event) => {
    const story = storyFrom(event.target);
    if (story) indexStory(story);
  }, true);

})();
/* ---- feed-controls.js ---- */
/* Manual feed reset controls retired: News Phi now refreshes automatically and replaces its feed daily. */

/* ---- news-interactions.js ---- */
(function(){
  'use strict';

  const SHARED_KEY='phiShared:collection:v1';
  const STORIES_KEY='phiShared:storyIndex:v2';
  const CONFIG_KEY='controlPhi:searchConfig:v1';
  const ROUND_KEY='newsPhi:similarRounds:v1';
  const params=new URLSearchParams(location.search);
  const AUTO_SIMILAR=params.get('buildSimilar')==='1';
  const AUTO_STORY_KEY=(()=>{try{const match=location.hash.match(/^#story=(.*)$/);return match?decodeURIComponent(match[1]):''}catch{return''}})();
  const STOP=new Set(['about','after','again','also','and','are','because','before','being','from','have','into','more','news','post','shared','source','that','their','these','they','this','through','what','when','where','which','with','would','your','infinity','phi','http','https','www','com','latest','background','context']);

  const get=(key,fallback)=>{try{return JSON.parse(localStorage.getItem(key))??fallback}catch{return fallback}};
  const set=(key,value)=>{try{localStorage.setItem(key,JSON.stringify(value));return true}catch{return false}};
  const clean=value=>String(value??'').replace(/<[^>]+>/g,' ').replace(/\s+/g,' ').trim();
  const clip=(value,size=1500)=>{const text=clean(value);return text.length>size?`${text.slice(0,size-1).trim()}…`:text};
  const hash=value=>{let h=2166136261;for(let i=0;i<value.length;i++){h^=value.charCodeAt(i);h=Math.imul(h,16777619)}return(h>>>0).toString(36)};
  const words=value=>clean(value).toLowerCase().replace(/https?:\/\/\S+/g,' ').replace(/[^a-z0-9'-]+/g,' ').split(/\s+/).filter(word=>word.length>2&&!STOP.has(word)&&!/^\d+$/.test(word));
  const timeout=(promise,ms)=>Promise.race([promise,new Promise((_,reject)=>setTimeout(()=>reject(new Error('timeout')),ms))]);
  const overlap=(a,b)=>{const right=new Set(words(b));return [...new Set(words(a))].reduce((n,word)=>n+(right.has(word)?1:0),0)};
  const keyOf=card=>card?.storyKey||card?.url||card?.id||String(card?.title||'card').toLowerCase().replace(/[^a-z0-9]+/g,'-');

  const feed=document.getElementById('feed');
  const dialog=document.getElementById('storyDialog');
  const storyContent=document.getElementById('storyContent');
  if(!feed)return;

  const style=document.createElement('style');
  style.textContent=`
    .card-actions .build-similar{border-color:rgba(198,138,255,.72);background:linear-gradient(135deg,rgba(92,35,138,.78),rgba(63,20,91,.78));cursor:pointer}
    .card-actions .build-similar[disabled]{opacity:.65;cursor:progress}
    .newsphi-toast{position:fixed;left:50%;bottom:max(18px,env(safe-area-inset-bottom));z-index:80;max-width:min(92vw,520px);padding:12px 16px;transform:translateX(-50%);border:1px solid rgba(198,138,255,.5);border-radius:14px;background:rgba(12,7,22,.96);box-shadow:0 15px 50px rgba(0,0,0,.55);color:white;font-weight:750;text-align:center;pointer-events:none}
  `;
  document.head.appendChild(style);

  let toastTimer=0;
  function toast(message){
    let node=document.querySelector('.newsphi-toast');
    if(!node){node=document.createElement('div');node.className='newsphi-toast';document.body.appendChild(node)}
    node.textContent=message;
    clearTimeout(toastTimer);
    toastTimer=setTimeout(()=>node.remove(),2600);
  }

  function cardRecord(key){
    return [...get('newsPhi:monitorCards:v1',[]),...get(SHARED_KEY,[])].find(card=>keyOf(card)===key)||null;
  }

  function storyRecord(key){
    return get(STORIES_KEY,{})[key]||null;
  }

  function buildQuery(key,article){
    const card=cardRecord(key)||{};
    const story=storyRecord(key)||{};
    const title=clean(story.headline||story.title||card.title||article?.querySelector('h2')?.textContent||'');
    const body=clean(story.standfirst||card.extract||article?.querySelector('.card-excerpt')?.textContent||'');
    const existing=clean(story.similarQuery||card.searchQuery||'');
    if(existing)return existing;
    const terms=[...new Set(words(`${title} ${body}`))].slice(0,8).join(' ');
    return clean(`${title} ${terms} related developments evidence`);
  }

  async function wikipedia(query,offset){
    const url=`https://en.wikipedia.org/w/api.php?action=query&generator=search&gsrsearch=${encodeURIComponent(query)}&gsrlimit=8&gsroffset=${offset}&prop=extracts|info|pageimages&exintro=1&explaintext=1&inprop=url&pithumbsize=1000&format=json&origin=*`;
    const response=await timeout(fetch(url,{cache:'no-store'}),6500);
    if(!response.ok)return [];
    const data=await response.json();
    return Object.values(data?.query?.pages||{}).flatMap(page=>page.title&&page.extract?[{title:clean(page.title),url:page.fullurl||'',excerpt:clean(page.extract),image:page.thumbnail?.source||'',provider:'Wikipedia'}]:[]);
  }

  async function duckDuckGo(query){
    const response=await timeout(fetch(`https://api.duckduckgo.com/?q=${encodeURIComponent(query)}&format=json&no_html=1&skip_disambig=0`,{cache:'no-store'}),5000);
    if(!response.ok)return [];
    const data=await response.json(),out=[];
    if(data.AbstractText)out.push({title:clean(data.Heading||query),url:data.AbstractURL||'',excerpt:clean(data.AbstractText),image:data.Image||'',provider:'DuckDuckGo'});
    (data.RelatedTopics||[]).flatMap(item=>item.Topics||[item]).forEach(item=>{if(item.Text)out.push({title:clean(item.Text).split(' - ')[0],url:item.FirstURL||'',excerpt:clean(item.Text),provider:'DuckDuckGo'})});
    return out;
  }

  async function crossref(query,offset){
    const response=await timeout(fetch(`https://api.crossref.org/works?query=${encodeURIComponent(query)}&rows=10&offset=${offset}`,{cache:'no-store'}),5500);
    if(!response.ok)return [];
    const data=await response.json();
    return (data?.message?.items||[]).flatMap(item=>{
      const title=clean(item.title?.[0]),excerpt=clean(item.abstract);
      if(!title||!excerpt)return [];
      const parts=item.published?.['date-parts']?.[0]||item.issued?.['date-parts']?.[0]||[];
      return [{title,url:item.URL||(item.DOI?`https://doi.org/${item.DOI}`:''),excerpt,provider:item.publisher||'Crossref',publishedAt:parts.length?parts.join('-'):''}];
    });
  }

  async function searxng(query,round){
    const config=get(CONFIG_KEY,{}),endpoint=clean(config?.endpoints?.searxng||config?.searxng||'https://orange-brook-a2ac.marvaseater.workers.dev').replace(/\/$/,'');
    if(!endpoint)return [];
    const response=await timeout(fetch(`${endpoint}/search?${new URLSearchParams({q:query,format:'json',pageno:String(round+1)})}`,{cache:'no-store'}),6500);
    if(!response.ok)return [];
    const data=await response.json();
    return (data?.results||[]).slice(0,14).flatMap(item=>item.title&&item.url&&(item.content||item.snippet)?[{title:clean(item.title),url:clean(item.url),excerpt:clean(item.content||item.snippet),image:clean(item.img_src||item.thumbnail),provider:'Web result',publishedAt:clean(item.publishedDate)}]:[]);
  }

  function rank(query,sources,existing){
    const target=words(query).slice(0,12).join(' '),seen=new Set(),minimum=words(target).length>1?1:0;
    return sources.flatMap(source=>{
      const id=source.url||`${source.provider}:${source.title}`;
      if(!source.title||!source.excerpt||seen.has(id)||existing.has(id))return [];
      seen.add(id);
      const score=overlap(`${source.title} ${source.excerpt}`,target);
      return score>=minimum?[{...source,_score:score}]:[];
    }).sort((a,b)=>b._score-a._score).map(({_score,...source})=>source);
  }

  async function buildSimilar(key,article,button){
    if(button?.disabled)return;
    if(button){button.disabled=true;button.textContent='Building similar news…'}
    const rounds=get(ROUND_KEY,{}),round=Number(rounds[key]||0),offset=round*8;
    const query=buildQuery(key,article);
    if(!query){toast('I need a story subject before I can build related cards.');if(button){button.disabled=false;button.textContent='Build similar news'}return}

    try{
      const shared=get(SHARED_KEY,[]),existing=new Set(shared.flatMap(card=>[card.url,keyOf(card)].filter(Boolean)));
      const parentStory=storyRecord(key)||{},topic=parentStory.searchQuery||query;
      const results=await Promise.allSettled(['day','week'].map(range=>window.NewsPhiDirect.requestTopic(topic,range,round+1)));
      const known=new Set([...get('newsPhi:monitorCards:v1',[]),...shared].map(c=>c.url));
      let found=results.filter(x=>x.status==='fulfilled').flatMap(x=>x.value).filter(c=>!known.has(c.url)).map(c=>({...c,excerpt:c.extract}));
      found=found.slice(0,6);
      if(!found.length){
        toast('No new related sources were found in this pass.');
        if(button){button.disabled=false;button.textContent='Build similar news'}
        return;
      }

      const parent=cardRecord(key)||{},parentTime=Date.parse(parent.collectedAt||'')||Date.now();
      const built=found.map((source,index)=>{
        const storyKey=`similar:${hash(source.url||`${source.provider}:${source.title}`)}`;
        return {
          id:`news-similar-${hash(`${key}|${source.url||source.title}`)}`,
          storyKey,
          title:source.title,
          extract:clip(source.excerpt),
          url:source.url||'',
          domain:source.provider||'Related source',
          provider:source.provider||'Related source',
          publishedAt:source.publishedAt||'',
          collectedAt:new Date(parentTime-(round*20+index+1)*1000).toISOString(),
          searchQuery:query,
          sources:[source],
          image:source.image||'',
          imageVerified:Boolean(source.image),
          sourceBacked:true,
          generatedBy:'monitor-news',
          parentStoryKey:key,
          relation:'similar'
        };
      });

      const stored=get('newsPhi:monitorCards:v1',[]);
      const stacked=window.NewsPhiDirect.stack(stored,[built]);
      set('newsPhi:monitorCards:v1',stacked.cards);
      rounds[key]=round+1;set(ROUND_KEY,rounds);
      toast(`Built ${built.length} new related card${built.length===1?'':'s'} below this story.`);
      window.dispatchEvent(new CustomEvent('controlphi:shared',{detail:{source:'build-similar-news',parentStoryKey:key,count:built.length}}));
    }catch(error){
      console.warn('Build similar news failed',error);
      toast('Similar news could not be built from the available sources.');
      if(button){button.disabled=false;button.textContent='Build similar news'}
    }
  }

  function addButton(actions,key,article){
    if(!actions||!key||actions.querySelector('[data-build-similar]'))return;
    const button=document.createElement('button');
    button.className='build-similar';
    button.type='button';
    button.dataset.buildSimilar=key;
    button.textContent='Build similar news';
    button.addEventListener('click',()=>void buildSimilar(key,article,button));
    const readSimilar=[...actions.querySelectorAll('a')].find(link=>/similar news/i.test(link.textContent||''));
    if(readSimilar)readSimilar.insertAdjacentElement('afterend',button);else actions.appendChild(button);
  }

  function enhanceFeed(){
    feed.querySelectorAll('article[data-story-card]').forEach(article=>{
      const key=article.dataset.storyCard;
      addButton(article.querySelector('.card-actions'),key,article);
    });
  }

  function enhanceDialog(){
    const key=dialog?.dataset.storyKey;
    if(!key||!storyContent)return;
    addButton(storyContent.querySelector('.card-actions'),key,storyContent);
  }

  let autoBuildStarted=false;
  function clearAutoFlag(){
    try{
      const url=new URL(location.href);
      url.searchParams.delete('buildSimilar');
      history.replaceState(history.state,'',`${url.pathname}${url.search}${url.hash}`);
    }catch{}
  }

  function maybeAutoBuild(){
    if(!AUTO_SIMILAR||autoBuildStarted||!AUTO_STORY_KEY)return;
    const article=[...feed.querySelectorAll('article[data-story-card]')].find(node=>node.dataset.storyCard===AUTO_STORY_KEY);
    if(!article)return;
    const button=article.querySelector('[data-build-similar]');
    if(!button)return;
    autoBuildStarted=true;
    clearAutoFlag();
    void buildSimilar(AUTO_STORY_KEY,article,button);
  }

  let enhanceQueued=false;
  function queueEnhanceFeed(){
    if(enhanceQueued)return;
    enhanceQueued=true;
    requestAnimationFrame(()=>{
      enhanceQueued=false;
      enhanceFeed();
      maybeAutoBuild();
    });
  }

  // Only add News Phi controls when the feed changes. Never move the user's
  // scroll position in response to asynchronous card/image/source updates.
  const feedObserver=new MutationObserver(queueEnhanceFeed);
  feedObserver.observe(feed,{childList:true,subtree:true});

  if(storyContent){
    const dialogObserver=new MutationObserver(enhanceDialog);
    dialogObserver.observe(storyContent,{childList:true,subtree:true});
  }

  enhanceFeed();
  enhanceDialog();
  maybeAutoBuild();
})();

