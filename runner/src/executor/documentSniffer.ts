import { BrowserContext, Page, Response } from "playwright";
import * as fs from "fs";
import * as path from "path";
import AdmZip from "adm-zip";

export interface SniffedDocument {
  xmlPath?: string;
  pdfPath?: string;
  source?: "download" | "network" | "blob" | "zip" | "newTab" | "base64";
}

export interface NetworkSniffer {
  captures: Array<Promise<{ contentType: string; body: Buffer; url: string } | null>>;
  dispose: () => void;
}

export function setupNetworkSniffer(page: Page): NetworkSniffer {
  const captures: NetworkSniffer["captures"] = [];
  const handler = (response: Response) => {
    const contentType = String(response.headers()["content-type"] || "").toLowerCase();
    if (!/(xml|pdf|zip|octet-stream)/i.test(contentType)) return;
    captures.push(response.body()
      .then(body => ({ contentType, body, url: response.url() }))
      .catch(() => null));
  };
  page.on("response", handler);
  return { captures, dispose: () => page.off("response", handler) };
}

function saveBuffer(tmpDir: string, filename: string, body: Buffer): string {
  const target = path.join(tmpDir, filename);
  fs.writeFileSync(target, body);
  return target;
}

function extractZip(zipPath: string, tmpDir: string): SniffedDocument {
  const zip = new AdmZip(zipPath);
  let xmlPath: string | undefined;
  let pdfPath: string | undefined;
  for (const entry of zip.getEntries()) {
    const ext = path.extname(entry.entryName).toLowerCase();
    if (entry.isDirectory || ![".xml", ".pdf"].includes(ext)) continue;
    const target = saveBuffer(tmpDir, `zip-${path.basename(entry.entryName)}`, entry.getData());
    if (ext === ".xml" && !xmlPath) xmlPath = target;
    if (ext === ".pdf" && !pdfPath) pdfPath = target;
  }
  return { xmlPath, pdfPath, source: "zip" };
}

export async function collectDocuments(
  page: Page,
  _context: BrowserContext,
  tmpDir: string,
  downloadedFiles: Array<{ filename: string; path: string }>,
  sniffer: NetworkSniffer
): Promise<SniffedDocument> {
  let xmlPath = downloadedFiles.find(f => f.filename.toLowerCase().endsWith(".xml"))?.path;
  let pdfPath = downloadedFiles.find(f => f.filename.toLowerCase().endsWith(".pdf"))?.path;
  const zipFile = downloadedFiles.find(f => f.filename.toLowerCase().endsWith(".zip"));
  if (zipFile && (!xmlPath || !pdfPath)) {
    const extracted = extractZip(zipFile.path, tmpDir);
    xmlPath ||= extracted.xmlPath;
    pdfPath ||= extracted.pdfPath;
    if (xmlPath) return { xmlPath, pdfPath, source: "zip" };
  }
  if (xmlPath) return { xmlPath, pdfPath, source: "download" };

  const captures = await Promise.all(sniffer.captures);
  for (const capture of captures.filter(Boolean) as Array<{ contentType: string; body: Buffer; url: string }>) {
    if (capture.contentType.includes("zip")) {
      const extracted = extractZip(saveBuffer(tmpDir, "network-download.zip", capture.body), tmpDir);
      xmlPath ||= extracted.xmlPath;
      pdfPath ||= extracted.pdfPath;
    } else if (/<(?:cfdi:)?Comprobante[\s>]/i.test(capture.body.toString("utf8"))) {
      xmlPath ||= saveBuffer(tmpDir, "network-cfdi.xml", capture.body);
    } else if (capture.contentType.includes("pdf") || capture.body.subarray(0, 4).toString() === "%PDF") {
      pdfPath ||= saveBuffer(tmpDir, "network-cfdi.pdf", capture.body);
    }
  }
  if (xmlPath) return { xmlPath, pdfPath, source: "network" };

  const blobDocuments = await page.evaluate(async () => {
    const urls = Array.from(document.querySelectorAll("a[href^='blob:'], embed[src^='blob:']"))
      .map(el => el.getAttribute("href") || el.getAttribute("src") || "").filter(Boolean);
    const results: Array<{ type: string; base64: string }> = [];
    for (const url of urls) {
      try {
        const response = await fetch(url);
        const blob = await response.blob();
        const bytes = new Uint8Array(await blob.arrayBuffer());
        let binary = "";
        for (const byte of bytes) binary += String.fromCharCode(byte);
        results.push({ type: blob.type, base64: btoa(binary) });
      } catch {
        // Ignore revoked or cross-origin blobs.
      }
    }
    return results;
  }).catch(() => [] as Array<{ type: string; base64: string }>);
  for (const blob of blobDocuments) {
    const body = Buffer.from(blob.base64, "base64");
    if (blob.type.includes("xml") || body.toString("utf8", 0, 200).includes("Comprobante")) {
      xmlPath ||= saveBuffer(tmpDir, "blob-cfdi.xml", body);
    }
    if (blob.type.includes("pdf") || body.subarray(0, 4).toString() === "%PDF") {
      pdfPath ||= saveBuffer(tmpDir, "blob-cfdi.pdf", body);
    }
  }
  if (xmlPath) return { xmlPath, pdfPath, source: "blob" };

  const dataUrls = await page.locator("a[href^='data:application/'], embed[src^='data:application/']").evaluateAll(elements =>
    elements.map(el => el.getAttribute("href") || el.getAttribute("src") || "").filter(Boolean)
  ).catch(() => [] as string[]);
  for (const dataUrl of dataUrls) {
    const match = dataUrl.match(/^data:([^;,]+);base64,(.+)$/);
    if (!match) continue;
    const body = Buffer.from(match[2], "base64");
    if (match[1].includes("xml")) xmlPath ||= saveBuffer(tmpDir, "base64-cfdi.xml", body);
    if (match[1].includes("pdf")) pdfPath ||= saveBuffer(tmpDir, "base64-cfdi.pdf", body);
  }
  return { xmlPath, pdfPath, source: xmlPath ? "base64" : undefined };
}
