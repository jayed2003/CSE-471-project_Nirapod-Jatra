const API_BASE = process.env.NEXT_PUBLIC_API_BASE_URL ?? "http://localhost:4000";
const TOKEN_KEY = "waymark-token";
export function getToken() { return typeof window === "undefined" ? null : localStorage.getItem(TOKEN_KEY); }
export function setToken(token: string) { localStorage.setItem(TOKEN_KEY, token); }
export function clearToken() { localStorage.removeItem(TOKEN_KEY); }
export async function apiFetch<T>(path: string, init: RequestInit = {}): Promise<T> { const response = await fetch(`${API_BASE}${path}`, { ...init, headers: { "content-type": "application/json", ...(getToken() ? { authorization: `Bearer ${getToken()}` } : {}), ...init.headers } }); if (!response.ok) { const body = await response.json().catch(() => null) as { error?: string } | null; throw new Error(body?.error ?? "Request failed"); } return response.status === 204 ? undefined as T : response.json() as Promise<T>; }