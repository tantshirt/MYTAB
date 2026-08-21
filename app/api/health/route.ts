import { NextResponse } from "next/server";
import { resolveConvexDeployment } from "@/lib/env/contract";

export const dynamic = "force-dynamic";

export async function GET() {
  const convexDeployment = resolveConvexDeployment({
    CONVEX_DEPLOYMENT: process.env.CONVEX_DEPLOYMENT,
    NEXT_PUBLIC_CONVEX_URL: process.env.NEXT_PUBLIC_CONVEX_URL,
  });

  if (!convexDeployment) {
    return NextResponse.json(
      { status: "unhealthy", convexDeployment: null },
      { status: 503 },
    );
  }

  return NextResponse.json({
    status: "ok",
    convexDeployment,
  });
}
