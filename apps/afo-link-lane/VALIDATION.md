# Lab validation checklist

Run from `apps/afo-link-lane/`:

```sh
npm install
npm run check
```

Before any lab deploy:

- Confirm `wrangler.jsonc` targets `afo-link-lane-v235-lab`.
- Confirm D1 target is `afo-link-lane-v235-lab-db`.
- Confirm R2 target is `afo-link-lane-v235-lab-content`.
- Confirm no production deploy workflow is active.

Before porting back to production:

- Validate `worker.js` syntax.
- Validate extracted embedded browser script.
- Test mobile visor/control deck gestures.
- Compare production v2.3.0 and lab v2.3.5 behavior.
- Port only the verified diff with AFO gitZip Patcher.
