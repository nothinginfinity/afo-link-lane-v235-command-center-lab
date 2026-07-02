# Workflow isolation

No deploy workflow is enabled in this lab repo yet.

When deployment is needed, add a lab-only workflow that deploys only:

- Worker script: `afo-link-lane-v235-lab`
- D1 database: `afo-link-lane-v235-lab-db`
- R2 bucket: `afo-link-lane-v235-lab-content`

Do not copy or enable a production deploy workflow from `repo-copilot` without first replacing production bindings and deployment targets.
