function parseSatQrUrl(text) {
  if (!text) return null;
  const idMatch = /[?&]id=([^&]+)/i.exec(text);
  const reMatch = /[?&]re=([^&]+)/i.exec(text);
  const rrMatch = /[?&]rr=([^&]+)/i.exec(text);
  const ttMatch = /[?&]tt=([^&]+)/i.exec(text);

  if (!idMatch || !reMatch || !rrMatch || !ttMatch) return null;

  const uuid = idMatch[1].trim();
  const uuidRegex = /^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$/;
  if (!uuidRegex.test(uuid)) return null;

  return {
    uuid,
    rfcEmisor: reMatch[1].trim(),
    rfcReceptor: rrMatch[1].trim(),
    total: parseFloat(ttMatch[1].trim()) || 0
  };
}

module.exports = {
  parseSatQrUrl
};
