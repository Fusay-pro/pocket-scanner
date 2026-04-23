# Emulate Ver — Capacitor + Supabase AI Proxy

**Date:** 2026-04-22
**Status:** Approved

---

## Overview

Create a new git branch `emulate-ver` that wraps the existing Pocket Scanner web app in Capacitor so it can be run natively in the iOS Simulator from Xcode. The AI chat feature is wired through a Supabase Edge Function proxy so the MiniMax API key never ships in the app bundle.

---

## Architecture

```
iOS App (Capacitor shell)
  └── Vite build (www/)
        └── aiChat.ts → POST https://<supabase>/functions/v1/ai-chat
                              └── Supabase Edge Function
                                    └── MiniMax API (key stored as Supabase secret)
```

---

## Part 1 — Supabase Edge Function

**Function name:** `ai-chat`
**File:** `supabase/functions/ai-chat/index.ts`

- Accepts `POST` with JSON body `{ messages, systemPrompt }`
- Reads `MINIMAX_API_KEY`, `MINIMAX_BASE_URL`, `MINIMAX_MODEL` from Supabase secrets
- Forwards request to MiniMax `/chat/completions` with `Authorization: Bearer` header
- Returns `{ content: string }` to the caller
- CORS headers set to allow requests from any origin (needed for Capacitor)

**Secrets to set in Supabase dashboard:**
- `MINIMAX_API_KEY`
- `MINIMAX_BASE_URL` (e.g. `https://api.minimaxi.com/v1`)
- `MINIMAX_MODEL` (e.g. `MiniMax-M2.7-highspeed`)

---

## Part 2 — aiChat.ts update

- Remove all `VITE_AI_*` env vars
- Call `${VITE_SUPABASE_URL}/functions/v1/ai-chat` with Supabase anon key in `Authorization: Bearer` header
- Parse response as `{ content: string }`

---

## Part 3 — Capacitor Setup

**Packages:** `@capacitor/core`, `@capacitor/cli`, `@capacitor/ios`

**Config:** `capacitor.config.ts` at repo root
- `appId`: `com.pocketscanner.app`
- `appName`: `Pocket Scanner`
- `webDir`: `dist`
- `server.url`: leave unset (uses bundled build)

**Steps:**
1. `npm install @capacitor/core @capacitor/cli @capacitor/ios`
2. `npx cap init`
3. `npx cap add ios`
4. `npm run build && npx cap sync`
5. Open `ios/App/App.xcworkspace` in Xcode → run on simulator

**Branch:** `emulate-ver` — created from `master`, not deployed to Vercel.

---

## What stays the same

- All existing features unchanged
- Supabase auth, products, sales — all work via HTTPS already
- `.env.local` keeps `VITE_SUPABASE_URL` and `VITE_SUPABASE_ANON_KEY`

---

## Out of scope

- Android support
- App Store submission
- Push notifications
- Camera/barcode native plugins (scan still works via browser camera API in WKWebView)
