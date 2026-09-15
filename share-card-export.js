(function(){
  'use strict';

  const STORIES_KEY='phiShared:storyIndex:v2';

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

  function shareTitle(story){
    return clean(story.headline||story.title||'News Phi story',220);
  }

  function shareText(story){
    const body=[story.standfirst,...(story.paragraphs||[])].filter(Boolean).join(' ');
    return clean(body,420);
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

    // Share the actual News Phi card URL. Social sites can crawl News Phi's
    // Open Graph/Twitter metadata, while a person who taps the share lands on
    // the exact card with its image, title, body, source and search context.
    const shareUrl=exactNewsTarget(story,key);
    const title=shareTitle(story);
    const text=shareText(story);

    if(!navigator.share){
      try{
        await navigator.clipboard.writeText(shareUrl);
        alert('News Phi card link copied.');
      }catch{}
      return true;
    }

    try{
      await navigator.share({title,text,url:shareUrl});
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
