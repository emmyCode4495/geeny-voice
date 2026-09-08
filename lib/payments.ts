import { getServiceSupabase } from "@/lib/supabase";

export async function creditUserFromPayment(opts: {
  userId: string;
  credits: number;
  reference: string;
  provider: "paystack" | "nowpayments";
  meta?: Record<string, unknown>;
}): Promise<{ ok: boolean; already?: boolean }> {
  const sb = getServiceSupabase();

  const { data: existing } = await sb
    .from("credit_transactions")
    .select("id")
    .eq("reference", opts.reference)
    .eq("kind", "purchase")
    .maybeSingle();

  if (existing) return { ok: true, already: true };

  const { data: profile } = await sb
    .from("profiles")
    .select("credits")
    .eq("id", opts.userId)
    .single();

  const bal = Number(profile?.credits ?? 0);
  const next = bal + opts.credits;

  const { error: upErr } = await sb
    .from("profiles")
    .update({ credits: next })
    .eq("id", opts.userId);
  if (upErr) throw upErr;

  const { error: txErr } = await sb.from("credit_transactions").insert({
    user_id: opts.userId,
    amount: opts.credits,
    kind: "purchase",
    reference: opts.reference,
    meta: { provider: opts.provider, product: "geeny-voice", ...(opts.meta || {}) }
  });
  if (txErr) throw txErr;

  return { ok: true };
}
