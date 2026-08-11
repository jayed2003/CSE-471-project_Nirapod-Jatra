import { NextRequest, NextResponse } from "next/server";

const API_BASE = process.env.NEXT_PUBLIC_API_BASE_URL ?? "http://localhost:4000";

export async function GET(request: NextRequest) {
  const tripId = request.nextUrl.searchParams.get("tripId");
  if (!tripId) return NextResponse.json({ error: "Missing tripId" }, { status: 400 });
  const token = request.headers.get("authorization")?.replace(/^Bearer\s+/i, "") ?? request.cookies.get("waymark-token")?.value ?? null;
  if (!token) return NextResponse.json({ error: "Authentication required" }, { status: 401 });
  try {
    const response = await fetch(`${API_BASE}/api/trips/${encodeURIComponent(tripId)}/readiness`, { headers: { authorization: `Bearer ${token}` }, signal: AbortSignal.timeout(30_000) });
    const body = await response.json().catch(() => null) as { error?: string } | null;
    if (!response.ok) return NextResponse.json({ error: body?.error ?? "Readiness check failed." }, { status: response.status });
    return NextResponse.json(body);
  } catch {
    return NextResponse.json({ error: "Readiness service unavailable." }, { status: 503 });
  }
}

export async function POST(request: NextRequest) {
  const tripId = request.nextUrl.searchParams.get("tripId");
  if (!tripId) return NextResponse.json({ error: "Missing tripId" }, { status: 400 });
  const token = request.headers.get("authorization")?.replace(/^Bearer\s+/i, "") ?? request.cookies.get("waymark-token")?.value ?? null;
  if (!token) return NextResponse.json({ error: "Authentication required" }, { status: 401 });
  try {
    const response = await fetch(`${API_BASE}/api/trips/${encodeURIComponent(tripId)}/readiness/offline`, { method: "POST", headers: { authorization: `Bearer ${token}` }, signal: AbortSignal.timeout(15_000) });
    const body = await response.json().catch(() => null) as { error?: string } | null;
    if (!response.ok) return NextResponse.json({ error: body?.error ?? "Offline marker failed." }, { status: response.status });
    return NextResponse.json(body);
  } catch {
    return NextResponse.json({ error: "Readiness service unavailable." }, { status: 503 });
  }
}
