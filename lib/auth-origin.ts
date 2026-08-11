export const CANONICAL_AUTH_ORIGIN = "https://quotes.clockwork-av.com";
export const RENDER_SERVICE_HOST = "quote-os.onrender.com";

export function normalizeRequestHost(host: string | null | undefined) {
  return host?.split(",", 1)[0]?.trim().toLowerCase().replace(/:\d+$/, "") ?? "";
}

export function publicRequestHost(forwardedHost: string | null, host: string | null, urlHostname: string) {
  return normalizeRequestHost(forwardedHost) || normalizeRequestHost(host) || normalizeRequestHost(urlHostname);
}

export function shouldCanonicalizeAuthHost(hostname: string, canonicalOrigin = process.env.AUTH_URL ?? CANONICAL_AUTH_ORIGIN) {
  const canonical = new URL(canonicalOrigin);
  return normalizeRequestHost(hostname) === RENDER_SERVICE_HOST && canonical.hostname !== RENDER_SERVICE_HOST;
}

export function canonicalRedirectTarget(pathname: string, search: string, canonicalOrigin = process.env.AUTH_URL ?? CANONICAL_AUTH_ORIGIN) {
  const target = new URL(canonicalOrigin);
  target.pathname = pathname;
  target.search = search;
  return target;
}
