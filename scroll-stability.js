(function(){
  'use strict';
  // Leave scrolling to the browser and the user.
  // Card/image/source mutations must never call scrollBy, poll the feed,
  // or try to restore an old card's viewport position.
  document.documentElement.dataset.newsPhiScroll='native';
})();
