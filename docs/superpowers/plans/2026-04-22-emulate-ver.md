# Emulate Ver Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Create a `emulate-ver` branch that wraps the Pocket Scanner web app in Capacitor (runnable in iOS Simulator from Xcode), with AI chat proxied through a Supabase Edge Function so the MiniMax API key never ships in the app bundle.

**Architecture:** The Vite build output (`dist/`) is bundled into a Capacitor iOS shell. AI requests go from the app → Supabase Edge Function → MiniMax API, keeping the secret server-side.

**Tech Stack:** Capacitor 7, @capacitor/ios, Supabase Edge Functions (Deno), MiniMax API (OpenAI-compatible)

---

### Task 1: Create the branch

**Files:**
- No file changes — git only

- [ ] **Step 1: Create and checkout the new branch**

```bash
git checkout -b emulate-ver
```

Expected: `Switched to a new branch 'emulate-ver'`

- [ ] **Step 2: Verify branch**

```bash
git branch
```

Expected: `* emulate-ver` is active

---

### Task 2: Supabase Edge Function — ai-chat

**Files:**
- Create: `supabase/functions/ai-chat/index.ts`

- [ ] **Step 1: Create the directory**

```bash
mkdir -p supabase/functions/ai-chat
```

- [ ] **Step 2: Write the Edge Function**

Create `supabase/functions/ai-chat/index.ts`:

```ts
const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  try {
    const { messages, systemPrompt } = await req.json();

    const baseUrl = Deno.env.get('MINIMAX_BASE_URL') ?? 'https://api.minimaxi.com/v1';
    const model = Deno.env.get('MINIMAX_MODEL') ?? 'MiniMax-M2.7-highspeed';
    const apiKey = Deno.env.get('MINIMAX_API_KEY');

    if (!apiKey) throw new Error('MINIMAX_API_KEY not set');

    const res = await fetch(`${baseUrl}/chat/completions`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${apiKey}`,
      },
      body: JSON.stringify({
        model,
        max_tokens: 1024,
        messages: [
          { role: 'system', content: systemPrompt },
          ...messages,
        ],
      }),
    });

    if (!res.ok) {
      const text = await res.text();
      throw new Error(`MiniMax error (${res.status}): ${text}`);
    }

    const data = await res.json();
    const content = data?.choices?.[0]?.message?.content;
    if (!content) throw new Error('Empty response from MiniMax');

    return new Response(JSON.stringify({ content }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  } catch (err) {
    return new Response(JSON.stringify({ error: (err as Error).message }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});
```

- [ ] **Step 3: Commit**

```bash
git add supabase/functions/ai-chat/index.ts
git commit -m "feat: add ai-chat Supabase Edge Function"
```

---

### Task 3: Set Supabase secrets

> Do this in the Supabase dashboard: Project → Edge Functions → Manage secrets
> OR via Supabase CLI if installed.

- [ ] **Step 1: Set secrets in Supabase dashboard**

Go to your Supabase project → **Edge Functions** → **Secrets** and add:

| Key | Value |
|-----|-------|
| `MINIMAX_API_KEY` | your MiniMax API key |
| `MINIMAX_BASE_URL` | `https://api.minimaxi.com/v1` |
| `MINIMAX_MODEL` | `MiniMax-M2.7-highspeed` |

- [ ] **Step 2: Deploy the Edge Function**

In the Supabase dashboard → Edge Functions → Deploy `ai-chat`, OR if Supabase CLI is installed:

```bash
npx supabase functions deploy ai-chat
```

---

### Task 4: Update aiChat.ts to call Supabase Edge Function

**Files:**
- Modify: `src/utils/aiChat.ts`

- [ ] **Step 1: Rewrite aiChat.ts**

Replace the entire contents of `src/utils/aiChat.ts`:

```ts
const SUPABASE_URL = import.meta.env.VITE_SUPABASE_URL as string;
const SUPABASE_ANON_KEY = import.meta.env.VITE_SUPABASE_ANON_KEY as string;

export interface ChatMessage {
  role: 'user' | 'assistant';
  content: string;
}

export async function sendChatMessage(
  messages: ChatMessage[],
  systemPrompt: string,
): Promise<string> {
  const res = await fetch(`${SUPABASE_URL}/functions/v1/ai-chat`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${SUPABASE_ANON_KEY}`,
    },
    body: JSON.stringify({ messages, systemPrompt }),
  });

  if (!res.ok) {
    const text = await res.text().catch(() => res.statusText);
    throw new Error(`AI request failed (${res.status}): ${text}`);
  }

  const data = await res.json();
  const content = data?.content;
  if (!content) throw new Error('Empty response from AI');
  return content;
}
```

- [ ] **Step 2: Commit**

```bash
git add src/utils/aiChat.ts
git commit -m "feat: wire aiChat to Supabase Edge Function proxy"
```

---

### Task 5: Install Capacitor

**Files:**
- Modify: `package.json` (via npm install)
- Create: `capacitor.config.ts`

- [ ] **Step 1: Install Capacitor packages**

```bash
npm install @capacitor/core @capacitor/cli @capacitor/ios
```

- [ ] **Step 2: Create capacitor.config.ts**

Create `capacitor.config.ts` at the repo root:

```ts
import type { CapacitorConfig } from '@capacitor/cli';

const config: CapacitorConfig = {
  appId: 'com.pocketscanner.app',
  appName: 'Pocket Scanner',
  webDir: 'dist',
};

export default config;
```

- [ ] **Step 3: Commit**

```bash
git add capacitor.config.ts package.json package-lock.json
git commit -m "feat: add Capacitor config and iOS dependency"
```

---

### Task 6: Add iOS platform and build

**Files:**
- Create: `ios/` directory (generated by Capacitor)

- [ ] **Step 1: Add iOS platform**

```bash
npx cap add ios
```

Expected: Creates `ios/` directory with Xcode project.

- [ ] **Step 2: Build the web app**

```bash
npm run build
```

Expected: `dist/` directory created with production build.

- [ ] **Step 3: Sync web build into iOS**

```bash
npx cap sync ios
```

Expected: Copies `dist/` into the iOS project.

- [ ] **Step 4: Commit**

```bash
git add ios/ capacitor.config.ts
git commit -m "feat: add Capacitor iOS platform"
```

---

### Task 7: Run in iOS Simulator

> This is a manual step — no code changes needed.

- [ ] **Step 1: Open in Xcode**

```bash
npx cap open ios
```

Expected: Xcode opens `ios/App/App.xcworkspace`.

- [ ] **Step 2: Select simulator**

In Xcode toolbar, select a simulator (e.g. **iPhone 17 Pro**).

- [ ] **Step 3: Run**

Press **Cmd+R** or click the Play button.

Expected: App launches in iOS Simulator, all features work, AI chat calls Supabase Edge Function.

---

### Task 8: Add .gitignore entries for iOS build artifacts

**Files:**
- Modify: `.gitignore`

- [ ] **Step 1: Check current .gitignore**

```bash
cat .gitignore
```

- [ ] **Step 2: Add iOS build artifacts if not present**

Add to `.gitignore`:

```
# Capacitor iOS
ios/App/Pods/
ios/App/App.xcworkspace/xcuserdata/
ios/App/DerivedData/
```

- [ ] **Step 3: Commit**

```bash
git add .gitignore
git commit -m "chore: ignore Capacitor iOS build artifacts"
```
