import { NextRequest, NextResponse } from "next/server";
import { getServiceSupabase } from "@/lib/supabase";
import { estimateCreditsForScript, textToSpeech } from "@/lib/elevenlabs";

export async function POST(req: NextRequest) {
  try {
    const token = req.headers.get("authorization")?.replace("Bearer ", "");
    if (!token) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    const sb = getServiceSupabase();
    const { data: userData } = await sb.auth.getUser(token);
    if (!userData?.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    const userId = userData.user.id;
    const body = await req.json().catch(() => ({}));
    const script = String(body.script || "").trim();
    const title = String(body.title || "Voiceover").slice(0, 120);
    const userVoiceId = body.user_voice_id as string | undefined;
    const premadeVoiceId = body.voice_id as string | undefined;

    if (!script) {
      return NextResponse.json({ error: "Script is required" }, { status: 400 });
    }
    if (script.length > 5000) {
      return NextResponse.json(
        { error: "Script too long (max 5000 characters for MVP)" },
        { status: 400 }
      );
    }

    let elevenVoiceId: string | null = null;
    let linkedUserVoice: string | null = null;

    if (userVoiceId) {
      const { data: uv } = await sb
        .from("user_voices")
        .select("id, elevenlabs_voice_id")
        .eq("id", userVoiceId)
        .eq("user_id", userId)
        .maybeSingle();
      if (!uv) {
        return NextResponse.json({ error: "Voice not found" }, { status: 404 });
      }
      elevenVoiceId = uv.elevenlabs_voice_id;
      linkedUserVoice = uv.id;
    } else if (premadeVoiceId) {
      elevenVoiceId = premadeVoiceId;
    } else {
      return NextResponse.json(
        { error: "Select your cloned voice or a stock voice" },
        { status: 400 }
      );
    }

    const need = estimateCreditsForScript(script);
    const minStart = Number(process.env.MIN_CREDITS_TO_GENERATE || 5);

    const { data: profile } = await sb
      .from("profiles")
      .select("credits")
      .eq("id", userId)
      .single();

    const credits = Number(profile?.credits ?? 0);
    if (credits < Math.max(need, minStart)) {
      return NextResponse.json(
        { error: `Not enough credits. Need ~${need}, you have ${credits}.` },
        { status: 402 }
      );
    }

    // Create job
    const { data: job, error: jobErr } = await sb
      .from("voice_jobs")
      .insert({
        user_id: userId,
        user_voice_id: linkedUserVoice,
        title,
        script,
        status: "processing",
        chars_count: script.length,
        credits_reserved: need
      })
      .select("id")
      .single();

    if (jobErr || !job) throw jobErr || new Error("Failed to create job");

    try {
      const audio = await textToSpeech({
        voiceId: elevenVoiceId!,
        text: script
      });

      // Upload to Supabase storage bucket "voice-audio"
      const path = `${userId}/${job.id}.mp3`;
      const { error: upErr } = await sb.storage
        .from("voice-audio")
        .upload(path, audio, {
          contentType: "audio/mpeg",
          upsert: true
        });

      let audioUrl: string | null = null;
      if (!upErr) {
        const { data: pub } = sb.storage.from("voice-audio").getPublicUrl(path);
        audioUrl = pub?.publicUrl || null;
      }

      // If storage fails, still try data URL fallback is too large — require bucket
      if (!audioUrl) {
        // Store as signed path attempt
        throw new Error(
          upErr?.message ||
            "Audio storage failed. Create a public Supabase bucket named voice-audio."
        );
      }

      const newBal = credits - need;
      await sb.from("profiles").update({ credits: newBal }).eq("id", userId);
      await sb.from("credit_transactions").insert({
        user_id: userId,
        amount: -need,
        kind: "voice_generate",
        reference: job.id,
        meta: { product: "geeny-voice", chars: script.length }
      });

      await sb
        .from("voice_jobs")
        .update({
          status: "completed",
          audio_url: audioUrl,
          credits_charged: need,
          updated_at: new Date().toISOString()
        })
        .eq("id", job.id);

      return NextResponse.json({
        job_id: job.id,
        status: "completed",
        audio_url: audioUrl,
        credits_charged: need,
        credits_remaining: newBal
      });
    } catch (genErr: any) {
      await sb
        .from("voice_jobs")
        .update({
          status: "failed",
          error_message: genErr?.message || "Generation failed",
          updated_at: new Date().toISOString()
        })
        .eq("id", job.id);
      throw genErr;
    }
  } catch (e: any) {
    console.error("generate error", e);
    return NextResponse.json(
      { error: e?.message || "Generate failed" },
      { status: 500 }
    );
  }
}
