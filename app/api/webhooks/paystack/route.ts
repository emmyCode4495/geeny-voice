import { NextRequest, NextResponse } from "next/server";
import crypto from "crypto";
import { creditUserFromPayment } from "@/lib/payments";

export async function POST(req: NextRequest) {
  try {
    const secret = process.env.PAYSTACK_SECRET_KEY;
    if (!secret) return NextResponse.json({ error: "Not configured" }, { status: 500 });

    const raw = await req.text();
    const signature = req.headers.get("x-paystack-signature") || "";
    const hash = crypto.createHmac("sha512", secret).update(raw).digest("hex");
    if (hash !== signature) {
      return NextResponse.json({ error: "Invalid signature" }, { status: 401 });
    }

    const event = JSON.parse(raw);
    if (event.event !== "charge.success") {
      return NextResponse.json({ received: true });
    }

    const data = event.data || {};
    const meta = data.metadata || {};
    const userId = meta.user_id as string | undefined;
    const credits = Number(meta.credits || 0);
    const reference = String(data.reference || "");

    if (!userId || !credits || !reference) {
      return NextResponse.json({ received: true, skipped: true });
    }

    await creditUserFromPayment({
      userId,
      credits,
      reference,
      provider: "paystack",
      meta: { amount: data.amount, currency: data.currency }
    });

    return NextResponse.json({ received: true });
  } catch (e: any) {
    return NextResponse.json({ error: e?.message || "Webhook failed" }, { status: 500 });
  }
}
