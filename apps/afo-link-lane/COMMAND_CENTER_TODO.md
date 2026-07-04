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

## v2.3.18 Search Galaxy Preview

Goal: introduce research organization as a temporary visual mode before adding persistent saved galaxies.

Concept:

- A Searchlight query can be converted into a temporary "Search Galaxy" or "Research Preview" cluster.
- Matched results pull into a temporary local formation while nonmatches remain ghosted or stay in the background universe.
- The user can browse the temporary cluster with Prev, Next, Fly, and the v2.3.17 waypoint layer.
- A clear Return to Universe action restores the normal spatial layout.

Possible controls:

- Cluster Results
- Return to Universe
- Refine Search
- Candidate Save as Galaxy button can be shown but should remain disabled or preview-only until v2.3.19.

Out of scope for v2.3.18:

- No permanent saved galaxy writes yet.
- No D1 schema changes unless the design is explicitly approved first.
- No automatic semantic clustering; this is still search-query driven.

Validation target:

- A search for AI, arXiv, Cloudflare, robotics, Texas oil, security, etc. can become a temporary research cluster.
- Returning to the main universe restores the original layout without losing search state.
- The preview makes it obvious whether saving the cluster would be useful.

## v2.3.19 Saved Research Galaxies

Goal: persist user-created research galaxies from search results so the universe becomes a research organization system, not just a browser.

Concept:

- Add Save as Galaxy after a Search Galaxy Preview feels useful.
- User names the saved galaxy, for example AI Safety, Cloudflare Workers, Robotics, Texas Oil, or WebAssembly.
- Matching links/nodes are assigned to that saved research galaxy.
- Saved research galaxies appear as first-class galaxy/group entries in the normal universe layout.
- Admin or organizer UI should allow rename, delete, add/remove nodes, and possibly duplicate/clone saved galaxies.

Likely backend work:

- Add D1 schema for saved research galaxies and memberships, or a carefully scoped equivalent if existing group fields are reused.
- Add endpoints for create, list, rename, delete, and membership updates.
- Keep original source group/source-family metadata intact so saved research galaxies do not destroy provenance.
- Consider allowing one link to belong to multiple saved research galaxies.

Validation target:

- Search results can be saved as a named research galaxy.
- Saved galaxies persist across reloads and future syncs.
- Existing feed/source grouping still works.
- Original link provenance is preserved while user organization becomes editable.

Roadmap note:

- v2.3.17 is navigation only.
- v2.3.18 is temporary search-cluster preview.
- v2.3.19 is persistent research-galaxy creation and management.
- Do not build v2.3.18 or v2.3.19 until v2.3.17 is manually tested and the persistent organization model is approved.
