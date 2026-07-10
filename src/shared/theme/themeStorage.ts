import { doc, getDoc, updateDoc } from "firebase/firestore";
import { db } from "@/services/firebase/firebase";
import { Theme, THEME_KEY, THEME_LEGACY_KEY } from "./themeTokens";

export const getLocalTheme = (): Theme => {
  if (typeof window === "undefined") return "dark";
  const stored = localStorage.getItem(THEME_KEY) || localStorage.getItem(THEME_LEGACY_KEY);
  return (stored as Theme) || "dark";
};

export const saveLocalTheme = (theme: Theme): void => {
  if (typeof window === "undefined") return;
  localStorage.setItem(THEME_KEY, theme);
  localStorage.setItem(THEME_LEGACY_KEY, theme); // keep legacy synchronized
};

export const getFirestoreTheme = async (uid: string): Promise<Theme | null> => {
  try {
    const userRef = doc(db, "users", uid);
    const userSnap = await getDoc(userRef);
    if (userSnap.exists()) {
      const data = userSnap.data();
      if (data?.preferences?.theme) {
        return data.preferences.theme as Theme;
      }
    }
  } catch (error) {
    console.error("Error loading theme from Firestore:", error);
  }
  return null;
};

export const saveFirestoreTheme = async (uid: string, theme: Theme): Promise<void> => {
  try {
    const userRef = doc(db, "users", uid);
    // Use updateDoc to avoid overwriting other fields in users/{uid}
    await updateDoc(userRef, {
      "preferences.theme": theme
    });
  } catch (error) {
    console.error("Error saving theme to Firestore:", error);
  }
};
