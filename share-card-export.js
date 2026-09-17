(function(){
  'use strict';

  const STORIES_KEY='phiShared:storyIndex:v2';
  const INFINITY_URL='https://www-infinity4.github.io/C13b0/phi/';

  const clean=(value,max=1800)=>String(value??'').replace(/<[^>]+>/g,' ').replace(/\s+/g,' ').trim().slice(0,max);
  const read=(key,fallback)=>{try{return JSON.parse(localStorage.getItem(key))??fallback}catch{return fallback}};

  function storyFor(key){return read(STORIES_KEY,{})[key]||null}

  function landingUrl(story){
    const q=clean(story.similarQuery||story.searchQuery||story.headline||story.title,500);
    const params=new URLSearchParams({q,run:'1'});
    params.set('cardTitle',clean(story.headline||story.title,220));
    params.set('cardBody',clean([story.standfirst,...(story.paragraphs||[])].filter(Boolean).join(' '),650));
    if(story.url)params.set('source',clean(story.url,1400));
    if(story.image)params.set('image',clean(story.image,1400));
    return `${INFINITY_URL}?${params.toString()}`;
  }

  function shareTitle(story){return clean(story.headline||story.title||'News Phi story',220)}
  function shareText(story){return clean([story.standfirst,...(story.paragraphs||[])].filter(Boolean).join(' '),520)}

  async function award(reference){
    try{if(window.ControlPhi?.ensureShareCredit)return await window.ControlPhi.ensureShareCredit(reference,'web_share_api')}catch(error){console.warn('News Phi share credit failed',error)}
    return {progressToNextCoin:null,awarded:0,balance:null};
  }

  function roundedRect(ctx,x,y,w,h,r){
    const radius=Math.min(r,w/2,h/2);
    ctx.beginPath();ctx.moveTo(x+radius,y);ctx.arcTo(x+w,y,x+w,y+h,radius);ctx.arcTo(x+w,y+h,x,y+h,radius);ctx.arcTo(x,y+h,x,y,radius);ctx.arcTo(x,y,x+w,y,radius);ctx.closePath();
  }

  function wrapLines(ctx,text,maxWidth,maxLines){
    const words=clean(text,3200).split(/\s+/).filter(Boolean),lines=[];let line='';
    for(const word of words){
      const next=line?`${line} ${word}`:word;
      if(ctx.measureText(next).width<=maxWidth)line=next;
      else{if(line)lines.push(line);line=word;if(lines.length>=maxLines)break}
    }
    if(line&&lines.length<maxLines)lines.push(line);
    if(lines.length===maxLines&&words.length){
      const last=lines.length-1;
      while(ctx.measureText(`${lines[last]}…`).width>maxWidth&&lines[last].length>4)lines[last]=lines[last].slice(0,-2).trim();
      lines[last]=`${lines[last].replace(/[.,;:!?]+$/,'')}…`;
    }
    return lines;
  }

  async function blobImage(url){
    if(!/^https?:\/\//i.test(url||''))return null;
    const tries=[url,`https://images.weserv.nl/?url=${encodeURIComponent(url)}&w=900&h=1100&fit=cover`];
    for(const target of tries){
      try{
        const response=await fetch(target,{cache:'force-cache',mode:'cors'});
        if(!response.ok)continue;
        const blob=await response.blob();
        if(!/^image\//i.test(blob.type))continue;
        const objectUrl=URL.createObjectURL(blob);
        try{
          const image=await new Promise((resolve,reject)=>{const img=new Image();img.onload=()=>resolve(img);img.onerror=reject;img.src=objectUrl});
          return image;
        }finally{URL.revokeObjectURL(objectUrl)}
      }catch{}
    }
    return null;
  }

  function drawCover(ctx,image,x,y,w,h){
    const scale=Math.max(w/image.width,h/image.height),sw=w/scale,sh=h/scale,sx=Math.max(0,(image.width-sw)/2),sy=Math.max(0,(image.height-sh)/2);
    ctx.drawImage(image,sx,sy,sw,sh,x,y,w,h);
  }

  async function renderCard(story){
    const canvas=document.createElement('canvas');canvas.width=1200;canvas.height=675;
    const ctx=canvas.getContext('2d');if(!ctx)return null;
    const bg=ctx.createLinearGradient(0,0,1200,675);bg.addColorStop(0,'#ff982e');bg.addColorStop(1,'#cf3c12');ctx.fillStyle=bg;ctx.fillRect(0,0,1200,675);
    ctx.fillStyle='#241004';roundedRect(ctx,38,36,1124,603,32);ctx.fill();

    const image=await blobImage(story.image||'');
    let left=76,width=1048,top=84;
    if(image){
      ctx.save();roundedRect(ctx,68,66,438,545,24);ctx.clip();drawCover(ctx,image,68,66,438,545);ctx.restore();
      left=548;width=574;
    }

    ctx.fillStyle='#ffd85a';ctx.font='900 26px Arial,sans-serif';ctx.fillText(clean(story.domain||story.channel||'News Phi',80),left,top);
    ctx.fillStyle='#fff7e6';ctx.font='900 47px Arial,sans-serif';
    let y=top+62;wrapLines(ctx,shareTitle(story),width,image?4:3).forEach(line=>{ctx.fillText(line,left,y);y+=55});
    ctx.fillStyle='#fff1d6';ctx.font='500 27px Arial,sans-serif';y+=15;
    wrapLines(ctx,shareText(story),width,image?7:8).forEach(line=>{ctx.fillText(line,left,y);y+=37});
    ctx.fillStyle='#ffd85a';ctx.font='800 22px Arial,sans-serif';ctx.fillText('News Phi • open in Infinity Phi Search for the connected path',left,592);
    return await new Promise(resolve=>canvas.toBlob(resolve,'image/png',0.95));
  }

  async function shareExactCard(button){
    const key=button.dataset.share||'';
    const story=storyFor(key);if(!story)return false;
    const url=landingUrl(story),title=shareTitle(story),text=shareText(story);

    if(!navigator.share){
      try{await navigator.clipboard.writeText(url);alert('Infinity Phi card link copied.')}catch{}
      return true;
    }

    try{
      const blob=await renderCard(story);
      if(blob&&typeof File==='function'){
        const file=new File([blob],'news-phi-orange-card.png',{type:'image/png'});
        if(typeof navigator.canShare!=='function'||navigator.canShare({files:[file]})){
          try{
            await navigator.share({title,text,url,files:[file]});
          }catch(error){
            if(error?.name==='AbortError')throw error;
            await navigator.share({title,text:clean(`${text}\n\n${url}`,1800),files:[file]});
          }
          const reward=await award(url);
          if(reward?.progressToNextCoin!=null)alert(reward.awarded?'Shared — 1 StarCoin completed!':`Shared — StarCoin progress ${reward.progressToNextCoin}/10`);
          else alert('Shared.');
          return true;
        }
      }

      await navigator.share({title,text,url});
      const reward=await award(url);
      if(reward?.progressToNextCoin!=null)alert(reward.awarded?'Shared — 1 StarCoin completed!':`Shared — StarCoin progress ${reward.progressToNextCoin}/10`);
      else alert('Shared.');
    }catch(error){
      if(!error||error.name!=='AbortError')alert('Share did not complete.');
    }
    return true;
  }

  document.addEventListener('click',event=>{
    const button=event.target.closest?.('.share-card[data-share]');if(!button)return;
    event.preventDefault();event.stopPropagation();event.stopImmediatePropagation();void shareExactCard(button);
  },true);
})();
