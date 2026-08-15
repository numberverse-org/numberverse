// #849 — shared token-injecting fetch helper.
// Every direct API call from the admin console should go through this one
// client so the Bearer token and the backend error parsing live in one place
// instead of being copy-pasted into each component.
export async function httpClient<T = unknown>(
  url: string,
  options: RequestInit = {}
): Promise<T> {
  const token = localStorage.getItem("nv_admin_token");
  const headers = new Headers(options.headers);
  if (token) headers.set("Authorization", `Bearer ${token}`);

  // Allow callers to pass a plain object body for JSON POSTs.
  let body = options.body;
  if (
    body != null &&
    typeof body !== "string" &&
    !(body instanceof FormData) &&
    !(body instanceof Blob) &&
    !(body instanceof URLSearchParams) &&
    !(body instanceof ArrayBuffer) &&
    !ArrayBuffer.isView(body)
  ) {
    body = JSON.stringify(body);
    if (!headers.has("Content-Type")) headers.set("Content-Type", "application/json");
  }

  const res = await fetch(url, { ...options, headers, body });

  let json: unknown = null;
  try {
    json = await res.json();
  } catch {
    // 204 No Content and non-JSON responses are fine for callers that don't
    // need a body.
  }

  if (!res.ok) {
    // #849 — surface the backend's FastAPI `detail` message when present so
    // operators see the actual reason instead of a bare status code.
    const detail =
      json && typeof json === "object" && "detail" in json
        ? (json as { detail: unknown }).detail
        : undefined;
    const message =
      typeof detail === "string"
        ? detail
        : Array.isArray(detail)
          ? detail
              .map((d) =>
                typeof d === "string"
                  ? d
                  : d && typeof d === "object" && "msg" in d
                    ? String((d as { msg: unknown }).msg)
                    : JSON.stringify(d)
              )
              .join("; ")
          : detail != null
            ? JSON.stringify(detail)
            : res.statusText || `HTTP ${res.status}`;
    throw new Error(message);
  }

  return json as T;
}
