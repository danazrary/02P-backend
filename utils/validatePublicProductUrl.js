import dns from "node:dns/promises";
import net from "node:net";

export class ProductUrlValidationError extends Error {
  constructor(code, message) {
    super(message);
    this.name = "ProductUrlValidationError";
    this.code = code;
  }
}

function isPrivateIpv4(address) {
  const parts = address.split(".").map(Number);
  if (parts.length !== 4 || parts.some((part) => !Number.isInteger(part))) return true;
  const [a, b] = parts;
  return (
    a === 0 || a === 10 || a === 127 ||
    (a === 169 && b === 254) ||
    (a === 172 && b >= 16 && b <= 31) ||
    (a === 192 && b === 168) ||
    a >= 224
  );
}

function isPrivateIp(address) {
  const normalized = address.toLowerCase().split("%")[0];
  if (net.isIPv4(normalized)) return isPrivateIpv4(normalized);
  if (!net.isIPv6(normalized)) return true;
  if (normalized === "::" || normalized === "::1") return true;
  if (normalized.startsWith("fc") || normalized.startsWith("fd") || normalized.startsWith("fe8") || normalized.startsWith("fe9") || normalized.startsWith("fea") || normalized.startsWith("feb")) return true;
  if (normalized.startsWith("::ffff:")) return isPrivateIpv4(normalized.slice(7));
  return false;
}

export default async function validatePublicProductUrl(rawUrl) {
  if (typeof rawUrl !== "string" || !rawUrl.trim() || rawUrl.length > 2048) {
    throw new ProductUrlValidationError("INVALID_URL", "Please enter a valid product URL.");
  }

  let url;
  try {
    url = new URL(rawUrl.trim());
  } catch {
    throw new ProductUrlValidationError("INVALID_URL", "Please enter a valid product URL.");
  }

  if (!['http:', 'https:'].includes(url.protocol) || url.username || url.password) {
    throw new ProductUrlValidationError("INVALID_URL", "Only public HTTP and HTTPS URLs are allowed.");
  }

  const hostname = url.hostname.toLowerCase().replace(/\.$/, "");
  if (!hostname || hostname === "localhost" || hostname.endsWith(".localhost") || hostname.endsWith(".local")) {
    throw new ProductUrlValidationError("BLOCKED_PRIVATE_URL", "Private or local URLs are not allowed.");
  }

  let addresses;
  try {
    addresses = net.isIP(hostname)
      ? [{ address: hostname }]
      : await dns.lookup(hostname, { all: true, verbatim: true });
  } catch {
    throw new ProductUrlValidationError("INVALID_URL", "The URL hostname could not be resolved.");
  }

  if (!addresses.length || addresses.some(({ address }) => isPrivateIp(address))) {
    throw new ProductUrlValidationError("BLOCKED_PRIVATE_URL", "Private or local URLs are not allowed.");
  }

  url.hash = "";
  return url;
}

