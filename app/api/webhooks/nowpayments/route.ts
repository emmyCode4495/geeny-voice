import { NextRequest, NextResponse } from "next/server";
import crypto from "crypto";
import { getServiceSupabase } from "@/lib/supabase";
import { creditUserFromPayment } from "@/lib/payments";

function sortObject(obj: any): any {
  if (obj === null || typeof obj !== "object" || Array.isArray(obj)) return obj;
  return Object.keys(obj)
    .sort()
    .reduce((acc: any, key) => {
      acc[key] = sortObject(obj[key]);
      return acc;
    }, {});
}

export async function POST(req: NextRequest) {
  try {
    const ipnSecret = process.env.NOWPAYMENTS_IPN_SECRET;
    if (!ipnSecret) return NextResponse.json({ error: "Not configured" }, { status: 500 });

    const raw = await req.text();
    const signature = req.headers.get("x-nowpayments-sig") || "";
    const payload = JSON.parse(raw);
    const sorted = sortObject(payload);
    const hmac = crypto
      .createHmac("sha512", ipnSecret)
      .update(JSON.stringify(sorted))
      .digest("hex");

    if (hmac !== signature) {
      return NextResponse.json({ error: "Invalid signature" }, { status: 401 });
    }

    const status = String(payload.payment_status || "").toLowerCase();
    if (!["finished", "confirmed"].includes(status)) {
      return NextResponse.json({ received: true, status });
    }

    const orderId = String(payload.order_id || "");
    if (!orderId) return NextResponse.json({ received: true, skipped: true });

    const sb = getServiceSupabase();
    const { data: pending } = await sb
      .from("credit_transactions")
      .select("*")
      .eq("reference", orderId)
      .eq("kind", "pending_crypto")
      .maybeSingle();

    if (!pending) return NextResponse.json({ received: true, no_pending: true });

    const credits = Number(pending.meta?.credits || 0);
    const userId = pending.user_id as string;
    if (!credits || !userId) return NextResponse.json({ received: true, skipped: true });

    await creditUserFromPayment({
      userId,
      credits,
      reference: String(payload.payment_id || orderId),
      provider: "nowpayments",
      meta: { order_id: orderId, payment_status: status }
    });

    await sb
      .from("credit_transactions")
      .update({ kind: "pending_crypto_done" })
      .eq("id", pending.id);

    return NextResponse.json({ received: true });
  } catch (e: any) {
    return NextResponse.json({ error: e?.message || "IPN failed" }, { status: 500 });
  }
}
