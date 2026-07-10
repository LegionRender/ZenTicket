import crypto from "crypto";

export function verifyStripeSignature(rawBody: string, signatureHeader: string, webhookSecret: string): boolean {
  if (!signatureHeader || !webhookSecret) return false;
  
  // Split header
  const parts = signatureHeader.split(",");
  let timestamp = "";
  const signatures: string[] = [];
  
  for (const part of parts) {
    const [key, val] = part.split("=");
    if (key === "t") timestamp = val;
    if (key === "v1") signatures.push(val);
  }
  
  if (!timestamp || signatures.length === 0) return false;

  // Verify timestamp age (prevent replay attacks, 5-minute window)
  const now = Math.floor(Date.now() / 1000);
  const timestampNumber = parseInt(timestamp, 10);
  if (isNaN(timestampNumber) || Math.abs(now - timestampNumber) > 300) {
    return false;
  }
  
  // Compute signature
  const signedPayload = `${timestamp}.${rawBody}`;
  const computedSig = crypto
    .createHmac("sha256", webhookSecret)
    .update(signedPayload)
    .digest("hex");
    
  // Check if computed signature matches any in signatures array
  const computedBuffer = Buffer.from(computedSig, "hex");
  for (const sig of signatures) {
    const sigBuffer = Buffer.from(sig, "hex");
    if (computedBuffer.length === sigBuffer.length && crypto.timingSafeEqual(computedBuffer, sigBuffer)) {
      return true;
    }
  }
  
  return false;
}
