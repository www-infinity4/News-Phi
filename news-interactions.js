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
    return get(SHARED_KEY,[]).find(card=>keyOf(card)===key)||null;
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
      const results=await Promise.allSettled([wikipedia(query,offset),duckDuckGo(query),crossref(query,round*10),searxng(query,round)]);
      let found=rank(query,results.flatMap(result=>result.status==='fulfilled'?result.value:[]),existing);
      if(!found.length){
        const fallback=[...new Set(words(query))].slice(0,5).join(' ');
        found=rank(fallback,await wikipedia(fallback,offset+8),existing);
      }
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
          generatedBy:'news-phi-similar-build',
          parentStoryKey:key,
          relation:'similar'
        };
      });

      set(SHARED_KEY,[...shared,...built]);
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
