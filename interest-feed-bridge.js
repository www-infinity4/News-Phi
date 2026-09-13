(function(){
  "use strict";

  const SIGNAL_KEY="phiShared:interestSignals:v1";
  const SHARED_KEY="phiShared:collection:v1";
  const GENERATED_BY="news-phi-interest-bridge";
  const read=(key,fallback)=>{try{return JSON.parse(localStorage.getItem(key))??fallback}catch(_){return fallback}};
  const write=(key,value)=>{try{localStorage.setItem(key,JSON.stringify(value));return true}catch(_){return false}};
  const clean=value=>String(value==null?"":value).replace(/\s+/g," ").trim();
  const slug=value=>clean(value).toLowerCase().replace(/[^a-z0-9]+/g,"-").replace(/^-|-$/g,"").slice(0,140)||"interest";

  function summarizeCounts(group){
    const parts=[];
    if(group.views)parts.push(`${group.views} view${group.views===1?"":"s"}`);
    if(group.searches)parts.push(`${group.searches} search${group.searches===1?"":"es"}`);
    if(group.shares)parts.push(`${group.shares} completed share${group.shares===1?"":"s"}`);
    return parts.join(" · ")||"interest signal";
  }

  function buildCard(group){
    const latest=group.latest;
    const isSearch=group.type==="search";
    const subject=isSearch?clean(latest.query):clean(latest.program||latest.channel||"Omni TV interest");
    const channel=clean(latest.channel);
    const engagement=summarizeCounts(group);
    const title=isSearch?`Explore: ${subject}`:subject;
    const context=isSearch
      ?`You searched Omni TV for “${subject}”. News Phi saved that search as a research path so it can grow into background, people, history, technology, related ideas, and current developments instead of disappearing after one search.`
      :`“${subject}” surfaced in your Omni TV activity${channel?` on ${channel}`:""}. News Phi saved it as a research starting point so you can move from watching into useful background, people, history, technology, related ideas, and current developments connected to the subject.`;
    const personalization=`This topic currently reflects ${engagement}. Repeated views bring a subject back toward the top, searches add new directions, and completed shares count as a stronger signal that the topic is worth expanding.`;
    const query=isSearch?subject:`${subject}${channel?` ${channel}`:""} background history technology people current developments`;
    return {
      storyKey:`omni-interest:${slug(group.topicKey)}`,
      title,
      extract:`${context} ${personalization}`,
      image:latest.image||"",
      url:latest.url||"https://www-infinity4.github.io/Omni-TV/",
      domain:isSearch?"Omni TV search":`Omni TV${channel?` · ${channel}`:""}`,
      provider:"Omni TV",
      searchQuery:query,
      collectedAt:new Date(group.lastAt||Date.now()).toISOString(),
      generatedBy:GENERATED_BY,
      interestScore:group.views+(group.searches*2)+(group.shares*4),
      interactionSummary:engagement
    };
  }

  function synchronizeInterestCards(){
    const signals=read(SIGNAL_KEY,[]).filter(Boolean);
    if(!signals.length)return [];

    const groups=new Map();
    signals.forEach(signal=>{
      const kind=clean(signal.kind)||"view";
      const topicKey=clean(signal.topicKey)||(kind==="search"?`search:${slug(signal.query)}`:`program:${slug(signal.channel)}:${slug(signal.program||signal.channel)}`);
      if(!topicKey)return;
      let group=groups.get(topicKey);
      if(!group){
        group={topicKey,type:kind==="search"?"search":"program",views:0,searches:0,shares:0,lastAt:0,latest:signal};
        groups.set(topicKey,group);
      }
      const hits=Math.max(1,Number(signal.hits)||1);
      if(kind==="share")group.shares+=hits;
      else if(kind==="search")group.searches+=hits;
      else group.views+=hits;
      const at=Number(signal.lastAt||Date.parse(signal.collectedAt||signal.createdAt||"")||0);
      if(at>=group.lastAt){group.lastAt=at;group.latest=signal;}
    });

    const generated=[...groups.values()].map(buildCard).sort((a,b)=>String(b.collectedAt).localeCompare(String(a.collectedAt)));
    const shared=read(SHARED_KEY,[]);
    const generatedMap=new Map(generated.map(card=>[card.storyKey,card]));
    const merged=[];
    const seen=new Set();

    generated.forEach(card=>{merged.push(card);seen.add(card.storyKey);});
    shared.forEach(card=>{
      const key=card?.storyKey||card?.url||card?.id||"";
      if(!key||seen.has(key))return;
      merged.push(card);
      seen.add(key);
    });

    write(SHARED_KEY,merged.slice(0,500));
    return generated;
  }

  synchronizeInterestCards();

  window.addEventListener("storage",event=>{
    if(event.key!==SIGNAL_KEY)return;
    synchronizeInterestCards();
    setTimeout(()=>document.getElementById("refreshFeed")?.click(),0);
  });

  window.addEventListener("newsphi:interest",()=>{
    synchronizeInterestCards();
    setTimeout(()=>document.getElementById("refreshFeed")?.click(),0);
  });
})();
