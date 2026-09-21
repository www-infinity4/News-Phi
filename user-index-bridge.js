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

})();