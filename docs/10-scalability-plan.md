# 10. Scalability Plan — Target: 100,000+ Users

## 10.1 What Actually Gets Stressed at Scale

For a fitness-tracking + coaching platform, the bottlenecks in order of likely impact are:

1. **Video bandwidth** (every user watches exercise demos frequently)
2. **Write-heavy logging tables** (workout logs, habit logs, water logs — every active user writes many small rows daily)
3. **Read-heavy aggregate views** (leaderboard, admin analytics, progress charts)
4. **AI inference cost & latency** (Claude API calls)
5. **Realtime fan-out** (chat, leaderboard updates)

Compute (Edge Functions, Next.js) is the *least* of the concerns — both scale horizontally and automatically on their respective platforms (Deno Deploy under Supabase Edge Functions, Vercel serverless/edge for Next.js) without capacity planning from us.

## 10.1a Module (Bounded-Context) Independence

The package-per-bounded-context split in [`docs/13-ddd-architecture.md`](13-ddd-architecture.md) is what makes "every module independently scalable" concrete rather than aspirational: each of `packages/identity`, `packages/training`, `packages/nutrition`, `packages/tracking`, `packages/billing`, `packages/notifications`, and `packages/ai` owns its own domain/application/infrastructure, with cross-context communication only through the `domain_events` table (never a direct import of another context's internals). Practically, this means:

- **Notifications** (the most likely candidate for its own scaling profile — bursty fan-out, e.g. "1,000 users hit a streak milestone today") can be extracted into its own worker/queue-consuming service later without any other context's code changing, because its Edge Function already only talks to `domain_events`/`push_tokens`/`notifications`, not to another context's tables directly.
- **AI** can be scaled/rate-limited/cost-capped independently of the rest of the platform, since every other context depends on it only through a port interface (`AIWorkoutRecommendationPort`, etc.) — swapping the underlying provider or adding a queue in front of it touches `packages/ai/infrastructure` alone.
- A context's database tables can be moved to a dedicated read replica or (in the extreme) a separate schema/database without breaking application code, since nothing outside that context's `infrastructure/` layer knows the table shape exists — only the repository port's interface is a public contract.

This is deliberately not implemented as literal separate services on day one (that would be premature for the current scale) — it's a codebase structure that keeps the *option* open and cheap, which is the actual engineering value of the split.

## 10.2 Database Scaling

- **Connection pooling**: use Supabase's built-in Supavisor pooler (transaction mode) for all Edge Function / serverless connections — serverless functions open/close connections per invocation, and Postgres has a hard connection ceiling, so pooling is not optional past a few hundred concurrent users.
- **Read replicas**: Supabase supports read replicas on higher tiers; route read-heavy, latency-tolerant queries (admin analytics, leaderboard recompute, reporting) to a replica, keeping the primary free for user-facing writes.
- **Indexing**: covered per-table in [Database Schema §4.4](04-database-schema.md#44-indexing-notes); revisited every phase using `pg_stat_statements` to find actual slow queries rather than guessing.
- **Partitioning**: `workout_logs`, `habit_logs`, `water_logs`, `weight_logs`, `notifications`, and `ai_coach_messages` are the tables that grow unbounded with user activity. Plan: range-partition by month (`created_at`) once any of these exceeds ~50M rows, keeping recent-partition queries fast and enabling cheap archival of old partitions. Not implemented on day one — Postgres handles tens of millions of rows in a single table fine; partitioning is a scale-triggered migration, not a launch requirement.
- **Materialized views**: `leaderboard_weekly` (and similar aggregates) are materialized and refreshed on a schedule (`pg_cron`, every few minutes) rather than computed live per request — turns an expensive join+aggregate into a fast indexed read.

## 10.3 Read-Heavy Endpoints

| Endpoint/query | Strategy at scale |
|---|---|
| Leaderboard | Materialized view, refreshed on a schedule; cached in Upstash Redis with short TTL for the hottest (global weekly) leaderboard |
| Exercise library browse/search | `pg_trgm` index; library is small relative to user data (thousands, not millions, of rows) so this stays cheap indefinitely |
| Progress charts (weight/body-fat over time) | Queried per-user with a tight composite index (`profile_id, logged_at`) — naturally bounded (one user's own history), doesn't get slower as the *platform* grows, only as an individual user's history grows (which is self-limiting) |
| Admin revenue/analytics dashboard | Read replica + materialized daily rollups (`daily_revenue_summary`, `daily_active_users`) computed by a nightly job rather than aggregating raw `payments`/`workout_logs` live |

## 10.4 Caching & Rate Limiting

- **Upstash Redis** (serverless, scales with request volume, no capacity planning needed): leaderboard cache, AI-endpoint rate limiting, idempotency-key storage for webhooks/checkout.
- **CDN caching**: exercise videos and images are the highest-bandwidth, most cacheable assets in the system — Cloudflare's edge network caches them close to users globally, so the origin (R2/Stream) serves each unique asset once per edge location, not once per view.

## 10.5 Video Delivery at Scale

- Cloudflare Stream's adaptive bitrate means a user on gym wifi gets a lower-bitrate stream automatically — reduces both buffering complaints and aggregate bandwidth.
- R2's zero egress fee is specifically why it was chosen over S3 for this workload: at 100k users regularly watching exercise demos, egress is the dominant line item on a traditional object-storage bill, and R2 removes it entirely.

## 10.6 AI Cost & Latency Management

- Model tiering (fast/cheap for high-volume simple tasks, strongest model reserved for structured plan generation — see [API Architecture §5.6](05-api-architecture.md#56-ai-endpoints)) is the primary lever, since AI cost scales linearly with usage unlike most of this stack.
- Aggressive per-user rate limits on AI endpoints, tuned by subscription tier (Elite gets a higher ceiling than Plus).
- Cache/reuse: motivational messages and common nutrition suggestions are templated with light AI personalization rather than a full generation call every single time, where quality permits.
- All AI spend is tracked per-request (`ai_coach_messages.metadata` stores token counts) so unit economics (AI cost per paying user) are visible in the revenue dashboard, not discovered via a surprise bill.

## 10.7 Realtime & Notifications

- Supabase Realtime (logical replication-based) scales to many concurrent subscriptions; chat and leaderboard channels are scoped narrowly (a chat channel per conversation, not a global firehose) so no client receives updates it doesn't need.
- Push notification fan-out (e.g. "1000 users hit a streak milestone today") is processed via the Postgres-native queue (`pgmq`) in batches rather than one Edge Function invocation per user, to avoid FCM rate-limit issues and keep the notification pipeline itself horizontally scalable.

## 10.8 Load Testing Plan (Phase 5)

- Synthetic load tests (k6 or Artillery) targeting: peak concurrent workout-session starts (morning/evening usage spikes are expected for a fitness app), leaderboard read throughput, AI endpoint burst behavior under rate limiting.
- Target: p95 API latency < 300ms for CRUD-style requests, < 3s for AI-generation requests (async/streamed, so perceived latency is softened by UI), sustained at a simulated 100,000 monthly active / ~5,000 concurrent peak user load.
- Results feed back into the indexing/partitioning/caching decisions above — this plan is deliberately "scale when the data says to," not speculative over-engineering on day one.

## 10.9 Summary: What We Do Now vs. What We Do When Triggered

| Do at launch (Phase 0–1) | Do when a real metric triggers it (Phase 5+) |
|---|---|
| Connection pooling (Supavisor) | Table partitioning |
| Correct indexes per query pattern | Read replicas |
| CDN for all media | Redis caching beyond leaderboard/rate-limit |
| Materialized leaderboard view | Sharding (not expected to be needed at 100k users on Postgres) |
| Model tiering for AI | Custom queue broker beyond `pgmq`/Upstash |

This keeps Phase 0–1 lean while ensuring nothing chosen now blocks the scale path — every "later" item above is an additive change (new index, new replica, new partition) rather than a rearchitecture.
