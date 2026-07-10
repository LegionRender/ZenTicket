export const maskRfc = (rfc?: string | null): string => {
  if (!rfc) return "S/D";
  const r = rfc.trim().toUpperCase();
  if (r.length < 10) return "****";
  return r.substring(0, 4) + "*".repeat(r.length - 7) + r.substring(r.length - 3);
};

export const maskEmail = (email?: string | null): string => {
  if (!email) return "S/D";
  const parts = email.split("@");
  if (parts.length !== 2) return "***";
  const local = parts[0];
  const domain = parts[1];
  const maskedLocal = local.length > 1 ? local[0] + "*".repeat(local.length - 1) : "*";
  const domainParts = domain.split(".");
  const maskedDomain = domainParts.map((dp, i) => {
    if (i === domainParts.length - 1) return dp;
    return dp.length > 1 ? dp[0] + "*".repeat(dp.length - 1) : "*";
  }).join(".");
  return `${maskedLocal}@${maskedDomain}`;
};

export const maskPhone = (phone?: string | null): string => {
  if (!phone) return "S/D";
  const p = phone.trim();
  if (p.length < 4) return "****";
  return "*".repeat(p.length - 4) + p.substring(p.length - 4);
};

export const maskName = (name?: string | null): string => {
  if (!name) return "S/D";
  const parts = name.trim().split(/\s+/);
  return parts.map(p => {
    if (p.length <= 1) return p;
    return p[0] + "*".repeat(p.length - 1);
  }).join(" ");
};

const stripSecrets = (text?: string | null): string => {
  if (!text) return "";
  let clean = text;

  // Mask Base64 data blocks
  clean = clean.replace(/data:[a-zA-Z\-]+\/[a-zA-Z\-]+;base64,[a-zA-Z0-9\/+=\s\r\n]+/ig, "[BASE64_DATA_REDACTED]");
  // Also mask raw base64 patterns that look like base64 blocks (longer than 100 chars, alphanumeric with + / = )
  clean = clean.replace(/(?:[A-Za-z0-9+/]{4}){25,}(?:[A-Za-z0-9+/]{2}==|[A-Za-z0-9+/]{3}=)?/g, "[BASE64_DATA_REDACTED]");

  // Mask XML documents
  clean = clean.replace(/<\?xml[\s\S]+?<\/cfdi:Comprobante>/ig, "[XML_DOCUMENT_REDACTED]");
  clean = clean.replace(/<\?xml[\s\S]+?>/ig, "[XML_HEADER_REDACTED]");

  // Mask PDF blocks
  clean = clean.replace(/%PDF-[\s\S]+?%%EOF/ig, "[PDF_DOCUMENT_REDACTED]");

  // Mask Signed URLs (Google Cloud Storage URLs with access ids/signatures/tokens)
  clean = clean.replace(/https:\/\/[a-zA-Z0-9\-\.\/]+(?:\?|&)(?:GoogleAccessId|Signature|Expires|token|X-Goog-Signature|X-Goog-Algorithm)=[a-zA-Z0-9%_\-\.\+=&]+/ig, "[SIGNED_URL_REDACTED]");

  // Mask generic Bearer and Auth tokens
  clean = clean.replace(/bearer\s+[a-zA-Z0-9_\-\.]+/ig, "Bearer [REDACTED]");
  clean = clean.replace(/authorization:\s*[^\r\n]+/ig, "authorization: [REDACTED]");
  clean = clean.replace(/cookie:\s*[^\r\n]+/ig, "cookie: [REDACTED]");

  // Mask structured API Keys / Secret key assignments
  clean = clean.replace(/(?:key|password|passwd|pwd|secret|token|session_id|sessionId|pass|api_key|apikey)\s*[:=]\s*["']?[a-zA-Z0-9_\-\.\/~\+\=]+["']?/ig, (match) => {
    const parts = match.split(/[:=]/);
    const key = parts[0];
    return `${key.trim()}=[REDACTED]`;
  });

  // Mask generic credit card numbers and Mexican CLABEs
  clean = clean.replace(/\b\d{4}[- ]?\d{4}[- ]?\d{4}[- ]?\d{4}\b/g, "[CREDIT_CARD_REDACTED]");
  clean = clean.replace(/\b\d{18}\b/g, "[CLABE_REDACTED]");

  return clean;
};

export const sanitizeRunnerDiagnostic = (event: any): any => {
  if (!event) return null;
  const clone = JSON.parse(JSON.stringify(event));

  if (clone.userEmail) {
    clone.userEmailMasked = maskEmail(clone.userEmail);
    delete clone.userEmail;
  }
  if (clone.userDisplayName) {
    clone.userDisplayName = maskName(clone.userDisplayName);
  }
  
  if (clone.normalizedFields) {
    if (clone.normalizedFields.rfcReceptor) {
      clone.normalizedFields.rfcReceptorMasked = maskRfc(clone.normalizedFields.rfcReceptor);
      delete clone.normalizedFields.rfcReceptor;
    } else if (!clone.normalizedFields.rfcReceptorMasked) {
      clone.normalizedFields.rfcReceptorMasked = "S/D";
    }
    if (clone.normalizedFields.email) {
      clone.normalizedFields.emailMasked = maskEmail(clone.normalizedFields.email);
      delete clone.normalizedFields.email;
    } else if (!clone.normalizedFields.emailMasked) {
      clone.normalizedFields.emailMasked = "S/D";
    }
  }

  if (clone.portalSnapshot) {
    const snap = clone.portalSnapshot;
    if (snap.visibleText) {
      snap.visibleText = snap.visibleText.substring(0, 1000);
    }
    delete snap.rawHtml;
    delete snap.domTree;
    delete snap.base64Image;

    if (snap.portalMessages) {
      snap.portalMessages = snap.portalMessages.map((msg: string) => stripSecrets(msg));
    }
  }

  delete clone.xmlContent;
  delete clone.pdfContent;
  delete clone.pdfHtml;
  delete clone.rawResponse;
  delete clone.cookies;
  delete clone.headers;
  delete clone.tokens;
  delete clone.passwords;

  if (clone.technicalMessage) {
    clone.technicalMessage = stripSecrets(clone.technicalMessage);
  }
  if (clone.adminMessage) {
    clone.adminMessage = stripSecrets(clone.adminMessage);
  }
  if (clone.portalMessage) {
    clone.portalMessage = stripSecrets(clone.portalMessage);
  }

  return clone;
};
