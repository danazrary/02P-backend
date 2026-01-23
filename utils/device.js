import crypto from "crypto";

export const getDeviceHash = (req) => {
  const rawData = [
    req.headers["user-agent"],
    req.headers["accept-language"],
  ].join("|");

  return crypto.createHash("sha256").update(rawData).digest("hex");
};
