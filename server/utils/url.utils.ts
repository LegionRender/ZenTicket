import { Request } from "express";

export const getSafeBaseUrl = (req: Request): string => {
  const referer = req.headers.referer;
  if (referer) {
    try {
      const parsed = new URL(referer);
      return parsed.origin;
    } catch (e) {
      // Ignorar error de parsing
    }
  }
  const origin = req.headers.origin;
  if (origin) {
    return origin;
  }
  let proto = req.headers["x-forwarded-proto"] || req.protocol || "http";
  if (Array.isArray(proto)) {
    proto = proto[0];
  }
  if (typeof proto === "string" && proto.includes(",")) {
    proto = proto.split(",")[0].trim();
  }
  const host = req.get("host") || "localhost:3000";
  return `${proto}://${host}`;
};
