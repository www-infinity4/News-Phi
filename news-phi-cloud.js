/* News Phi client receives reporting from Cloudflare only.
   This script never searches news sites, never reads an old article as current,
   and never merges collected media into the news feed. */
(function(){
'use strict';
const API='https://news-phi-feed.marvaseater.workers.dev/v1/news';
const CARDS='newsPhi:monitorCards:v1',STATUS='newsPhi:monitorStatus:v1';
const HIDDEN='newsPhi:hiddenStories:v1',AGE=48*3600000;
const safeRead=(key,f)=>{try{return JSON.parse(localStorage.getItem(key)||'null')??f}catch{return f}};
const save=(key,v)=>{try{localStorage.setItem(key,JSON.stringify(v))}catch(error){console.warn('News Phi cache unavailable',error)}};
const clean=(v,n=500)=>String(v??'').replace(/\s+/g,' ').trim().slice(0,n);
const unsafe=/\b(?:porn|pornography|xxx|hardcore|onlyfans|nude\s+leak|explicit\s+sex|sex\s+tape|adult\s+video)\b/i;
const canonicalUrl=(v)=>{try{const u=new URL(v);if(u.protocol!=='https:')return '';u.hash='';return u.href}catch{return ''}};
const isRecent=(row)=>{const t=Date.parse(row.publishedAt||'');return Number.isFinite(t)&&t<=Date.now()+300000&&Date.now()-t<=AGE};
function normalize(x){
 const url=canonicalUrl(x.url),title=clean(x.title,250),extract=clean(x.extract,1400);
 if(!url||!title||extract.length<35||!isRecent(x)||unsafe.test(title+' '+extract+' '+url))return null;
 const domain=new URL(url).hostname.replace(/^www\./,'');
 return {id:'cloud-news:'+url,storyKey:'news:'+url,title,extract,url,canonicalUrl:url,
   image:'',imageVerified:false,domain,provider:domain,sourceBacked:true,
   publicationVerified:true,publishedAt:x.publishedAt,
   publishedLabel:new Date(x.publishedAt).toLocaleString(),
   collectedAt:x.publishedAt,searchQuery:clean(x.topic||x.searchQuery||'Current reporting',85),
   retrievedAt:new Date().toISOString(),generatedBy:'monitor-news',retrievalVersion:'cloudflare-news-v1',
   sourceKind:clean(x.sourceKind||'cloudflare')};
}
function emit(){window.dispatchEvent(new CustomEvent('newsphi:monitor-feed',{detail:{source:'Cloudflare',cloud:true}}))}
function hidden(){const h=safeRead(HIDDEN,{});return h&&typeof h==='object'?h:{}}
function list(rows){
 const seen=new Set(),hide=hidden(),out=[];
 for(const item of rows||[]){
  const x=normalize(item);if(!x||hide[x.storyKey]||hide[x.url]||seen.has(x.url))continue;
  seen.add(x.url);out.push(x);
 }
 return out.sort((a,b)=>Date.parse(b.publishedAt)-Date.parse(a.publishedAt)).slice(0,100);
}
function updateStatus(state,data={}){
 save(STATUS,{state,source:'Cloudflare News Phi',checkedAt:new Date().toISOString(),
  retrievedAt:new Date().toISOString(),count:safeRead(CARDS,[]).length,added:data.added||0,
  message:data.message||'',origin:'cloudflare',windowHours:48});
 const label=document.getElementById('newsCloudStatus');if(label)label.textContent=data.message||
  (state==='fresh'?'Cloudflare feed updated':state==='error'?'Cloudflare news unavailable':'Checking Cloudflare…');
}
function noOldCards(){
 // Do not show 258 collected/old cached rows even for one frame while loading.
 save(CARDS,[]);updateStatus('loading',{message:'Cloudflare is checking fresh reporting…'});emit();
}
let inFlight=null;
async function getCloud(force=false){
 const response=await fetch(API+'/feed'+(force?'?refresh=1':''),{cache:'no-store',signal:AbortSignal.timeout(28000)});
 if(!response.ok)throw new Error('Cloudflare returned HTTP '+response.status);
 const payload=await response.json();
 if(payload.cloud!==true||!Array.isArray(payload.articles))throw new Error('Invalid cloud news response');
 return payload;
}
async function getQuantTopics(){
 const bridge=window.QuantaCloudConnection||window.StarQuestCloudLedger;
 if(!bridge?.authenticatedFetch)return [];
 try{
  const response=await bridge.authenticatedFetch('https://quanta-phi-ledger.marvaseater.workers.dev/v1/quants/interests',{cache:'no-store'});
  if(!response.ok)return [];
  const data=await response.json(),now=Date.now();
  return (Array.isArray(data.topics)?data.topics:[])
   .filter(x=>{let t=Number(x.last_at)||0;if(t>0&&t<1e12)t*=1000;return t>now-30*86400000&&t<now+300000})
   .sort((a,b)=>(Number(b.last_at)||0)-(Number(a.last_at)||0))
   .map(x=>clean(x.query,82)).filter(x=>x.length>2&&!unsafe.test(x)).slice(0,3);
 }catch(error){return []}
}
async function getRelated(topics){
 const response=await fetch(API+'/related',{method:'POST',cache:'no-store',
  headers:{'content-type':'application/json'},body:JSON.stringify({topics}),
  signal:AbortSignal.timeout(24000)});
 if(!response.ok)throw Error('Related Cloudflare news '+response.status);
 const data=await response.json();
 return Array.isArray(data.articles)?data.articles:[];
}
async function refresh(force=false){
 if(inFlight)return inFlight;
 inFlight=(async()=>{
  updateStatus('loading',{message:'Cloudflare is retrieving dated source articles…'});
  try{
   const payload=await getCloud(force);
   let source=list(payload.articles),related=[];
   // Interest tokens steer what the Cloudflare service searches; no browser
   // news searching or imported collection artifacts are used as headlines.
   const topics=await getQuantTopics();
   if(topics.length)try{related=list(await getRelated(topics))}catch(error){console.warn('Optional Cloudflare topic refinement unavailable',error)}
   const blended=list([...related,...source]);
   save(CARDS,blended);
   updateStatus(blended.length?'fresh':'error',{added:blended.length,
    message:blended.length?'Cloudflare · '+blended.length+' dated stories · '+(topics.length?'your recent Quant topics included':'public sources'):
      'No verified recent articles from Cloudflare right now. Old headlines are not being recycled.'});
   emit();
   return {ok:true,count:blended.length,cloud:true,topics:topics.length,provider:payload.sourceStatus};
  }catch(error){
   // Source outage is visible. The browser does not fabricate or recycle old news.
   save(CARDS,[]);
   updateStatus('error',{message:'Cloudflare news unavailable · '+clean(error.message,100)});
   emit();
   return {ok:false,error:clean(error.message,150)};
  }
 })().finally(()=>{inFlight=null});
 return inFlight;
}
function hideStory(key){
 const records=safeRead(CARDS,[]),card=records.find(c=>c.storyKey===key||c.url===key);
 const marks=hidden();marks[key]=Date.now();if(card)marks[card.url]=Date.now();
 save(HIDDEN,marks);save(CARDS,records.filter(c=>c.storyKey!==key&&c.url!==key));
 emit();
}
const stack=(stored,found)=>{
 const cards=list([...(found||[]).flat(),...(stored||[])]);
 return {cards,added:cards.length};
};
async function requestTopic(topic){
 const rows=await getRelated([topic]);return list(rows);
}
window.NewsPhiDirect={
 refresh,hide:hideStory,topics:()=>[],requestTopic,stack,canonicalUrl,
 cardKey:c=>c.storyKey||c.url,setMode:()=>{},applyPolicy:()=>{},
 normalize:(item,topic)=>normalize({...item,topic}),
 publication:x=>({at:Date.parse(x?.publishedAt||'')||0})
};
window.NewsPhiCloud={refresh,endpoint:API,cloudOnly:true};
window.addEventListener('focus',()=>{if(document.visibilityState==='visible')void refresh()});
window.addEventListener('newsphi:run-retrieval',()=>void refresh());
document.addEventListener('visibilitychange',()=>{if(!document.hidden)void refresh()});
document.addEventListener('starquest:ledger-connected',()=>void refresh(),{once:true});
document.getElementById('cloudRefresh')?.addEventListener('click',()=>void refresh(true));
noOldCards();
void refresh();
setInterval(()=>{if(!document.hidden)void refresh()},20*60*1000);
})();