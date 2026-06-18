const API_BASE_URL = import.meta.env.VITE_API_BASE_URL?.trim() || "";

function buildApiUrl(path: string): string {
  if (!path) return API_BASE_URL || "/";
  if (/^https?:\/\//i.test(path)) return path;
  if (!API_BASE_URL) return path;
  const normalizedBase = API_BASE_URL.endsWith("/")
    ? API_BASE_URL.slice(0, -1)
    : API_BASE_URL;
  const normalizedPath = path.startsWith("/") ? path : `/${path}`;
  return `${normalizedBase}${normalizedPath}`;
}

type ApiRequestOptions = Omit<RequestInit, "body"> & {
  body?: BodyInit | null | Record<string, unknown>;
};

async function apiFetch(path: string, options: ApiRequestOptions = {}) {
  const { body, headers, ...rest } = options;
  const normalizedHeaders = new Headers(headers);

  let requestBody: BodyInit | null | undefined = body as BodyInit | null | undefined;
  const isPlainObject =
    body !== null &&
    body !== undefined &&
    typeof body === "object" &&
    !(body instanceof FormData) &&
    !(body instanceof URLSearchParams) &&
    !(body instanceof Blob) &&
    !(body instanceof ArrayBuffer);

  if (isPlainObject) {
    if (!normalizedHeaders.has("Content-Type")) {
      normalizedHeaders.set("Content-Type", "application/json");
    }
    requestBody = JSON.stringify(body);
  }

  return fetch(buildApiUrl(path), {
    ...rest,
    headers: normalizedHeaders,
    body: requestBody,
  });
}

async function parseJsonResponse<T>(response: Response): Promise<T> {
  const contentType = response.headers.get("content-type") || "";
  if (contentType.includes("application/json")) {
    return response.json() as Promise<T>;
  }

  const text = await response.text();
  return text as T;
}

export async function apiRequest<T>(path: string, options: ApiRequestOptions = {}): Promise<T> {
  const response = await apiFetch(path, options);

  if (!response.ok) {
    const message = await response.text();
    throw new Error(message || `API request failed with status ${response.status}`);
  }

  return parseJsonResponse<T>(response);
}

export { API_BASE_URL, buildApiUrl, apiFetch };
