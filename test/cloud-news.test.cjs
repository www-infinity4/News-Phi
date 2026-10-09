const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),vm=require('node:vm');
const root=path.resolve(__dirname,'..'),load=p=>fs.readFileSync(path.join(root,p),'utf8');
const worker=load('workers/news-phi-feed/worker.js');
const script=worker.replace('export default {','globalThis.NewsWorker = {');
const context=vm.createContext({Date,URL,URLSearchParams,Response,Request,AbortSignal,console,fetch:()=>{throw Error('unexpected network request')}});
vm.runInContext(script,context);
const normalize=(v)=>vm.runInContext('normalize('+JSON.stringify(v)+',"test","SearXNG")',context);
const valid=v=>vm.runInContext('valid('+JSON.stringify(v)+')',context);
const article=(overrides={})=>({title:'Researchers describe a documented scientific finding',extract:'An original publisher reported a confirmed science finding and included details that can be inspected by readers.',url:'https://www.bbc.com/news/science-12345',publishedAt:new Date().toISOString(),...overrides});
test('Cloudflare-only service rejects invented undated, stale and unsafe news',()=>{
 assert.equal(valid(article()),true);
 assert.equal(valid(article({publishedAt:''})),false);
 assert.equal(valid(article({publishedAt:new Date(Date.now()-72*3600000).toISOString()})),false);
 assert.equal(valid(article({title:'Exclusive hardcore porn videos'})),false);
 assert.equal(valid(article({url:'https://random-unknown-blog.example/news'})),false);
});
test('Cloudflare service accepts allowed source-backed news and refuses timestamp fabrication',()=>{
 const row=normalize(article());
 assert.equal(row.sourceBacked,true);assert.equal(row.publicationVerified,true);
 assert.equal(row.generatedBy,'monitor-news');
 assert.equal(normalize(article({publishedAt:''})),null);
});
test('no browser-side news index or silent saved Quant substitution',()=>{
 const html=load('index.html'),client=load('news-phi-cloud.js');
 assert.match(html,/News Phi · Infinity Oracle/);
 assert.ok(html.includes('oracle-news.css'));
 assert.ok(html.includes('news-phi-cloud.js'));
 assert.ok(!html.includes('monitor-refresh-loop.js'));
 assert.ok(!html.includes('news-phi-bridges.js'));
 assert.ok(!html.includes('news-phi-extras.js'));
 assert.ok(client.includes("save(CARDS,[])"));
 assert.ok(client.includes('new URL(v)'));
 assert.ok(!client.includes('orange-brook-a2ac'));
 assert.ok(client.includes("/v1/quants/interests"));
});
test('every backend source result requires real publication date and approved publisher',()=>{
 assert.ok(worker.includes("published_at >= ?"));
 assert.ok(worker.includes("t>=now-AGE_MS"));
 assert.ok(worker.includes("safeUrl(row.url)"));
 assert.ok(worker.includes("source:'Cloudflare News Phi'"));
 assert.ok(worker.includes('async scheduled('));
});
