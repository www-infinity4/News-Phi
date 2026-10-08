(function(){
'use strict';
const BASE='https://quanta-phi-ledger.marvaseater.workers.dev/v1/quants/storybook';
const CACHE='newsPhi:quantaCloudCards:v1',META='newsPhi:storybookChapters:v1';
const $=s=>document.querySelector(s);
const clean=(x,max=8000)=>String(x??'').replace(/\s+/g,' ').trim().slice(0,max);
const json=(k,f)=>{try{const x=JSON.parse(localStorage.getItem(k)||'null');return x??f}catch{return f}};
const save=(k,v)=>{try{localStorage.setItem(k,JSON.stringify(v))}catch(e){console.warn('Storybook device cache unavailable',e)}};
const node=(tag,cls,text)=>{const e=document.createElement(tag);if(cls)e.className=cls;if(text!==undefined)e.textContent=text;return e};
const bridge=()=>window.QuantaCloudConnection||window.StarQuestCloudLedger;
let cards=[],meta=json(META,{}),status='Reading saved stories',cloudReady=false;
function key(card){return clean(card?.storyKey||card?.id||card?.key,800).replace(/^collect:/,'').replace(/^quanta-cloud:/,'')}
function normalize(x){
 if(!x||!clean(x.title))return null;
 return {...x,_key:key(x),title:clean(x.title,300),
  body:clean(x.body||x.story||x.extract,8000),
  collectedAt:clean(x.collectedAt||x.createdAt||'',80),
  sourceUrl:clean(x.sourceUrl||x.url,1700),
  image:x.imageVerified?clean(x.image,1800):clean(x.type).toLowerCase()==='image'?clean(x.media,1800):''};
}
function collection(){
 const fromCloud=json(CACHE,[]),local=json('quantaPhiCollected',[]);
 const shared=json('phiShared:collection:v1',[]);
 const found=new Map();
 for(const x of [...(Array.isArray(shared)?shared:[]),...(Array.isArray(local)?local:[]),...(Array.isArray(fromCloud)?fromCloud:[])]){
  const item=normalize(x);if(!item||!item._key)continue;
  const old=found.get(item._key);
  found.set(item._key,old?{...old,...item,body:item.body||old.body,
   sourceUrl:item.sourceUrl||old.sourceUrl,collectedAt:old.collectedAt||item.collectedAt}:item);
 }
 return [...found.values()];
}
function setStatus(s){status=s;$('#syncState').textContent=s}
function date(v){const t=Date.parse(v);return Number.isFinite(t)?new Date(t).toLocaleDateString():'Saved story'}
function filtered(){
 const term=clean($('#bookSearch').value).toLowerCase(),chapter=$('#chapterFilter').value,order=$('#sortSelect').value;
 let out=cards.filter(x=>(!chapter||(meta[x._key]?.chapter||'Unsorted')===chapter)&&
  (!term||[x.title,x.body,x.sourceUrl,meta[x._key]?.chapter,meta[x._key]?.note].some(v=>String(v||'').toLowerCase().includes(term))));
 if(order==='az')out.sort((a,b)=>a.title.localeCompare(b.title));
 else out.sort((a,b)=>(Date.parse(b.collectedAt)||0)-(Date.parse(a.collectedAt)||0));
 if(order==='oldest')out.reverse();
 return out;
}
function chapters(){
 const select=$('#chapterFilter'),value=select.value;
 select.replaceChildren(new Option('All chapters',''));
 const names=[...new Set(cards.map(c=>meta[c._key]?.chapter||'Unsorted'))].sort();
 for(const name of names)select.add(new Option(name,name));
 select.value=names.includes(value)?value:'';
}
function paragraph(container,text){
 const p=node('p','',text);container.append(p);return p;
}
function readPage(item){
 const dialog=$('#reader'),body=$('#readerBody');body.replaceChildren();
 body.append(node('div','meta',(meta[item._key]?.chapter||'Unsorted')+' · '+date(item.collectedAt)));
 body.append(node('h2','',item.title));
 if(item.image&&/^https:\/\//.test(item.image)){const img=node('img');img.src=item.image;img.alt='';img.style.cssText='max-width:100%;max-height:360px;object-fit:contain;border-radius:12px';body.append(img)}
 paragraph(body,item.body||'This collected item has a title or image, but no stored long-form text.');
 if(meta[item._key]?.note)paragraph(body,'My notes: '+meta[item._key].note);
 if(/^https:\/\//.test(item.sourceUrl)){const a=node('a','', 'View original source ↗');a.href=item.sourceUrl;a.target='_blank';a.rel='noopener noreferrer';body.append(a)}
 dialog.showModal();
}
async function update(item,patch){
 const keyId=item._key,old=meta[keyId]||{},next={...old,...patch,updatedAt:new Date().toISOString()};
 meta[keyId]=next;save(META,meta);render();
 const auth=bridge();
 if(!auth?.authenticatedFetch){setStatus('Chapter saved on this device; cloud wallet is not connected');return}
 try{
  const res=await auth.authenticatedFetch(BASE,{method:'POST',headers:{'content-type':'application/json'},
   body:JSON.stringify({key:keyId,chapter:next.chapter||'Unsorted',note:next.note||'',favorite:Boolean(next.favorite)})});
  if(!res.ok)throw Error('Cloud returned '+res.status);
  setStatus('Chapter saved to your cloud Storybook');
 }catch(e){setStatus('Saved on this device; cloud chapter sync pending');console.warn('Storybook chapter sync deferred',e)}
}
function createCard(item){
 const article=node('article','page');
 if(item.image&&/^https:\/\//i.test(item.image)){const img=node('img');img.src=item.image;img.loading='lazy';img.alt='Collected image';article.append(img)}
 article.append(node('div','meta',(meta[item._key]?.chapter||'Unsorted')+' · '+date(item.collectedAt)));
 article.append(node('h2','',item.title));
 paragraph(article,(item.body||'Saved media or article').slice(0,280)+(item.body.length>280?'…':''));
 const actions=node('div','actions'),open=node('button','', 'Read page'),favorite=node('button','secondary',meta[item._key]?.favorite?'★ Favorite':'☆ Favorite');
 open.type='button';favorite.type='button';open.onclick=()=>readPage(item);favorite.onclick=()=>update(item,{favorite:!meta[item._key]?.favorite});
 actions.append(open,favorite);
 const editor=node('div','editor');
 const chapter=node('input');chapter.placeholder='Chapter title · e.g. Origins, Music, Mysteries';chapter.value=meta[item._key]?.chapter||'';chapter.maxLength=90;
 const notes=node('input');notes.placeholder='Add your own note (optional)';notes.value=meta[item._key]?.note||'';notes.maxLength=1200;
 const saveButton=node('button','secondary','Save chapter + note');saveButton.type='button';saveButton.onclick=()=>update(item,{chapter:clean(chapter.value,90)||'Unsorted',note:clean(notes.value,1200)});
 editor.append(chapter,notes,saveButton);article.append(actions,editor);return article;
}
function render(){
 cards=collection();
 // Safe stable key dedupe: no artificial 25/50-card cap, no loss on refresh.
 cards.sort((a,b)=>(Date.parse(b.collectedAt)||0)-(Date.parse(a.collectedAt)||0));
 $('#bookCount').textContent=cards.length+' collected page'+(cards.length===1?'':'s');
 chapters();
 const list=filtered(),host=$('#bookCards');host.replaceChildren();
 if(!list.length){host.append(node('div','empty',cards.length?'No saved stories match that filter.':'No collections found on this browser yet. Collect a story in QuantaPhi, then sync your Storybook.'));return}
 for(const item of list)host.append(createCard(item));
}
async function sync(){
 const cloud=window.NewsPhiQuantaCloud;
 setStatus('Checking cloud collections…');
 try{
  const [results,annotations]=await Promise.all([
   cloud?.refresh?.()||Promise.resolve({ok:false,reason:'bridge_missing'}),
   (async()=>{const auth=bridge();if(!auth?.authenticatedFetch)return null;
    const response=await auth.authenticatedFetch(BASE,{cache:'no-store'});
    return response.ok?response.json():null})()
  ]);
  if(annotations&&Array.isArray(annotations.cards)){
   for(const entry of annotations.cards){if(entry.key)meta[entry.key]={...meta[entry.key],chapter:entry.chapter||'Unsorted',note:entry.note||'',favorite:Boolean(entry.favorite)}}
   save(META,meta);
  }
  cloudReady=Boolean(results?.ok);
  render();
  setStatus(cloudReady?'Synced '+results.received+' cloud entries · '+results.pages+' page(s)':'Using local saved entries · connect your cloud wallet to sync');
 }catch(error){render();setStatus('Cloud unavailable; preserved previously saved entries');console.warn('Storybook sync error',error)}
}
$('#bookSearch').addEventListener('input',render);
$('#chapterFilter').addEventListener('change',render);
$('#sortSelect').addEventListener('change',render);
$('#syncButton').addEventListener('click',()=>void sync());
$('#closeReader').addEventListener('click',()=>$('#reader').close());
$('#reader').addEventListener('click',e=>{if(e.target===$('#reader'))e.target.close()});
window.addEventListener('storybook:updated',render);
render();void sync();
})();