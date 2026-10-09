/* Cloudflare News Phi: source-backed current reporting, never browser search or collected archives. */
const AGE_MS=48*3600000, REFRESH_MS=20*60000, MAX_ARTICLES=120;
const DEFAULT_QUERIES=['science discovery','space NASA','technology research','music recording history','business economy','world news','environment energy','medical research'];
const FEEDS=[
  'https://feeds.bbci.co.uk/news/rss.xml',
  'https://feeds.bbci.co.uk/news/technology/rss.xml',
  'https://feeds.bbci.co.uk/news/science_and_environment/rss.xml',
  'https://feeds.npr.org/1001/rss.xml',
  'https://www.nasa.gov/news-release/feed/'
];
const HOSTS=[
 'bbc.com','bbc.co.uk','npr.org','apnews.com','reuters.com','pbs.org',
 'nasa.gov','smithsonianmag.com','history.com','scientificamerican.com',
 'nature.com','science.org','phys.org','space.com','theguardian.com',
 'arstechnica.com','techcrunch.com','abcnews.go.com','cbsnews.com',
 'nbcnews.com','cnn.com','washingtonpost.com','nytimes.com','time.com',
 'nationalgeographic.com','noaa.gov','nih.gov','cdc.gov','who.int',
 'ieee.org','scientificamerican.com','sciencenews.org','newscientist.com',
 'aljazeera.com','theconversation.com','economist.com','wsj.com',
 'bloomberg.com','marketwatch.com','cnbc.com','abc.net.au','spectrum.ieee.org'
];
const BLOCK=/\b(?:pornography|pornographic|porn|hardcore|onlyfans|nude\s+leak|explicit\s+sex|sex\s+tape|escort\s+service|adult\s+video|xxx)\b/i;
const clean=(v,n=2500)=>String(v??'').replace(/<[^>]*>/g,' ').replace(/&nbsp;/gi,' ').replace(/&amp;/gi,'&').replace(/&quot;/gi,'"').replace(/&#39;|&apos;/gi,"'").replace(/&lt;/gi,'<').replace(/&gt;/gi,'>').replace(/\s+/g,' ').trim().slice(0,n);
const isHost=h=>HOSTS.some(x=>h===x||h.endsWith('.'+x));
function safeUrl(s){try{const u=new URL(String(s||''));if(u.protocol!=='https:'||u.username||u.password||!isHost(u.hostname.toLowerCase()))return null;u.hash='';return u;}catch{return null}}
function dateOf(s){const t=Date.parse(String(s||''));return Number.isFinite(t)?t:0}
function valid(row,now=Date.now()){
 const url=safeUrl(row.url),t=dateOf(row.publishedAt);
 return !!(url&&t&&t<=now+300000&&t>=now-AGE_MS&&clean(row.title).length>=14&&
  clean(row.extract).length>=35&&!BLOCK.test([row.title,row.extract,row.url].join(' ')));
}
function json(data,status=200,origin=''){
 const allowed=/^https:\/\/(?:quantaphi\.org|www\.quantaphi\.org|www-infinity4\.github\.io)$/.test(origin);
 return new Response(JSON.stringify(data),{status,headers:{
  'content-type':'application/json; charset=utf-8','cache-control':'no-store','x-news-phi-origin':'cloudflare',
  'access-control-allow-origin':allowed?origin:'https://quantaphi.org',
  'access-control-allow-methods':'GET,POST,OPTIONS','access-control-allow-headers':'content-type',
  'vary':'Origin','x-content-type-options':'nosniff'
 }});
}
async function ensure(db){
 await db.prepare("CREATE TABLE IF NOT EXISTS news_articles(article_key TEXT PRIMARY KEY,title TEXT NOT NULL,extract TEXT NOT NULL,url TEXT NOT NULL,domain TEXT NOT NULL,published_at TEXT NOT NULL,topic TEXT NOT NULL,source_kind TEXT NOT NULL,created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP)").run();
 await db.prepare("CREATE INDEX IF NOT EXISTS news_articles_published_at_idx ON news_articles(published_at DESC)").run();
 await db.prepare("CREATE TABLE IF NOT EXISTS news_feed_status(id INTEGER PRIMARY KEY CHECK(id=1),last_attempt INTEGER NOT NULL DEFAULT 0,last_success INTEGER NOT NULL DEFAULT 0,last_count INTEGER NOT NULL DEFAULT 0,last_error TEXT NOT NULL DEFAULT '')").run();
 await db.prepare("INSERT OR IGNORE INTO news_feed_status(id) VALUES(1)").run();
}
function normalize(item,topic,kind){
 const u=safeUrl(item.url),title=clean(item.title,250),extract=clean(item.extract||item.content,1200);
 if(!u)return null;
 const row={title,extract,url:u.href,domain:u.hostname.replace(/^www\./,''),publishedAt:new Date(dateOf(item.publishedAt)||0).toISOString(),topic:clean(topic,90),sourceKind:kind};
 if(!valid(row))return null;
 return {...row,id:'cloud-news:'+u.href,storyKey:'news:'+u.href,sourceBacked:true,publicationVerified:true,generatedBy:'monitor-news',retrievalVersion:'cloudflare-news-v1'};
}
function decodeXml(s){return clean(String(s).replace(/<!\[CDATA\[([\s\S]*?)\]\]>/g,(_,inner)=>inner),2400)}
function tag(xml,name){const re=new RegExp('<(?:[a-zA-Z0-9_-]+:)?'+name+'(?:\\s[^>]*)?>([\\s\\S]*?)<\\/(?:[a-zA-Z0-9_-]+:)?'+name+'>','i');return decodeXml(xml.match(re)?.[1]||'')}
function rssStories(xml,label){
 const items=[...xml.matchAll(/<item\b[^>]*>([\s\S]*?)<\/item>/gi)].slice(0,40);
 return items.map((m)=>({
  title:tag(m[1],'title'),extract:tag(m[1],'description')||tag(m[1],'summary'),
  url:tag(m[1],'link'),publishedAt:tag(m[1],'pubDate')||tag(m[1],'published'),
  topic:label
 })).filter(x=>x.title&&x.url);
}
async function sourceSearch(topic,range='day'){
 const u=new URL('https://orange-brook-a2ac.marvaseater.workers.dev/search');
 u.search=new URLSearchParams({q:topic,format:'json',categories:'news',time_range:range,safesearch:'2',_fresh:String(Date.now())}).toString();
 const r=await fetch(u,{headers:{accept:'application/json'},cache:'no-store',signal:AbortSignal.timeout(10500)});
 if(!r.ok)throw new Error('news-index-'+r.status);
 const payload=await r.json();
 if(!Array.isArray(payload.results))throw new Error('news-index-malformed');
 return payload.results.map(x=>({title:x.title,extract:x.content||x.description||x.snippet,url:x.url,publishedAt:x.publishedDate||x.published_at||x.pubDate||x.date}));
}
async function liveRows(topics,withFeeds=false){
 const outcomes=await Promise.allSettled(topics.map(async topic=>{
  const results=await Promise.allSettled(['day','week'].map(r=>sourceSearch(topic,r)));
  if(results.every(x=>x.status==='rejected'))throw new Error('search unavailable '+topic);
  return results.filter(x=>x.status==='fulfilled').flatMap(x=>x.value.map(item=>normalize(item,topic,'SearXNG')).filter(Boolean));
 }));
 const rows=outcomes.filter(x=>x.status==='fulfilled').flatMap(x=>x.value);
 let rssError='';
 if(withFeeds || !rows.length){
  const rss=await Promise.allSettled(FEEDS.map(async url=>{
   const r=await fetch(url,{headers:{accept:'application/rss+xml,application/xml,text/xml'},cache:'no-store',signal:AbortSignal.timeout(11000)});
   if(!r.ok)throw new Error('RSS '+r.status);
   const xml=await r.text();if(!xml.includes('<rss')&&!xml.includes('<item'))throw new Error('RSS invalid');
   return rssStories(xml,'Current reporting').map(x=>normalize(x,'Current reporting','RSS')).filter(Boolean);
  }));
  rows.push(...rss.filter(x=>x.status==='fulfilled').flatMap(x=>x.value));
  rssError=rss.every(x=>x.status==='rejected')?'RSS upstream unavailable':'';
 }
 const found=new Map();
 for(const row of rows)if(valid(row)){const prev=found.get(row.url);if(!prev||dateOf(row.publishedAt)>dateOf(prev.publishedAt))found.set(row.url,row)}
 return {rows:[...found.values()].sort((a,b)=>dateOf(b.publishedAt)-dateOf(a.publishedAt)).slice(0,MAX_ARTICLES),
 error:rows.length?'':rssError||'No verified current source articles were returned'};
}
async function readRows(db,limit=60){
 await ensure(db);
 const result=await db.prepare("SELECT article_key,title,extract,url,domain,published_at,topic,source_kind FROM news_articles WHERE published_at >= ? ORDER BY published_at DESC LIMIT ?").bind(new Date(Date.now()-AGE_MS).toISOString(),limit).all();
 return (result.results||[]).map(x=>({id:'cloud-news:'+x.article_key,storyKey:'news:'+x.url,title:x.title,extract:x.extract,url:x.url,domain:x.domain,publishedAt:x.published_at,publishedLabel:new Date(x.published_at).toLocaleString('en-US',{timeZone:'UTC'})+' UTC',
  topic:x.topic,searchQuery:x.topic,sourceKind:x.source_kind,sourceBacked:true,publicationVerified:true,generatedBy:'monitor-news',retrievalVersion:'cloudflare-news-v1'})).filter(x=>valid(x));
}
async function refresh(db,force=false){
 await ensure(db);
 const status=await db.prepare("SELECT last_attempt,last_success,last_count FROM news_feed_status WHERE id=1").first();
 if(!force&&Date.now()-Number(status?.last_attempt||0)<REFRESH_MS)return {skipped:true,reason:'recently_refreshed'};
 const now=Date.now();
 await db.prepare("UPDATE news_feed_status SET last_attempt=? WHERE id=1").bind(now).run();
 try{
  const result=await liveRows(DEFAULT_QUERIES,true);
  if(result.rows.length){
   const batch=result.rows.map(x=>db.prepare("INSERT INTO news_articles(article_key,title,extract,url,domain,published_at,topic,source_kind) VALUES(?,?,?,?,?,?,?,?) ON CONFLICT(article_key) DO UPDATE SET title=excluded.title,extract=excluded.extract,published_at=excluded.published_at,topic=excluded.topic,source_kind=excluded.source_kind")
    .bind(x.url,x.title,x.extract,x.url,x.domain,x.publishedAt,x.topic,x.sourceKind));
   for(let i=0;i<batch.length;i+=50)await db.batch(batch.slice(i,i+50));
   await db.prepare("UPDATE news_feed_status SET last_success=?,last_count=?,last_error='' WHERE id=1").bind(now,result.rows.length).run();
  }else await db.prepare("UPDATE news_feed_status SET last_error=? WHERE id=1").bind(result.error).run();
  await db.prepare("DELETE FROM news_articles WHERE published_at < ?").bind(new Date(now-AGE_MS).toISOString()).run();
  return {added:result.rows.length,error:result.error};
 }catch(e){
  const reason=clean(e.message,180);
  await db.prepare("UPDATE news_feed_status SET last_error=? WHERE id=1").bind(reason).run();
  return {added:0,error:reason};
 }
}
async function serveFeed(db,{force=false}={}){
 await ensure(db);
 let rows=await readRows(db);
 const status=await db.prepare("SELECT last_attempt,last_success,last_count,last_error FROM news_feed_status WHERE id=1").first();
 let attempt=null;
 if(force||!rows.length){
  if(force||Date.now()-Number(status?.last_attempt||0)>=REFRESH_MS)attempt=await refresh(db,force);
  rows=await readRows(db);
 }
 const latest=await db.prepare("SELECT last_attempt,last_success,last_count,last_error FROM news_feed_status WHERE id=1").first();
 return {ok:true,source:'Cloudflare News Phi',provider:'SearXNG + RSS; verified publication date',cloud:true,
  windowHours:48,generatedAt:new Date().toISOString(),refreshedAt:latest?.last_success?new Date(latest.last_success).toISOString():null,
  attemptedAt:latest?.last_attempt?new Date(latest.last_attempt).toISOString():null,
  articles:rows,stories:rows,count:rows.length,sourceStatus:rows.length?'ready':'no_verified_articles',error:rows.length?'':latest?.last_error||attempt?.error||'No verified articles available'};
}
function sanitizeTopics(input){
 const unique=new Set();
 for(const x of (Array.isArray(input)?input:[]).slice(0,10)){
  const s=clean(x,85).replace(/[^\p{L}\p{N}\s.'-]/gu,' ').replace(/\s+/g,' ').trim();
  if(s.length<3||s.length>85||BLOCK.test(s))continue;
  unique.add(s);
  if(unique.size>=3)break;
 }
 return [...unique];
}
export default {
 async fetch(request,env,ctx){
  const url=new URL(request.url),origin=request.headers.get('Origin')||'';
  if(request.method==='OPTIONS')return json({ok:true},200,origin);
  if(url.pathname==='/v1/news/health'){
   await ensure(env.DB);const status=await env.DB.prepare("SELECT last_attempt,last_success,last_count,last_error FROM news_feed_status WHERE id=1").first();
   return json({ok:true,service:'news-phi-cloud',status,windowHours:48},200,origin);
  }
  if(url.pathname==='/v1/news/feed'&&request.method==='GET'){
   // Cloudflare is the sole source of displayed news. Browser never mixes archives.
   const current=await serveFeed(env.DB,{force:url.searchParams.get('refresh')==='1'});
   return json(current,200,origin);
  }
  if(url.pathname==='/v1/news/related'&&request.method==='POST'){
   const payload=await request.json().catch(()=>({}));
   const topics=sanitizeTopics(payload.topics);
   if(!topics.length)return json({ok:true,cloud:true,articles:[],stories:[],count:0,sourceStatus:'no_topic'},200,origin);
   const matches=await liveRows(topics,false);
   return json({ok:true,cloud:true,source:'Cloudflare News Phi',topics,articles:matches.rows,stories:matches.rows,
    count:matches.rows.length,sourceStatus:matches.rows.length?'ready':'no_verified_articles',error:matches.error},200,origin);
  }
  return json({ok:false,error:'not_found'},404,origin);
 },
 async scheduled(_event,env,ctx){ctx.waitUntil(refresh(env.DB,false))}
};
