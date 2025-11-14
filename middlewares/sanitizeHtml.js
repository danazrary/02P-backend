import sanitizeHtml from "sanitize-html";

export const sanitizeHtmlMiddleware = (req, res, next) => {
  const sanitizeObject = (obj) => {
    // Ignore null, undefined, or non-objects
    if (!obj || typeof obj !== "object") return;

    // If it's an array, sanitize each item
    if (Array.isArray(obj)) {
      obj.forEach((item) => sanitizeObject(item));
      return;
    }

    // Safe iteration for plain objects
    for (const key in obj) {
      if (Object.prototype.hasOwnProperty.call(obj, key)) {
        const value = obj[key];

        if (typeof value === "string") {
          obj[key] = sanitizeHtml(value, {
            allowedTags: [],
            allowedAttributes: {},
          });
        } else if (typeof value === "object") {
          sanitizeObject(value); // recursive
        }
      }
    }
  };

  if (req.body) sanitizeObject(req.body);
  if (req.query) sanitizeObject(req.query);
  if (req.params) sanitizeObject(req.params);

  next();
};
