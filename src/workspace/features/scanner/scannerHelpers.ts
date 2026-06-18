import type { Connector, ExtractedTicketData } from "@/types";

export function isTicketDataIncomplete(data: ExtractedTicketData): boolean {
  return (
    !data.rfcEmisor?.trim() ||
    !data.nombreEmisor?.trim() ||
    !data.total ||
    data.total <= 0 ||
    !data.folio?.trim() ||
    !data.fechaCompra?.trim()
  );
}

export function getRelativeTimeText(date: Date) {
  const diffMs = Date.now() - date.getTime();
  const diffSec = Math.floor(diffMs / 1000);
  const diffMin = Math.floor(diffSec / 60);
  const diffHr = Math.floor(diffMin / 60);
  const diffDays = Math.floor(diffHr / 24);

  if (diffSec < 60) return "Hace un momento";
  if (diffMin < 60) return `Hace ${diffMin} min`;
  if (diffHr < 24) return `Hace ${diffHr}h`;
  return `Hace ${diffDays}d`;
}

export function matchConnector(
  connectors: Connector[],
  tEmisorName: string,
  tEmisorRfc: string
): Connector | null {
  const cleanStr = (value: string) =>
    (value || "")
      .toLowerCase()
      .normalize("NFD")
      .replace(/[\u0300-\u036f]/g, "")
      .replace(/[^a-z0-9\s]/g, "")
      .replace(/\b(sa|de|cv|sapi|srl|grupo|comercial|cadena|tiendas|sucursal|santa|fe|magna|pemex)\b/g, "")
      .trim();

  const tRfc = (tEmisorRfc || "").toLowerCase().trim();
  const tNombre = cleanStr(tEmisorName || "");

  const found = connectors.find((connector) => {
    const cRfc = (connector.rfc || "").toLowerCase().trim();
    if (tRfc && cRfc && tRfc === cRfc) return true;

    const cNombre = cleanStr(connector.nombre || "");
    if (!tNombre || !cNombre) return false;

    if (tNombre.includes(cNombre) || cNombre.includes(tNombre)) return true;

    const tWords = tNombre.split(/\s+/).filter((word) => word.length > 2);
    const cWords = cNombre.split(/\s+/).filter((word) => word.length > 2);
    return tWords.some((word) => cWords.includes(word));
  });

  return found || null;
}
