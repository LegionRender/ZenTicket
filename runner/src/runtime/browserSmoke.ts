import { Browser, BrowserContext, chromium } from "playwright";

export interface BrowserSmokeResult {
  healthy: boolean;
  checkedAt: string;
  playwrightVersion: string;
  chromiumVersion?: string;
  executablePath: string;
  errorCode?: "PLAYWRIGHT_BROWSER_LAUNCH_FAILED";
  error?: string;
}

export async function runBrowserSmoke(): Promise<BrowserSmokeResult> {
  const checkedAt = new Date().toISOString();
  const executablePath = chromium.executablePath();
  const playwrightVersion = require("playwright/package.json").version as string;
  let browser: Browser | null = null;
  let context: BrowserContext | null = null;

  try {
    browser = await chromium.launch({ headless: true, executablePath });
    context = await browser.newContext();
    const page = await context.newPage();
    await page.setContent("<main>browser-smoke</main>");
    return {
      healthy: true,
      checkedAt,
      playwrightVersion,
      chromiumVersion: browser.version(),
      executablePath
    };
  } catch (error: any) {
    return {
      healthy: false,
      checkedAt,
      playwrightVersion,
      executablePath,
      errorCode: "PLAYWRIGHT_BROWSER_LAUNCH_FAILED",
      error: error?.message || String(error)
    };
  } finally {
    await context?.close().catch(() => undefined);
    await browser?.close().catch(() => undefined);
  }
}
