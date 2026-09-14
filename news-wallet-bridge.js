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
    return detail;
  }

  window.ControlPhi=window.ControlPhi||{};
  window.ControlPhi.ensureShareCredit=ensureShareCredit;
})();
