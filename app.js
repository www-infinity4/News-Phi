(function(){
  const KEYS={
    shared:'phiShared:collection:v1',
    stories:'phiShared:storyIndex:v1',
    omniProfile:'omniPhi:profile:v1',
    omniResearch:'omniPhi:lastResearch:v1'
  };
  const get=(key,fallback)=>{try{return JSON.parse(localStorage.getItem(key))??fallback}catch{return fallback}};
  const set=(key,value)=>localStorage.setItem(key,JSON.stringify(value));
  const esc=(value)=>String(value??'').replace(/[&<>'"]/g,(char)=>({'&':'&amp;','<':'&lt;','>':'&gt;',"'":'&#39;','"':'&quot;'}[char]));
  const keyOf=(card)=>card.storyKey||card.url||card.id||String(card.title||'card').toLowerCase().replace(/[^a-z0-9]+/g,'-');
  const sentenceList=(text)=>String(text||'').replace(/\s+/g,' ').trim().split(/(?<=[.!?])\s+/).filter(Boolean);

  function synchronize(){
    const shared=get(KEYS.shared,[]);
    const profile=get(KEYS.omniProfile,{collected:[]});
    const research=get(KEYS.omniResearch,null);
    const currentSources=new Map((research?.sources||[]).map(card=>[keyOf(card),card]));
    const all=[...shared,...(profile.collected||[])];
    const merged=new Map();
    all.forEach((card)=>{
      const key=keyOf(card);
      const enriched=currentSources.get(key)||{};
      const previous=merged.get(key)||{};
      merged.set(key,{...previous,...card,...enriched,storyKey:key,searchQuery:card.searchQuery||previous.searchQuery||research?.query||'',collectedAt:card.collectedAt||previous.collectedAt||new Date().toISOString()});
    });
    const cards=[...merged.values()].sort((a,b)=>String(b.collectedAt).localeCompare(String(a.collectedAt)));
    set(KEYS.shared,cards);

    const storyIndex=get(KEYS.stories,{});
    cards.forEach((card)=>{
      const key=keyOf(card);
      if(!storyIndex[key]){
        storyIndex[key]={storyKey:key,title:card.title||'Collected story',image:card.image||'',url:card.url||'',domain:card.domain||card.provider||'Collected source',searchQuery:card.searchQuery||'',collectedAt:card.collectedAt,paragraphs:buildParagraphs(card)};
      }else{
        ['image','url','domain','searchQuery'].forEach(field=>{if(!storyIndex[key][field]&&card[field])storyIndex[key][field]=card[field]});
      }
    });
    set(KEYS.stories,storyIndex);
    return {cards,storyIndex};
  }

  function buildParagraphs(card){
    const sentences=sentenceList(card.extract);
    if(!sentences.length)return [`${card.title||'This collected card'} is saved as a starting point. Open the evidence source or return to Omni Phi to expand this line of research.`];
    const paragraphs=[];
    for(let i=0;i<sentences.length;i+=3)paragraphs.push(sentences.slice(i,i+3).join(' '));
    return paragraphs;
  }

  function excerpt(story){
    const text=(story.paragraphs||[]).join(' ');
    const sentences=sentenceList(text).slice(0,4).join(' ');
    return sentences.length>520?`${sentences.slice(0,517).trim()}…`:sentences;
  }

  const feed=document.getElementById('feed');
  const count=document.getElementById('cardCount');
  const syncLabel=document.getElementById('syncLabel');
  const search=document.getElementById('feedSearch');
  const dialog=document.getElementById('storyDialog');
  const storyContent=document.getElementById('storyContent');
  let state=synchronize();

  function relatedUrl(story){
    const q=`${story.title} related research`;
    return `https://www-infinity4.github.io/Omni-Phi/overview/?${new URLSearchParams({q,mode:'search'})}`;
  }

  function render(){
    const term=search.value.trim().toLowerCase();
    const cards=state.cards.filter(card=>`${card.title||''} ${card.extract||''} ${card.searchQuery||''}`.toLowerCase().includes(term));
    count.textContent=`${cards.length} card${cards.length===1?'':'s'}`;
    syncLabel.textContent=`${state.cards.length} shared card${state.cards.length===1?'':'s'}`;
    if(!cards.length){
      feed.innerHTML=`<div class="empty-feed"><h2>${state.cards.length?'No cards match that filter':'Your news feed is ready'}</h2><p>${state.cards.length?'Try a broader word.':'Collect orange cards on page two of Omni Phi. They will flow into News Phi automatically and each full story will be built only once.'}</p>${state.cards.length?'':`<a href="https://www-infinity4.github.io/Omni-Phi/">Open Omni Phi</a>`}</div>`;
      return;
    }
    feed.innerHTML=cards.map(card=>{
      const story=state.storyIndex[keyOf(card)];
      return `<article class="news-card"><div class="card-grid">${story.image?`<img class="card-image" src="${esc(story.image)}" alt="" loading="lazy">`:`<div class="card-image fallback"><span>φ</span></div>`}<div class="card-body"><div class="card-meta"><span>${esc(story.domain)}</span>${story.searchQuery?`<span>From ${esc(story.searchQuery)}</span>`:''}</div><h2>${esc(story.title)}</h2><p class="card-excerpt">${esc(excerpt(story))}</p><div class="card-actions"><button class="full" type="button" data-story="${esc(story.storyKey)}">Open full card</button><a href="${relatedUrl(story)}">Build similar news</a></div></div></div></article>`;
    }).join('');
    feed.querySelectorAll('[data-story]').forEach(button=>button.addEventListener('click',()=>openStory(button.dataset.story)));
  }

  function openStory(key){
    const story=state.storyIndex[key];
    if(!story)return;
    storyContent.innerHTML=`${story.image?`<img class="story-hero" src="${esc(story.image)}" alt="">`:''}<div class="story-full"><div class="card-meta"><span>${esc(story.domain)}</span>${story.searchQuery?`<span>Collected from ${esc(story.searchQuery)}</span>`:''}</div><h2>${esc(story.title)}</h2>${(story.paragraphs||[]).map((paragraph,index)=>`<p class="${index===0?'lead':''}">${esc(paragraph)}</p>`).join('')}<div class="card-actions">${story.url?`<a href="${esc(story.url)}" target="_blank" rel="noopener">Open evidence source</a>`:''}<a href="${relatedUrl(story)}">Build similar news</a></div></div>`;
    if(location.hash!==`#story=${encodeURIComponent(key)}`)history.replaceState(null,'',`#story=${encodeURIComponent(key)}`);
    dialog.showModal();
  }

  function closeStory(){dialog.close();history.replaceState(null,'',location.pathname+location.search)}
  document.getElementById('closeStory').addEventListener('click',closeStory);
  dialog.addEventListener('click',event=>{if(event.target===dialog)closeStory()});
  search.addEventListener('input',render);
  document.getElementById('refreshFeed').addEventListener('click',()=>{state=synchronize();render()});
  render();
  const hashKey=location.hash.startsWith('#story=')?decodeURIComponent(location.hash.slice(7)):'';
  if(hashKey)openStory(hashKey);
})();
