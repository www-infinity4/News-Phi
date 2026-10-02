(function(){
  'use strict';
  let timer=0,running=false;
  async function run(){
    if(running||!window.NewsPhiMonitor?.refresh)return;
    running=true;
    try{await window.NewsPhiMonitor.refresh()}catch(_){}finally{running=false}
  }
  function schedule(delay=120){
    clearTimeout(timer);
    timer=setTimeout(()=>void run(),delay);
  }
  window.addEventListener('focus',()=>schedule(80));
  window.addEventListener('controlphi:shared',()=>schedule(160));
  window.addEventListener('phi:ingested',()=>schedule(160));
  setInterval(()=>schedule(0),300000);
  schedule(500);
})();