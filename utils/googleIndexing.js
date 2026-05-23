/**
 * Google Indexing API integration.
 *
 * Notifies Google when a product or shop URL is created, updated, or deleted.
 * This helps new content get discovered and indexed faster than relying on
 * Google's regular crawl schedule.
 *
 * SETUP REQUIRED — add these environment variables on the server:
 *   GOOGLE_INDEXING_CLIENT_EMAIL   - service account email (from Google Cloud)
 *   GOOGLE_INDEXING_PRIVATE_KEY    - RSA private key PEM (newlines as \n)
 *
 * The service account must be added as a verified owner in Google Search Console
 * for every property (domain) you want to submit URLs for.
 *
 * Reference: https://developers.google.com/search/apis/indexing-api/v3/quickstart
 *
 * If credentials are not configured, all calls are silent no-ops — safe to call
 * everywhere without guarding.
 */

import crypto from "crypto";
import https from "https";

const INDEXING_ENDPOINT =
  "https://indexing.googleapis.com/v3/urlNotifications:publish";
const TOKEN_ENDPOINT = "https://oauth2.googleapis.com/token";
const INDEXING_SCOPE = "https://www.googleapis.com/auth/indexing";

/** Cached OAuth2 access token */
let _tokenCache = null; // { value: string, expiresAt: number }

function isConfigured() {
  return (
    !!process.env.GOOGLE_INDEXING_CLIENT_EMAIL &&
    !!process.env.GOOGLE_INDEXING_PRIVATE_KEY
  );
}

function base64url(buf) {
  return buf
    .toString("base64")
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=/g, "");
}

/**
 * Build a signed JWT for the Google Indexing API service account.
 * The private key in the env var may use literal \n for newlines — normalize it.
 */
function buildServiceAccountJwt() {
  const now = Math.floor(Date.now() / 1000);

  const header = base64url(
    Buffer.from(JSON.stringify({ alg: "RS256", typ: "JWT" })),
  );

  const payload = base64url(
    Buffer.from(
      JSON.stringify({
        iss: process.env.GOOGLE_INDEXING_CLIENT_EMAIL,
        scope: INDEXING_SCOPE,
        aud: TOKEN_ENDPOINT,
        iat: now,
        exp: now + 3600,
      }),
    ),
  );

  const signingInput = `${header}.${payload}`;
  const privateKey = (process.env.GOOGLE_INDEXING_PRIVATE_KEY || "").replace(
    /\\n/g,
    "\n",
  );

  const signer = crypto.createSign("RSA-SHA256");
  signer.update(signingInput);
  const signature = base64url(signer.sign(privateKey));

  return `${signingInput}.${signature}`;
}

/** Fetch (or return cached) OAuth2 access token for the service account. */
async function getAccessToken() {
  if (_tokenCache && _tokenCache.expiresAt > Date.now() + 60_000) {
    return _tokenCache.value;
  }

  const jwt = buildServiceAccountJwt();
  const body = new URLSearchParams({
    grant_type: "urn:ietf:params:oauth:grant-type:jwt-bearer",
    assertion: jwt,
  }).toString();

  const data = await new Promise((resolve, reject) => {
    const req = https.request(
      TOKEN_ENDPOINT,
      {
        method: "POST",
        headers: {
          "Content-Type": "application/x-www-form-urlencoded",
          "Content-Length": Buffer.byteLength(body),
        },
      },
      (res) => {
        let raw = "";
        res.on("data", (chunk) => {
          raw += chunk;
        });
        res.on("end", () => {
          try {
            resolve(JSON.parse(raw));
          } catch {
            reject(new Error(`Unparseable token response: ${raw}`));
          }
        });
      },
    );
    req.on("error", reject);
    req.write(body);
    req.end();
  });

  if (!data.access_token) {
    throw new Error(`Google token exchange failed: ${JSON.stringify(data)}`);
  }

  _tokenCache = {
    value: data.access_token,
    expiresAt: Date.now() + (data.expires_in || 3600) * 1000,
  };

  return _tokenCache.value;
}

/**
 * Notify Google of a URL change.
 *
 * @param {string} url  - Full canonical URL (e.g. https://shop.dwkanlink.com/p/123)
 * @param {"URL_UPDATED"|"URL_DELETED"} type
 * @returns {Promise<void>}  Always resolves — errors are logged, never thrown.
 */
export async function notifyGoogle(url, type = "URL_UPDATED") {
  if (!isConfigured()) return;

  try {
    const token = await getAccessToken();
    const body = JSON.stringify({ url, type });

    await new Promise((resolve) => {
      const req = https.request(
        INDEXING_ENDPOINT,
        {
          method: "POST",
          headers: {
            Authorization: `Bearer ${token}`,
            "Content-Type": "application/json",
            "Content-Length": Buffer.byteLength(body),
          },
        },
        (res) => {
          let raw = "";
          res.on("data", (chunk) => {
            raw += chunk;
          });
          res.on("end", () => {
            if (res.statusCode === 200) {
              console.log(`✅ Google indexed: [${type}] ${url}`);
            } else {
              console.warn(
                `⚠️ Google Indexing API HTTP ${res.statusCode}: ${raw}`,
              );
            }
            resolve();
          });
        },
      );

      req.on("error", (err) => {
        console.warn(`⚠️ Google Indexing API network error: ${err.message}`);
        resolve();
      });

      req.write(body);
      req.end();
    });
  } catch (err) {
    console.warn(`⚠️ Google Indexing API: ${err.message}`);
  }
}
