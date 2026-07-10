import { useEffect } from "react";
import AppRouter from "@/app/router/AppRouter";
import { ThemeProvider } from "@/app/providers/ThemeProvider";

function App() {
  useEffect(() => {
    // 1. Font Size
    const fontSizeChoice = localStorage.getItem("zenticket_font_size") || "medium";
    document.documentElement.setAttribute("data-font-size", fontSizeChoice);

    // 2. Border Radius
    const borderRadiusChoice = localStorage.getItem("zenticket_border_radius") || "standard";
    document.documentElement.setAttribute("data-radius", borderRadiusChoice);
  }, []);

  return (
    <ThemeProvider>
      <div className="App">
        <AppRouter />
      </div>
    </ThemeProvider>
  );
}

export default App;

