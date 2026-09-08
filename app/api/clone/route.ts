import { NextRequest, NextResponse } from "next/server";
import { getServiceSupabase } from "@/lib/supabase";
import { cloneVoice } from "@/lib/elevenlabs";

export async function POST(req: NextRequest) {
  try {
    const token = req.headers.get("authorization")?.replace("Bearer ", "");
    if (!token) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    const sb = getServiceSupabase();
    const { data: userData } = await sb.auth.getUser(token);
    if (!userData?.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    const userId = userData.user.id;
    const cloneCost = Number(process.env.CLONE_CREDITS_COST || 80);

    const { data: profile } = await sb
      .from("profiles")
      .select("credits")
      .eq("id", userId)
      .single();

    const credits = Number(profile?.credits ?? 0);
    if (credits < cloneCost) {
      return NextResponse.json(
        { error: `Not enough credits. Cloning costs ${cloneCost} credits.` },
        { status: 402 }
      );
    }

    const form = await req.formData();
    const file = form.get("audio") as File | null;
    const name = String(form.get("name") || "My voice").slice(0, 80);
    if (!file) return NextResponse.json({ error: "Audio sample required" }, { status: 400 });

    const buffer = await file.arrayBuffer();
    if (buffer.byteLength < 1000) {
      return NextResponse.json(
        { error: "Sample too short. Record at least 30 seconds of clear speech." },
        { status: 400 }
      );
    }

    const { voice_id } = await cloneVoice({
      name: `${name} (${userId.slice(0, 6)})`,
      buffer,
      filename: file.name || "sample.mp3",
      contentType: file.type || "audio/mpeg"
    });

    // Store original sample so user can play back their clone
    let sampleUrl: string | null = null;
    const samplePath = `${userId}/samples/${voice_id}-${Date.now()}`;
    const { error: sampleUpErr } = await sb.storage
      .from("voice-audio")
      .upload(samplePath, buffer, {
        contentType: file.type || "audio/mpeg",
        upsert: true
      });
    if (!sampleUpErr) {
      const { data: pub } = sb.storage.from("voice-audio").getPublicUrl(samplePath);
      sampleUrl = pub?.publicUrl || null;
    }

    // Deduct clone cost
    await sb
      .from("profiles")
      .update({ credits: credits - cloneCost })
      .eq("id", userId);

    await sb.from("credit_transactions").insert({
      user_id: userId,
      amount: -cloneCost,
      kind: "voice_clone",
      reference: `clone_${voice_id}`,
      meta: { product: "geeny-voice", elevenlabs_voice_id: voice_id }
    });

    const { data: row, error } = await sb
      .from("user_voices")
      .insert({
        user_id: userId,
        elevenlabs_voice_id: voice_id,
        name,
        sample_url: sampleUrl
      })
      .select("id, name, elevenlabs_voice_id, sample_url, created_at")
      .single();

    if (error) throw error;

    return NextResponse.json({
      voice: row,
      credits_charged: cloneCost,
      credits_remaining: credits - cloneCost
    });
  } catch (e: any) {
    console.error("clone error", e);
    return NextResponse.json(
      { error: e?.message || "Clone failed" },
      { status: 500 }
    );
  }
}
