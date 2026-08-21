const TOKEN_KEY = "waymark-token";
export function getToken() {
  return typeof window === "undefined" ? null : localStorage.getItem(TOKEN_KEY);
}
export function setToken(token: string) {
  localStorage.setItem(TOKEN_KEY, token);
}
export function clearToken() {
  localStorage.removeItem(TOKEN_KEY);
}

function describeFailure(status: number, body: { error?: string; message?: string } | null) {
  if (body?.error) return body.error;
  if (typeof body?.message === "string" && body.message.trim()) return body.message;
  if (status === 429) return "Too many requests. Please wait a minute and try again.";
  if (status === 404 || status >= 500)
    return "Cannot reach the API. Start both apps with npm run dev:all.";
  return "Request failed";
}

export async function apiFetch<T>(path: string, init: RequestInit = {}): Promise<T> {
  let response: Response;
  try {
    response = await fetch(path, {
      ...init,
      headers: {
        "content-type": "application/json",
        ...(getToken() ? { authorization: `Bearer ${getToken()}` } : {}),
        ...init.headers,
      },
    });
  } catch {
    throw new Error(
      "Cannot reach the server. Start both apps with npm run dev:all (port 3000 and 4000).",
    );
  }
  if (!response.ok) {
    const body = (await response.json().catch(() => null)) as {
      error?: string;
      message?: string;
    } | null;
    throw new Error(describeFailure(response.status, body));
  }
  return response.status === 204 ? (undefined as T) : (response.json() as Promise<T>);
}
