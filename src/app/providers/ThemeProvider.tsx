import React, { createContext, useContext, useEffect, useState } from "react";
import { useAuth } from "@/auth/context/AuthContext";
import { Theme, getSystemTheme } from "@/shared/theme/themeTokens";
import {
  getLocalTheme,
  saveLocalTheme,
  getFirestoreTheme,
  saveFirestoreTheme
} from "@/shared/theme/themeStorage";

interface ThemeContextType {
  theme: Theme;
  resolvedTheme: "light" | "dark";
  setTheme: (theme: Theme) => void;
}

const ThemeContext = createContext<ThemeContextType | undefined>(undefined);

export const ThemeProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const { user } = useAuth() || { user: null };
  const [theme, setThemeState] = useState<Theme>(() => getLocalTheme());
  const [resolvedTheme, setResolvedTheme] = useState<"light" | "dark">("dark");

  // Apply theme attributes to document.documentElement
  const applyTheme = (targetTheme: Theme) => {
    let active: "light" | "dark" = "dark";
    if (targetTheme === "system") {
      active = getSystemTheme();
    } else {
      active = targetTheme;
    }
    
    setResolvedTheme(active);
    document.documentElement.setAttribute("data-theme", active);
    
    // Also toggle the 'dark' class for Tailwind dark: modifiers
    if (active === "dark") {
      document.documentElement.classList.add("dark");
    } else {
      document.documentElement.classList.remove("dark");
    }
  };

  // Sync theme when state changes
  useEffect(() => {
    applyTheme(theme);
  }, [theme]);

  // Load Firestore theme once user is authenticated
  useEffect(() => {
    if (user?.uid) {
      getFirestoreTheme(user.uid).then((fsTheme) => {
        if (fsTheme) {
          setThemeState(fsTheme);
          saveLocalTheme(fsTheme);
        }
      });
    }
  }, [user?.uid]);

  // Listen to prefers-color-scheme changes when in system mode
  useEffect(() => {
    if (theme !== "system") return;

    const mediaQuery = window.matchMedia("(prefers-color-scheme: dark)");
    const handler = () => {
      applyTheme("system");
    };

    mediaQuery.addEventListener("change", handler);
    return () => mediaQuery.removeEventListener("change", handler);
  }, [theme]);

  const setTheme = async (newTheme: Theme) => {
    setThemeState(newTheme);
    saveLocalTheme(newTheme);
    if (user?.uid) {
      await saveFirestoreTheme(user.uid, newTheme);
    }
  };

  return (
    <ThemeContext.Provider value={{ theme, resolvedTheme, setTheme }}>
      {children}
    </ThemeContext.Provider>
  );
};

export const useTheme = () => {
  const context = useContext(ThemeContext);
  if (!context) {
    throw new Error("useTheme must be used within a ThemeProvider");
  }
  return context;
};
