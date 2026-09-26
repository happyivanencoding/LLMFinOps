# Data and API contract

## Ingestion

`POST /api/v1/calls` uses `Authorization: Bearer <ingestion-token>`. It accepts either one observation or `{ "source": "my-app", "calls": [...] }` with at most 1,000 observations / 4 MB per request. The ingestion credential cannot read administrator data. Identical IDs are ignored on repeat delivery; the response includes `received`, `inserted`, and `duplicates`.

Required fields: a stable `id`, `project`, `provider`. Provide `model`, `started_at` (ISO timestamp), `account_id`, `feature`, `environment`, and `trace_id` for useful attribution. Supported providers: `openai`, `deepseek`, `gemini`, `mimo`, `jev`, `codex`, `other`.

```json
{
  "id": "stable-provider-call-id",
  "trace_id": "one-user-operation",
  "project": "onward",
  "environment": "production",
  "provider": "deepseek",
  "account_id": "deepseek-onward",
  "feature": "match-explanation",
  "model": "deepseek-flash",
  "requested_model": "deepseek-flash",
  "started_at": "2026-09-26T12:00:00Z",
  "duration_ms": 1500,
  "status": "success",
  "usage": {"prompt_tokens": 1000, "completion_tokens": 100, "prompt_cache_hit_tokens": 800},
  "scope": "call",
  "attempt": 1
}
```

The example is illustrative, not production data. Do not include prompts, responses, CVs or email content. Server persistence uses an explicit field allowlist.

`scope=call` is one actual provider attempt. `scope=operation` or `aggregate` represents a logical component whose internal requests may be unavailable. Do not upload both an operation's summed cost and the same child costs as separate billable records.

`usage` accepts OpenAI Chat/Responses, DeepSeek, Gemini and normalized camelCase fields. Missing values remain null. Cache/reasoning fields retain their subset semantics. The normalizer does not infer undocumented context-cache writes, tools, grounding fees, negotiated discounts or taxes.

Optional cost metadata: `estimated_cost`, or `cost_low`/`cost_high`, `cost_source`, `actual_cost`, `pricing_id`. Ingested monetary costs are USD. Account snapshots and provider bills separately support USD/EUR/CNY. Do not upload non-USD observation costs as USD.

Status: `success`, `failed`, `cancelled`, `timeout`, `running`; legacy `complete`/`completed` maps to success. Ingestion is an immutable terminal ledger, not an update stream: send a finished event once. A started event with the same ID would prevent a later terminal insert.

Retries: use distinct IDs, `attempt`, and `retry_of`. A fallback adds `fallback_from`. Do not count an SDK wrapper as a provider attempt when it hides multiple attempts.

`POST /api/v1/heartbeat` accepts an integration `id`, name, pending/dropped counts and total records, using the same write-only token.

## Administrator API

Login: `POST /api/login` with `username=admin` and password. Session is a 30-day opaque HttpOnly SameSite=Strict cookie, Secure over HTTPS. All following routes require that session. Same-origin browser writes only.

- `GET /api/overview`, `/api/calls`, `/api/calls/export`: `days` or `from`/`to`, plus project/provider/environment/model/status/account/feature and search `q`. Calls support page/limit and `fallback=1`.
- `GET /api/traces/:id`: operation summary and component observations.
- `GET/POST /api/accounts`, `POST /api/accounts/:id/sync`, `/snapshot`: account metadata, write-only credentials, explicit balance snapshots. `DELETE /api/accounts/:id` removes the account connection, saved credentials and account-level balance/billing state while retaining historical request observations.
- `GET /api/billing`: date/provider/account filters; statement amounts stay separate from observation estimates.
- `POST /api/billing/import`: `{rows:[{account_id,day,currency,amount,provider_project,line_item}]}`. Keys deduplicate statement lines; negative credit adjustments are accepted. Import normalized statements, not token estimates.
- `GET/POST /api/pricing`: exact provider/model match, USD-per-million rates, source URL, effective date. Duplicate effective versions are rejected.
- `GET/POST /api/budgets`, `DELETE /api/budgets/:id`: all/project/provider/account scope, daily/monthly, amount, threshold. Non-global budgets require a target.
- `GET /api/alerts`, `POST /api/alerts/:id/ack`: notification history and acknowledgement.
- `GET /api/integrations`, `POST /api/collect`, `POST /api/sync`: source health and immediate collection/account synchronization.
- `POST /api/import`: `{calls:[...]}` via the dashboard's administrator session.
- Settings: `/api/settings`, `/password`, `/ingest-token`, `/webhook`, `/webhook/test`.

`Accept-Language: en` localizes system messages; Chinese is supported. Account labels and source data are not machine-translated. CSV cells starting with spreadsheet formula characters are escaped.

## Source collection

Collectors are configured in private `FINOPS_DATA/collectors.json`. TGN uses SQLite read-only mode plus terminal-ID bookkeeping, so slow older operations finishing after newer ones are not missed. Onward visits only `*/mobile/tasks/*.json` and extracts known metrics, never stores candidate content. JSONL collectors deduplicate stable IDs. A source path is not proof it is deployed or complete: Integrations shows connection state and aggregate granularity.
