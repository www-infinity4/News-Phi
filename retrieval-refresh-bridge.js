(function(){
  'use strict';
  let queued=false;
  function refresh(){
    if(queued)return;
    queued=true;
    requestAnimationFrame(()=>{
      queued=false;
      window.dispatchEvent(new CustomEvent('controlphi:shared',{detail:{source:'newsphi-fresh-retrieval'}}));
    });
  }
  window.addEventListener('newsphi:retrieval-upgraded',refresh);
  window.addEventListener('newsphi:monitor-feed',refresh);
})();
