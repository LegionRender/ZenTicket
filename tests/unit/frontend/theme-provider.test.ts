import { vi, describe, it, expect, beforeEach } from "vitest";
import React from "react";
import * as themeStorage from "../../../src/shared/theme/themeStorage";

// Mock document
const documentMock = (() => {
  const attrs: Record<string, string> = {};
  return {
    documentElement: {
      setAttribute: (name: string, val: string) => {
        attrs[name] = val;
      },
      getAttribute: (name: string) => attrs[name] || null,
      removeAttribute: (name: string) => {
        delete attrs[name];
      },
      className: "",
    }
  };
})();
Object.defineProperty(global, "document", { value: documentMock, writable: true, configurable: true });

// Mock window and localStorage
const localStorageMock = (() => {
  let store: Record<string, string> = {};
  return {
    getItem: (key: string) => store[key] || null,
    setItem: (key: string, value: string) => {
      store[key] = value.toString();
    },
    clear: () => {
      store = {};
    },
  };
})();
Object.defineProperty(global, "window", { value: { localStorage: localStorageMock } });
Object.defineProperty(global, "localStorage", { value: localStorageMock });

// Mock matchMedia
Object.defineProperty(global, "matchMedia", {
  writable: true,
  value: vi.fn().mockImplementation((query) => ({
    matches: false,
    media: query,
    onchange: null,
    addListener: vi.fn(),
    removeListener: vi.fn(),
    addEventListener: vi.fn(),
    removeEventListener: vi.fn(),
    dispatchEvent: vi.fn(),
  })),
});

// Mock firebase firestore updateDoc
const mockUpdateDoc = vi.fn();
vi.mock("firebase/firestore", () => {
  return {
    doc: vi.fn().mockReturnValue({ id: "mockDocId" }),
    updateDoc: (ref: any, data: any) => mockUpdateDoc(ref, data),
    getFirestore: vi.fn(),
  };
});

// Mock firebase auth
vi.mock("firebase/auth", () => {
  return {
    getAuth: vi.fn().mockReturnValue({ currentUser: { uid: "test-user-uid" } }),
  };
});

describe("themeStorage Unit Tests", () => {
  beforeEach(() => {
    localStorageMock.clear();
    mockUpdateDoc.mockClear();
    document.documentElement.removeAttribute("data-theme");
    document.documentElement.className = "";
  });

  it("themeStorage.getLocalTheme recupera el valor de localStorage o retorna default dark", () => {
    expect(themeStorage.getLocalTheme()).toBe("dark");

    themeStorage.saveLocalTheme("light");
    expect(themeStorage.getLocalTheme()).toBe("light");
  });

  it("themeStorage.saveFirestoreTheme actualiza la preferencia en Firestore", async () => {
    await themeStorage.saveFirestoreTheme("test-user-uid", "light");
    expect(mockUpdateDoc).toHaveBeenCalledWith(
      expect.anything(),
      { "preferences.theme": "light" }
    );
  });
});
