import { NextResponse } from "next/server";
import { listPremadeVoices } from "@/lib/elevenlabs";

export async function GET() {
  try {
    const voices = await listPremadeVoices();
    return NextResponse.json({ voices });
  } catch (e: any) {
    return NextResponse.json(
      { error: e?.message || "Failed to list voices", voices: [] },
      { status: 500 }
    );
  }
}
