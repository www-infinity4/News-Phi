(function(){
  'use strict';

  const STORIES_KEY='phiShared:storyIndex:v2';
  const WIDTH=1200;
  const HEIGHT=630;

  const clean=value=>String(value??'').replace(/<[^>]+>/g,' ').replace(/\s+/g,' ').trim();
  const read=(key,fallback)=>{try{return JSON.parse(localStorage.getItem(key))??fallback}catch{return fallback}};

  function storyFor(key){
    return read(STORIES_KEY,{})[key]||null;
  }

  function kindLabel(kind){
    if(kind==='screen')return 'FILM & TELEVISION';
    if(kind==='science')return 'SCIENCE & DISCOVERY';
    if(kind==='sports')return 'SPORTS';
    if(kind==='public-affairs')return 'PUBLIC AFFAIRS';
    return 'PERSONALIZED NEWS';
  }

  function exactShareUrl(story,key){
    const params=new URLSearchParams({
      sharedTitle:story.headline||story.title||'',
      sharedBody:[story.standfirst,...(story.paragraphs||[])].filter(Boolean).join(' ').slice(0,1800),
      sharedUrl:story.url||'',
      sharedImage:story.image||'',
      sharedDomain:story.domain||'',
      sharedQuery:story.similarQuery||story.searchQuery||''
    });
    return `${location.origin}${location.pathname}?${params}#story=${encodeURIComponent(key)}`;
  }

  function wrap(ctx,text,maxWidth,maxLines){
    const words=clean(text).split(/\s+/).filter(Boolean);
    const lines=[];
    let line='';
    for(const word of words){
      const test=line?`${line} ${word}`:word;
      if(ctx.measureText(test).width<=maxWidth){line=test;continue}
      if(line)lines.push(line);
      line=word;
      if(lines.length>=maxLines)break;
    }
    if(lines.length<maxLines&&line)lines.push(line);
    const used=lines.slice(0,maxLines);
    if(words.length&&used.length===maxLines){
      let last=used[maxLines-1];
      while(last.length>1&&ctx.measureText(`${last}…`).width>maxWidth)last=last.slice(0,-1);
      used[maxLines-1]=`${last.replace(/[ ,.;:-]+$/,'')}…`;
    }
    return used;
  }

  function roundedRect(ctx,x,y,w,h,r){
    const radius=Math.min(r,w/2,h/2);
    ctx.beginPath();
    ctx.moveTo(x+radius,y);
    ctx.arcTo(x+w,y,x+w,y+h,radius);
    ctx.arcTo(x+w,y+h,x,y+h,radius);
    ctx.arcTo(x,y+h,x,y,radius);
    ctx.arcTo(x,y,x+w,y,radius);
    ctx.closePath();
  }

  function loadImage(url){
    return new Promise(resolve=>{
      if(!url){resolve(null);return}
      const img=new Image();
      img.crossOrigin='anonymous';
      let settled=false;
      const done=value=>{if(settled)return;settled=true;resolve(value)};
      img.onload=()=>done(img);
      img.onerror=()=>done(null);
      img.src=url;
      setTimeout(()=>done(null),4500);
    });
  }

  function drawCover(ctx,img,x,y,w,h){
    if(!img)return false;
    const scale=Math.max(w/img.naturalWidth,h/img.naturalHeight);
    const sw=w/scale;
    const sh=h/scale;
    const sx=(img.naturalWidth-sw)/2;
    const sy=(img.naturalHeight-sh)/2;
    try{ctx.drawImage(img,sx,sy,sw,sh,x,y,w,h);return true}catch{return false}
  }

  async function makeShareFile(story){
    const canvas=document.createElement('canvas');
    canvas.width=WIDTH;
    canvas.height=HEIGHT;
    const ctx=canvas.getContext('2d');
    if(!ctx)return null;

    const bg=ctx.createLinearGradient(0,0,WIDTH,HEIGHT);
    bg.addColorStop(0,'#090514');
    bg.addColorStop(.48,'#251024');
    bg.addColorStop(1,'#090512');
    ctx.fillStyle=bg;
    ctx.fillRect(0,0,WIDTH,HEIGHT);

    ctx.save();
    roundedRect(ctx,34,34,1132,562,30);
    ctx.clip();
    const panel=ctx.createLinearGradient(34,34,1166,596);
    panel.addColorStop(0,'#5d2608');
    panel.addColorStop(.48,'#32150d');
    panel.addColorStop(1,'#150b20');
    ctx.fillStyle=panel;
    ctx.fillRect(34,34,1132,562);

    const image=await loadImage(story.image||'');
    const imageDrawn=drawCover(ctx,image,34,34,420,562);
    if(!imageDrawn){
      const fallback=ctx.createRadialGradient(244,260,15,244,260,300);
      fallback.addColorStop(0,'#9a50ff');
      fallback.addColorStop(.45,'#35134e');
      fallback.addColorStop(1,'#07182e');
      ctx.fillStyle=fallback;
      ctx.fillRect(34,34,420,562);
      ctx.fillStyle='rgba(255,255,255,.92)';
      ctx.font='150px Georgia,serif';
      ctx.textAlign='center';
      ctx.fillText('φ',244,365);
      ctx.textAlign='left';
    }

    const shade=ctx.createLinearGradient(370,0,525,0);
    shade.addColorStop(0,'rgba(20,8,13,0)');
    shade.addColorStop(1,'rgba(20,8,13,.92)');
    ctx.fillStyle=shade;
    ctx.fillRect(335,34,190,562);
    ctx.restore();

    ctx.strokeStyle='rgba(255,145,52,.72)';
    ctx.lineWidth=2;
    roundedRect(ctx,34,34,1132,562,30);
    ctx.stroke();

    const tx=500;
    const max=620;
    ctx.fillStyle='#ffc76d';
    ctx.font='800 20px system-ui,-apple-system,Segoe UI,sans-serif';
    ctx.fillText('NEWS φ',tx,84);

    ctx.fillStyle='#ffbb7b';
    ctx.font='800 15px system-ui,-apple-system,Segoe UI,sans-serif';
    const meta=`${kindLabel(story.kind)}  •  ${clean(story.domain||'News Phi')}`.toUpperCase();
    wrap(ctx,meta,max,2).forEach((line,i)=>ctx.fillText(line,tx,122+i*21));

    ctx.fillStyle='#fffaf4';
    ctx.font='400 50px Georgia,Times New Roman,serif';
    const titleLines=wrap(ctx,story.headline||story.title||'News Phi story',max,4);
    let y=180;
    titleLines.forEach(line=>{ctx.fillText(line,tx,y);y+=55});

    ctx.fillStyle='#eee4df';
    ctx.font='400 25px system-ui,-apple-system,Segoe UI,sans-serif';
    y+=8;
    const body=clean(story.standfirst||(story.paragraphs||[]).join(' '));
    wrap(ctx,body,max,5).forEach(line=>{ctx.fillText(line,tx,y);y+=34});

    ctx.fillStyle='#ffc76d';
    ctx.font='800 18px system-ui,-apple-system,Segoe UI,sans-serif';
    ctx.fillText('READ THE FULL CARD ON NEWS PHI',tx,560);

    const blob=await new Promise(resolve=>canvas.toBlob(resolve,'image/png',.94));
    if(!blob)return null;
    return new File([blob],'news-phi-card.png',{type:'image/png'});
  }

  async function award(reference){
    try{
      if(window.ControlPhi?.ensureShareCredit)return await window.ControlPhi.ensureShareCredit(reference,'web_share_api');
    }catch{}
    return null;
  }

  async function shareExactCard(button){
    const key=button.dataset.share||'';
    const story=storyFor(key);
    if(!story)return false;
    const shareUrl=exactShareUrl(story,key);
    const file=await makeShareFile(story);
    const shortText=`${clean(story.headline||story.title||'News Phi story')}\n${shareUrl}`;

    if(!navigator.share){
      try{await navigator.clipboard.writeText(shortText);alert('Card link copied.')}catch{}
      return true;
    }

    const payload={title:clean(story.headline||story.title||'News Phi story'),text:shortText};
    if(file&&navigator.canShare?.({files:[file]}))payload.files=[file];
    else payload.url=shareUrl;

    try{
      await navigator.share(payload);
      const reward=await award(shareUrl);
      if(reward){
        alert(reward.awarded?'Shared — 1 StarCoin completed!':`Shared — StarCoin progress ${reward.progressToNextCoin}/10`);
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
