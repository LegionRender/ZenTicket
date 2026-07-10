import { PortalSnapshot } from "../../../shared/diagnostics/diagnostic-types";

export const capturePortalSnapshot = async (page: any, screenshotPath?: string | null): Promise<PortalSnapshot> => {
  if (!page) {
    return {
      currentUrlSanitized: "no_active_page",
      timestamp: new Date().toISOString(),
      screenshotPath: screenshotPath || null
    };
  }

  try {
    const currentUrl = page.url() || "";
    const currentUrlSanitized = currentUrl.split("?")[0];

    const metadata = await page.evaluate(() => {
      const buttons: string[] = [];
      const links: string[] = [];
      const forms: string[] = [];
      const inputs: string[] = [];
      const labels: string[] = [];
      const downloadCandidates: string[] = [];

      const visibleText = document.body.innerText ? document.body.innerText.substring(0, 1000) : "";

      document.querySelectorAll("button, input[type='button'], input[type='submit']").forEach(btn => {
        const text = (btn.textContent || (btn as any).value || "").trim().substring(0, 30);
        if (text) buttons.push(text);
      });

      document.querySelectorAll("a").forEach(a => {
        const text = (a.textContent || "").trim().substring(0, 30);
        const href = a.getAttribute("href") || "";
        if (text) links.push(`${text} (${href.split("?")[0]})`);
        if (href.includes(".xml") || href.includes(".pdf") || href.includes("download") || href.includes("descarga")) {
          downloadCandidates.push(text || href.substring(0, 30));
        }
      });

      document.querySelectorAll("form").forEach(f => {
        forms.push(f.getAttribute("id") || f.getAttribute("name") || "unnamed_form");
      });

      document.querySelectorAll("input").forEach(inp => {
        const type = inp.getAttribute("type") || "text";
        const name = inp.getAttribute("name") || inp.getAttribute("id") || "unnamed";
        inputs.push(`${name} (${type})`);
      });

      document.querySelectorAll("label").forEach(lbl => {
        const text = (lbl.textContent || "").trim().substring(0, 30);
        if (text) labels.push(text);
      });

      let activeModalText: string | null = null;
      const modal = document.querySelector(".modal, .dialog, [role='dialog'], .alert");
      if (modal && (modal as any).innerText) {
        activeModalText = (modal as any).innerText.substring(0, 200);
      }

      return {
        visibleText,
        buttonsDetected: Array.from(new Set(buttons)).slice(0, 10),
        linksDetected: Array.from(new Set(links)).slice(0, 10),
        formsDetected: Array.from(new Set(forms)).slice(0, 5),
        inputsDetected: Array.from(new Set(inputs)).slice(0, 15),
        labelsDetected: Array.from(new Set(labels)).slice(0, 15),
        downloadCandidates: Array.from(new Set(downloadCandidates)).slice(0, 5),
        activeModalText
      };
    });

    return {
      ...metadata,
      currentUrlSanitized,
      screenshotPath: screenshotPath || null,
      timestamp: new Date().toISOString()
    };
  } catch (err) {
    console.error("Error capturing portal snapshot:", err);
    return {
      currentUrlSanitized: "error_capturing",
      timestamp: new Date().toISOString(),
      screenshotPath: screenshotPath || null
    };
  }
};
