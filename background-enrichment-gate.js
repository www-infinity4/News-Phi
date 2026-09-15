(function(){
  'use strict';

  // app.js historically schedules background enrichStory() calls about 80 ms
  // after rendering every unenriched card. That rewrites older cards and then
  // rebuilds the whole feed, which is the source of the visible card bouncing.
  // Keep explicit actions available, but block only those automatic timers.
  const nativeSetTimeout=window.setTimeout.bind(window);
  const nativeToString=Function.prototype.toString;

  window.setTimeout=function(callback,delay){
    const args=Array.prototype.slice.call(arguments,2);
    if(typeof callback==='function' && Number(delay)<=120){
      let source='';
      try{source=nativeToString.call(callback)}catch(_){}
      if(/\benrichStory\s*\(/.test(source)) return 0;
    }
    return nativeSetTimeout(callback,delay,...args);
  };
})();
