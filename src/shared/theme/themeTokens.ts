export type Theme = "light" | "dark" | "system";

export const THEME_KEY = "zenticket.theme";
export const THEME_LEGACY_KEY = "zenticket_theme";

export const getSystemTheme = (): "light" | "dark" => {
  if (typeof window === "undefined") return "dark";
  return window.matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light";
};
