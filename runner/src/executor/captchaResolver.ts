import { Page, Locator } from "playwright";

/**
 * Finds the CAPTCHA image element on the active page.
 */
export async function findCaptchaImageElement(page: Page, captchaSelectors: string[] = []): Promise<Locator | null> {
  const defaultSelectors = [
    "img[src*='captcha' i]",
    "img[id*='captcha' i]",
    "img[class*='captcha' i]",
    "img[src*='secur' i]",
    "img[src*='code' i]",
    "img[src*='show' i]",
    "img[src*='image' i]",
    "img#captcha",
    "img#imgCaptcha",
    "img#img_captcha",
    "#captchaImage",
    "img.captcha",
    // Fallbacks for specific common portals
    "img[src*='Captcha' i]",
    "img[src*='valida' i]"
  ];

  const allSelectors = [...new Set([...captchaSelectors, ...defaultSelectors])];

  for (const selector of allSelectors) {
    const loc = page.locator(selector).first();
    if (await loc.isVisible().catch(() => false)) {
      return loc;
    }
  }

  // Fallback: search for any visible image next to a text input that has a name/id with "captcha" or "codigo"
  try {
    const inputs = page.locator("input[name*='captcha' i], input[id*='captcha' i], input[placeholder*='código' i], input[placeholder*='codigo' i]");
    const inputCount = await inputs.count().catch(() => 0);
    if (inputCount > 0) {
      const imgs = page.locator("img:visible");
      const imgCount = await imgs.count().catch(() => 0);
      if (imgCount > 0) {
        return imgs.first();
      }
    }
  } catch {}

  return null;
}

/**
 * Solves an image CAPTCHA (Base64 encoded) using CapSolver.
 */
async function solveWithCapSolver(apiKey: string, base64Image: string): Promise<string | null> {
  try {
    console.log("[CaptchaResolver] Sending CAPTCHA to CapSolver...");
    const response = await fetch("https://api.capsolver.com/createTask", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        clientKey: apiKey,
        task: {
          type: "ImageToTextTask",
          body: base64Image
        }
      })
    });

    if (!response.ok) {
      console.warn(`[CaptchaResolver] CapSolver request failed: ${response.statusText}`);
      return null;
    }

    const data: any = await response.json();
    if (data.errorId === 0 && data.solution?.text) {
      console.log(`[CaptchaResolver] CapSolver solved CAPTCHA: ${data.solution.text}`);
      return data.solution.text;
    } else {
      console.warn("[CaptchaResolver] CapSolver returned an error:", data);
    }
  } catch (err: any) {
    console.error("[CaptchaResolver] CapSolver API error:", err);
  }
  return null;
}

/**
 * Solves an image CAPTCHA (Base64 encoded) using 2Captcha.
 */
async function solveWithTwoCaptcha(apiKey: string, base64Image: string): Promise<string | null> {
  try {
    console.log("[CaptchaResolver] Sending CAPTCHA to 2Captcha...");
    const response = await fetch("https://2captcha.com/in.php", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        key: apiKey,
        method: "base64",
        body: base64Image,
        json: 1
      })
    });

    if (!response.ok) {
      console.warn(`[CaptchaResolver] 2Captcha upload failed: ${response.statusText}`);
      return null;
    }

    const initData: any = await response.json();
    if (initData.status !== 1 || !initData.request) {
      console.warn("[CaptchaResolver] 2Captcha upload returned error:", initData);
      return null;
    }

    const taskId = initData.request;
    console.log(`[CaptchaResolver] 2Captcha Task created. ID: ${taskId}. Polling for solution...`);

    // Poll 2Captcha for solution (timeout after 60 seconds)
    const startTime = Date.now();
    while (Date.now() - startTime < 60000) {
      await new Promise((r) => setTimeout(r, 3000));
      const res = await fetch(`https://2captcha.com/res.php?key=${apiKey}&action=get&id=${taskId}&json=1`);
      if (res.ok) {
        const resData: any = await res.json();
        if (resData.status === 1 && resData.request) {
          console.log(`[CaptchaResolver] 2Captcha solved CAPTCHA: ${resData.request}`);
          return resData.request;
        } else if (resData.request === "CAPCHA_NOT_READY") {
          continue;
        } else {
          console.warn("[CaptchaResolver] 2Captcha returned polling error:", resData);
          break;
        }
      }
    }
  } catch (err: any) {
    console.error("[CaptchaResolver] 2Captcha API error:", err);
  }
  return null;
}

/**
 * Entry point to resolve a CAPTCHA on the page.
 */
export async function solveCaptchaOnPage(page: Page, captchaSelectors: string[] = []): Promise<string | null> {
  const capSolverKey = process.env.CAPSOLVER_API_KEY || "";
  const twoCaptchaKey = process.env.TWOCAPTCHA_API_KEY || "";

  if (!capSolverKey && !twoCaptchaKey) {
    console.log("[CaptchaResolver] Skipping auto-resolution: No API keys configured in environment.");
    return null;
  }

  const captchaImg = await findCaptchaImageElement(page, captchaSelectors);
  if (!captchaImg) {
    console.warn("[CaptchaResolver] Could not locate CAPTCHA image element on page.");
    return null;
  }

  try {
    // Take a screenshot of the specific CAPTCHA image
    const screenshotBuffer = await captchaImg.screenshot({ type: "png" });
    const base64Image = screenshotBuffer.toString("base64");

    if (capSolverKey) {
      return await solveWithCapSolver(capSolverKey, base64Image);
    } else if (twoCaptchaKey) {
      return await solveWithTwoCaptcha(twoCaptchaKey, base64Image);
    }
  } catch (err: any) {
    console.error("[CaptchaResolver] Failed to capture or solve CAPTCHA:", err);
  }

  return null;
}
