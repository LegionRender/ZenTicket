import { ERROR_CATALOG } from "./errorCatalog";

export function getFriendlyMessage(code: string): string {
  const catalogEntry = ERROR_CATALOG[code];
  if (catalogEntry) {
    return catalogEntry.userMessage;
  }
  return "Ocurrió un error inesperado al procesar el ticket. Por favor, reintenta más tarde.";
}
