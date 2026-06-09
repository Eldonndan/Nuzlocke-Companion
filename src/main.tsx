import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { App } from "./app/App";
import { OverlayScreen } from "./screens/OverlayScreen";
import "./styles.css";

const isOverlayWindow = new URLSearchParams(window.location.search).has("overlay");

createRoot(document.getElementById("root") as HTMLElement).render(
  <StrictMode>
    {isOverlayWindow ? <OverlayScreen /> : <App />}
  </StrictMode>,
);
