# News-Phi PR #6 investigation

PR #6 is open, unmerged and currently not mergeable. Its latest recorded
update is September 20, 2026; head 8812c8b25b4f5c7bc1357e86ccb383a8ca5d6dcd.
It targets the older separate interest-feed/app/retrieval scripts. Current
index.html loads consolidated news-phi-core.js, news-phi-bridges.js,
monitor-refresh-loop.js and news-phi-extras.js. A wholesale merge is not the
smallest safe test of the current feed.

| Layer | Evidence | Smallest discriminating test |
| --- | --- | --- |
| Unmerged code | Store acceptance, excluded-source URLs and canonical URL deduplication in PR #6 have not been adopted by the current interest bridge. | Use the scripts loaded by current index.html; do not test only the obsolete individual files. |
| Signal flow | The core signal whitelist drops `store`. The direct fresh-news topic reader ignores keyword-only `terms` signals. | Seed `{kind:'store',terms:['ruthenium','catalysts']}` and assert a retrieval job and matching direct-news topic before requesting any provider. |
| Retrieval | A live SearXNG news request for Iran returned 10 results with publication metadata. Reuters reported an HTTP error, so retrieval is partially healthy, not universally down. | Inspect subject index/queue first, then provider status/result counts; separate no subject, no result, provider failure and filtered result. |
| Freshness | Two existing indexed-news tests fail on current main: undated results impersonate a publication time and future/undated results are accepted. | The existing publication-order and recent-only tests reproduce this without network calls. Fix verified dates separately from signal ingestion. |
| Repeats | The direct feed uses literal URLs/story keys; tracking variants can evade that identity. Source exclusions from PR #6 are absent from the loaded direct retriever. | Retrieve original URL, tracking variant and distinct current article; exclude original and deduplicate variants before stacking. |

This focused patch adds `store` acceptance to the loaded core bridge and
uses `terms` in the direct topic reader. It preserves collect/search/view/share,
current Cloudflare retrieval, feed storage and refresh policy. Two new
signal-flow tests pass and both changed scripts pass syntax checks.

The existing indexed-news suite remains 4 passing / 2 failing before and after
this patch. Those failures are the separate freshness issues above. This patch
does not claim to deliver 20 new stories on every refresh.

Wallet failures were independently reproduced and repaired in C13b0 and
QuantaPhi. Infinity crashed when a shared cloud record used `id` rather than
`walletId`. The .org gateway rewrote the old-origin storage iframe while the
client still validated GitHub-origin replies, and its .org handoff route was
missing. Those wallet fixes preserve identity and balances; they do not
depend on merging News-Phi PR #6.
