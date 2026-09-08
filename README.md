# Geeny Voice

Independent app: **record / upload your voice once → generate ad voiceovers from any script.**

- Separate codebase from Geeny Studio  
- Same Supabase project (shared auth + `profiles.credits` wallet)  
- ElevenLabs for clone + TTS  
- Paystack + NowPayments for credit packs  

## Setup

```bash
cd geeny-voice
cp .env.example .env.local
# fill keys — use NEXT_PUBLIC_APP_URL=http://localhost:3001
npm install
npm run dev -- -p 3001
```

### Supabase

1. Use the **same** project as Geeny Studio.  
2. Run `supabase-schema.sql` (adds `user_voices`, `voice_jobs`).  
3. Storage → create bucket **`voice-audio`** (public read).  

### Env

- `ELEVENLABS_API_KEY`  
- Same `NEXT_PUBLIC_SUPABASE_*` and `SUPABASE_SERVICE_ROLE_KEY` as Studio  
- Paystack / NowPayments keys  
- Webhooks:  
  - `https://YOUR_VOICE_DOMAIN/api/webhooks/paystack`  
  - `https://YOUR_VOICE_DOMAIN/api/webhooks/nowpayments`  

## Credits

| Action | Default |
|--------|---------|
| Clone voice | `CLONE_CREDITS_COST` (80) |
| Generate | `CREDITS_PER_1K_CHARS` (10 per 1000 characters) |

Balance lives on shared `profiles.credits`.
