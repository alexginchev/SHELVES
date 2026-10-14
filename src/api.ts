export class RequestError extends Error {
  constructor(
    public status: number,
    message: string,
  ) {
    super(message);
  }
}
export async function api<T>(
  path: string,
  options: RequestInit = {},
): Promise<T> {
  let response: Response;
  try {
    response = await fetch(`/api${path}`, {
      ...options,
      credentials: "same-origin",
      signal: options.signal || AbortSignal.timeout(15000),
      headers: {
        "Content-Type": "application/json",
        "X-Shelves-Request": "1",
        ...options.headers,
      },
    });
  } catch {
    throw new RequestError(
      0,
      "Cannot reach Shelves. Check your connection and try again.",
    );
  }
  if (response.status === 204) return undefined as T;
  const payload = (await response.json()) as T & { error?: string };
  if (!response.ok)
    throw new RequestError(
      response.status,
      payload.error || "Something went wrong. Please try again.",
    );
  return payload;
}
export const json = (method: string, data: unknown): RequestInit => ({
  method,
  body: JSON.stringify(data),
});
