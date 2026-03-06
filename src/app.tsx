import { useState, useEffect } from "react";
import Dashboard from "./pages/dashboard";
import Onboarding from "./pages/onboarding";
import Settings from "./pages/settings";
import { loadProjects } from "./lib/tauri-commands";

type Page = "loading" | "onboarding" | "dashboard" | "settings";

function App() {
  const [page, setPage] = useState<Page>("loading");

  useEffect(() => {
    loadProjects()
      .then((config) => {
        const hasProjects = Object.keys(config.projects).length > 0;
        setPage(hasProjects ? "dashboard" : "onboarding");
      })
      .catch(() => {
        // First run — no projects.json yet
        setPage("onboarding");
      });
  }, []);

  return (
    <div className="min-h-screen bg-background text-foreground">
      {page === "loading" && (
        <div className="flex items-center justify-center min-h-screen">
          <p className="text-muted-foreground">Loading...</p>
        </div>
      )}
      {page === "onboarding" && (
        <Onboarding onComplete={() => setPage("dashboard")} />
      )}
      {page === "dashboard" && (
        <Dashboard onSettings={() => setPage("settings")} />
      )}
      {page === "settings" && (
        <Settings onBack={() => setPage("dashboard")} />
      )}
    </div>
  );
}

export default App;
