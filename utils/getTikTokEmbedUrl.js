import axios from "axios";

const TIKTOK_EMBED_PREFIX = "https://www.tiktok.com/embed/v2/";
const TIKTOK_SHORT_HOSTS = new Set(["vt.tiktok.com", "vm.tiktok.com"]);
const MAX_REDIRECT_HOPS = 5;
const REQUEST_TIMEOUT_MS = 5000;

function normalizeTikTokInput(url) {
  if (typeof url !== "string") return "";

  const trimmedUrl = url.trim();
  if (!trimmedUrl) return "";

  if (/^https?:\/\//i.test(trimmedUrl)) {
    return trimmedUrl;
  }

  if (/^(?:www\.|m\.|vt\.|vm\.)?tiktok\.com\//i.test(trimmedUrl)) {
    return `https://${trimmedUrl}`;
  }

  return trimmedUrl;
}

function parseUrlSafely(url) {
  try {
    return new URL(normalizeTikTokInput(url));
  } catch {
    return null;
  }
}

function extractTikTokVideoId(url) {
  const normalizedUrl = normalizeTikTokInput(url);
  if (!normalizedUrl) return null;

  const patterns = [
    /tiktok\.com\/embed\/v2\/(\d+)/i,
    /tiktok\.com\/player\/v1\/(\d+)/i,
    /tiktok\.com\/@[^/]+\/video\/(\d+)/i,
  ];

  for (const pattern of patterns) {
    const match = normalizedUrl.match(pattern);
    if (match?.[1]) {
      return match[1];
    }
  }

  return null;
}

function buildTikTokEmbedUrl(videoId) {
  return `${TIKTOK_EMBED_PREFIX}${videoId}`;
}

function isRedirectStyleTikTokUrl(urlObject) {
  const hostname = urlObject.hostname.toLowerCase();
  const pathname = urlObject.pathname.toLowerCase();

  return (
    TIKTOK_SHORT_HOSTS.has(hostname) ||
    pathname.startsWith("/t/") ||
    pathname.startsWith("/v/")
  );
}

export function isTikTokUrlCandidate(url) {
  const parsedUrl = parseUrlSafely(url);
  if (parsedUrl) {
    return parsedUrl.hostname.toLowerCase().endsWith("tiktok.com");
  }

  return /(?:^|\/\/)(?:www\.|m\.|vt\.|vm\.)?tiktok\.com\//i.test(
    typeof url === "string" ? url.trim() : "",
  );
}

async function resolveRedirectChain(startUrl) {
  let currentUrl = normalizeTikTokInput(startUrl);

  for (let hop = 0; hop < MAX_REDIRECT_HOPS; hop += 1) {
    const directVideoId = extractTikTokVideoId(currentUrl);
    if (directVideoId) {
      return buildTikTokEmbedUrl(directVideoId);
    }

    const parsedUrl = parseUrlSafely(currentUrl);
    if (!parsedUrl || !isRedirectStyleTikTokUrl(parsedUrl)) {
      return null;
    }

    const response = await axios.get(currentUrl, {
      timeout: REQUEST_TIMEOUT_MS,
      maxRedirects: 0,
      validateStatus: (status) => status >= 200 && status < 400,
      headers: {
        "User-Agent":
          "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/136.0.0.0 Safari/537.36",
        Accept: "text/html,application/xhtml+xml",
      },
    });

    const nextLocation = response.headers?.location;
    if (nextLocation) {
      currentUrl = new URL(nextLocation, currentUrl).toString();
      continue;
    }

    const responseUrl = response.request?.res?.responseUrl;
    if (responseUrl && responseUrl !== currentUrl) {
      currentUrl = responseUrl;
      continue;
    }

    return null;
  }

  return null;
}

export default async function getTikTokEmbedUrl(url) {
  try {
    const normalizedUrl = normalizeTikTokInput(url);
    if (!normalizedUrl || !isTikTokUrlCandidate(normalizedUrl)) {
      return null;
    }

    if (normalizedUrl.includes("/embed/v2/")) {
      return normalizedUrl;
    }

    const directVideoId = extractTikTokVideoId(normalizedUrl);
    if (directVideoId) {
      return buildTikTokEmbedUrl(directVideoId);
    }

    const parsedUrl = parseUrlSafely(normalizedUrl);
    if (!parsedUrl || !isRedirectStyleTikTokUrl(parsedUrl)) {
      return null;
    }

    return await resolveRedirectChain(normalizedUrl);
  } catch {
    return null;
  }
}