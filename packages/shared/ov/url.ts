/** Conservative identity: meaningful query parameters and path case survive. */
export function normalizeOvUrl(input: string): string {
  const url = new URL(input.trim());
  if (
    !["http:", "https:"].includes(url.protocol) ||
    url.username ||
    url.password
  ) {
    throw new Error("Only HTTP(S) URLs without credentials are supported");
  }
  const host = url.hostname.toLowerCase().replace(/\.$/, "");
  // WHATWG URL canonicalizes decimal/hex IPv4 and IPv6 before these checks.
  const ipv4 = /^(\d+)\.(\d+)\.(\d+)\.(\d+)$/.exec(host);
  const first = ipv4 ? Number(ipv4[1]) : null;
  const second = ipv4 ? Number(ipv4[2]) : null;
  if (
    !host.includes(".") ||
    host.includes(":") ||
    /(^|\.)(localhost|local|internal|test|invalid)$/.test(host) ||
    (first !== null &&
      (first === 0 ||
        first === 10 ||
        first === 127 ||
        first >= 224 ||
        (first === 169 && second === 254) ||
        (first === 172 && second! >= 16 && second! <= 31) ||
        (first === 192 && second === 168) ||
        (first === 100 && second! >= 64 && second! <= 127)))
  ) {
    throw new Error("Private or internal URLs cannot be imported");
  }
  url.hostname = host;
  url.hash = "";
  for (const key of [...url.searchParams.keys()]) {
    if (/^utm_/i.test(key) || ["fbclid", "gclid"].includes(key.toLowerCase()))
      url.searchParams.delete(key);
  }
  return url.toString();
}
