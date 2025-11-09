import sanitizeHtml from "sanitize-html";

export const sanitizeHtmlMiddleware = (req, res, next) => {
  const sanitizeObject = (obj) => {
    for (let key in obj) {
      if (obj.hasOwnProperty(key) && typeof obj[key] === "string") {
        obj[key] = sanitizeHtml(obj[key], {
          allowedTags: [],
          allowedAttributes: {},
        });
      }
    }
  };

  if (req.body) sanitizeObject(req.body);
  if (req.query) sanitizeObject(req.query);
  if (req.params) sanitizeObject(req.params);

  next();
};
