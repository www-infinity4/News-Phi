const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm');
function setup(seed,fetch){const data=new Map(Object.entries(seed).map(([k,v])=>[k,JSON.stringify(v)])),events=[];const window={addEventListener(){},dispatchEvent:e=>events.push(e)};vm.runInNewContext(fs.readFileSync('monitor-refresh-loop.js','utf8'),{window,document:{addEventListener(){},hidden:false},localStorage:{getItem:k=>data.get(k)||null,setItem:(k,v)=>data.set(k,v)},fetch,URL,URLSearchParams,AbortController,CustomEvent:function(type,options){this.type=type;this.detail=options?.detail},setTimeout:()=>1,clearTimeout(){},setInterval(){},Date,Map,Set,Promise});return {api:window.NewsPhiDirect,data,events}}
test('indexed search words request today news and publish source articles rather than the search itself',async()=>{
 const queries=[];const {api,data}=setup({'quantaPhiBuildHistoryV1':[{query:'Iran',created_at:'2026-10-03T04:20:00Z'}]},async url=>{queries.push(new URL(url));return {ok:true,json:async()=>({results:[1,2,3].map(n=>({title:'Iran development '+n,url:'https://publisher.example/story/'+n,content:'A sourced news report about Iran, with details from the publisher.',metadata:n+' hours ago | Publisher'}))})}});
 const result=await api.refresh();assert.equal(queries[0].searchParams.get('q'),'Iran');assert.equal(queries[0].searchParams.get('categories'),'news');assert.equal(queries[0].searchParams.get('time_range'),'day');assert.equal(result.stories.length,3);assert.equal(result.stories[0].publishedLabel,'1 hours ago');assert.equal(JSON.parse(data.get('newsPhi:subjectIndex:v1'))[0].topic,'Iran');assert.equal(result.stories[0].domain,'publisher.example');
});
test('publication metadata ranks freshest articles first and missing dates do not impersonate a publication date',()=>{const {api}=setup({},null),now=Date.now();const cards=[{title:'older',url:'https://a.example/old',content:'old',metadata:'5 hours ago'},{title:'unknown',url:'https://b.example/story',content:'unknown'},{title:'fresh',url:'https://a.example/new',content:'new',metadata:'12 minutes ago'}].map(x=>api.normalize(x,'Iran',now));const merged=api.merge([cards]);assert.equal(merged[0].title,'fresh');assert.equal(merged[2].publishedAt,'');assert.equal(merged[2].publishedLabel,'')});
test('collected filenames become clean indexed subjects and generated news does not seed itself',()=>{const {api}=setup({'quantaPhiCollected':[{title:'Kenny Rogers (7787975040).jpg'}],'phiShared:collection:v1':[{title:'Generated headline',generatedBy:'monitor-news'}]},null);assert.deepEqual(Array.from(api.topics()),['Kenny Rogers'])});
test('a failed retrieval retains the last successful feed',async()=>{const {api,data}=setup({'quantaPhiBuildHistoryV1':[{query:'Iran'}],'newsPhi:monitorCards:v1':[{title:'Saved story'}]},async()=>{throw Error('offline')});const out=await api.refresh();assert.equal(out.stories[0].title,'Saved story');assert.equal(JSON.parse(data.get('newsPhi:monitorStatus:v1')).state,'error')});
test('refresh seeds up to 20 new cards and retains saved stories until reset',()=>{
 const {api}=setup({},null),now=Date.now(),mk=(n,extra={})=>({title:'Story '+n,url:'https://x.example/'+n,extract:'e',relevance:1,publishedAt:new Date(now-n*3600000).toISOString(),retrievedAt:new Date(now).toISOString(),...extra});
 const stored=[mk(100,{firstSeenAt:new Date(now-DAYS(1)).toISOString()}),mk(101,{firstSeenAt:new Date(now-DAYS(8)).toISOString()}),mk(102,{firstSeenAt:new Date(now-DAYS(1)).toISOString()})];
 function DAYS(n){return n*86400000}
 const found=[[...Array(25).keys()].map(n=>mk(n+1))];
 const out=api.stack(stored,found,now);
 assert.equal(out.added,20);assert.equal(out.cards[0].isNew,true);assert.equal(out.cards[19].isNew,true);assert.equal(out.cards[20].isNew,false);
 assert.ok(out.cards.some(c=>c.title==='Story 101'));assert.ok(out.cards.some(c=>c.title==='Story 100'));
});

test('recent-only filtering excludes old, undated and future articles even if provider ignores date range',async()=>{
 const queries=[],now=Date.now();const {api}=setup({'quantaPhiBuildHistoryV1':[{query:'Iran'}]},async url=>{queries.push(new URL(url));return {ok:true,json:async()=>({results:[
 {title:'Iran old',url:'https://x.example/old',content:'Iran old reporting',publishedDate:new Date(now-30*86400000).toISOString()},
 {title:'Iran undated',url:'https://x.example/undated',content:'Iran unknown date'},
 {title:'Iran future',url:'https://x.example/future',content:'Iran future',publishedDate:new Date(now+86400000).toISOString()},
 {title:'Iran current',url:'https://x.example/current',content:'Iran source report',metadata:'10 minutes ago'}]})}});
 const out=await api.refresh();assert.equal(out.stories.length,1);assert.equal(out.stories[0].title,'Iran current');assert.ok(queries.every(q=>['day','week'].includes(q.searchParams.get('time_range'))));
});

test('tracking variants are one story across providers and refreshes; original sources are excluded',async()=>{
 const {api}=setup({'phiShared:interestSignals:v1':[{kind:'share',title:'Iran',url:'https://www.x.example/original?utm_source=share'}]},async()=>({ok:true,json:async()=>({results:[
  {title:'Iran original',url:'https://x.example/original?fbclid=a',content:'Iran reporting',metadata:'1 hour ago'},
  {title:'Iran new',url:'https://www.x.example/new/?utm_campaign=one#top',content:'Iran current reporting',metadata:'1 hour ago'}]})}));
 const rows=await api.requestTopic('Iran','day');assert.equal(rows.length,1);assert.equal(rows[0].canonicalUrl,'https://x.example/new');assert.equal(rows[0].url,'https://www.x.example/new/?utm_campaign=one#top');
 const stored=[{...rows[0],url:'https://www.x.example/new/?utm_source=old',storyKey:'monitor:legacy'}];
 const result=api.stack(stored,[rows]);assert.equal(result.added,0);assert.equal(result.cards.length,1);
});
test('hiding an older monitor key also hides future canonical URL variants',()=>{
 const {api,data}=setup({'newsPhi:monitorCards:v1':[{title:'Iran saved',url:'https://www.x.example/story/?utm_source=a',storyKey:'monitor:old'}]},null);
 api.hide('monitor:old');assert.equal(JSON.parse(data.get('newsPhi:monitorCards:v1')).length,0);
 const result=api.stack([],[api.normalize({title:'Iran new title',url:'https://x.example/story?fbclid=b',content:'Iran',metadata:'1 hour ago'},'Iran')]);assert.equal(result.added,0);
});
test('even a feed older than the reset marker survives a retrieval outage',async()=>{
 const {api,data}=setup({'quantaPhiBuildHistoryV1':[{query:'Iran'}],'newsPhi:feedWipedAt:v1':Date.now()-8*86400000,'newsPhi:monitorCards:v1':[{title:'Saved story'}]},async()=>{throw Error('offline')});
 await api.refresh();assert.equal(JSON.parse(data.get('newsPhi:monitorCards:v1'))[0].title,'Saved story');
});
