/** Server-side only: keep scoped API keys in the Site secret store. */
export function createOvClient(baseUrl: string, token: string) {
  return async function call<T>(
    operation: string,
    args: unknown = {},
  ): Promise<T> {
    if (!/^[a-zA-Z]+$/.test(operation)) throw new Error("Invalid operation");
    const response = await fetch(
      `${baseUrl.replace(/\/$/, "")}/api/ov/v1/${operation}`,
      {
        method: "POST",
        headers: {
          Authorization: `Bearer ${token}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify(args),
        signal: AbortSignal.timeout(30000),
      },
    );
    if (!response.ok) throw new Error(`OV Bookmarks HTTP ${response.status}`);
    return response.json() as Promise<T>;
  };
}
