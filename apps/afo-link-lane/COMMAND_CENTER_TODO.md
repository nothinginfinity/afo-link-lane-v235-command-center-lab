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
