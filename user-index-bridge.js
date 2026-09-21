(() => {
  "use strict";
  const USER_INDEX = "newsPhi:userStoryIndex:v1";
  const SHARED = "phiShared:collection:v1";
  const clean = (value, max = 2400) =>
    String(value || "").replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim().slice(0, max);
  const read = (key, fallback) => {
    try { const value = JSON.parse(localStorage.getItem(key) || "null"); return value ?? fallback; }
    catch { return fallback; }
  };
  const write = (key, value) => {
    try { localStorage.setItem(key, JSON.stringify(value)); return true; }
    catch { return false; }
  };
  const storyFrom = (node) => {
    const card = node.closest("[data-story]");
    if (!card) return null;
    const link = card.querySelector("a[href]");
    const image = card.querySelector("img");
    const title = clean(card.querySelector("h1,h2,h3,h4,[data-title]")?.textContent || link?.textContent);
    const sourceUrl = clean(card.dataset.url || link?.href, 1600);
    if (!title && !sourceUrl) return null;
    return {
      id: clean(card.dataset.story || sourceUrl || title, 500),
      storyKey: sourceUrl || clean(card.dataset.story || title, 500),
      title: title || "Opened News Phi story",
      sourceTitle: title || "Opened News Phi story",
      extract: clean(card.querySelector("p,[data-extract]")?.textContent),
      url: sourceUrl,
      image: clean(image?.currentSrc || image?.src, 1600),
      domain: (() => { try { return new URL(sourceUrl).hostname.replace(/^www\./, ""); } catch { return ""; } })(),
      searchQuery: clean(card.dataset.query || title),
      collectedFrom: "News Phi story opened",
      ingestType: "semantic-seed",
      seedOnly: true,
      clickedAt: new Date().toISOString()
    };
  };
  const indexStory = (story) => {
    const index = read(USER_INDEX, []);
    const key = story.storyKey || story.id;
    const without = Array.isArray(index) ? index.filter(x => (x?.storyKey || x?.id) !== key) : [];
    write(USER_INDEX, [story, ...without].slice(0, 500));
    const shared = read(SHARED, []);
    const list = Array.isArray(shared) ? shared : [];
    const next = list.filter(x => !(x?.collectedFrom === "News Phi story opened" && (x?.storyKey || x?.id) === key));
    write(SHARED, [{ ...story, collectedAt: story.clickedAt }, ...next].slice(0, 500));
    window.dispatchEvent(new CustomEvent("phiShared:collection-change", { detail: { storyKey: key, source: "news-user-click" } }));
  };
  document.addEventListener("click", (event) => {
    const story = storyFrom(event.target);
    if (story) indexStory(story);
  }, true);

  if (!document.getElementById("newsPhiGuardButton")) {
    const button = document.createElement("button");
    button.id = "newsPhiGuardButton";
    button.type = "button";
    button.setAttribute("aria-label", "Open News Phi menu");
    button.textContent = "☰";
    Object.assign(button.style, { position:"fixed", top:"12px", left:"12px", zIndex:"2147483646", width:"46px", height:"46px", border:"1px solid #ffffff44", borderRadius:"14px", background:"#140b25", color:"#fff", fontSize:"23px", boxShadow:"0 7px 24px #0005" });
    const nav = document.createElement("nav");
    nav.id = "newsPhiGuardMenu";
    nav.setAttribute("aria-label", "News Phi navigation");
    nav.innerHTML = [
      ["News Phi","https://www-infinity4.github.io/News-Phi/"],
      ["Infinity Phi","https://www-infinity4.github.io/C13b0/"],
      ["Web Phi","https://www-infinity4.github.io/Web-Phi/"],
      ["Omni Phi","https://www-infinity4.github.io/Omni-Phi/"],
      ["Unified wallet","https://www-infinity4.github.io/C13b0/wallet/"]
    ].map(([label, href]) => '<a href="' + href + '">' + label + '</a>').join("");
    Object.assign(nav.style, { position:"fixed", top:"68px", left:"12px", zIndex:"2147483646", display:"none", width:"min(310px,calc(100vw - 24px))", padding:"12px", border:"1px solid #ffffff2e", borderRadius:"18px", background:"#10091d", boxShadow:"0 14px 40px #0008" });
    nav.querySelectorAll("a").forEach(a => Object.assign(a.style, { display:"block", padding:"13px", borderBottom:"1px solid #ffffff22", color:"#fff", textDecoration:"none", fontWeight:"800" }));
    button.addEventListener("click", () => { nav.style.display = nav.style.display === "none" ? "block" : "none"; });
    nav.addEventListener("click", () => { nav.style.display = "none"; });
    document.body.append(button, nav);
  }
})();