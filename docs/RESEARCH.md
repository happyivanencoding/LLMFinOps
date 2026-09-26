# Open-source research and implementation decisions

Research was requested before finalizing the platform. These are actual source files inspected, not just product-name recommendations. Review date: 2026-09-26. Runtime code is independently implemented; the following repositories are not runtime dependencies and no enterprise module was copied.

## LiteLLM

Repository: https://github.com/BerriAI/litellm

Inspected revision `115668f43ea5f6ed5ce47ad9de0db2df0bf96ff1`:
- `litellm/llms/deepseek/cost_calculator.py`
- `litellm/litellm_core_utils/llm_cost_calc/utils.py`

Useful ideas: normalize provider-specific usage before costing; cache-hit input is excluded from normal input pricing; model/provider rates and additional billable categories are distinct. The upstream implementation also handles more tiers, cache writes and context thresholds than this initial personal platform.

Applied here: one usage normalizer, cached input counted once, exact provider/model effective-dated rates, cost ranges when cache split is missing, and no guessed price for an unsupported model. We deliberately do not deploy the proxy or duplicate its provider routing stack.

License inspected: root MIT terms apply outside `enterprise/`; enterprise content has separate terms. No enterprise source imported.

## Langfuse

Repository: https://github.com/langfuse/langfuse

Inspected revision `66f6226131714eb73cc88c3ccc4b851cd7b63c89`:
- `web/src/features/trace-graph-view/buildStepData.ts`

Useful ideas: distinguish observations from their enclosing trace, preserve observed start/end timing, and account for parent-child constraints when presenting a graph.

Applied here: operation summaries plus individual observation inspection, explicit aggregate/call labels, and timing bars. We do not pretend that source imports with a shared operation timestamp prove concurrency. Full graph layout, prompt inspection and evaluation management are not implemented.

License inspected: MIT Expat outside `ee/`, `web/src/ee/`, `worker/src/ee/`; enterprise directories have separate terms. No source copied.

## Helicone

Repository: https://github.com/Helicone/helicone

Inspected revision `067d9290acb4f1fc9320e902fc67b4b399b50363`:
- `web/components/templates/sessions/SessionMetrics.tsx`

Useful ideas: session-level cost and duration views, model and project attribution alongside request-level logs, and making successful product operations visible rather than only counting tokens.

Applied here: project/feature cost pages, trace summaries, request filters, P50/P95, failed/fallback observations, and a compact multi-provider overview. A centralized gateway, request replay and full prompt storage are deliberately excluded.

License inspected: Apache-2.0. No code copied or distributed from that repository.

## ccusage

Repository: https://github.com/ccusage/ccusage

Inspected revision `bb366f34058ca1fabe2acbfc8d5d0da105691699`:
- `rust/adapters/codex/src/parser.rs`
- `apps/ccusage/LICENSE`

Useful ideas: cumulative token snapshots and replayed/forked session history require deduplication; a raw usage event is not necessarily incremental billable consumption.

Applied here: immutable observation IDs, imported aggregate granularity, no summing a parent's cost plus its already-counted children, and subscription usage kept separate from cash billing. We did not implement or claim a complete Codex rollout parser in this version. A future local session collector must compute deltas and avoid fork replay before it can be called accurate.

License inspected: MIT, copyright 2025 ryoppippi. No parser code copied.

## Why not deploy an entire upstream stack?

The current need is a single administrator viewing a few existing applications on an existing VPS. Most project transports already expose useful usage metadata. A Node/SQLite side-channel ledger avoids putting another service in the inference path, avoids new large database services, and leaves product prompts, retry policy and provider choice untouched.

The resulting differentiator is the combination of **provider balances + project/feature attribution + honest coverage + bilingual mobile access**. It is not a replacement for all capabilities of the upstream observability products.
