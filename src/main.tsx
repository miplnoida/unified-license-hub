import { createRoot } from "react-dom/client";
import { validateEnv } from "./lib/envValidation";
import App from "./App.tsx";
import "./index.css";

// Fail fast if required env vars are missing
validateEnv();

const rootEl = document.getElementById("root");
if (rootEl) {
  createRoot(rootEl).render(<App />);
}
