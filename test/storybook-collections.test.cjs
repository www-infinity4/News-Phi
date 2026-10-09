const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path');
const read=n=>fs.readFileSync(path.join(__dirname,'..',n),'utf8');
test('News Phi is an Oracle news desk, not a collected Quant shelf',()=>{
 const html=read('index.html'),core=read('news-phi-core.js');
 assert.match(html,/News Phi · Infinity Oracle/);
 assert.ok(html.includes('id="feed"'));
 assert.ok(html.includes('oracle-news.css'));
 assert.ok(html.includes('news-phi-cloud.js'));
 assert.ok(!html.includes('news-phi-bridges.js'));
 assert.ok(!html.includes('monitor-refresh-loop.js'));
 assert.ok(core.includes("const all=monitor.filter(card=>card&&card.sourceBacked).filter(isVisibleCard);"));
 assert.ok(!core.includes('pinnedCollection'));
});
test('three-day-old train articles never reappear as fresh cloud headlines',()=>{
 const core=read('news-phi-core.js'),client=read('news-phi-cloud.js');
 const worker=read('workers/news-phi-feed/worker.js');
 assert.ok(core.includes('ageLimit=48*60*60*1000'));
 assert.ok(core.includes('now-when>ageLimit'));
 assert.ok(client.includes('AGE=48*3600000'));
 assert.ok(worker.includes('AGE_MS=48*3600000'));
 assert.ok(worker.includes('published_at >= ?'));
});
test('cloud recent Quants steer topic refinement without importing five-month archive',()=>{
 const client=read('news-phi-cloud.js'),worker=read('workers/news-phi-feed/worker.js');
 assert.ok(client.includes('/v1/quants/interests'));
 assert.ok(client.includes('now-30*86400000'));
 assert.ok(client.includes('getRelated(topics)'));
 assert.ok(!client.includes('quantaPhiCollected'));
 assert.ok(worker.includes('sourceSearch(topic'));
});
test('no unwanted explicit content, auto pictures or fake source links',()=>{
 const core=read('news-phi-core.js'),client=read('news-phi-cloud.js'),worker=read('workers/news-phi-feed/worker.js');
 assert.match(core,/porn|pornography/);
 assert.match(client,/porn|pornography/);
 assert.match(worker,/porn|pornography/);
 assert.ok(client.includes("image:'',imageVerified:false"));
 assert.ok(worker.includes('isHost(u.hostname.toLowerCase())'));
});
test('My Storybook stays a separate Oracle reading room',()=>{
 const old=read('storybook.html');
 assert.ok(old.includes('https://quantaphi.org/storybook/'));
});
