# LLMFinOps

**Your AI spend, in focus. / 每一次调用，都清晰可见。**

A private, self-hosted web workspace for model usage, account balances, project costs, traces and budgets. Chinese and English, light and dark, desktop and mobile.

这是一个私人 LLM 账本与监控平台，而不是模型网关。模型请求继续走原有供应商；平台只读已有元数据，或接收旁路 SDK 上报。遥测服务不可用不会改变业务模型的请求、输出或重试。

## Included in 0.1

| Workspace | Capabilities |
| --- | --- |
| Overview / 总览 | Observed cost trends, token breakdown, cache coverage, P50/P95, provider/project distribution, recent activity |
| Accounts / 账户 | Multiple provider accounts, DeepSeek balance sync, manual balance history, billing-group labels, estimated runway, write-only credentials |
| Projects / 项目 | Project and feature-level spend, usage, success rates and latency |
| Requests / 调用 | Date/provider/project/environment/status filters, search, pagination, CSV export, fallback filtering |
| Traces / 调用链 | Operation summary, individual observations, timing bars, token/cache/reasoning details, request IDs, error and fallback metadata |
| Models / 模型 | Model performance and effective-dated pricing; source URL required; historical estimates stay immutable |
| Billing / 账单 | OpenAI organization Costs/Usage integration, JSON/CSV statement import, currencies kept separate, negative credit adjustments |
| Budgets / 预算 | Daily/monthly soft budgets by project/provider/account/all usage; thresholds and acknowledgement |
| Alerts / 提醒 | Budget, low-balance and runway alerts; optional generic HTTPS webhook |
| Integrations / 接入 | Read-only TGN SQLite and Onward task collectors, JSONL, bulk import, dependency-free Node SDK with durable local buffering |
| Settings / 设置 | Chinese/English, light/dark/system theme, password change, ingestion credentials, webhook settings |

All numbers shown in the workspace come from collected records or explicit manual entries. There is no demo-data fallback in the running product.

## Accounting boundaries

- **Estimated spend, account balance and provider bills are different datasets.** Never sum them together.
- An unknown token count or price is `null`, not invented zero. Totals include known values and expose coverage.
- Cached input is a subset of input; OpenAI reasoning is a subset of output. Gemini thinking is normalized according to its returned fields. These are not added to total twice.
- Imported project estimates retain their source. A new catalog rate does not rewrite past charges.
- Historical TGN/Onward records are marked **operation aggregates**. Inner retries, missing failures and provider charges cannot be reconstructed when the original project did not save them.
- Several API keys can share one billing account. Balances are not summed across cards or currencies.
- Codex/ChatGPT subscription observations remain separate from metered API costs. Subscription activity is not labeled free.
- Local dates use `Europe/Paris`; OpenAI billing buckets use UTC. Differences are not automatically classified as missing requests.
- Runway is based on the observed seven-day upper cost estimate. Unconnected usage, new top-ups and changing rates can alter it.

More: [data and API contract](docs/API.md), [provider support](docs/PROVIDERS.md), [operations](docs/OPERATIONS.md), [open-source research](docs/RESEARCH.md).

## Run locally

Requires **Node.js 24+**. SQLite is provided by Node; no separate database service is required.

```sh
npm ci
npm test
npm run build
npm start
```

Open `http://127.0.0.1:43911`. On the first start the service creates a random administrator password in `.local/initial-login.txt`; username is `admin`. Keep that file private. Changing the password invalidates all existing sessions.

For UI development, run `npm start` and `npm run dev` in separate terminals. Vite serves on `127.0.0.1:43910` and proxies the local API.

Configuration is read from environment variables, not automatically from an `.env` file:

| Variable | Default |
| --- | --- |
| `HOST` | `127.0.0.1` |
| `PORT` | `43911` |
| `FINOPS_DATA` | `.local` |
| `FINOPS_SECRETS_DIR` | Same as data directory |
| `FINOPS_INITIAL_PASSWORD` | Random, first start only |
| `FINOPS_REVISION` | `local` |

`npm run setup` is the owner's Windows bootstrap: it registers known projects and references existing key files without printing their contents. For another installation use the Accounts interface or `node scripts/configure.mjs /private/bootstrap.json`; see the operations guide.

## Side-channel SDK

Copy `sdk/telemetry.mjs` into the application. No model-provider dependency is required.

```js
import { createTelemetry } from './telemetry.mjs';

const telemetry = createTelemetry({
  url: process.env.FINOPS_URL,
  token: process.env.FINOPS_INGEST_TOKEN,
  project: 'my-app',
  environment: 'production',
  spoolDir: './.private/finops-spool',
  accountIds: { deepseek: 'deepseek-onward' },
});

const result = await telemetry.track(
  { provider: 'deepseek', model: 'deepseek-flash', feature: 'explanation' },
  () => existingModelCall(),
);

// Await this when shutting down a short-lived script.
await telemetry.close();
```

Use `telemetry.trace()` around a multi-call operation. Tag each real retry separately with `attempt`/`retry_of`; tag the actual fallback with `fallback_from`. The SDK does not implement retries itself. For streams, call `record()` with the provider's terminal usage after consumption. Missing final usage stays unknown.

The SDK stores metadata in a private local spool, uploads batches every five seconds, and keeps unsent entries after a network failure. An abrupt process exit before the asynchronous local write completes can still lose the newest event; call `close()` during graceful shutdown. Server deduplication prevents acknowledged-but-retried batches from charging twice.

## Remote deployment

The production deployment is an independent Docker Compose stack behind HTTPS Cloudflare Tunnel. Application code lives here; host Compose, backup and release services belong to the separate `server-infra` repository. Provider credentials may be mounted read-only; administrator configuration belongs in a separate private writable directory.

The release watcher checks public GitHub verification results every five minutes and deploys only a successful **current `main`** revision. It does not store a server-administration key in this public repository or use a coding agent. Manual releases use the same root deployment script.

Do not expose the database or run an unauthenticated dashboard on a public interface. The supplied service requires authentication for all financial data; the ingestion credential is write-only.

## Verification

`npm test` checks accounting, deduplication, authentication, provider normalization, late-completing history imports and SDK isolation. `npm run build` compiles the complete UI. `node scripts/qa-browser.mjs` runs a separate synthetic, temporary database through real Chromium desktop/mobile, language/theme, form, trace and export interactions; the synthetic data is not placed in the production ledger.

## Current limitations

The initial automatic project collectors cover the explicitly configured TGN and Onward sources, not all software running on the machine. Other connectors show **not connected** until instrumented. OpenAI bills require an Organization Admin key. Gemini, MiMo and Jev balances use explicitly labeled manual snapshots unless a supported account integration is added; invoices can be imported. This version does not auto-top-up, auto-switch models, block production on budget overruns, capture prompts, or reconstruct unavailable provider history.

## Research and licensing

The design was informed by LiteLLM, Langfuse, Helicone and ccusage, with source files and license boundaries reviewed. The runtime is independently implemented, not a fork of those products, and contains no copied enterprise modules. See [the research notes](docs/RESEARCH.md). Dependency licenses remain those supplied by each package.
