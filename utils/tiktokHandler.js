import axios from "axios";

const TIKTOK_DOMAINS = ["tiktok.com", "vt.tiktok.com", "vm.tiktok.com"];

/**
 * Returns true if the URL belongs to any TikTok domain.
 * @param {string} url
 * @returns {boolean}
 */
function isTikTokUrl(url) {
  try {
    const { hostname } = new URL(url);
    return TIKTOK_DOMAINS.some((domain) => hostname.endsWith(domain));
  } catch {
    return false;
  }
}

/**
 * Removes known tracking / noise query params from a TikTok URL.
 * @param {string} url
 * @returns {string}
 */
function cleanTikTokUrl(url) {
  const REMOVE_PARAMS = [
    "is_from_webapp",
    "sender_device",
    "sender_web_id",
    "share_app_id",
    "share_link_id",
    "tt_from",
    "u_code",
    "utm_source",
    "utm_medium",
    "utm_campaign",
    "_r",
    "checksum",
    "sec_user_id",
    "share_item_id",
    "social_share_type",
    "timestamp",
    "unique_id",
    "user_id",
  ];

  try {
    const parsed = new URL(url);
    REMOVE_PARAMS.forEach((param) => parsed.searchParams.delete(param));
    // Return without trailing slash on the search string
    return parsed.toString();
  } catch {
    return url;
  }
}

/**
 * Extracts { username, videoId } from a canonical TikTok video URL.
 * Returns null values if the URL does not match the expected pattern.
 *
 * Example input: https://www.tiktok.com/@username/video/123456789
 * @param {string} url
 * @returns {{ username: string|null, videoId: string|null }}
 */
export function extractTikTokMeta(url) {
  try {
    const match = url.match(
      /tiktok\.com\/@([^/?#]+)\/video\/(\d+)/i,
    );
    if (match) {
      return { username: match[1], videoId: match[2] };
    }
  } catch {
    // fall through
  }
  return { username: null, videoId: null };
}

/**
 * Normalizes a TikTok URL:
 *  - Non-TikTok URLs are returned unchanged.
 *  - Short links (vt.tiktok.com / vm.tiktok.com) are resolved via HTTP redirect.
 *  - Known tracking query params are stripped from the final URL.
 *
 * Never throws — on any error the original URL is returned.
 *
 * @param {string} url
 * @returns {Promise<string>}
 */
export async function normalizeTikTokUrl(url) {
  if (!url || typeof url !== "string") return url;

  const trimmed = url.trim();

  if (!isTikTokUrl(trimmed)) return trimmed;

  try {
    const parsed = new URL(trimmed);
    const isShortLink =
      parsed.hostname === "vt.tiktok.com" ||
      parsed.hostname === "vm.tiktok.com";

    if (isShortLink) {
      // Follow redirects to resolve the canonical URL
      const response = await axios.get(trimmed, {
        maxRedirects: 10,
        timeout: 5000,
        // We only need the final URL, so we can use HEAD if supported;
        // TikTok short links typically require GET to complete the redirect chain.
        validateStatus: (status) => status < 400,
        headers: {
          "User-Agent":
            "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36",
        },
      });

      // axios exposes the final URL after all redirects here:
      const finalUrl =
        response.request?.res?.responseUrl ||
        response.request?.responseURL ||
        trimmed;

      return cleanTikTokUrl(finalUrl);
    }

    // Already a full TikTok URL — just clean it
    return cleanTikTokUrl(trimmed);
  } catch {
    // On any network/parse error, return the original URL untouched
    return trimmed;
  }
}
