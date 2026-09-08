import { NextRequest, NextResponse } from "next/server";
import { getServiceSupabase } from "@/lib/supabase";
import { getPackage } from "@/lib/packages";

export async function POST(req: NextRequest) {
  try {
    const token = req.headers.get("authorization")?.replace("Bearer ", "");
    if (!token) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    const secret = process.env.PAYSTACK_SECRET_KEY;
    if (!secret) return NextResponse.json({ error: "Paystack not configured" }, { status: 500 });

    const sb = getServiceSupabase();
    const { data: userData } = await sb.auth.getUser(token);
    if (!userData?.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    const body = await req.json().catch(() => ({}));
    const pkg = getPackage(String(body.package_id || ""));
    if (!pkg) return NextResponse.json({ error: "Invalid package" }, { status: 400 });

    const email = userData.user.email;
    if (!email) return NextResponse.json({ error: "User email required" }, { status: 400 });

    const reference = `gv_ps_${userData.user.id.slice(0, 8)}_${Date.now()}`;
    const res = await fetch("https://api.paystack.co/transaction/initialize", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${secret}`,
        "Content-Type": "application/json"
      },
      body: JSON.stringify({
        email,
        amount: Math.round(pkg.amountNgn * 100),
        currency: "NGN",
        reference,
        callback_url: `${process.env.NEXT_PUBLIC_APP_URL || "http://localhost:3001"}/?paid=paystack`,
        metadata: {
          user_id: userData.user.id,
          package_id: pkg.id,
          credits: pkg.credits,
          app: "geeny-voice"
        }
      })
    });

    const json = await res.json();
    if (!res.ok || !json.status) {
      return NextResponse.json(
        { error: json.message || "Paystack initialize failed" },
        { status: 502 }
      );
    }

    return NextResponse.json({
      authorization_url: json.data.authorization_url,
      reference: json.data.reference
    });
  } catch (e: any) {
    return NextResponse.json({ error: e?.message || "Payment init failed" }, { status: 500 });
  }
}
