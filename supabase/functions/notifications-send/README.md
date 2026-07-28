# Edge Function: `notifications-send`

**Phase:** 1 · **Auth:** internal (service role — invoked by DB triggers / `pg_cron`, not directly by clients) · **Method:** POST

Fans out a push notification to one or more `push_tokens` via Firebase Cloud Messaging, and writes a corresponding `notifications` row per recipient for in-app notification-center display.

## Request
```json
{
  "profileIds": ["uuid", "..."],
  "type": "workout_reminder | streak_milestone | trainer_message | payment_failed",
  "title": "string",
  "body": "string",
  "data": { "deepLink": "9thround://workout/uuid" }
}
```

Batches sends (see `docs/10-scalability-plan.md §10.7`) rather than one FCM call per user.

Not yet implemented — this file documents the contract only.
