import { NextRequest, NextResponse } from "next/server";
import { getServiceSupabase } from "@/lib/supabase";
import { writeFile, mkdir, unlink } from "fs/promises";
import { join } from "path";
import { tmpdir } from "os";
import { randomUUID } from "crypto";
import { execFile } from "child_process";
import { promisify } from "util";

const execFileAsync = promisify(execFile);

const MERGE_CREDITS = Number(process.env.MERGE_CREDITS_COST || 15);

export async function POST(req: NextRequest) {
  const workDir = join(tmpdir(), `gv-merge-${randomUUID()}`);
  let videoPath = "";
  let audioPath = "";
  let outPath = "";

  try {
    const token = req.headers.get("authorization")?.replace("Bearer ", "");
    if (!token) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    const sb = getServiceSupabase();
    const { data: userData } = await sb.auth.getUser(token);
    if (!userData?.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    const userId = userData.user.id;

    const { data: profile } = await sb
      .from("profiles")
      .select("credits")
      .eq("id", userId)
      .single();
    const credits = Number(profile?.credits ?? 0);
    if (credits < MERGE_CREDITS) {
      return NextResponse.json(
        { error: `Not enough credits. Merge costs ${MERGE_CREDITS} credits.` },
        { status: 402 }
      );
    }

    const form = await req.formData();
    const video = form.get("video") as File | null;
    const audioUrl = String(form.get("audio_url") || "");
    const title = String(form.get("title") || "Merged ad").slice(0, 120);

    if (!video) {
      return NextResponse.json({ error: "Video file is required" }, { status: 400 });
    }
    if (!audioUrl) {
      return NextResponse.json({ error: "audio_url is required (generate voiceover first)" }, { status: 400 });
    }

    await mkdir(workDir, { recursive: true });
    const vExt = (video.name.split(".").pop() || "mp4").toLowerCase().replace(/[^a-z0-9]/g, "") || "mp4";
    videoPath = join(workDir, `in.${vExt}`);
    audioPath = join(workDir, "voice.mp3");
    outPath = join(workDir, "out.mp4");

    const videoBuf = Buffer.from(await video.arrayBuffer());
    await writeFile(videoPath, videoBuf);

    // Download generated voiceover
    const audioRes = await fetch(audioUrl);
    if (!audioRes.ok) {
      return NextResponse.json({ error: "Could not download voiceover audio" }, { status: 400 });
    }
    await writeFile(audioPath, Buffer.from(await audioRes.arrayBuffer()));

    // Mux: keep video stream, replace audio, cut to shortest
    await execFileAsync(
      "ffmpeg",
      [
        "-y",
        "-i",
        videoPath,
        "-i",
        audioPath,
        "-c:v",
        "copy",
        "-map",
        "0:v:0",
        "-map",
        "1:a:0",
        "-shortest",
        "-movflags",
        "+faststart",
        outPath
      ],
      { timeout: 120000 }
    );

    const { readFile } = await import("fs/promises");
    const outBuf = await readFile(outPath);

    const path = `${userId}/merged-${randomUUID()}.mp4`;
    const { error: upErr } = await sb.storage.from("voice-audio").upload(path, outBuf, {
      contentType: "video/mp4",
      upsert: true
    });
    if (upErr) {
      throw new Error(upErr.message || "Failed to upload merged video");
    }

    const { data: pub } = sb.storage.from("voice-audio").getPublicUrl(path);
    const videoUrl = pub?.publicUrl;
    if (!videoUrl) throw new Error("No public URL for merged video");

    const newBal = credits - MERGE_CREDITS;
    await sb.from("profiles").update({ credits: newBal }).eq("id", userId);
    await sb.from("credit_transactions").insert({
      user_id: userId,
      amount: -MERGE_CREDITS,
      kind: "voice_merge",
      reference: `merge_${path}`,
      meta: { product: "geeny-voice", title }
    });

    // Optional: store as a completed job row
    await sb.from("voice_jobs").insert({
      user_id: userId,
      title: `${title} (video)`,
      script: "[merged video]",
      status: "completed",
      audio_url: videoUrl,
      credits_charged: MERGE_CREDITS
    });

    return NextResponse.json({
      video_url: videoUrl,
      credits_charged: MERGE_CREDITS,
      credits_remaining: newBal
    });
  } catch (e: any) {
    console.error("merge error", e);
    return NextResponse.json(
      { error: e?.message || "Merge failed" },
      { status: 500 }
    );
  } finally {
    // best-effort cleanup
    try {
      const { rm } = await import("fs/promises");
      await rm(workDir, { recursive: true, force: true });
    } catch {
      /* ignore */
    }
  }
}
