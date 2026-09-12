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
        storyIndex[key]={storyKey:key,title:card.title||'Collected story',image:card.image||'',url:card.url||'',domain:card.domain||card.provider||'Collected source',searchQuery:card.searchQuery||'',collectedAt:card.collectedAt,sourceFingerprint:card.extract||'',paragraphs:buildParagraphs(card)};
      }else{
        ['image','url','domain','searchQuery'].forEach(field=>{if(!storyIndex[key][field]&&card[field])storyIndex[key][field]=card[field]});
        if(card.extract&&!storyIndex[key].sourceFingerprint){storyIndex[key].paragraphs=buildParagraphs(card);storyIndex[key].sourceFingerprint=card.extract}
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

  function awardStarCoinShare(reference) {
    const attemptId=`phi-share-${Date.now().toString(36)}-${Math.random().toString(36).slice(2,8)}`;
    const read=(key,fallback)=>{try{return JSON.parse(localStorage.getItem(key))||fallback}catch{return fallback}};
    const session=read('starquest_session',null);
    const users=read('starquest_users',{});
    const signedIn=session&&session.key&&users[session.key];
    const wallet=signedIn||read('starquest_guest_profile_v1',{key:'__guest__',username:'Guest',tokens:0,shareCount:0,pendingShareCredits:0,shareEvents:[],ledger:[],watchHistory:[],watchPositions:{},unlockedContent:{}});
    wallet.tokens=Math.max(0,Number(wallet.tokens)||0);
    wallet.shareCount=Math.max(0,Number(wallet.shareCount)||0)+1;
    wallet.pendingShareCredits=Math.max(0,Number(wallet.pendingShareCredits)||0)+1;
    wallet.shareEvents=Array.isArray(wallet.shareEvents)?wallet.shareEvents:[];
    wallet.ledger=Array.isArray(wallet.ledger)?wallet.ledger:[];
    wallet.shareEvents.push({id:attemptId,attemptId,contentId:reference,method:'web_share_api',confirmed:true,verified:true,createdAt:Date.now()});
    let awarded=0;
    while(wallet.pendingShareCredits>=10){wallet.pendingShareCredits-=10;wallet.tokens+=1;awarded+=1}
    wallet.ledger.push({id:`tx-${attemptId}`,type:awarded?'share_reward':'share_credit',amount:awarded,balance:wallet.tokens,pendingShareCredits:wallet.pendingShareCredits,reason:awarded?'Share reward: 10 completed shares':`Confirmed share receipt ${wallet.pendingShareCredits}/10`,referenceId:attemptId,createdAt:Date.now()});
    wallet.shareEvents=wallet.shareEvents.slice(-250);wallet.ledger=wallet.ledger.slice(-500);
    if(signedIn){users[session.key]=wallet;localStorage.setItem('starquest_users',JSON.stringify(users))}
    else localStorage.setItem('starquest_guest_profile_v1',JSON.stringify(wallet));
    window.dispatchEvent(new CustomEvent('starquest:share-progress',{detail:{progressToNextCoin:wallet.pendingShareCredits,awarded,balance:wallet.tokens}}));
    return {progressToNextCoin:wallet.pendingShareCredits,awarded,balance:wallet.tokens};
  }

  async function shareStory(key) {
    const story=state.storyIndex[key]; if(!story)return;
    const params=new URLSearchParams({
      sharedTitle:story.title||'Shared orange card',
      sharedBody:(story.paragraphs||[]).join(' ').slice(0,1200),
      sharedUrl:story.url||'',
      sharedImage:story.image||'',
      sharedDomain:story.domain||'',
      sharedQuery:story.searchQuery||''
    });
    const shareUrl=`${location.origin}${location.pathname}?${params}#story=${encodeURIComponent(key)}`;
    if(!navigator.share){try{await navigator.clipboard.writeText(shareUrl);alert('Card link copied. Open Android Share to earn 1/10 StarCoin.')}catch{}return}
    try{
      await navigator.share({title:story.title,text:excerpt(story),url:shareUrl});
      const reward=awardStarCoinShare(shareUrl);
      alert(reward.awarded?'Shared — 1 StarCoin completed!':`Shared — StarCoin progress ${reward.progressToNextCoin}/10`);
    }catch(error){if(!error||error.name!=='AbortError')alert('Share did not complete.')}
  }

  function importSharedCard() {
    const params=new URLSearchParams(location.search);
    const title=params.get('sharedTitle'); if(!title)return '';
    const card={title,extract:params.get('sharedBody')||'',url:params.get('sharedUrl')||'',image:params.get('sharedImage')||'',domain:params.get('sharedDomain')||'Shared card',searchQuery:params.get('sharedQuery')||'',collectedAt:new Date().toISOString()};
    card.storyKey=keyOf(card);
    const shared=get(KEYS.shared,[]);
    const existing=shared.find(item=>keyOf(item)===card.storyKey);
    if(existing)Object.assign(existing,card);else shared.unshift(card);
    set(KEYS.shared,shared);
    state=synchronize();
    return card.storyKey;
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
    return `https://www-infinity4.github.io/C13b0/phi?${new URLSearchParams({q,run:'1',cardTitle:story.title||'',cardBody:(story.paragraphs||[]).join(' ').slice(0,1200),source:story.url||''})}`;
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
      return `<article class="news-card"><div class="card-grid">${story.image?`<img class="card-image" src="${esc(story.image)}" alt="" loading="lazy">`:`<div class="card-image fallback"><span>φ</span></div>`}<div class="card-body"><div class="card-meta"><span>${esc(story.domain)}</span>${story.searchQuery?`<span>From ${esc(story.searchQuery)}</span>`:''}</div><h2>${esc(story.title)}</h2><p class="card-excerpt">${esc(excerpt(story))}</p><div class="card-actions"><button class="full" type="button" data-story="${esc(story.storyKey)}">Open full card</button><a href="${relatedUrl(story)}">Build similar news</a><button class="share-card" type="button" data-share="${esc(story.storyKey)}">Share card · +1/10 ⭐</button></div></div></div></article>`;
    }).join('');
    feed.querySelectorAll('[data-story]').forEach(button=>button.addEventListener('click',()=>openStory(button.dataset.story)));
    feed.querySelectorAll('[data-share]').forEach(button=>button.addEventListener('click',()=>shareStory(button.dataset.share)));
  }

  function openStory(key){
    const story=state.storyIndex[key];
    if(!story)return;
    storyContent.innerHTML=`${story.image?`<img class="story-hero" src="${esc(story.image)}" alt="">`:''}<div class="story-full"><div class="card-meta"><span>${esc(story.domain)}</span>${story.searchQuery?`<span>Collected from ${esc(story.searchQuery)}</span>`:''}</div><h2>${esc(story.title)}</h2>${(story.paragraphs||[]).map((paragraph,index)=>`<p class="${index===0?'lead':''}">${esc(paragraph)}</p>`).join('')}<div class="card-actions">${story.url?`<a href="${esc(story.url)}" target="_blank" rel="noopener">Open evidence source</a>`:''}<a href="${relatedUrl(story)}">Build similar news</a><button class="share-card" type="button" data-share="${esc(story.storyKey)}">Share card · +1/10 ⭐</button></div></div>`;
    storyContent.querySelectorAll("[data-share]").forEach(button=>button.addEventListener("click",()=>shareStory(button.dataset.share)));
    if(location.hash!==`#story=${encodeURIComponent(key)}`)history.replaceState(null,'',`#story=${encodeURIComponent(key)}`);
    dialog.showModal();
  }

  function closeStory(){dialog.close();history.replaceState(null,'',location.pathname+location.search)}
  document.getElementById('closeStory').addEventListener('click',closeStory);
  dialog.addEventListener('click',event=>{if(event.target===dialog)closeStory()});
  search.addEventListener('input',render);
  document.getElementById('refreshFeed').addEventListener('click',()=>{state=synchronize();render()});
  const importedKey=importSharedCard();
  render();
  const hashKey=location.hash.startsWith('#story=')?decodeURIComponent(location.hash.slice(7)):'';
  if(hashKey)openStory(state.storyIndex[hashKey]?hashKey:importedKey);
})();
