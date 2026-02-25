---
name: Bitbucket (REST API)
match: ["*"]
enabled: false
provider: bitbucket
---

# Bitbucket Integration — REST API 2.0

Bitbucket REST API connector is planned for a future release. When available, it will provide `git.*` step types for pull request management.

## Planned Step Types

| Step | Purpose |
|------|---------|
| `git.listPRs` | List pull requests |
| `git.getPR` | Get PR details by ID |
| `git.createPR` | Create a pull request |

## Current Status

This connector is not yet implemented. Use the **Browser** connector for Bitbucket access.

## Authentication

Will require `BITBUCKET_USERNAME` and `BITBUCKET_APP_PASSWORD` in Settings > Environment Variables. Create an app password at Bitbucket > Settings > App passwords.
