(function(){
  'use strict';
  const select=document.getElementById('feedMode'),button=document.getElementById('refreshFeed');
  if(!select||!button)return;
  try{select.value=JSON.parse(localStorage.getItem('newsPhi:feedMode:v1'))||'off'}catch{}
  select.addEventListener('change',()=>{window.NewsPhiDirect?.setMode(select.value);window.NewsPhiDirect?.refresh().catch(()=>{})});
  button.addEventListener('click',async()=>{button.disabled=true;try{await window.NewsPhiDirect?.refresh()}catch(_){}finally{button.disabled=false}});
})();
