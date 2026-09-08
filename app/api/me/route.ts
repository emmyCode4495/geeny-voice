import { NextRequest, NextResponse } from "next/server";
import { getServiceSupabase } from "@/lib/supabase";

export async function GET(req: NextRequest) {
  try {
    const token = req.headers.get("authorization")?.replace("Bearer ", "");
    if (!token) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    const sb = getServiceSupabase();
    const { data: userData } = await sb.auth.getUser(token);
    if (!userData?.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    const userId = userData.user.id;

    // Ensure profile exists (shared with Studio)
    let { data: profile } = await sb
      .from("profiles")
      .select("credits, email")
      .eq("id", userId)
      .maybeSingle();

    if (!profile) {
      await sb.from("profiles").insert({
        id: userId,
        email: userData.user.email,
        credits: 20
      });
      profile = { credits: 20, email: userData.user.email };
    }

    const { data: voices } = await sb
      .from("user_voices")
      .select("id, name, elevenlabs_voice_id, sample_url, created_at")
      .eq("user_id", userId)
      .order("created_at", { ascending: false });

    const { data: jobs } = await sb
      .from("voice_jobs")
      .select("id, title, status, audio_url, chars_count, credits_charged, created_at, error_message")
      .eq("user_id", userId)
      .order("created_at", { ascending: false })
      .limit(20);

    return NextResponse.json({
      credits: Number(profile?.credits ?? 0),
      voices: voices || [],
      jobs: jobs || []
    });
  } catch (e: any) {
    return NextResponse.json({ error: e?.message || "Failed" }, { status: 500 });
  }
}
