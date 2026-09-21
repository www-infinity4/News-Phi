(function(){
  'use strict';

  function status(message){
    const label=document.getElementById('syncLabel');
    if(label)label.textContent=message;
  }

  function cleanShareParams(){
    const url=new URL(location.href);
    ['shareTarget','title','text','url'].forEach((key)=>url.searchParams.delete(key));
    if(url.href!==location.href)history.replaceState({},'',`${url.pathname}${url.search}${url.hash}`);
  }

  async function importIncomingShare(){
    if(!window.PhiIngest)return null;
    const params=new URLSearchParams(location.search);
    if(!params.has('shareTarget'))return null;
    const record=await window.PhiIngest.ingestShareTarget(params);
    cleanShareParams();
    if(!record)return null;
    if(record.readyForCard){status('Shared material indexed; building a source-backed card');window.dispatchEvent(new Event('newsphi:run-retrieval'));}
    else status('Link queued until its published content is resolved');
    return record;
  }

  async function resolveQueuedLinks(){
    if(!window.PhiIngest?.resolvePending)return;
    const resolved=await window.PhiIngest.resolvePending();
    if(resolved){status(`${resolved} copied link${resolved===1?'':'s'} indexed; building sourced cards`);window.dispatchEvent(new Event('newsphi:run-retrieval'));}
  }

  function installPasteButton(){
    if(!window.PhiIngest||document.getElementById('pasteToPhi'))return;
    const tools=document.querySelector('.feed-tools');
    if(!tools)return;
    const button=document.createElement('button');
    button.id='pasteToPhi';
    button.type='button';
    button.className='refresh';
    button.textContent='Import clipboard';
    button.setAttribute('aria-label','Import copied link or text into News Phi');button.title='Build a News Phi seed from a link or text currently copied on this device';
    button.addEventListener('click',async()=>{
      button.disabled=true;
      try{
        const record=await window.PhiIngest.ingestClipboard();
        if(record.readyForCard){
          status('Clipboard material indexed; building a source-backed card');
          window.dispatchEvent(new Event('newsphi:run-retrieval'));
          return;
        }
        status('Clipboard link queued for content resolution');
      }catch(error){
        status(error&&error.message?error.message:'Clipboard import failed');
      }finally{
        button.disabled=false;
      }
    });
    tools.appendChild(button);
  }

  importIncomingShare().catch((error)=>status(error?.message||'Shared item could not be indexed'));
  resolveQueuedLinks().catch(()=>{});
  installPasteButton();
})();
