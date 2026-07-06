# Command Center Lab TODO

## First UI pass

- Add slide-up visor shell.
- Add control deck foundation.
- Keep the existing v2.3.0 focus-mode path intact until each interaction is proven.
- Prefer mock/control-state data before connecting live data.

## Validation pass

- Run `npm install` from `apps/afo-link-lane/`.
- Run `npm run check`.
- Validate embedded browser script extraction/parsing.
- Test mobile gestures and viewport resizing.

## Deployment pass

- Add a lab-only deploy workflow only after the first validated UI pass.
- Deploy to `afo-link-lane-v235-lab` only.
- Confirm production `afo-link-lane` remains unchanged.

## v2.3.11 Mobile Flight HUD

Goal: make 1,400+ to 2,000+ node universes navigable on iPhone with dedicated cockpit controls while preserving existing touch gestures.

Current state:

- Live lab reached 1,403 links across 63 galaxies after the curated feed pack sync.
- Supercluster view is visually impressive but touch-only navigation is no longer enough for deliberate travel.
- Keep pinch, tap, drag, and focus gestures available for fine-tuned interaction.

Mobile-first HUD layout:

- Keep the existing Galaxies / Supercluster and Sphere / Spiral / Cube / Torus controls above the new flight controls.
- Add a bottom Flight HUD below the shape controls.
- Row 1: `⟲ ORBIT`, `◀ TURN`, `TURN ▶`, `ORBIT ⟳`.
- Row 2: `◀ PAN`, `− SPD`, `■ STOP`, `+ SPD`, `PAN ▶`.
- Row 3: compact readout such as `speed: 0.0x / cruise off`.

Button behavior:

- Tap applies one small movement step.
- Press-and-hold applies continuous movement until release.
- Stop immediately zeros travel speed and cancels held thrust.
- Gesture controls must remain active for fine adjustments.

Implementation notes:

- Add a `navState` object separate from existing touch state.
- Suggested state: thrust/speed, yaw, orbit, panX, panY, braking/heldButtons.
- Main animation loop should apply both touch input and HUD button input.
- Use pointer events for press/hold: `pointerdown`, `pointerup`, `pointercancel`, `pointerleave`.
- Keep mobile hit targets at least 44px high.
- Respect `env(safe-area-inset-bottom)`.
- Preserve current retro cockpit style: dark translucent panel, cyan glow, red STOP, green/cyan speed controls.

Validation target:

- iPhone Safari can speed up, slow down, stop, turn left/right, orbit left/right, and pan left/right using buttons.
- Existing pinch/tap/drag still works.
- Large Supercluster/Sphere views remain usable at 1,400+ nodes.
- No production deploy; lab Worker only.

## v2.3.17 HUD Radar / Offscreen Waypoints

Goal: keep v2.3.17 strictly focused on spatial navigation for current Searchlight results, not persistent organization.

Current state:

- v2.3.16 Search Sequence Polish is the current lab Worker HEAD.
- Searchlight now supports Search, result count, Prev, Next, Fly, and a selected-result label.
- Manual user testing confirmed the guided Searchlight flow is working well enough to plan the next layer.

Scope:

- Add a lightweight radar/compass ring around the reticle or HUD center.
- Project current Searchlight result positions from 3D world space into screen space.
- For results behind the camera or offscreen, draw small edge waypoints/triangles pointing toward them.
- Show only the nearest few waypoints to avoid clutter on iPhone.
- Tapping a waypoint selects that result and triggers the existing guided fly-to path.

Out of scope for v2.3.17:

- Do not create new galaxies.
- Do not add D1 schema changes.
- Do not permanently mutate link/group organization.
- Do not increase the 2500-node display cap.

Validation target:

- Search results behind or outside the viewport produce useful directional hints.
- The radar layer remains readable on iPhone Safari.
- Tapping a waypoint feels like navigation, not a flat search list.
- Existing Search, Prev, Next, Fly, focus/unfold, and mobile HUD controls still work.

## v2.3.18 Temporary Research Interaction Layer

Goal: make the existing universe feel like a real spatial research UI without adding persistence, schema changes, or saved research galaxies yet.

Status: mostly implemented and manually tested through v2.3.18.8.

Completed sub-slices:

- v2.3.18 Search Galaxy Preview
  - Cluster Results creates a temporary local formation from Searchlight matches.
  - Return to Universe restores original positions.
  - No saved galaxy writes.
- v2.3.18.1 Mobile Search Controls
  - Search controls were made safer on iPhone.
  - Prev/Next select results without auto-flying.
  - Decorative starfield was disabled so real nodes are easier to see.
- v2.3.18.2 Aim Lock Selector
  - Added center-aim hover detection.
  - Added readable aimed-link HUD label.
  - Added magnet selector for session-only multi-select.
- v2.3.18.3 Tractor Beam Restore
  - Locked links can be temporarily staged near the camera.
  - Original positions are snapshotted and restorable.
- v2.3.18.4 Visible Beam Button
  - Beam action moved into the always-visible mobile control row.
- v2.3.18.5 Beam Reading Dock
  - Beamed selections become camera-facing cards.
  - Tapping a beamed card prioritizes unfold/inspect.
  - Restore returns position and available rotation.
- v2.3.18.6 Focus Card Carousel
  - Unfolded nodes open a mobile-first carousel.
  - Cards: TITLE, IMAGE, CHANNEL, TYPE, PUBLISHED, SOURCE.
  - Back closes carousel while preserving the 3D unfolded grid behind it.
- v2.3.18.7 Focus Carousel Navigation Binding
  - Carousel buttons are bound programmatically.
  - Dot navigation and swipe navigation work on mobile.
- v2.3.18.8 Dock Restore Session Polish
  - Visible Restore button appears beside Beam/Re-Beam when docked.
  - Dock status line shows locked count, docked state, and session-only state.
  - Save/Later controls are labeled as session-only.

Current hard boundary for v2.3.18:

- Client-side/session-only research interactions only.
- No D1 schema changes.
- No new persistence endpoints.
- No permanent saved galaxies.
- Save/Later may remain session-only until the v2.3.19 persistence model is approved.

## v2.3.18.9 Beam Focus Isolation

Goal: when links are docked with Beam, the UI should focus on those links and stop showing unrelated node previews or background interaction noise.

Current problem:

- Beam successfully docks selected links, but the rest of the universe remains visually and interactively active.
- Background nodes and unrelated cube previews compete with the docked reading tray.
- The HUD can still show unrelated Tap to View hints while the user is trying to inspect docked links.

Scope:

- While `aimState.tractorActive` is true, only selected/docked links should be targetable.
- `updateTarget()` should ignore non-selected nodes during Beam Focus.
- Hide or heavily dim non-selected promoted meshes and far instanced nodes while docked.
- Suppress unrelated hover labels/previews while Beam Focus is active.
- Make the dock status read like a focused tray, for example `Beam Focus · 5 docked · tap a card to unfold`.
- Restore exits Beam Focus and brings the full universe back.

Out of scope:

- No saved galaxy writes.
- No D1 schema changes.
- No endpoint changes.
- No persistent saved set.

Validation target:

- After Beam, only docked links are readable and selectable.
- Background universe can still be visually present if dimmed, but not distracting or targetable.
- Restore returns the universe and normal targeting behavior.
- Carousel, unfold, Visit, Searchlight, and mobile HUD controls still work.

## v2.3.18.10 Galaxy Focus Mode

Goal: allow a whole source galaxy or galaxy label to become a temporary focused reading tray, without saving a new persistent research galaxy yet.

Concept:

- The user can aim at or select a galaxy label such as `Cloudflare Blog` or `Vox`.
- A new Galaxy Focus action beams a readable batch from that galaxy into the Beam Reading Dock.
- Because some galaxies can contain hundreds or thousands of links, do not dock every item at once.
- Use a safe batch window first, such as newest 24, nearest 24, or search-filtered 24.
- Add Next Batch / Previous Batch after the first safe batch implementation works.

Possible controls:

- Galaxy Focus
- Next Batch
- Previous Batch
- Restore Universe
- Optional Search Within Galaxy later.

Data behavior:

- Uses existing link metadata and source/group fields.
- No new saved-galaxy table yet.
- Original source provenance remains untouched.
- A later v2.3.19 save flow may save the current focused galaxy batch or search-filtered set.

Validation target:

- Aim/select a galaxy label and focus a readable batch.
- The batch uses the same Beam Reading Dock and Focus Card Carousel patterns.
- Large galaxies do not overload iPhone rendering or UI readability.
- Restore returns to the normal universe.

## v2.3.20 Social Embed and Sports Link Ingestion

Goal: make Link Lane able to ingest sports/news/social links that appear as normal pages, embedded social posts, or redirected embed URLs, starting with ESPN and X/Twitter and later extending to YouTube, Instagram, TikTok, and similar providers.

Why this matters:

- ESPN and other sports/news pages often contain embedded social posts rather than simple article-only links.
- A URL such as `platform.twitter.com/embed/Tweet.html?...id=...` is not an RSS feed; it is an embed iframe URL that should be normalized into a canonical X/Twitter post URL.
- Link Lane should preserve where the item was discovered, for example an X post discovered through ESPN, while also storing the clean canonical post URL.

Initial providers:

- ESPN article/page links.
- ESPN pages that expose X/Twitter embeds.
- `x.com/.../status/...` links.
- `twitter.com/.../status/...` links.
- `platform.twitter.com/embed/Tweet.html?...id=...` links.

Later providers:

- YouTube video, Shorts, playlist, and embed links.
- Instagram post/reel/embed links where public metadata is available.
- TikTok video/embed links where public metadata is available.
- Other sports/news liveblog embeds if they expose stable public URLs.

Normalizer behavior:

- Detect provider from URL host and path.
- Extract post/video ID when the URL is an embed wrapper.
- Convert Twitter/X embed URLs to canonical links such as `https://x.com/i/status/{id}` when the author handle is unknown.
- Store `provider`, `provider_id`, `canonical_url`, `original_url`, `discovered_from_url`, `source_family`, and `content_type` metadata.
- Use a content type such as `social_post`, `sports_article`, `video`, `short_video`, or `embed`.
- Preserve ESPN/source provenance when social links are discovered through an ESPN page or Arena embed.

Preview/render behavior:

- Render normalized social embeds as Link Lane cards using available public metadata.
- Fall back to provider, ID, canonical URL, and discovered-from source when rich metadata is unavailable.
- Avoid depending on private cookies or user-specific sessions.
- Do not store temporary session IDs from embed URLs as canonical data.

RSS/feed relationship:

- This is not the same as RSS ingestion.
- If ESPN or another provider exposes a stable public RSS/feed URL for a section, it can be added through the existing feed-source path.
- Social embed ingestion should work for pasted links and extracted page embeds even when no RSS feed exists.

Safety and platform rules:

- Public links only.
- No private account scraping.
- No bypassing paywalls, login walls, or platform access controls.
- Respect provider terms and use official embed/oEmbed/public metadata paths where feasible.

Possible UI:

- Add URL accepts article, embed, and social-post URLs.
- Show normalized provider badge, for example ESPN, X, YouTube, Instagram, TikTok.
- Show `discovered via ESPN` or similar provenance when applicable.
- Social posts can appear in Galaxy Focus, Beam Reading Dock, and Focus Card Carousel like any other link.

Validation target:

- Pasting an ESPN article adds a sports article card with source metadata.
- Pasting a Twitter/X status link adds a normalized social-post card.
- Pasting a `platform.twitter.com/embed/Tweet.html?...id=...` URL extracts the ID and stores a clean canonical X status URL.
- The original embed URL is retained only as `original_url` or evidence, not as the main canonical link.
- Existing feed sync, Searchlight, Beam, carousel, and future saved research galaxies continue to work.

## v2.3.19 Saved Research Galaxies

Goal: persist user-created research galaxies from Searchlight, Beam selections, and Galaxy Focus batches so the universe becomes a true research organization system.

Concept:

- Save current locked/beamed selections as a named research galaxy.
- Save current Searchlight result set as a named research galaxy.
- Save a Galaxy Focus batch or filtered galaxy set as a named research galaxy.
- User names saved galaxies, for example AI Safety, Cloudflare Workers, Robotics, Texas Oil, or WebAssembly.
- Saved research galaxies appear as first-class galaxy/group entries in the normal universe layout.
- Admin or organizer UI should allow rename, delete, add/remove nodes, and possibly duplicate/clone saved galaxies.

Suggested schema direction:

- `research_galaxies`
  - `id`
  - `name`
  - `description`
  - `created_at`
  - `updated_at`
- `research_galaxy_items`
  - `galaxy_id`
  - `link_id`
  - `position`
  - `note`
  - `created_at`

Likely endpoints:

- `POST /api/research-galaxies`
- `GET /api/research-galaxies`
- `GET /api/research-galaxies/:id`
- `PATCH /api/research-galaxies/:id`
- `DELETE /api/research-galaxies/:id`
- Optional membership endpoint for add/remove/reorder.

Important data rules:

- Keep original source group/source-family metadata intact.
- Saved research galaxies should not destroy provenance.
- One link should be allowed to belong to multiple saved research galaxies.
- Existing RSS/feed sync should not break saved research galaxies.
- D1 migrations must be explicit, reversible where possible, and committed with matching repo docs.

Validation target:

- Search results, Beam selections, and Galaxy Focus batches can be saved as named research galaxies.
- Saved galaxies persist across reloads and future syncs.
- Original link provenance is preserved.
- Saved galaxies can be loaded back into the reading dock or shown as first-class galaxies.

## v2.3.20 Social Embed and Sports Link Ingestion

Goal: add ESPN, X/Twitter posts, and later YouTube/Instagram/TikTok-style embeds through a normalized link-ingestion pipeline.

Why this matters:

- Real research sessions often start from sports/news pages, social embeds, or redirected embed iframes rather than clean article URLs.
- ESPN pages may contain embedded X/Twitter posts, Arena embeds, video cards, article links, and live-update modules.
- X/Twitter embed iframe URLs are not RSS feeds, but they can often be normalized into canonical social-post links by extracting the post ID.
- Link Lane should preserve where a link was discovered while storing a clean canonical URL for browsing and future research-galaxy saves.

Initial source types:

- ESPN article/page URLs.
- ESPN-discovered embed URLs.
- X/Twitter canonical URLs such as `x.com/{handle}/status/{id}` and `twitter.com/{handle}/status/{id}`.
- X/Twitter iframe URLs such as `platform.twitter.com/embed/Tweet.html?...id={tweet_id}`.
- Later: YouTube, Instagram, TikTok, Threads, Bluesky, and other public embed formats.

Normalizer behavior:

- Detect provider from hostname and path.
- Extract canonical ID when possible.
- Convert noisy embed URLs into clean canonical URLs.
- Store `provider`, `provider_id`, `source_url`, `canonical_url`, `discovered_from`, `content_type`, and available metadata.
- Preserve provenance, for example `discovered_from=espn.com` while the canonical item is an X/Twitter post.
- Avoid storing session IDs, widget IDs, iframe widths, consent parameters, or other temporary embed-frame noise.

Suggested content types:

- `article`
- `social_post`
- `video`
- `short_video`
- `sports_update`
- `embed`

Possible UI behavior:

- Add a paste/import path for a single URL.
- When a noisy embed URL is pasted, show the normalized canonical URL before save.
- Render social posts as source cards in the universe.
- Group ESPN content into a Sports or ESPN galaxy/source family.
- Allow X/Twitter posts discovered from ESPN to appear both under the social provider and under ESPN-discovered sports context.

Backend/data considerations:

- Prefer a normalization layer before insertion into the existing links table.
- Reuse existing Open Graph extraction where possible.
- Add optional fields only after reviewing the current D1 schema.
- Do not scrape private or access-controlled content.
- Treat public embeds as public link metadata only.
- Check platform terms before using any provider-specific API or aggressive fetch strategy.

Validation target:

- Pasting an ESPN article creates a readable ESPN node with title/image/source metadata.
- Pasting a `platform.twitter.com/embed/Tweet.html?...id=...` URL creates a clean X/Twitter social-post node.
- Pasting a normal `x.com/.../status/...` or `twitter.com/.../status/...` URL creates the same canonical node format.
- The node can be searched, aimed at, beamed, unfolded, viewed in the carousel, and later saved into research galaxies.
- No duplicate nodes are created when the same social post is encountered through multiple embed URLs.

## Current sequence recommendation

1. v2.3.18.9 Beam Focus Isolation.
2. v2.3.18.10 Galaxy Focus Mode.
3. v2.3.19 Saved Research Galaxies, spec-first, with D1/schema review before code.
4. v2.3.20 Social Embed and Sports Link Ingestion.
4. v2.3.20 Social Embed and Sports Link Ingestion for ESPN, X/Twitter, YouTube, Instagram, TikTok, and normalized embed URLs.

Roadmap note:

- v2.3.17 remains navigation-only.
- v2.3.18 is the temporary client-side research interaction layer.
- v2.3.18.9 and v2.3.18.10 should finish the temporary/non-persistent research UX.
- v2.3.19 is the first persistence phase and should not begin until the data model is approved.
- v2.3.20 adds normalized public social/sports/embed ingestion after the core research organization model is stable.
- v2.3.20 expands the ingestion pipeline so sports/social/embed links can become first-class Link Lane nodes.
