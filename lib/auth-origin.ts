export const CANONICAL_AUTH_ORIGIN = "https://quotes.clockwork-av.com";
export const RENDER_SERVICE_HOST = "quote-os.onrender.com";

export function shouldCanonicalizeAuthHost(hostname: string, canonicalOrigin = process.env.AUTH_URL ?? CANONICAL_AUTH_ORIGIN) {
  const canonical = new URL(canonicalOrigin);
  return hostname.toLowerCase() === RENDER_SERVICE_HOST && canonical.host !== RENDER_SERVICE_HOST;
}
