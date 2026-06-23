import { useEffect } from "react";
import AppRouter from "@/app/router/AppRouter";

function App() {
  useEffect(() => {
    // 1. Load and apply Theme choice
    const themeChoice = localStorage.getItem("zenticket_theme") || "dark";
    let activeTheme = themeChoice;
    if (themeChoice === "system") {
      activeTheme = window.matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light";
    }
    document.documentElement.setAttribute("data-theme", activeTheme);
    if (activeTheme === "dark") {
      document.documentElement.classList.add("dark");
    } else {
      document.documentElement.classList.remove("dark");
    }

    // 2. Font Size
    const fontSizeChoice = localStorage.getItem("zenticket_font_size") || "medium";
    document.documentElement.setAttribute("data-font-size", fontSizeChoice);

    // 3. Border Radius
    const borderRadiusChoice = localStorage.getItem("zenticket_border_radius") || "standard";
    document.documentElement.setAttribute("data-radius", borderRadiusChoice);
  }, []);

  return (
    <div className="App">
      <AppRouter />
    </div>
  );
}

export default App;

