(function(){
  'use strict';

  const KEYS={
    shared:'phiShared:collection:v1',
    stories:'phiShared:storyIndex:v2',
    legacyStories:'phiShared:storyIndex:v1',
    omniProfile:'omniPhi:profile:v1',
    omniResearch:'omniPhi:lastResearch:v1',
    controlShares:'controlPhi:shareFeed:v1'
  };

  const STOP=new Set([
    'about','after','again','against','also','and','are','because','before','being','between','built','card','channel',
    'could','every','from','have','into','itself','more','news','open','other','over','points','prepared','research',
    'same','share','shared','sharing','source','story','such','than','that','their','these','they','this','through',
    'under','user','watch','what','when','where','which','while','with','would','your','infinity','phi','live','page',
    'completed','synchronized','starting','point','available','moment','information','read','generate'
  ]);

  const BOILERPLATE=[
    /\bwas shared\b/i,
    /\bthe share points to\b/i,
    /\bnews phi prepared\b/i,
    /\bopen this card\b/i,
    /\bresearch starting point\b/i,
    /\bcompleted share\b/i,
    /\bstarcoin\b/i,
    /\bshare reward\b/i
  ];

  const get=(key,fallback)=>{try{return JSON.parse(localStorage.getItem(key))??fallback}catch{return fallback}};
  const set=(key,value)=>{try{localStorage.setItem(key,JSON.stringify(value));return true}catch{return false}};
  const clean=(value)=>String(value??'').replace(/<[^>]+>/g,' ').replace(/\s+/g,' ').trim();
  const esc=(value)=>String(value??'').replace(/[&<>'"]/g,(char)=>({'&':'&amp;','<':'&lt;','>':'&gt;',"'":'&#39;','"':'&quot;'}[char]));
  const keyOf=(card)=>card.storyKey||card.url||card.id||String(card.title||'card').toLowerCase().replace(/[^a-z0-9]+/g,'-');
  const sentenceList=(text)=>clean(text).split(/(?<=[.!?])\s+/).map(clean).filter(Boolean);
  const genericTitle=(title)=>/^(shared|collected|news|story|orange card|shared story|collected story)$/i.test(clean(title));

  function words(text){
    return clean(text).toLowerCase().replace(/https?:\/\/\S+/g,' ').replace(/[^a-z0-9'-]+/g,' ').split(/\s+/)
      .filter(word=>word.length>2&&!STOP.has(word)&&!/^\d+$/.test(word));
  }

  function importantTerms(text,limit=8){
    const counts=new Map();
    words(text).forEach((word,index)=>{
      const weight=index<14?2:1;
      counts.set(word,(counts.get(word)||0)+weight);
    });
    return [...counts].sort((a,b)=>b[1]-a[1]||b[0].length-a[0].length).map(([word])=>word).slice(0,limit);
  }

  function overlap(a,b){
    const left=new Set(words(a));
    const right=new Set(words(b));
    let hit=0;
    left.forEach(word=>{if(right.has(word))hit++});
    return hit;
  }

  function usefulSentences(text){
    const seen=new Set();
    return sentenceList(text).filter(sentence=>{
      if(sentence.length<38)return false;
      if(BOILERPLATE.some(pattern=>pattern.test(sentence)))return false;
      const key=sentence.toLowerCase();
      if(seen.has(key))return false;
      seen.add(key);
      return true;
    });
  }

  function titleFromCard(card){
    let title=clean(card.title||'');
    title=title
      .replace(/\s*[·|—-]\s*(Infinity Channel|Infinity TV)$/i,'')
      .replace(/\s*[·|—-]\s*(USA Up All Night|AMC Classic Movies|Motor TV|Comedy Central)$/i,'')
      .replace(/^Shared\s+(orange\s+)?card\s*[:—-]?\s*/i,'')
      .trim();
    if(!title||genericTitle(title)){
      const q=clean(card.searchQuery||'');
      if(q)title=q.replace(/\b(related|research|news)\b.*$/i,'').trim()||q;
    }
    return title||'A story worth following';
  }

  function detectKind(card,headline){
    const text=`${headline} ${card.searchQuery||''} ${card.extract||''} ${card.channel||''} ${card.domain||''}`.toLowerCase();
    if(/\b(movie|film|cinema|episode|actor|actress|director|screenplay|box office|cast|television|tv show)\b/.test(text))return 'screen';
    if(/\b(physics|chemistry|element|atom|research|study|science|engineering|technology|space|nasa)\b/.test(text))return 'science';
    if(/\b(game|nfl|nba|mlb|nhl|nascar|race|sports|football|baseball|basketball)\b/.test(text))return 'sports';
    if(/\b(election|government|president|congress|policy|court|law)\b/.test(text))return 'public-affairs';
    return 'general';
  }

  function similarQueryFor(card,headline,kind){
    const terms=importantTerms(`${headline} ${card.searchQuery||''} ${card.extract||''}`,6).join(' ');
    if(kind==='screen')return clean(`${headline} film plot cast production reception ${terms}`);
    if(kind==='science')return clean(`${headline} latest research evidence applications ${terms}`);
    if(kind==='sports')return clean(`${headline} latest results history analysis ${terms}`);
    if(kind==='public-affairs')return clean(`${headline} latest developments background analysis ${terms}`);
    return clean(`${headline} latest developments background context ${terms}`);
  }

  function paragraphize(sentences,limit=4){
    const out=[];
    for(let i=0;i<sentences.length&&out.length<limit;i+=2){
      const paragraph=sentences.slice(i,i+2).join(' ');
      if(paragraph)out.push(paragraph);
    }
    return out;
  }

  function makeBaseStory(card,previous={}){
    const headline=titleFromCard(card);
    const kind=detectKind(card,headline);
    const facts=usefulSentences(card.extract||card.body||'');
    const standfirst=facts.slice(0,2).join(' ');
    const paragraphs=paragraphize(facts.length?facts:[standfirst],4);
    return {
      ...previous,
      storyVersion:2,
      storyKey:keyOf(card),
      title:headline,
      headline,
      kind,
      image:card.imageVerified?(card.image||previous.image||''):'',
      url:card.url||previous.url||'',
      domain:card.domain||card.provider||card.channel||previous.domain||'Infinity interest signal',
      channel:card.channel||previous.channel||'',
      searchQuery:card.searchQuery||previous.searchQuery||'',
      collectedAt:card.collectedAt||previous.collectedAt||new Date().toISOString(),
      standfirst,
      paragraphs,
      similarQuery:similarQueryFor(card,headline,kind),
      sources:Array.isArray(card.sources)?card.sources:(Array.isArray(previous.sources)?previous.sources:[]),
      enriched:Boolean(card.sourceBacked||previous.enriched),
      sourceFingerprint:card.extract||previous.sourceFingerprint||''
    };
  }

  function isVisibleCard(card){
    if(!card||card.generatedBy==='news-phi-interest-bridge'||card.ingestType)return false;
    if(card.kind==='share'&&!card.sourceBacked)return false;
    return Boolean(clean(card.title)&&clean(card.extract||card.body));
  }

  function synchronize(){
    const shared=get(KEYS.shared,[]);
    const profile=get(KEYS.omniProfile,{collected:[]});
    const research=get(KEYS.omniResearch,null);
    const currentSources=new Map((research?.sources||[]).map(card=>[keyOf(card),card]));
    const all=[...shared,...(profile.collected||[])].filter(isVisibleCard);
    const merged=new Map();

    all.forEach(card=>{
      const key=keyOf(card);
      const enriched=currentSources.get(key)||{};
      const previous=merged.get(key)||{};
      merged.set(key,{
        ...previous,...card,...enriched,
        storyKey:key,
        searchQuery:card.searchQuery||previous.searchQuery||research?.query||'',
        collectedAt:card.collectedAt||previous.collectedAt||new Date().toISOString()
      });
    });

    const cards=[...merged.values()].sort((a,b)=>String(b.collectedAt).localeCompare(String(a.collectedAt)));
    set(KEYS.shared,cards);

    const legacy=get(KEYS.legacyStories,{});
    const storyIndex=get(KEYS.stories,{});
    cards.forEach(card=>{
      const key=keyOf(card);
      storyIndex[key]=makeBaseStory(card,storyIndex[key]||legacy[key]||{});
    });
    set(KEYS.stories,storyIndex);
    return {cards,storyIndex};
  }

  async function wikiSearch(query){
    const url=`https://en.wikipedia.org/w/api.php?action=query&generator=search&gsrsearch=${encodeURIComponent(query)}&gsrlimit=5&prop=extracts|info|pageimages&exintro=1&explaintext=1&inprop=url&pithumbsize=1000&format=json&origin=*`;
    const response=await fetch(url,{cache:'no-store'});
    if(!response.ok)throw new Error('Wikipedia search failed');
    const data=await response.json();
    return Object.values(data?.query?.pages||{}).map(page=>({
      title:clean(page.title),
      url:page.fullurl||'',
      excerpt:clean(page.extract),
      image:page.thumbnail?.source||'',
      provider:'Wikipedia'
    })).filter(item=>item.title&&item.excerpt);
  }

  function rankSources(story,sources){
    return [...sources].sort((a,b)=>{
      const target=`${story.headline} ${story.searchQuery} ${story.similarQuery}`;
      return overlap(`${b.title} ${b.excerpt}`,target)-overlap(`${a.title} ${a.excerpt}`,target);
    });
  }

  async function enrichStory(key){
    const story=state.storyIndex[key];
    if(!story||story.enriching)return story;
    story.enriching=true;
    renderStoryCardState(key);
    try{
      const query=story.kind==='screen'?`${story.headline} film`:story.similarQuery||story.headline;
      const target=`${story.headline} ${story.searchQuery}`;
      const minimum=importantTerms(target).length>1?2:1;
      const found=rankSources(story,await wikiSearch(query)).filter(source=>overlap(`${source.title} ${source.excerpt}`,target)>=minimum);
      if(found.length){
        const sourceSentences=[];
        found.slice(0,3).forEach(source=>{
          usefulSentences(source.excerpt).slice(0,4).forEach(sentence=>{
            if(!sourceSentences.some(existing=>overlap(existing,sentence)>=Math.min(5,words(sentence).length)))sourceSentences.push(sentence);
          });
        });
        const standfirst=sourceSentences.slice(0,2).join(' ')||story.standfirst;
        const paragraphs=paragraphize(sourceSentences.slice(2),4);
        story.standfirst=standfirst;
        story.paragraphs=paragraphs.length?paragraphs:[standfirst];
        story.sources=found.slice(0,4);
        const imageSource=found.find(source=>source.image&&overlap(`${source.title} ${source.excerpt}`,target)>=minimum);
        story.image=imageSource?.image||'';
        story.imageVerified=Boolean(imageSource);
        story.enriched=true;
      }
    }catch(_){}
    story.enriching=false;
    set(KEYS.stories,state.storyIndex);
    render();
    if(dialog.open&&dialog.dataset.storyKey===key)openStory(key,true);
    return story;
  }

  function excerpt(story){
    const text=clean(story.standfirst||(story.paragraphs||[]).join(' '));
    return text.length>520?`${text.slice(0,517).trim()}…`:text;
  }

  function awardStarCoinShare(reference){
    if(window.ControlPhi?.ensureShareCredit)return window.ControlPhi.ensureShareCredit(reference,'web_share_api');
    return {progressToNextCoin:0,awarded:0,balance:0};
  }

  async function shareStory(key){
    const story=state.storyIndex[key];
    if(!story)return;
    const params=new URLSearchParams({
      sharedTitle:story.headline||story.title,
      sharedBody:[story.standfirst,...(story.paragraphs||[])].join(' ').slice(0,1800),
      sharedUrl:story.url||'',
      sharedImage:story.image||'',
      sharedDomain:story.domain||'',
      sharedQuery:story.similarQuery||story.searchQuery||''
    });
    const shareUrl=`${location.origin}${location.pathname}?${params}#story=${encodeURIComponent(key)}`;
    if(!navigator.share){
      try{await navigator.clipboard.writeText(shareUrl);alert('Story link copied.')}catch{}
      return;
    }
    try{
      await navigator.share({title:story.headline||story.title,text:excerpt(story),url:shareUrl});
      const reward=awardStarCoinShare(shareUrl);
      if(reward&&typeof reward.then==='function'){
        const resolved=await reward;
        alert(resolved.awarded?'Shared — 1 StarCoin completed!':`Shared — StarCoin progress ${resolved.progressToNextCoin}/10`);
      }else{
        alert(reward.awarded?'Shared — 1 StarCoin completed!':`Shared — StarCoin progress ${reward.progressToNextCoin}/10`);
      }
    }catch(error){
      if(!error||error.name!=='AbortError')alert('Share did not complete.');
    }
  }

  function importSharedCard(){
    const params=new URLSearchParams(location.search);
    const title=params.get('sharedTitle');
    if(!title)return '';
    const card={
      title,
      extract:params.get('sharedBody')||'',
      url:params.get('sharedUrl')||'',
      image:params.get('sharedImage')||'',
      domain:params.get('sharedDomain')||'Shared story',
      searchQuery:params.get('sharedQuery')||'',
      collectedAt:new Date().toISOString()
    };
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
    const q=story.similarQuery||story.searchQuery||`${story.headline} background context`;
    return `https://www-infinity4.github.io/C13b0/phi?${new URLSearchParams({
      q,run:'1',
      cardTitle:story.headline||story.title||'',
      cardBody:[story.standfirst,...(story.paragraphs||[])].join(' ').slice(0,1600),
      source:story.sources?.[0]?.url||story.url||'',
      image:story.image||''
    })}`;
  }

  function kindLabel(kind){
    if(kind==='screen')return 'FILM & TELEVISION';
    if(kind==='science')return 'SCIENCE & DISCOVERY';
    if(kind==='sports')return 'SPORTS';
    if(kind==='public-affairs')return 'PUBLIC AFFAIRS';
    return 'PERSONALIZED NEWS';
  }

  function renderStoryCardState(key){
    const node=feed?.querySelector(`[data-story-card="${CSS.escape(key)}"]`);
    const story=state.storyIndex[key];
    if(!node||!story)return;
    node.classList.toggle('is-enriching',Boolean(story.enriching));
  }

  function render(){
    const term=search.value.trim().toLowerCase();
    const cards=state.cards.filter(card=>{
      const story=state.storyIndex[keyOf(card)];
      return `${story?.headline||card.title||''} ${story?.standfirst||card.extract||''} ${story?.similarQuery||card.searchQuery||''}`.toLowerCase().includes(term);
    });
    count.textContent=`${cards.length} stor${cards.length===1?'y':'ies'}`;
    syncLabel.textContent=`${state.cards.length} personalized stor${state.cards.length===1?'y':'ies'}`;
    if(!cards.length){
      feed.innerHTML=`<div class="empty-feed"><h2>${state.cards.length?'No stories match that filter':'Your personalized news desk is ready'}</h2><p>${state.cards.length?'Try a broader word.':'Views, searches and shares create subject signals. News Phi turns those signals into readable stories instead of displaying the activity log itself.'}</p>${state.cards.length?'':`<a href="https://www-infinity4.github.io/Omni-Phi/">Open Omni Phi</a>`}</div>`;
      return;
    }
    feed.innerHTML=cards.map(card=>{
      const story=state.storyIndex[keyOf(card)];
      return `<article class="news-card${story.enriching?' is-enriching':''}" data-story-card="${esc(story.storyKey)}"><div class="card-grid">${story.image?`<img class="card-image" src="${esc(story.image)}" alt="" loading="lazy">`:`<div class="card-image fallback"><span>φ</span></div>`}<div class="card-body"><div class="card-meta"><span>${kindLabel(story.kind)}</span><span>${esc(story.domain)}</span></div><h2>${esc(story.headline)}</h2><p class="card-excerpt">${esc(excerpt(story))}</p><div class="card-actions"><button class="full" type="button" data-story="${esc(story.storyKey)}">Read story</button><a href="${relatedUrl(story)}">Read similar news</a><button class="share-card" type="button" data-share="${esc(story.storyKey)}">Share story · +1/10 ⭐</button></div></div></div></article>`;
    }).join('');
    feed.querySelectorAll('[data-story]').forEach(button=>button.addEventListener('click',()=>openStory(button.dataset.story)));
    feed.querySelectorAll('[data-share]').forEach(button=>button.addEventListener('click',()=>shareStory(button.dataset.share)));
    cards.slice(0,6).forEach(card=>{
      const story=state.storyIndex[keyOf(card)];
      if(story&&!story.enriched&&!story.enriching)setTimeout(()=>void enrichStory(story.storyKey),80);
    });
  }

  function openStory(key,rerender=false){
    const story=state.storyIndex[key];
    if(!story)return;
    dialog.dataset.storyKey=key;
    const sources=(story.sources||[]).map(source=>`<li><a href="${esc(source.url)}" target="_blank" rel="noopener">${esc(source.title)}</a><span>${esc(source.provider||'Source')}</span></li>`).join('');
    storyContent.innerHTML=`${story.image?`<img class="story-hero" src="${esc(story.image)}" alt="">`:''}<div class="story-full"><div class="card-meta"><span>${kindLabel(story.kind)}</span><span>${esc(story.domain)}</span></div><h2>${esc(story.headline)}</h2><p class="lead">${esc(story.standfirst)}</p>${(story.paragraphs||[]).filter(paragraph=>clean(paragraph)!==clean(story.standfirst)).map(paragraph=>`<p>${esc(paragraph)}</p>`).join('')}${sources?`<section class="story-sources"><h3>Sources behind this story</h3><ul>${sources}</ul></section>`:''}<div class="card-actions">${story.url?`<a href="${esc(story.url)}" target="_blank" rel="noopener">Open primary source</a>`:''}<a href="${relatedUrl(story)}">Read similar news</a><button class="share-card" type="button" data-share="${esc(story.storyKey)}">Share story · +1/10 ⭐</button></div></div>`;
    storyContent.querySelectorAll('[data-share]').forEach(button=>button.addEventListener('click',()=>shareStory(button.dataset.share)));
    if(location.hash!==`#story=${encodeURIComponent(key)}`)history.replaceState(null,'',`#story=${encodeURIComponent(key)}`);
    if(!rerender)dialog.showModal();
    if(!story.enriched&&!story.enriching)void enrichStory(key);
  }

  function closeStory(){
    dialog.close();
    dialog.dataset.storyKey='';
    history.replaceState(null,'',location.pathname+location.search);
  }

  document.getElementById('closeStory').addEventListener('click',closeStory);
  dialog.addEventListener('click',event=>{if(event.target===dialog)closeStory()});
  search.addEventListener('input',render);
  document.getElementById('refreshFeed').addEventListener('click',()=>{state=synchronize();render()});
  window.addEventListener('controlphi:shared',()=>{state=synchronize();render()});

  const importedKey=importSharedCard();
  render();
  const hashKey=location.hash.startsWith('#story=')?decodeURIComponent(location.hash.slice(7)):'';
  if(hashKey)openStory(state.storyIndex[hashKey]?hashKey:importedKey);
})();
