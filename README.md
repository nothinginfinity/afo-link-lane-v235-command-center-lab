# AFO Link Lane v2.3.5 Command Center Lab

Independent lab clone for the `afo-link-lane` v2.3.5 Command Center overlay and control deck work.

Source:
- `nothinginfinity/repo-copilot`
- `apps/afo-link-lane/`
- source commit: `274ffd35e4e37f3e1f90c868f0bc21e0b57d3c56`

Lab isolation:
- Worker name: `afo-link-lane-v235-lab`
- D1 database: `afo-link-lane-v235-lab-db`
- R2 bucket: `afo-link-lane-v235-lab-content`

Safety rules:
- This repo is not the production `repo-copilot` app.
- Do not bind this lab to the production `afo-link-lane` Worker.
- Do not bind this lab to production D1/R2 resources.
- Keep deploy workflows absent or lab-only until the Command Center UI is verified.

Intended flow:
1. Build the slide-up visor and control deck in this lab repo.
2. Validate `worker.js` and embedded browser scripts.
3. Deploy only to the lab Worker.
4. Compare lab vs production.
5. Port the verified patch back to production with AFO gitZip Patcher.
