/**
 * Central utility to sanitize and validate a billing reference (folio) for a given connector.
 * This guarantees that no UUIDs, internal ticketIds, mock values, or malformed inputs are saved.
 */
export function sanitizeBillingReferenceForConnector(
  value: string | undefined | null,
  rawOcrText: string | undefined | null,
  connector: any,
  fieldContract?: any
): string {
  if (!value) return "";

  let cleanValue = String(value).trim();

  // 1. General forbidden checks (UUIDs, internal IDs)
  const isUuid = /^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$/.test(cleanValue);
  const hasInternalPrefix = /^ticket_|^job_|^OFFLINE-|^worker-/i.test(cleanValue);
  if (isUuid || hasInternalPrefix) {
    console.log(`[Sanitizer] Blocked UUID or internal prefix: "${cleanValue}"`);
    return "";
  }

  // 2. Length check: if value is > 20 characters and does not match the expected pattern, block it.
  if (cleanValue.length > 20) {
    let patternPassed = false;
    let contractField = fieldContract;
    if (!contractField && connector && connector.extractionContract) {
      contractField = connector.extractionContract.requiredPortalFields?.find(
        (f: any) => f.canonicalKey === "billingReference" || f.key === "portalFields.billingReference"
      );
    }
    if (contractField && contractField.validationPattern) {
      try {
        const regex = new RegExp(contractField.validationPattern, "i");
        patternPassed = regex.test(cleanValue);
      } catch (e) {}
    }
    if (!patternPassed) {
      console.log(`[Sanitizer] Blocked too long value (>20 chars) without matching pattern: "${cleanValue}"`);
      return "";
    }
  }

  // 3. Extraction contract field-specific checks
  let contractField = fieldContract;
  if (!contractField && connector && connector.extractionContract) {
    contractField = connector.extractionContract.requiredPortalFields?.find(
      (f: any) => f.canonicalKey === "billingReference" || f.key === "portalFields.billingReference"
    );
  }

  if (contractField) {
    // validationPattern check
    if (contractField.validationPattern) {
      try {
        const regex = new RegExp(contractField.validationPattern, "i");
        if (!regex.test(cleanValue)) {
          console.log(`[Sanitizer] Blocked by validationPattern "${contractField.validationPattern}": "${cleanValue}"`);
          return "";
        }
      } catch (e) {}
    }

    // forbiddenPatterns check
    if (contractField.forbiddenPatterns && contractField.forbiddenPatterns.length > 0) {
      for (const pattern of contractField.forbiddenPatterns) {
        try {
          const regex = new RegExp(pattern, "i");
          if (regex.test(cleanValue)) {
            console.log(`[Sanitizer] Blocked by forbiddenPattern "${pattern}": "${cleanValue}"`);
            return "";
          }
        } catch (e) {}
      }
    }

    // requireLiteralMatch check
    if (contractField.requireLiteralMatch === true && rawOcrText) {
      if (!rawOcrText.includes(cleanValue)) {
        console.log(`[Sanitizer] Blocked: value "${cleanValue}" is not present in rawOcrText`);
        return "";
      }
    }
  }

  return cleanValue;
}
