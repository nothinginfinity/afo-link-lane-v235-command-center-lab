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

## Current sequence recommendation

1. v2.3.18.9 Beam Focus Isolation.
2. v2.3.18.10 Galaxy Focus Mode.
3. v2.3.19 Saved Research Galaxies, spec-first, with D1/schema review before code.

Roadmap note:

- v2.3.17 remains navigation-only.
- v2.3.18 is the temporary client-side research interaction layer.
- v2.3.18.9 and v2.3.18.10 should finish the temporary/non-persistent research UX.
- v2.3.19 is the first persistence phase and should not begin until the data model is approved.
