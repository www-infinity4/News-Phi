(function(){
  'use strict';

  const STORIES_KEY='phiShared:storyIndex:v2';
  const SHARE_ENDPOINT='https://infinity-rogers.marvaseater.workers.dev/share/phi';
  const INFINITY_SHARE_FALLBACK='https://www-infinity4.github.io/C13b0/infinity-phi-share.png';

  const clean=(value,max=1800)=>String(value??'').replace(/<[^>]+>/g,' ').replace(/\s+/g,' ').trim().slice(0,max);
  const read=(key,fallback)=>{try{return JSON.parse(localStorage.getItem(key))??fallback}catch{return fallback}};

  function storyFor(key){
    return read(STORIES_KEY,{})[key]||null;
  }

  function exactNewsTarget(story,key){
    const params=new URLSearchParams({
      sharedTitle:story.headline||story.title||'',
      sharedBody:[story.standfirst,...(story.paragraphs||[])].filter(Boolean).join(' ').slice(0,1800),
      sharedUrl:story.url||'',
      sharedImage:story.image||'',
      sharedDomain:story.domain||'',
      sharedQuery:story.similarQuery||story.searchQuery||''
    });
    return `${location.origin}${location.pathname}?${params.toString()}#story=${encodeURIComponent(key)}`;
  }

  function previewUrl(story,key){
    const body=[story.standfirst,...(story.paragraphs||[])].filter(Boolean).join(' ');
    const params=new URLSearchParams({
      title:clean(story.headline||story.title||'News Phi story',220),
      body:clean(body,1400),
      source:clean(story.url||'',1800),
      image:clean(story.image||INFINITY_SHARE_FALLBACK,1800),
      q:clean(story.similarQuery||story.searchQuery||story.headline||story.title||'',1000),
      target:exactNewsTarget(story,key)
    });
    return `${SHARE_ENDPOINT}?${params.toString()}`;
  }

  async function award(reference){
    try{
      if(window.ControlPhi?.ensureShareCredit){
        return await window.ControlPhi.ensureShareCredit(reference,'web_share_api');
      }
    }catch(error){
      console.warn('News Phi share credit failed',error);
    }
    return {progressToNextCoin:null,awarded:0,balance:null};
  }

  async function shareExactCard(button){
    const key=button.dataset.share||'';
    const story=storyFor(key);
    if(!story)return false;
    const shareUrl=previewUrl(story,key);

    if(!navigator.share){
      try{
        await navigator.clipboard.writeText(shareUrl);
        alert('Card preview link copied.');
      }catch{}
      return true;
    }

    try{
      // Use the same preview-link behavior as Infinity Phi. X/Twitter receives
      // one crawlable URL whose metadata contains the card title, body and image.
      await navigator.share({url:shareUrl});
      const reward=await award(shareUrl);
      if(reward?.progressToNextCoin!=null){
        alert(reward.awarded?'Shared — 1 StarCoin completed!':`Shared — StarCoin progress ${reward.progressToNextCoin}/10`);
      }else{
        alert('Shared.');
      }
    }catch(error){
      if(!error||error.name!=='AbortError')alert('Share did not complete.');
    }
    return true;
  }

  document.addEventListener('click',event=>{
    const button=event.target.closest?.('.share-card[data-share]');
    if(!button)return;
    event.preventDefault();
    event.stopPropagation();
    event.stopImmediatePropagation();
    void shareExactCard(button);
  },true);
})();
