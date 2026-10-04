const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm');
function storage(seed){const map=new Map(Object.entries(seed).map(([k,v])=>[k,JSON.stringify(v)]));return {map,api:{getItem:k=>map.get(k)??null,setItem:(k,v)=>map.set(k,v)}};}
test('keyword-only store signal enters the currently loaded retrieval queue',()=>{
 const s=storage({'phiShared:interestSignals:v1':[{kind:'store',terms:['ruthenium','catalysts'],lastAt:Date.now()}]});
 const core=fs.readFileSync('news-phi-core.js','utf8');
 const source=core.split('/* ---- interest-feed-bridge.js ---- */')[1].split('/* ---- background-enrichment-gate.js ---- */')[0];
 vm.runInNewContext(source,{localStorage:s.api,window:{addEventListener(){},dispatchEvent(){}},Date,Map,Set});
 const jobs=JSON.parse(s.map.get('newsPhi:retrievalQueue:v2'));
 assert.equal(jobs.length,1);assert.equal(jobs[0].subject,'ruthenium catalysts');assert.equal(jobs[0].kind,'store');
});
test('the direct fresh-news reader uses stored terms without needing the copied card title',()=>{
 const s=storage({'phiShared:interestSignals:v1':[{kind:'store',terms:['ruthenium','catalysts'],title:'Unrelated filename.jpg',lastAt:Date.now()}]});
 const window={addEventListener(){},dispatchEvent(){}};
 vm.runInNewContext(fs.readFileSync('monitor-refresh-loop.js','utf8'),{window,document:{addEventListener(){},hidden:false},localStorage:s.api,URL,URLSearchParams,AbortController,CustomEvent:function(){},setTimeout:()=>1,clearTimeout(){},setInterval(){},Date,Map,Set,Promise});
 assert.deepEqual(Array.from(window.NewsPhiDirect.topics()),['ruthenium catalysts']);
});
