import { NextResponse } from "next/server";

/**
 * AD-5 JWKS endpoint stub — activated only if Story 1.5 fails.
 */
export async function GET() {
  return NextResponse.json(
    { error: "JWKS not configured" },
    { status: 501 },
  );
}
