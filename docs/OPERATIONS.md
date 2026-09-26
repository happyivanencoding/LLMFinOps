# Operations and deployment

## Ownership

Application: `happyivanencoding/LLMFinOps`, owner checkout `C:\dev\LLMFinOps`.
Host infrastructure: separate `server-infra` repository. Do not reset its unrelated dirty owner checkout; use the isolated infrastructure branch/worktree.

Production URL: `https://finops.thegreatnovel.com`.
Independent Compose project: `llmfinops`. Public traffic uses its own Cloudflare Tunnel. The only host port is loopback `127.0.0.1:43911`.

Paths on the VPS:
- `/srv/apps/llmfinops/repo` — checked-out deployed source
- `/srv/apps/llmfinops/data` — monitoring SQLite and collection configuration
- `/etc/server-infra/secrets/llmfinops` — own administrator/ingestion credentials and connector token
- `/etc/server-infra/llmfinops-release.env` — immutable image references
- `/var/lib/server-infra/llmfinops-deployed-sha` — last successful deployment

Existing TGN/Onward data and existing provider-key files are mounted **read-only**. No candidate database, model routing, prompt or product file is rewritten by this stack.

The initial deployment generates a separate administrator password on the server in `/srv/apps/llmfinops/data/initial-login.txt`. Transfer that one-time login instruction privately to the owner. Do not post passwords in issues, source control or screenshots. Password changes remove the initial-login file and invalidate all sessions.

## Release

GitHub `.github/workflows/ci.yml` runs Node tests and production UI compilation. On the VPS, `llmfinops-update.timer` checks every five minutes for current main with a successful verification run, then invokes the same deployment script. It needs only public repository reads, not GitHub-stored server credentials.

```sh
sudo /srv/server-infra/scripts/llmfinops-deploy-root.sh status
sudo /srv/server-infra/scripts/llmfinops-deploy-root.sh <current-main-sha>
sudo systemctl status llmfinops-update.timer
sudo journalctl -u llmfinops-update.service -n 60
```

The deploy command rejects a SHA that is not current `origin/main`, backs up the monitoring database, builds/tests an image, configures missing accounts without overwriting existing administrator settings, waits for health, checks anonymous API denial, and starts the independent tunnel. A failed replacement restores the previous image reference when available.

A future revision must preserve the existing ledger schema or include an explicitly reviewed data migration. This initial version does not ship a generic migration framework.

## Backups

`llmfinops-backup.timer` runs daily at approximately 03:20 UTC. The script uses SQLite's Backup API and separately archives private configuration into `/srv/backups/llmfinops`, root-only permissions, 14-day retention. These are **same-server recovery copies, not off-site disaster recovery**.

```sh
sudo /srv/server-infra/scripts/llmfinops-backup.sh
sudo systemctl list-timers 'llmfinops-*'
```

Restore: stop this stack's web/tunnel only, preserve the current monitoring directory, restore a compatible database snapshot and its matching configuration, set ownership to UID/GID1000, then start this stack. Never restore monitoring snapshots over a source application's data. Never use `docker compose down -v` on shared production.

## Private bootstrap

`node scripts/configure.mjs <file>` accepts a JSON object with `accounts`, `collectors`, `pending` and optional `pricing`. Account key references are server paths, never plaintext values in repository templates. It creates absent accounts and collection config; it does not replace already configured keys or settings. Existing values can be changed through the authenticated interface.

A collector entry contains `id`, `name`, `kind`, `project`, `environment`, `path`, and `accounts` (provider-to-account-ID map). Kinds are `tgn-sqlite`, `onward-tasks`, and `jsonl`.

## Troubleshooting

Health up but no data: check Integrations source state and read-only mount paths. A missing source is not zero usage. A connected historical collector is not proof every provider attempt was captured upstream.

OpenAI billing unavailable: configure an Organization Admin key in Accounts. Do not replace a valid inference key with a guessed billing endpoint.

DeepSeek balance error: inspect the account's last sync status; no test inference is necessary. A successful balance refresh does not backfill missing per-call token history.

Dashboard errors: inspect only this container's logs and `/health` revision. Do not restart shared Runtime, source applications, or unrelated tunnels.

No webhook delivery: configure an HTTPS receiver and use the test action. Without a configured receiver, alerts remain in-app; no email or push delivery is claimed.

Desktop SDK callers should flush on graceful shutdown. Failed uploads remain in their local spool; do not delete it as a recovery step.
