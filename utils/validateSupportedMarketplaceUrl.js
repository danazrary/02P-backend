export class UnsupportedMarketplaceError extends Error {
  constructor() {
    super("Only Amazon, Alibaba, and AliExpress links are supported.");
    this.name = "UnsupportedMarketplaceError";
    this.code = "UNSUPPORTED_MARKETPLACE";
  }
}

const amazonHosts = new Set([
  "amazon.com",
  "amazon.co.uk",
  "amazon.ae",
  "amazon.sa",
  "amazon.de",
  "amazon.fr",
  "amazon.it",
  "amazon.es",
  "amazon.ca",
  "amazon.com.au",
  "amazon.co.jp",
]);

function exactOrTrustedSubdomain(hostname, root) {
  return hostname === root || hostname.endsWith(`.${root}`);
}

export default function validateSupportedMarketplaceUrl(urlLike) {
  const url = urlLike instanceof URL ? urlLike : new URL(String(urlLike));
  const host = url.hostname.toLowerCase().replace(/\.$/, "");

  for (const root of amazonHosts) {
    if (exactOrTrustedSubdomain(host, root)) return "amazon";
  }
  if (exactOrTrustedSubdomain(host, "alibaba.com")) return "alibaba";
  if (exactOrTrustedSubdomain(host, "aliexpress.com")) return "aliexpress";

  throw new UnsupportedMarketplaceError();
}
