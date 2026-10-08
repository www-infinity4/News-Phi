const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path');
const file=n=>fs.readFileSync(path.join(__dirname,'..',n),'utf8');
test('all collected stories are part of the visible News Phi feed',()=>{
 const code=file('news-phi-core.js');
 assert.ok(code.includes('...quanta,...localQuanta,...shared'));
 assert.ok(code.includes('...monitor.filter(card=>card&&card.sourceBacked).filter(isVisibleCard),...collected'));
 assert.ok(code.includes("storyKey:'collect:'+card.key"));
 assert.ok(code.includes('pinnedCollection:true'));
});
test('cloud bridge paginates, merges and keeps the older collection cache',()=>{
 const code=file('news-phi-bridges.js');
 assert.ok(code.includes("ENDPOINT+'?limit=200&offset='+offset"));
 assert.ok(code.includes("payload.nextOffset"));
 assert.ok(code.includes('...(Array.isArray(prior)?prior:[]),...incoming'));
 assert.ok(code.includes("replace(/^quanta-cloud:/,'collect:')"));
 assert.ok(!code.includes('write(CACHE,cards);'));
});
test('My Storybook has its own full reading and chapter UI',()=>{
 const html=file('storybook.html'),js=file('storybook.js');
 assert.match(html,/My <em>Storybook<\/em>/);
 for(const id of ['bookCount','bookCards','chapterFilter','bookSearch','syncButton'])assert.ok(html.includes('id="'+id+'"'));
 assert.ok(js.includes('/v1/quants/storybook'));
 assert.ok(js.includes("meta[item._key]?.chapter"));
 assert.ok(js.includes('auth.authenticatedFetch(BASE'));
 assert.ok(js.includes("imageVerified"));
});
test('News Phi links the new book without replacing the news feed',()=>{
 const html=file('index.html');
 assert.ok(html.includes('href="storybook.html"'));
 assert.ok(html.includes('id="feed"'));
});
