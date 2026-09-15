(function(){
  'use strict';

  const feed=document.getElementById('feed');
  if(!feed)return;

  const style=document.createElement('style');
  style.textContent=`
    html,body{overflow-anchor:none!important}
    #feed,.news-card{overflow-anchor:none!important}
    .news-card{contain:layout style paint}
  `;
  document.head.appendChild(style);

  let anchorKey='';
  let anchorTop=0;
  let captureQueued=false;
  let restoreQueued=false;
  let restoring=false;

  function headerFloor(){
    const topbar=document.querySelector('.topbar');
    return topbar?Math.max(0,topbar.getBoundingClientRect().bottom+8):8;
  }

  function capture(){
    captureQueued=false;
    if(restoring)return;
    const floor=headerFloor();
    const cards=[...feed.querySelectorAll('[data-story-card]')];
    const visible=cards.find(card=>{
      const rect=card.getBoundingClientRect();
      return rect.bottom>floor+20&&rect.top<innerHeight-20;
    });
    if(!visible){
      anchorKey='';
      return;
    }
    anchorKey=visible.dataset.storyCard||'';
    anchorTop=visible.getBoundingClientRect().top;
  }

  function queueCapture(){
    if(captureQueued||restoring)return;
    captureQueued=true;
    requestAnimationFrame(capture);
  }

  function restore(){
    restoreQueued=false;
    if(!anchorKey)return;
    const selector=`[data-story-card="${CSS.escape(anchorKey)}"]`;
    const card=feed.querySelector(selector);
    if(!card)return;
    const currentTop=card.getBoundingClientRect().top;
    const delta=currentTop-anchorTop;
    if(Math.abs(delta)<1)return;
    restoring=true;
    window.scrollBy(0,delta);
    requestAnimationFrame(()=>{
      restoring=false;
      const same=feed.querySelector(selector);
      if(same)anchorTop=same.getBoundingClientRect().top;
    });
  }

  function queueRestore(){
    if(restoreQueued||!anchorKey)return;
    restoreQueued=true;
    requestAnimationFrame(()=>requestAnimationFrame(restore));
  }

  addEventListener('scroll',queueCapture,{passive:true});
  addEventListener('touchstart',queueCapture,{passive:true});
  addEventListener('touchmove',queueCapture,{passive:true});
  addEventListener('pointerdown',queueCapture,{passive:true});
  addEventListener('resize',queueCapture,{passive:true});

  const observer=new MutationObserver(()=>{
    queueRestore();
  });
  observer.observe(feed,{childList:true,subtree:true});

  requestAnimationFrame(()=>requestAnimationFrame(capture));
  setInterval(()=>{if(!restoreQueued&&!restoring)capture()},250);
})();
