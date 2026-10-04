const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm');
test('Monitor fallback uses allowed headers and never replaces saved dated news with undated results',async()=>{
 const data=new Map([['newsPhi:monitorCards:v1',JSON.stringify([{title:'Saved dated story',url:'https://x.example/saved',publishedAt:new Date().toISOString()}])]]);let options;
 const window={addEventListener(){},dispatchEvent(){}};const context={window,localStorage:{getItem:k=>data.get(k)||null,setItem:(k,v)=>data.set(k,v)},CustomEvent:function(){},fetch:async(_,opt)=>{options=opt;return {ok:true,json:async()=>({stories:[{title:'No date',url:'https://x.example/unknown'}],seeds:[]})}}};
 const script=fs.readFileSync('news-phi-bridges.js','utf8').split('/* ---- monitor-bridge.js ---- */')[1];vm.runInNewContext(script,context);await window.NewsPhiMonitor.refresh();assert.deepEqual(Object.keys(options.headers),['content-type']);assert.equal(JSON.parse(data.get('newsPhi:monitorCards:v1'))[0].title,'Saved dated story');assert.equal(JSON.parse(data.get('newsPhi:monitorStatus:v1')).state,'no-new');
});
