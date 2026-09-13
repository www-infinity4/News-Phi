# News Phi

News Phi is the reusable reading feed for cards collected across Infinity Phi searches.

## Shared memory contract

- `phiShared:collection:v1` is the canonical cross-Phi card collection.
- `phiShared:storyIndex:v1` stores each built full-card story by stable source URL, source ID, or normalized title.
- `omniPhi:profile:v1` remains supported and is migrated automatically for earlier collections.
- `omniPhi:lastResearch:v1` enriches older saved cards with current source text and imagery when available.
- `controlPhi:shareFeed:v1` receives one unique article seed for every completed channel share.

Because `Omni-Phi` and `News-Phi` are served from the same `www-infinity4.github.io` origin, they can use the same browser memory across repository paths.

## Feed behavior

1. Collect an orange source card on Omni Phi page two.
2. News Phi synchronizes it into the shared collection.
3. The feed shows a larger source-grounded paragraph.
4. **Open full card** displays the saved full read.
5. **Build similar news** sends the story subject back into Omni Phi as a related search.

Stories are deduplicated and built once, then reused on later feed visits.

Control Phi share events intentionally retain their unique event ID, so repeated shares create separate News Phi cards. Each card carries a query assembled from the shared title, description, current channel/program context, and source URL.
