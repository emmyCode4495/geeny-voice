const BASE = "https://api.elevenlabs.io/v1";

function headers(json = true): Record<string, string> {
  const key = process.env.ELEVENLABS_API_KEY;
  if (!key) throw new Error("ELEVENLABS_API_KEY is not set");
  const h: Record<string, string> = { "xi-api-key": key };
  if (json) h["Content-Type"] = "application/json";
  return h;
}

function errMsg(json: unknown, fallback: string): string {
  if (json == null) return fallback;
  if (typeof json === "string") return json;
  if (typeof json === "object") {
    const o = json as Record<string, unknown>;
    if (typeof o.detail === "string") return o.detail;
    if (Array.isArray(o.detail)) {
      try {
        return o.detail
          .map((d: any) => d?.msg || d?.message || JSON.stringify(d))
          .join("; ");
      } catch {
        /* fall */
      }
    }
    if (typeof o.message === "string") return o.message;
    try {
      return JSON.stringify(json);
    } catch {
      /* fall */
    }
  }
  return fallback;
}

/** Instant voice clone from audio buffer */
export async function cloneVoice(opts: {
  name: string;
  buffer: ArrayBuffer;
  filename: string;
  contentType: string;
}): Promise<{ voice_id: string }> {
  const form = new FormData();
  form.append("name", opts.name);
  form.append(
    "files",
    new Blob([opts.buffer], { type: opts.contentType || "audio/mpeg" }),
    opts.filename || "sample.mp3"
  );
  // Remove background noise when possible
  form.append("remove_background_noise", "true");

  const res = await fetch(`${BASE}/voices/add`, {
    method: "POST",
    headers: { "xi-api-key": process.env.ELEVENLABS_API_KEY! },
    body: form
  });
  const json = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(errMsg(json, "Voice clone failed"));
  const voiceId = (json as any).voice_id;
  if (!voiceId) throw new Error("No voice_id returned from ElevenLabs");
  return { voice_id: voiceId };
}

/** List premade voices (for users who skip clone) */
export async function listPremadeVoices(): Promise<
  Array<{ voice_id: string; name: string; category?: string; preview_url?: string | null }>
> {
  const res = await fetch(`${BASE}/voices`, { headers: headers(false) });
  const json = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(errMsg(json, "Failed to list voices"));
  const voices = (json as any).voices || [];
  return voices.slice(0, 40).map((v: any) => ({
    voice_id: v.voice_id,
    name: v.name,
    category: v.category,
    preview_url: v.preview_url || null
  }));
}

/** Text-to-speech → returns audio ArrayBuffer */
export async function textToSpeech(opts: {
  voiceId: string;
  text: string;
  modelId?: string;
}): Promise<ArrayBuffer> {
  const res = await fetch(`${BASE}/text-to-speech/${opts.voiceId}`, {
    method: "POST",
    headers: headers(true),
    body: JSON.stringify({
      text: opts.text,
      model_id: opts.modelId || "eleven_multilingual_v2",
      voice_settings: {
        stability: 0.5,
        similarity_boost: 0.75
      }
    })
  });
  if (!res.ok) {
    const json = await res.json().catch(() => ({}));
    throw new Error(errMsg(json, "Text-to-speech failed"));
  }
  return await res.arrayBuffer();
}

export function estimateCreditsForScript(script: string): number {
  const chars = script.trim().length;
  const per1k = Number(process.env.CREDITS_PER_1K_CHARS || 10);
  return Math.max(1, Math.ceil((chars / 1000) * per1k));
}
