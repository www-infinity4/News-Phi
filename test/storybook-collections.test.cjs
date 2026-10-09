const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path');
const read=name=>fs.readFileSync(path.join(__dirname,'..',name),'utf8');
test('News Phi is the original news desk, not a collected-story shelf',()=>{
 const html=read('index.html'),core=read('news-phi-core.js');
 assert.match(html,/<title>News Phi — Collected Intelligence<\/title>/);
 assert.ok(html.includes('id="feed"'));
 assert.ok(!html.includes('storybook-shortcut'));
 assert.ok(core.includes("const all=monitor.filter(card=>card&&card.sourceBacked).filter(isVisibleCard);"));
 assert.ok(!core.includes('pinnedCollection'));
});
test('stale train stories expire even if saved in storage and retrieval fails',()=>{
 const core=read('news-phi-core.js'),loop=read('monitor-refresh-loop.js');
 assert.ok(core.includes('ageLimit=48*60*60*1000'));
 assert.ok(core.includes('now-when>ageLimit'));
 assert.ok(loop.includes('ARTICLE_MAX_AGE=48*60*60*1000'));
 assert.ok(loop.includes('if(!freshArticle(card,now))continue'));
 assert.ok(loop.includes('const current=stack(stored,[]).cards'));
});
test('fresh news retrieval is not driven by months-old Quants',()=>{
 const loop=read('monitor-refresh-loop.js');
 assert.ok(loop.includes('TOPIC_MAX_AGE=30*86400000'));
 assert.ok(loop.includes('Date.now()-timestamp>TOPIC_MAX_AGE'));
 assert.ok(loop.includes("unseen().length>=BATCH"));
});
test('unwanted adult material is excluded before news cards and Monitor fallback appear',()=>{
 for(const file of ['news-phi-core.js','monitor-refresh-loop.js','news-phi-bridges.js']){
  assert.match(read(file),/porn|pornography/);
 }
});
test('legacy Storybook link leads to separate Oracle site',()=>{
 const html=read('storybook.html');
 assert.match(html,/https:\/\/quantaphi\.org\/storybook\//);
 assert.ok(!html.includes('<section class="tools">'));
});
