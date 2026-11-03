const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm'),path=require('node:path');
const worker=fs.readFileSync(path.join(__dirname,'../workers/news-phi-feed/worker.js'),'utf8');
const ready=worker.replace('export default {','globalThis.NewsWorker = {');
const publisher='https://science.nasa.gov/missions/hubble/source-investigation/';
const article={url:publisher,domain:'science.nasa.gov',title:'New research on star-forming small galaxies',publishedAt:new Date().toISOString()};
const p='<p>Researchers examined a verified sample of galaxies with observational evidence from several telescopes and explained the uncertainty involved in interpreting measurements over time.</p>';
function setup(paragraphs,aiEnabled=true){
 const context=vm.createContext({Date,URL,URLSearchParams,Response,Request,AbortSignal,console,
  fetch:async()=>new Response('<html><body>'+Array.from({length:8},(_,i)=>p.replace('Researchers examined','For finding '+i+', researchers examined')).join('')+'</body></html>',{status:200,headers:{'content-type':'text/html'}})});
 vm.runInContext(ready,context);context.article=article;
 let called=null;
 context.env={AI:aiEnabled?{run:async(_,args)=>{called=args;return {response:JSON.stringify({paragraphs})}}}:undefined};
 return {context,call:()=>vm.runInContext('sourceContext(article,env)',context),args:()=>called};
}
test('original-source generator produces at least six detailed, independently written paragraphs',async()=>{
 const report=Array.from({length:7},(_,i)=>'Paragraph '+i+': '+'Evidence reported by the original publication is limited to its actual observations and uncertainty. '.repeat(4));
 const s=setup(report);
 const result=await s.call();
 assert.equal(result.kind,'gpt-source-grounded');
 assert.equal(result.text.split('\n\n').length,7);
 assert.ok(s.args().max_tokens>=1800);
 assert.match(s.args().messages[0].content,/at least six|6 to 9|seven to nine/i);
});
test('short AI output does not masquerade as a full original article',async()=>{
 const s=setup(['One brief headline.','One brief summary.','One more brief paragraph.']);
 const result=await s.call();
 assert.notEqual(result.kind,'gpt-source-grounded');
 assert.equal(result.text,'');
});
test('missing AI or inaccessible primary text never generates fabricated full news',async()=>{
 const s=setup([],false);
 const result=await s.call();
 assert.equal(result.text,'');
 assert.equal(result.kind,'AI_unavailable');
});
test('D1 stores source-grounded reports once and only returns them while source is current',()=>{
 assert.match(worker,/CREATE TABLE IF NOT EXISTS news_read_reports/);
 assert.match(worker,/source_published_at/);
 assert.match(worker,/news_read_reports WHERE article_key=\?/);
 assert.match(worker,/sourceContext\(found,env\)/);
 assert.match(worker,/published_at/);
});
test('thin publisher HTML cannot support invented long reporting even when AI is available',async()=>{
 const s=setup(Array.from({length:7},()=>('A detailed but ungrounded sentence. ').repeat(8)));
 s.context.fetch=async()=>new Response('<html>'+p+'</html>',{status:200,headers:{'content-type':'text/html'}});
 const result=await s.call();
 assert.equal(result.text,'');
 assert.equal(result.kind,'source_too_thin');
});

 test('one blocked paragraph rejects the entire AI report without laundering it',async()=>{
  const paragraphs=Array.from({length:7},(_,i)=>'Paragraph '+i+': '+'Detailed source interpretation and measurable observations from published research with no additional invented evidence. '.repeat(4));
  paragraphs[3]='This output contains explicit pornographic material. '+paragraphs[3];
  const result=await setup(paragraphs).call();
  assert.equal(result.kind,'AI_unverified');
  assert.equal(result.text,'');
 });
 test('long-form report D1 rows are bounded by retention cleanup',()=>{
  assert.match(worker,/DELETE FROM news_read_reports WHERE generated_at </);
 });
