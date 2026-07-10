import { Page } from "playwright";

interface DomElementInfo {
  tagName: string;
  id: string;
  name: string;
  type: string;
  placeholder: string;
  role: string;
  value: string;
  textContent: string;
  ariaLabel: string;
  labelText: string;
  outerHTMLCompact: string;
}

/**
 * Extracts a simplified, token-efficient map of interactive elements on the page.
 */
async function extractInteractiveDom(page: Page): Promise<DomElementInfo[]> {
  try {
    return await page.evaluate(() => {
      const elements = Array.from(document.querySelectorAll("input, button, select, a, textarea, [role='button'], [role='link']"));
      return elements
        .map((el) => {
          const rect = el.getBoundingClientRect();
          const style = window.getComputedStyle(el);
          const isVisible = rect.width > 0 && rect.height > 0 && style.display !== "none" && style.visibility !== "hidden" && style.opacity !== "0";
          if (!isVisible) return null;

          return {
            tagName: el.tagName,
            id: el.getAttribute("id") || "",
            name: el.getAttribute("name") || "",
            type: el.getAttribute("type") || "",
            placeholder: el.getAttribute("placeholder") || "",
            role: el.getAttribute("role") || "",
            value: (el as any).value || "",
            textContent: el.textContent?.trim().slice(0, 100) || "",
            ariaLabel: el.getAttribute("aria-label") || "",
            labelText: (() => {
              if (el.id) {
                const lbl = document.querySelector(`label[for="${el.id}"]`);
                if (lbl) return lbl.textContent?.trim() || "";
              }
              const parentLabel = el.closest("label");
              if (parentLabel) return parentLabel.textContent?.trim() || "";
              return "";
            })(),
            outerHTMLCompact: el.outerHTML.slice(0, el.outerHTML.indexOf(">") + 1)
          };
        })
        .filter((x): x is DomElementInfo => x !== null);
    });
  } catch (err: any) {
    console.error("[SelfHealing] Failed to extract interactive DOM:", err);
    return [];
  }
}

/**
 * Uses a lightweight LLM (Google Gemini API) to suggest a corrected CSS selector.
 */
export async function healSelectorWithAi(
  page: Page,
  step: { type: string; selector: string; value?: string; label?: string; placeholder?: string },
  failedSelector: string,
  errorMessage: string
): Promise<{ healedSelector: string; explanation: string } | null> {
  const apiKey = process.env.GEMINI_API_KEY || "";
  if (!apiKey) {
    console.log("[SelfHealing] Skipping AI self-healing: GEMINI_API_KEY is not configured.");
    return null;
  }

  console.log(`[SelfHealing] Attempting to heal selector: "${failedSelector}"...`);
  const domTree = await extractInteractiveDom(page);
  if (domTree.length === 0) {
    console.warn("[SelfHealing] DOM tree extraction returned no visible elements.");
    return null;
  }

  const prompt = `
A selector "${failedSelector}" failed for a Playwright automation action of type "${step.type}" during a portal billing process.
Action Details: ${JSON.stringify(step)}
Playwright Error Message: ${errorMessage}

Here is a list of all visible interactive elements on the current webpage:
${JSON.stringify(domTree, null, 2)}

Find the most likely element that matches the intended action.
Return a JSON object with:
{
  "healedSelector": "a valid CSS selector to match the element (prefer id, name, placeholder, label, role, or unique combination)",
  "confidence": 0.0 to 1.0,
  "explanation": "why this selector was chosen"
}
`;

  try {
    const url = `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=${apiKey}`;
    const response = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        contents: [
          {
            parts: [
              { text: prompt }
            ]
          }
        ],
        generationConfig: {
          responseMimeType: "application/json"
        }
      })
    });

    if (!response.ok) {
      console.warn(`[SelfHealing] Gemini API request failed: ${response.statusText}`);
      return null;
    }

    const data: any = await response.json();
    const responseText = data.candidates?.[0]?.content?.parts?.[0]?.text;
    if (!responseText) {
      console.warn("[SelfHealing] Empty response from Gemini API.");
      return null;
    }

    const result = JSON.parse(responseText.trim());
    if (result.healedSelector && result.confidence > 0.4) {
      console.log(`[SelfHealing] LLM suggested healed selector: "${result.healedSelector}" (Confidence: ${result.confidence}). Explanation: ${result.explanation}`);
      return {
        healedSelector: result.healedSelector,
        explanation: result.explanation
      };
    } else {
      console.warn(`[SelfHealing] LLM suggestion confidence too low or selector missing:`, result);
    }
  } catch (err: any) {
    console.error("[SelfHealing] Gemini API error:", err);
  }

  return null;
}
