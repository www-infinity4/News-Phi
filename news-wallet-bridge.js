(function(){
  'use strict';

  const GUEST_KEY='starquest_guest_profile_v1';
  const SESSION_KEY='starquest_session';
  const USERS_KEY='starquest_users';
  const DUPLICATE_WINDOW_MS=5000;

  const read=(key,fallback)=>{try{return JSON.parse(localStorage.getItem(key))??fallback}catch{return fallback}};
  const write=(key,value)=>{try{localStorage.setItem(key,JSON.stringify(value));return true}catch{return false}};

  function walletStore(){
    const session=read(SESSION_KEY,null);
    const users=read(USERS_KEY,{});
    if(session&&session.key&&users&&users[session.key]){
      return {
        profile:users[session.key],
        save(profile){users[session.key]=profile;write(USERS_KEY,users)}
      };
    }
    const guest=read(GUEST_KEY,{
      key:'__guest__',username:'Guest',tokens:0,shareCount:0,pendingShareCredits:0,
      shareEvents:[],ledger:[],watchHistory:[],watchPositions:{},unlockedContent:{}
    });
    return {profile:guest,save(profile){write(GUEST_KEY,profile)}};
  }

  function normalize(profile){
    const wallet=profile&&typeof profile==='object'?profile:{};
    wallet.tokens=Math.max(0,Number(wallet.tokens)||0);
    wallet.shareCount=Math.max(0,Number(wallet.shareCount)||0);
    wallet.pendingShareCredits=Math.max(0,Number(wallet.pendingShareCredits)||0);
    wallet.shareEvents=Array.isArray(wallet.shareEvents)?wallet.shareEvents:[];
    wallet.ledger=Array.isArray(wallet.ledger)?wallet.ledger:[];
    wallet.watchHistory=Array.isArray(wallet.watchHistory)?wallet.watchHistory:[];
    wallet.watchPositions=wallet.watchPositions&&typeof wallet.watchPositions==='object'?wallet.watchPositions:{};
    wallet.unlockedContent=wallet.unlockedContent&&typeof wallet.unlockedContent==='object'?wallet.unlockedContent:{};
    return wallet;
  }

  function snapshot(wallet){
    return {
      progressToNextCoin:wallet.pendingShareCredits,
      awarded:0,
      balance:wallet.tokens,
      shareCount:wallet.shareCount
    };
  }

  function ensureShareCredit(reference='',method='web_share_api'){
    const store=walletStore();
    const wallet=normalize(store.profile);
    const now=Date.now();
    const ref=String(reference||location.href);
    const duplicate=wallet.shareEvents.some(event=>{
      const when=Number(event&&event.createdAt||0);
      const sameReference=String(event&&event.contentId||'')===ref;
      return sameReference&&when&&Math.abs(now-when)<DUPLICATE_WINDOW_MS&&event.confirmed!==false&&event.verified!==false;
    });

    if(duplicate){
      const result=snapshot(wallet);
      result.alreadyRecorded=true;
      window.ControlPhi?.refreshWallet?.();
      refreshNetworkWallet();
      return result;
    }

    const attemptId=`newsphi-share-${now.toString(36)}-${Math.random().toString(36).slice(2,8)}`;
    wallet.shareCount+=1;
    wallet.pendingShareCredits+=1;
    wallet.shareEvents.push({
      id:attemptId,attemptId,contentId:ref,method,confirmed:true,verified:true,
      createdAt:now,source:'news-phi-wallet-bridge'
    });

    let awarded=0;
    while(wallet.pendingShareCredits>=10){
      wallet.pendingShareCredits-=10;
      wallet.tokens+=1;
      awarded+=1;
    }

    wallet.ledger.push({
      id:`tx-${attemptId}`,
      type:awarded?'share_reward':'share_credit',
      amount:awarded,
      balance:wallet.tokens,
      pendingShareCredits:wallet.pendingShareCredits,
      reason:awarded?'Share reward: 10 completed shares':`Confirmed share receipt ${wallet.pendingShareCredits}/10`,
      referenceId:attemptId,
      createdAt:now,
      source:'news-phi-wallet-bridge'
    });

    wallet.shareEvents=wallet.shareEvents.slice(-250);
    wallet.ledger=wallet.ledger.slice(-500);
    store.save(wallet);

    const detail={
      progressToNextCoin:wallet.pendingShareCredits,
      awarded,
      balance:wallet.tokens,
      shareCount:wallet.shareCount,
      source:'news-phi-wallet-bridge'
    };
    window.dispatchEvent(new CustomEvent('starquest:share-progress',{detail}));
    window.dispatchEvent(new CustomEvent('controlphi:wallet-change',{detail}));
    window.ControlPhi?.refreshWallet?.();
    refreshNetworkWallet();
    return detail;
  }

  function refreshNetworkWallet(){
    const wallet=normalize(walletStore().profile);
    document.querySelectorAll('[data-news-star-wallet]').forEach(node=>{
      node.innerHTML=`<strong>★ ${wallet.tokens} Star Coin${wallet.tokens===1?'':'s'}</strong><small>${wallet.pendingShareCredits}/10 shares toward next coin · ${wallet.shareCount} total shares</small>`;
    });
  }

  function installNetworkMenu(){
    if(document.querySelector('[data-news-network-menu]')){refreshNetworkWallet();return;}
    const topbar=document.querySelector('.topbar');
    if(!topbar)return;

    const style=document.createElement('style');
    style.textContent=`
      .news-network-button{width:44px;height:44px;border:1px solid rgba(255,255,255,.16);border-radius:13px;background:rgba(12,8,30,.72);color:#fff;font-size:22px;font-weight:900;cursor:pointer;display:grid;place-items:center;flex:0 0 auto}
      .news-network-backdrop{position:fixed;inset:0;background:rgba(3,2,12,.58);backdrop-filter:blur(3px);z-index:998;opacity:0;pointer-events:none;transition:opacity .18s ease}
      .news-network-drawer{position:fixed;top:0;right:0;width:min(88vw,360px);height:100dvh;z-index:999;padding:20px;background:linear-gradient(180deg,#12092c,#080515);border-left:1px solid rgba(255,255,255,.12);box-shadow:-18px 0 45px rgba(0,0,0,.42);transform:translateX(104%);transition:transform .2s ease;color:#fff;overflow:auto}
      .news-network-backdrop.open{opacity:1;pointer-events:auto}.news-network-drawer.open{transform:translateX(0)}
      .news-network-head{display:flex;align-items:center;justify-content:space-between;gap:12px;margin-bottom:16px}.news-network-head strong{font-size:1.15rem}.news-network-close{width:42px;height:42px;border:1px solid rgba(255,255,255,.15);border-radius:12px;background:rgba(255,255,255,.07);color:#fff;font-size:24px}
      .news-network-nav{display:grid;gap:8px}.news-network-nav a{display:block;padding:13px 14px;border:1px solid rgba(255,255,255,.11);border-radius:13px;background:rgba(255,255,255,.045);color:#fff;text-decoration:none;font-weight:800}
      .news-network-label{margin-top:10px;padding-top:14px;border-top:1px solid rgba(255,255,255,.12);font-size:.68rem;font-weight:950;letter-spacing:.14em;text-transform:uppercase;opacity:.6}
      .news-star-wallet{display:grid;gap:3px;margin-top:4px;padding:13px 14px;border:1px solid rgba(240,189,85,.3);border-radius:14px;background:rgba(240,189,85,.09);color:#f6d77e}.news-star-wallet small{color:rgba(255,255,255,.6);line-height:1.45}
      @media(max-width:620px){.topbar{gap:8px}.sync-state{display:none}.refresh{margin-left:auto}.news-network-button{width:42px;height:42px}}
    `;
    document.head.appendChild(style);

    const button=document.createElement('button');
    button.type='button';
    button.className='news-network-button';
    button.dataset.newsNetworkMenu='1';
    button.setAttribute('aria-label','Open News Phi menu');
    button.textContent='☰';
    topbar.appendChild(button);

    const backdrop=document.createElement('div');
    backdrop.className='news-network-backdrop';
    const drawer=document.createElement('aside');
    drawer.className='news-network-drawer';
    drawer.innerHTML=`
      <div class="news-network-head"><strong>News Phi</strong><button class="news-network-close" type="button" aria-label="Close menu">×</button></div>
      <nav class="news-network-nav" aria-label="Phi network">
        <a href="https://www-infinity4.github.io/News-Phi/">News Phi</a>
        <a href="https://www-infinity4.github.io/Omni-Phi/">Omni Phi</a>
        <a href="https://www-infinity4.github.io/C13b0/phi/">Infinity Phi</a>
        <div class="news-network-label">Wallets</div>
        <a href="https://www-infinity4.github.io/C13b0/wallet/">Infinity + Star Coin wallets</a>
        <div class="news-star-wallet" data-news-star-wallet></div>
      </nav>`;
    document.body.append(backdrop,drawer);

    const setOpen=open=>{
      backdrop.classList.toggle('open',open);
      drawer.classList.toggle('open',open);
      document.body.style.overflow=open?'hidden':'';
    };
    button.addEventListener('click',()=>setOpen(true));
    backdrop.addEventListener('click',()=>setOpen(false));
    drawer.querySelector('.news-network-close')?.addEventListener('click',()=>setOpen(false));
    drawer.querySelectorAll('a').forEach(link=>link.addEventListener('click',()=>setOpen(false)));
    refreshNetworkWallet();
  }

  window.ControlPhi=window.ControlPhi||{};
  window.ControlPhi.ensureShareCredit=ensureShareCredit;

  if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',installNetworkMenu,{once:true});
  else installNetworkMenu();
  window.addEventListener('storage',refreshNetworkWallet);
  window.addEventListener('starquest:share-progress',refreshNetworkWallet);
  window.addEventListener('controlphi:wallet-change',refreshNetworkWallet);
})();
