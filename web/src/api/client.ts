/** 开发环境可在 `.env.development` 中设置 `PUBLIC_API_BASE=http://127.0.0.1:8000`，直接请求后端并绕过 dev server 代理。 */
export function apiUrl(path: string): string {
  const raw = import.meta.env.PUBLIC_API_BASE ?? '';
  const base = typeof raw === 'string' ? raw.replace(/\/$/, '') : '';
  if (!base) return path;
  const p = path.startsWith('/') ? path : `/${path}`;
  return `${base}${p}`;
}

export async function api<T = unknown>(
  url: string,
  options: RequestInit = {},
): Promise<T> {
  const headers: Record<string, string> = {
    ...((options.headers as Record<string, string>) || {}),
  };
  const isFormData = options.body instanceof FormData;
  if (!isFormData && !headers['Content-Type']) {
    headers['Content-Type'] = 'application/json';
  }
  const resp = await fetch(apiUrl(url), {
    headers,
    ...options,
  });
  const text = await resp.text();
  let data: unknown = {};
  try {
    data = text ? JSON.parse(text) : {};
  } catch {
    data = { raw: text };
  }
  if (!resp.ok) {
    const d = data as { detail?: string; raw?: string };
    throw new Error(d.detail || d.raw || 'request failed');
  }
  return data as T;
}

export function prettyJson(x: unknown): string {
  return JSON.stringify(x, null, 2);
}
