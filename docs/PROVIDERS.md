# Provider capabilities

Checked during the initial build on 2026-09-26. Provider docs and permissions can change; a configured model key is not automatically a billing administration key.

| Provider | Inference usage | Account information implemented |
| --- | --- | --- |
| OpenAI | Chat/Responses input/output/cache/reasoning | Organization Costs and completion Usage; **Admin key required**. No inferred prepaid balance. |
| DeepSeek | Chat/Responses input/output/cache | `GET /user/balance`, per-currency total/granted/top-up balance with an ordinary API key. |
| Gemini | usageMetadata; output includes reported thinking | Manual balance and normalized bill import. No BigQuery connector in 0.1. |
| MiMo | OpenAI-compatible usage | Manual balance and normalized bill import. Public balance endpoint not established in this build. |
| Jev | SystemOne input usage | Source costs or input-only price catalog, manual balance and bill import. Public credit API not established. |
| Codex | Explicitly imported reported usage | Subscription observations, no invented per-request cash expense; no whole-computer session scanner in 0.1. |

DeepSeek account sync is read-only and does not issue a paid inference. OpenAI uses the current month and paginates provider buckets. Financial totals are from Costs; Usage is a separate diagnostic dataset. Provider history outside the current sync window can be imported rather than guessed.

Source references:
- DeepSeek balance: https://api-docs.deepseek.com/api/get-user-balance/
- OpenAI Usage / Costs: https://developers.openai.com/api/reference/resources/admin/subresources/organization/subresources/usage
- OpenAI pricing: https://developers.openai.com/api/docs/pricing
- Gemini billing: https://ai.google.dev/gemini-api/docs/billing
- TypeSafe models/pricing: https://docs.typesafe.ai/models
- MiMo platform: https://platform.xiaomimimo.com/

The initial Jev catalog is input $0.042 per million, output free, effective only from its recorded verification date. Other imported costs remain their source project's estimates. Adding an OpenAI/DeepSeek/Gemini rate requires the correct model, context tier, service tier and billing assumptions; a single flat price is not a universal bill calculator.

A successful credential read does not prove that several API keys have separate billing balances. Label shared billing groups explicitly and do not total their balances together.
