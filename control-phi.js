(function controlPhiBootstrap(){
  'use strict';
  if(window.ControlPhi?.version)return;
  const ROOT='https://www-infinity4.github.io/';
  const scriptSource=document.currentScript?.src||`${ROOT}Control-Phi/control-phi.js`;
  const ASSET_ROOT=new URL('.',scriptSource).href;
  const SHARE_KEY='controlPhi:shareFeed:v1';
  const MAX_SHARES=500;
  const read=(key,fallback)=>{try{return JSON.parse(localStorage.getItem(key))??fallback}catch{return fallback}};
  const write=(key,value)=>{try{localStorage.setItem(key,JSON.stringify(value));return true}catch{return false}};
  const clean=(value,max=1200)=>String(value||'').replace(/\s+/g,' ').trim().slice(0,max);
  const pageMeta=(name)=>document.querySelector(`meta[property="${name}"],meta[name="${name}"]`)?.content||'';
  const pageChannel=()=>clean(document.body?.dataset?.channel||pageMeta('application-name')||document.querySelector('h1')?.textContent||document.title.split(/[—|]/)[0],100);
  const searchTerms=(payload)=>{
    const raw=[payload.title,payload.text,payload.channel,document.querySelector('[data-now-playing]')?.textContent,pageMeta('description')].filter(Boolean).join(' ');
    const words=clean(raw,500).replace(/https?:\/\/\S+/g,' ').replace(/[^\p{L}\p{N}' -]+/gu,' ').split(/\s+/).filter(word=>word.length>2);
    return [...new Set(words)].slice(0,18).join(' ');
  };
  const describe=(payload,query)=>{
    const title=clean(payload.title||document.title||'Shared from Infinity TV',180);
    const channel=clean(payload.channel||pageChannel(),100);
    const detail=clean(payload.text||pageMeta('description')||document.querySelector('[data-now-playing]')?.textContent,1000);
    const lead=`${title} was shared${channel?` from ${channel}`:''}.`;
    const context=detail&&detail.toLowerCase()!==title.toLowerCase()?detail:`The share points to ${clean(payload.url||location.href,300)} and preserves the program or subject as a News Phi research starting point.`;
    const next=`News Phi prepared the research query “${query}” from the information available at the moment of sharing. Open this card to review the source and generate a deeper, source-based news search.`;
    return [lead,context,next].join(' ');
  };
  function recordShare(input={}){
    const now=new Date();
    const payload={title:clean(input.title||document.title,180),text:clean(input.text||'',1200),url:clean(input.url||location.href,700),image:clean(input.image||pageMeta('og:image')||pageMeta('twitter:image'),700),channel:clean(input.channel||pageChannel(),100)};
    const query=clean(input.searchQuery||searchTerms(payload)||payload.title,500);
    const id=`share-${now.getTime().toString(36)}-${Math.random().toString(36).slice(2,9)}`;
    const event={id,storyKey:id,title:payload.title||'Shared story',extract:describe(payload,query),url:payload.url,image:payload.image,domain:payload.channel||location.hostname,channel:payload.channel,searchQuery:query,collectedAt:now.toISOString(),kind:'shared-news',shareConfirmed:true};
    const feed=read(SHARE_KEY,[]);
    feed.unshift(event);
    write(SHARE_KEY,feed.slice(0,MAX_SHARES));
    window.dispatchEvent(new CustomEvent('controlphi:shared',{detail:event}));
    return event;
  }
  function installShareBridge(){
    if(typeof navigator.share!=='function'||navigator.share.__controlPhi)return;
    const nativeShare=navigator.share.bind(navigator);
    const wrapped=async(data={})=>{const result=await nativeShare(data);recordShare(data);return result};
    wrapped.__controlPhi=true;
    try{Object.defineProperty(navigator,'share',{configurable:true,value:wrapped})}catch{try{navigator.share=wrapped}catch{}}
  }
  function injectRemote(){
    if(document.getElementById('controlPhiButton'))return;
    const existingMenu=document.querySelector('details.channel-menu, details[data-channel-menu]');
    if(existingMenu){
      const nav=existingMenu.querySelector('nav')||existingMenu.appendChild(document.createElement('nav'));
      const filter=existingMenu.querySelector('input[type="search"]');
      fetch(`${ASSET_ROOT}channels.json`,{cache:'no-store'}).then(r=>r.ok?r.json():Promise.reject()).then(data=>{
        nav.innerHTML=data.channels.map(item=>`<a href="${ROOT}${encodeURIComponent(item.path).replace(/%2F/g,'/')}/" data-name="${item.name.toLowerCase()}">${item.name}</a>`).join('');
        if(filter)filter.dispatchEvent(new Event('input'));
      }).catch(()=>{});
      existingMenu.dataset.controlPhi='connected';
      return;
    }
    const css=document.createElement('link');css.rel='stylesheet';css.href=`${ASSET_ROOT}control-phi.css`;document.head.appendChild(css);
    const button=document.createElement('button');button.id='controlPhiButton';button.type='button';button.setAttribute('aria-label','Open Control Phi channels');button.setAttribute('aria-expanded','false');button.textContent='☰';
    const panel=document.createElement('aside');panel.id='controlPhiPanel';panel.setAttribute('aria-hidden','true');panel.innerHTML='<div class="control-phi-head"><strong>Control Phi</strong><button type="button" aria-label="Close channels">×</button></div><p class="control-phi-news">Every completed share becomes a research card in <a href="'+ROOT+'News-Phi/">News Phi</a>.</p><input class="control-phi-search" type="search" placeholder="Find a channel" aria-label="Find a channel"><nav class="control-phi-links" aria-label="Infinity channels"><a href="'+ROOT+'News-Phi/">News Phi</a></nav>';
    document.body.append(button,panel);
    const toggle=(open)=>{panel.classList.toggle('open',open);panel.setAttribute('aria-hidden',String(!open));button.setAttribute('aria-expanded',String(open))};
    button.addEventListener('click',()=>toggle(!panel.classList.contains('open')));panel.querySelector('.control-phi-head button').addEventListener('click',()=>toggle(false));
    const nav=panel.querySelector('.control-phi-links');const input=panel.querySelector('input');
    fetch(`${ASSET_ROOT}channels.json`,{cache:'no-store'}).then(r=>r.ok?r.json():Promise.reject()).then(data=>{nav.innerHTML=data.channels.map(item=>`<a href="${ROOT}${encodeURIComponent(item.path).replace(/%2F/g,'/')}/" data-name="${item.name.toLowerCase()}">${item.name}</a>`).join('');filter()}).catch(()=>{});
    function filter(){const term=input.value.trim().toLowerCase();nav.querySelectorAll('a').forEach(a=>a.hidden=!!term&&!a.textContent.toLowerCase().includes(term))}input.addEventListener('input',filter);
  }
  window.ControlPhi={version:'1.0.0',recordShare,openNews:()=>location.assign(`${ROOT}News-Phi/`)};
  installShareBridge();
  if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',injectRemote,{once:true});else injectRemote();
})();
