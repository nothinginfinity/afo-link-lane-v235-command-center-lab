# Lab binding safety checklist

Before deploying this lab Worker, confirm:

- `wrangler.jsonc` has `name: afo-link-lane-v235-lab`.
- D1 binding points to `afo-link-lane-v235-lab-db`.
- R2 binding points to `afo-link-lane-v235-lab-content`.
- No production deploy workflow is present.
- No production D1/R2 IDs are reintroduced.
- The live production Worker `afo-link-lane` remains untouched.

Current lab resources:

- Worker target: `afo-link-lane-v235-lab`
- D1 database UUID: `00b999a1-d637-45ee-9720-f90411cabb65`
- R2 bucket: `afo-link-lane-v235-lab-content`
