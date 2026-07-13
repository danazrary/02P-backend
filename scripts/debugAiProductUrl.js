import validatePublicProductUrl from "../utils/validatePublicProductUrl.js";
import validateSupportedMarketplaceUrl from "../utils/validateSupportedMarketplaceUrl.js";
import extractProductPageBasic, { evaluateExtractionQuality, ProductExtractionError } from "../utils/extractProductPageBasic.js";

function printReport(report) {
  for (const [key, value] of Object.entries(report)) {
    console.log(`${key}: ${Array.isArray(value) ? value.join(", ") : value}`);
  }
}

async function main() {
  const input = process.argv[2];
  if (!input) {
    console.error('Usage: node backend/scripts/debugAiProductUrl.js "https://a.aliexpress.com/_c4M3iJBd"');
    process.exit(1);
  }

  const report = {
    Marketplace: "",
    "Original hostname": "",
    "Final hostname": "",
    "HTTP status": "",
    "Content type": "",
    "Redirect count": "",
    "Title found": "",
    "Description found": "",
    "JSON-LD product found": "",
    "Embedded product found": "",
    "Images found": "",
    "Visible text length": "",
    "Blocked page": "",
    "Blocked reason": "",
    "Quality gate": "",
    "Quality reason": "",
    "Failure code": "",
  };

  try {
    const parsed = new URL(input);
    report["Original hostname"] = parsed.hostname;
    report.Marketplace = validateSupportedMarketplaceUrl(parsed);
    const validated = await validatePublicProductUrl(parsed.href);
    report.Marketplace = validateSupportedMarketplaceUrl(validated);
    const extracted = await extractProductPageBasic(validated.href);
    validateSupportedMarketplaceUrl(extracted.sourceUrl || validated.href);
    const quality = evaluateExtractionQuality(extracted);
    const diagnostics = extracted.diagnostics || {};
    Object.assign(report, {
      "Final hostname": diagnostics.finalHostname || new URL(extracted.sourceUrl).hostname,
      "HTTP status": diagnostics.httpStatus || "",
      "Content type": diagnostics.contentType || "",
      "Redirect count": diagnostics.redirectCount ?? 0,
      "Title found": Boolean(extracted.title || extracted.h1 || extracted.openGraph?.title),
      "Description found": Boolean(extracted.metaDescription || extracted.openGraph?.description),
      "JSON-LD product found": Boolean(extracted.jsonLdProducts?.length),
      "Embedded product found": Boolean(extracted.embeddedProducts?.length),
      "Images found": extracted.openGraph?.images?.length || 0,
      "Visible text length": extracted.visibleText?.length || 0,
      "Blocked page": Boolean(quality.blockedPageDetected),
      "Blocked reason": quality.blockedPageReason || "",
      "Quality gate": quality.passed ? "passed" : "failed",
      "Quality reason": quality.reason,
    });
  } catch (error) {
    if (error instanceof ProductExtractionError) {
      const diagnostics = error.diagnostics || {};
      Object.assign(report, {
        "Final hostname": diagnostics.finalHostname || "",
        "HTTP status": diagnostics.httpStatus || "",
        "Content type": diagnostics.contentType || "",
        "Redirect count": diagnostics.redirectCount ?? "",
        "Visible text length": diagnostics.visibleTextLength ?? "",
        "Blocked page": diagnostics.blockedPageDetected ?? "",
        "Blocked reason": diagnostics.blockedPageReason || diagnostics.failureReason || "",
        "Quality gate": diagnostics.qualityGatePassed === true ? "passed" : "failed",
        "Quality reason": diagnostics.qualityGateReason || diagnostics.failureReason || "",
        "Failure code": error.code,
      });
    } else {
      report["Failure code"] = error.code || error.name || "ERROR";
      report["Blocked reason"] = error.message;
    }
  }

  printReport(report);
}

main();
