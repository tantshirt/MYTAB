import { NextResponse } from "next/server";

/**
 * AD-5 token-bridge fallback stub — activated only if Story 1.5 fails.
 */
export async function POST() {
  return NextResponse.json(
    { error: "Token bridge not configured" },
    { status: 501 },
  );
}
