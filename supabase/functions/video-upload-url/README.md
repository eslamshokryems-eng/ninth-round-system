# Edge Function: `video-upload-url`

**Phase:** 1 · **Auth:** trainer or admin · **Method:** POST

Requests a Cloudflare Stream direct-creator-upload URL so the browser/app uploads video straight to Cloudflare (never through our own server).

## Request
```json
{ "exerciseId": "uuid | null" }
```

## Response
```json
{ "data": { "uploadUrl": "https://upload.videodelivery.net/...", "streamVideoId": "..." }, "error": null }
```
Caller's client subsequently `PATCH`es `exercises.video_id = streamVideoId` with `video_status = 'processing'`; the `cloudflare-stream-webhook` function flips it to `ready` once encoding finishes.

Not yet implemented — this file documents the contract only.
