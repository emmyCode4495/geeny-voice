import { NextResponse } from "next/server";
import { CREDIT_PACKAGES } from "@/lib/packages";

export async function GET() {
  return NextResponse.json({ packages: CREDIT_PACKAGES });
}
