# v2.3.5 Command Center Lab Notes

This lab repo exists to develop the Command Center overlay without touching the production v2.3.0 Worker.

## Build target

- Slide-up visor
- Control deck foundation
- Mobile-first cockpit UI experiments
- Safe lab-only deployment target

## Current base

The lab was cloned from the canonical `apps/afo-link-lane/` app in `nothinginfinity/repo-copilot` at source commit `274ffd35e4e37f3e1f90c868f0bc21e0b57d3c56`.

## Keep production safe

Do not port anything back to production until:

1. `node --check worker.js` passes.
2. Embedded browser script validation passes.
3. Mobile UI is tested hard.
4. Lab Worker is deployed and verified.
5. Production vs lab behavior is compared.
6. The verified patch is ported with AFO gitZip Patcher.
7. The production `worker.js` is re-stoned as v2.3.5 and linked `supersedes` to v2.3.0.
