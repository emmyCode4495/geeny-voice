import { NextRequest, NextResponse } from "next/server";
import { getServiceSupabase } from "@/lib/supabase";
import { getPackage } from "@/lib/packages";

export async function POST(req: NextRequest) {
  try {
    const token = req.headers.get("authorization")?.replace("Bearer ", "");
    if (!token) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    const apiKey = process.env.NOWPAYMENTS_API_KEY;
    if (!apiKey) return NextResponse.json({ error: "NowPayments not configured" }, { status: 500 });

    const sb = getServiceSupabase();
    const { data: userData } = await sb.auth.getUser(token);
    if (!userData?.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    const body = await req.json().catch(() => ({}));
    const pkg = getPackage(String(body.package_id || ""));
    if (!pkg) return NextResponse.json({ error: "Invalid package" }, { status: 400 });

    const orderId = `gv_np_${userData.user.id.slice(0, 8)}_${Date.now()}`;
    const appUrl = process.env.NEXT_PUBLIC_APP_URL || "http://localhost:3001";

    const res = await fetch("https://api.nowpayments.io/v1/invoice", {
      method: "POST",
      headers: {
        "x-api-key": apiKey,
        "Content-Type": "application/json"
      },
      body: JSON.stringify({
        price_amount: pkg.amountUsd,
        price_currency: "usd",
        pay_currency: String(body.pay_currency || "usdttrc20").toLowerCase(),
        order_id: orderId,
        order_description: `Geeny Voice — ${pkg.label}`,
        ipn_callback_url: `${appUrl}/api/webhooks/nowpayments`,
        success_url: `${appUrl}/?paid=crypto`,
        cancel_url: `${appUrl}/?paid=cancel`
      })
    });

    const json = await res.json().catch(() => ({}));
    if (!res.ok) {
      return NextResponse.json(
        { error: json.message || json.error || "NowPayments create failed" },
        { status: 502 }
      );
    }

    await sb.from("credit_transactions").insert({
      user_id: userData.user.id,
      amount: 0,
      kind: "pending_crypto",
      reference: orderId,
      meta: {
        package_id: pkg.id,
        credits: pkg.credits,
        invoice_id: json.id,
        product: "geeny-voice"
      }
    });

    return NextResponse.json({
      invoice_url: json.invoice_url,
      order_id: orderId
    });
  } catch (e: any) {
    return NextResponse.json({ error: e?.message || "Crypto init failed" }, { status: 500 });
  }
}
