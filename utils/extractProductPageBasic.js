import axios from "axios";
import * as cheerio from "cheerio";
import validatePublicProductUrl from "./validatePublicProductUrl.js";

export class ProductExtractionError extends Error {
  constructor(code, message, diagnostics = {}) {
    super(message);
    this.name = "ProductExtractionError";
    this.code = code;
    this.diagnostics = diagnostics;
  }
}

export const extractionHeaders = {
  "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0 Safari/537.36 DwkanLinkProductImporter/1.0",
  Accept: "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
  "Accept-Language": "en-US,en;q=0.9,ar;q=0.8",
  "Accept-Encoding": "gzip, deflate, br",
  "Cache-Control": "no-cache",
};

function clean(value, max = 2000) {
  return typeof value === "string" ? value.replace(/\s+/g, " ").trim().slice(0, max) : "";
}

function safeHost(url) {
  try { return new URL(url).hostname.toLowerCase(); } catch { return null; }
}

function safeSnippet(value, max = 300) {
  return clean(String(value || "").replace(/[\u0000-\u001f\u007f]/g, " "), max);
}

function normalizeImages(value) {
  if (!value) return [];
  if (Array.isArray(value)) return value.flatMap(normalizeImages).filter(Boolean);
  if (typeof value === "string") return [value].filter((url) => /^https?:\/\//i.test(url));
  if (typeof value === "object") return normalizeImages(value.url || value.contentUrl);
  return [];
}

function normalizeOffer(offers) {
  const first = Array.isArray(offers) ? offers[0] : offers;
  return {
    price: clean(first?.price || first?.lowPrice || first?.highPrice, 100),
    priceCurrency: clean(first?.priceCurrency, 20),
    availability: clean(first?.availability, 200),
  };
}

function pushProductCandidate(products, candidate) {
  const types = Array.isArray(candidate?.["@type"]) ? candidate["@type"] : [candidate?.["@type"]];
  if (types.some((type) => String(type).toLowerCase() === "product")) products.push(candidate);
}

function walkJsonForProducts(value, products, depth = 0) {
  if (!value || depth > 6) return;
  if (Array.isArray(value)) {
    value.forEach((item) => walkJsonForProducts(item, products, depth + 1));
    return;
  }
  if (typeof value !== "object") return;
  pushProductCandidate(products, value);
  if (value["@graph"]) walkJsonForProducts(value["@graph"], products, depth + 1);
  for (const key of ["product", "products", "item", "items", "data"]) {
    if (value[key]) walkJsonForProducts(value[key], products, depth + 1);
  }
}

function productJsonLd($) {
  const products = [];
  $('script[type="application/ld+json"]').each((_, element) => {
    try {
      const parsed = JSON.parse($(element).text());
      walkJsonForProducts(parsed, products);
    } catch { /* Ignore malformed page-owned JSON-LD. */ }
  });
  return products.slice(0, 5).map((product) => ({
    name: clean(product.name, 300),
    description: clean(product.description, 2000),
    sku: clean(product.sku, 100),
    brand: clean(typeof product.brand === "string" ? product.brand : product.brand?.name, 150),
    offers: normalizeOffer(product.offers),
    image: normalizeImages(product.image),
    additionalProperty: product.additionalProperty,
  }));
}

function extractBalancedObject(source, marker) {
  const markerIndex = source.indexOf(marker);
  if (markerIndex < 0) return null;
  const start = source.indexOf("{", markerIndex);
  if (start < 0) return null;
  let depth = 0;
  let inString = false;
  let quote = "";
  let escaped = false;
  for (let i = start; i < source.length; i += 1) {
    const ch = source[i];
    if (inString) {
      if (escaped) escaped = false;
      else if (ch === "\\") escaped = true;
      else if (ch === quote) inString = false;
      continue;
    }
    if (ch === '"' || ch === "'") { inString = true; quote = ch; continue; }
    if (ch === "{") depth += 1;
    if (ch === "}") depth -= 1;
    if (depth === 0) return source.slice(start, i + 1);
  }
  return null;
}

function embeddedProductData(html) {
  const products = [];
  const jsonMarkers = ["window.__INITIAL_STATE__", "window.runParams", "__NEXT_DATA__"];
  for (const marker of jsonMarkers) {
    const chunk = extractBalancedObject(html, marker);
    if (!chunk) continue;
    try { walkJsonForProducts(JSON.parse(chunk), products); } catch { /* ignore non-JSON JS literals */ }
  }
  return products.slice(0, 3).map((product) => ({
    name: clean(product.name || product.title || product.subject, 300),
    description: clean(product.description || product.summary, 2000),
    brand: clean(typeof product.brand === "string" ? product.brand : product.brand?.name, 150),
    offers: normalizeOffer(product.offers || product.offer),
    image: normalizeImages(product.image || product.images),
  })).filter((product) => product.name || product.description || product.image?.length);
}

export function classifyExtractedProductPage(data) {
  const text = String(data?.visibleText || "").toLowerCase();
  const title = String(data?.title || "").toLowerCase();
  const combined = `${title} ${text}`;
  const markers = [
    ["captcha", "captcha"],
    ["verify you are human", "verify_you_are_human"],
    ["access denied", "access_denied"],
    ["unusual traffic", "unusual_traffic"],
    ["security check", "security_check"],
    ["robot check", "robot_check"],
    ["please enable javascript", "javascript_required"],
    ["just a moment", "cloudflare_challenge"],
    ["challenge", "challenge"],
    ["login required", "login_required"],
    ["sign in", "sign_in"],
    ["temporarily unavailable", "temporarily_unavailable"],
  ];
  const matched = markers.filter(([phrase]) => combined.includes(phrase)).map(([, reason]) => reason);
  const metadataCount = [data?.h1, data?.title, data?.metaDescription, data?.openGraph?.title, data?.openGraph?.description, data?.price].filter(Boolean).length;
  const productDataFound = Boolean(data?.jsonLdProducts?.length || data?.embeddedProducts?.length);
  const lowText = (data?.visibleText?.length || 0) < 250;
  const challengeTitle = /captcha|access denied|just a moment|security check|verify/i.test(data?.title || "");
  const blockedPageDetected = Boolean((matched.length && (lowText || metadataCount < 2 || challengeTitle)) || (challengeTitle && !productDataFound));
  return {
    blockedPageDetected,
    blockedPageReason: blockedPageDetected ? matched[0] || "challenge_title" : null,
    markerNames: matched.slice(0, 5),
    classificationSnippet: safeSnippet(`${data?.title || ""} ${data?.visibleText || ""}`),
  };
}

export function evaluateExtractionQuality(data) {
  const classification = classifyExtractedProductPage(data);
  if (classification.blockedPageDetected) return { passed: false, reason: "blocked_page_detected", ...classification };
  const title = data?.h1 || data?.title || data?.openGraph?.title || data?.jsonLdProducts?.[0]?.name || data?.embeddedProducts?.[0]?.name;
  if (!title) return { passed: false, reason: "missing_title", ...classification };
  const description = data?.metaDescription || data?.openGraph?.description || data?.jsonLdProducts?.[0]?.description || data?.embeddedProducts?.[0]?.description;
  const productData = Boolean(data?.jsonLdProducts?.length || data?.embeddedProducts?.length);
  const hasSpecs = /\b(specification|specifications|features|details|brand|model|material|size|color|sku|item specifics)\b/i.test(data?.visibleText || "");
  const meaningfulFields = [title, description, data?.price, data?.currency, productData ? "productData" : ""].filter(Boolean).length;
  if ((data?.visibleText?.length || 0) < 80 && !productData && !description) return { passed: false, reason: "text_too_short", ...classification };
  if (!(description || hasSpecs || productData || meaningfulFields >= 3)) return { passed: false, reason: "missing_description_and_specs", ...classification };
  return { passed: true, reason: "passed", ...classification };
}

export default async function extractProductPageBasic(initialUrl, options = {}) {
  const redirectLimit = Number(options.redirectLimit || 5);
  let current = await validatePublicProductUrl(initialUrl);
  let response;
  const diagnostics = {
    originalHostname: safeHost(current.href),
    finalHostname: safeHost(current.href),
    redirectCount: 0,
    redirects: [],
  };

  try {
    for (let redirects = 0; redirects <= redirectLimit; redirects += 1) {
      response = await axios.get(current.href, {
        headers: extractionHeaders,
        timeout: Number(options.timeout || 15000),
        maxRedirects: 0,
        responseType: "text",
        decompress: true,
        maxContentLength: 3 * 1024 * 1024,
        validateStatus: (status) => status >= 200 && status < 400,
      });
      diagnostics.httpStatus = response.status;
      diagnostics.contentType = String(response.headers?.["content-type"] || "").toLowerCase();
      diagnostics.responseBytes = typeof response.data === "string" ? Buffer.byteLength(response.data, "utf8") : 0;
      diagnostics.finalHostname = safeHost(current.href);
      if (response.status < 300) break;
      const location = response.headers.location;
      if (!location || redirects === redirectLimit) {
        throw new ProductExtractionError("EXTRACTION_FAILED", "The product page redirected too many times.", { ...diagnostics, failureReason: "too_many_redirects" });
      }
      const nextUrl = new URL(location, current).href;
      const next = await validatePublicProductUrl(nextUrl);
      diagnostics.redirects.push({ fromHostname: safeHost(current.href), toHostname: safeHost(next.href), status: response.status });
      diagnostics.redirectCount = diagnostics.redirects.length;
      current = next;
    }
  } catch (error) {
    if (error?.code === "BLOCKED_PRIVATE_URL") throw error;
    if (error instanceof ProductExtractionError) throw error;
    const status = error.response?.status;
    const extractionDiagnostics = {
      ...diagnostics,
      httpStatus: status || diagnostics.httpStatus || null,
      contentType: String(error.response?.headers?.["content-type"] || diagnostics.contentType || "").toLowerCase(),
      responseBytes: typeof error.response?.data === "string" ? Buffer.byteLength(error.response.data, "utf8") : diagnostics.responseBytes || 0,
    };
    if (error.code === "ECONNABORTED") {
      throw new ProductExtractionError("EXTRACTION_TIMEOUT", "The marketplace took too long to respond.", extractionDiagnostics);
    }
    if ([401, 403, 407, 429, 451, 503].includes(status)) {
      throw new ProductExtractionError("WEBSITE_BLOCKED_OR_UNREADABLE", "This marketplace did not provide a readable product page.", extractionDiagnostics);
    }
    throw new ProductExtractionError("EXTRACTION_FAILED", "The product page could not be extracted.", extractionDiagnostics);
  }

  const contentType = String(response.headers["content-type"] || "").toLowerCase();
  if (!(/text\/html|application\/xhtml\+xml/.test(contentType)) || typeof response.data !== "string") {
    throw new ProductExtractionError("WEBSITE_BLOCKED_OR_UNREADABLE", "The URL did not return a readable web page.", { ...diagnostics, contentType, failureReason: "unsupported_content_type" });
  }

  const html = response.data;
  const $ = cheerio.load(html);
  const meta = (selector) => clean($(selector).first().attr("content"));
  const rawTitle = clean($("title").first().text(), 300);
  const rawH1 = clean($("h1").first().text(), 300);
  const jsonLdProducts = productJsonLd($);
  const embeddedProducts = embeddedProductData(html);

  $('script:not([type="application/ld+json"]), style, noscript, svg, nav, footer, header, form').remove();
  const images = [
    meta('meta[property="og:image"]'),
    meta('meta[name="twitter:image"]'),
    ...jsonLdProducts.flatMap((product) => product.image || []),
    ...embeddedProducts.flatMap((product) => product.image || []),
  ].filter(Boolean).slice(0, 12);
  const price = meta('meta[property="product:price:amount"]') || meta('meta[itemprop="price"]') || jsonLdProducts[0]?.offers?.price || embeddedProducts[0]?.offers?.price;
  const currency = meta('meta[property="product:price:currency"]') || meta('meta[itemprop="priceCurrency"]') || jsonLdProducts[0]?.offers?.priceCurrency || embeddedProducts[0]?.offers?.priceCurrency;
  const bodyText = clean($("main, [itemtype*=Product], article, body").first().text(), 12000);
  const data = {
    sourceUrl: current.href,
    title: rawTitle,
    h1: rawH1,
    metaDescription: meta('meta[name="description"]'),
    openGraph: {
      title: meta('meta[property="og:title"]'),
      description: meta('meta[property="og:description"]'),
      images,
    },
    price: price || null,
    currency: currency || null,
    jsonLdProducts,
    embeddedProducts,
    visibleText: bodyText,
  };
  const classification = classifyExtractedProductPage(data);
  const quality = evaluateExtractionQuality(data);
  data.diagnostics = {
    ...diagnostics,
    finalHostname: safeHost(current.href),
    httpStatus: response.status,
    contentType,
    responseBytes: Buffer.byteLength(html, "utf8"),
    pageTitleFound: Boolean(data.title || data.h1),
    metaDescriptionFound: Boolean(data.metaDescription),
    openGraphTitleFound: Boolean(data.openGraph.title),
    openGraphDescriptionFound: Boolean(data.openGraph.description),
    openGraphImageCount: data.openGraph.images.length,
    jsonLdFound: $('script[type="application/ld+json"]').length > 0,
    jsonLdProductFound: data.jsonLdProducts.length > 0,
    embeddedProductFound: data.embeddedProducts.length > 0,
    extractedPriceFound: Boolean(data.price),
    visibleTextLength: data.visibleText.length,
    blockedPageDetected: classification.blockedPageDetected,
    blockedPageReason: classification.blockedPageReason,
    markerNames: classification.markerNames,
    classificationSnippet: classification.classificationSnippet,
    qualityGatePassed: quality.passed,
    qualityGateReason: quality.reason,
  };

  if (!data.title && !data.h1 && !data.metaDescription && !data.openGraph.title && !data.openGraph.description && !data.jsonLdProducts.length && !data.embeddedProducts.length && bodyText.length < 40) {
    throw new ProductExtractionError("WEBSITE_BLOCKED_OR_UNREADABLE", "The page did not contain readable product information.", data.diagnostics);
  }
  return data;
}