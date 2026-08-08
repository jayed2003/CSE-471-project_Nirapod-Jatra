import { NextRequest, NextResponse } from "next/server";

const cache = new Map<string, { expiresAt: number; value: unknown }>();
export async function GET(request: NextRequest) {
  const query = request.nextUrl.searchParams.get("q")?.trim();
  if (!query || query.length < 2) return NextResponse.json({ error: "Place not found." }, { status: 400 });
  const key = query.toLowerCase();
  const cached = cache.get(key);
  if (cached && cached.expiresAt > Date.now()) return NextResponse.json(cached.value);
  try {
    const upstream = await fetch(`https://nominatim.openstreetmap.org/search?q=${encodeURIComponent(query)}&format=jsonv2&limit=1`, { headers: { "accept-language": "en", "user-agent": "WaymarkSafety/1.0 (contact: local-development)" }, signal: AbortSignal.timeout(10_000) });
    if (!upstream.ok) throw new Error();
    const item = (await upstream.json() as Array<{ lat: string; lon: string; display_name: string }>)[0];
    if (!item) return NextResponse.json({ error: "Place not found." }, { status: 404 });
    const result = { lat: Number(item.lat), lon: Number(item.lon), displayName: item.display_name };
    cache.set(key, { value: result, expiresAt: Date.now() + 30 * 24 * 60 * 60 * 1000 });
    return NextResponse.json(result);
  } catch { return NextResponse.json({ error: "Please check your internet connection." }, { status: 503 }); }
}