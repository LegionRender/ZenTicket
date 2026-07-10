import { vi, describe, it, expect, beforeEach } from "vitest";
import React from "react";
import { render, act } from "@testing-library/react";
import { ThemeProvider, useTheme } from "../../../src/app/providers/ThemeProvider";
import { themeStorage } from "../../../src/shared/theme/themeStorage";

// Mock localStorage
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

// A dummy component to consume useTheme hook
const TestComponent = () => {
  const { theme, setTheme } = useTheme();
  return (
    <div>
      <span data-testid="theme-val">{theme}</span>
      <button data-testid="btn-light" onClick={() => setTheme("light")}>Set Light</button>
      <button data-testid="btn-dark" onClick={() => setTheme("dark")}>Set Dark</button>
    </div>
  );
};

describe("ThemeProvider & themeStorage Unit Tests", () => {
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

  it("ThemeProvider inicializa con el valor por defecto e inyecta data-theme en documentElement", () => {
    localStorageMock.setItem("zenticket.theme", "light");

    const { getByTestId } = render(
      <ThemeProvider>
        <TestComponent />
      </ThemeProvider>
    );

    expect(getByTestId("theme-val").textContent).toBe("light");
    expect(document.documentElement.getAttribute("data-theme")).toBe("light");
  });

  it("ThemeProvider cambia de tema, actualiza localStorage y documentElement", () => {
    const { getByTestId } = render(
      <ThemeProvider>
        <TestComponent />
      </ThemeProvider>
    );

    expect(getByTestId("theme-val").textContent).toBe("dark"); // starts with dark

    act(() => {
      getByTestId("btn-light").click();
    });

    expect(getByTestId("theme-val").textContent).toBe("light");
    expect(localStorageMock.getItem("zenticket.theme")).toBe("light");
    expect(document.documentElement.getAttribute("data-theme")).toBe("light");
  });
});
