import { createRoot } from "react-dom/client";
import App from "./App";
import "./index.css";

const _origFetch = window.fetch.bind(window);
(window as any).fetch = (input: RequestInfo | URL, init: RequestInit = {}) => {
  const token = localStorage.getItem("netguard_token") || "";
  if (token) {
    const existing = (init.headers as Record<string, string>) || {};
    init.headers = { ...existing, Authorization: `Bearer ${token}` };
  }
  return _origFetch(input, init);
};

createRoot(document.getElementById("root")!).render(<App />);
