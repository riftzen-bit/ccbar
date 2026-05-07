import React, { Suspense } from "react";
import ReactDOM from "react-dom/client";
import "./index.css";

const Dashboard = React.lazy(() => import("./App"));
const TrayPopup = React.lazy(() => import("./TrayPopup"));

async function bootstrap() {
  // Mock-Tauri shim for `pnpm dev:mock` — also lets us pick a variant via
  // `?variant=trayFresh|trayEmpty|trayCritical|...` so the screenshot
  // pipeline can capture every state without a Tauri shell.
  if (import.meta.env.VITE_MOCK_TAURI === "1") {
    const params = new URLSearchParams(window.location.search);
    const variant = params.get("variant");
    if (variant) {
      (window as unknown as { __CCBAR_MOCK_VARIANT__?: string }).__CCBAR_MOCK_VARIANT__ = variant;
    }
    await import("./lib/mockTauri");
  }

  // Decide which surface to render. Two signals, in priority order:
  //   1. `?label=tray` query — used by the screenshot pipeline + manual mock testing.
  //   2. `getCurrentWebviewWindow().label` — the real Tauri window label.
  // We must NOT call `getCurrentWebviewWindow()` in mock mode because
  // `mockIPC` sets a partial `__TAURI_INTERNALS__` that lacks the
  // `metadata.currentWindow` field.
  let label: string;
  const params = new URLSearchParams(window.location.search);
  const labelParam = params.get("label");
  const isMock = import.meta.env.VITE_MOCK_TAURI === "1";
  if (labelParam) {
    label = labelParam;
  } else if (!isMock && "__TAURI_INTERNALS__" in window) {
    const { getCurrentWebviewWindow } = await import("@tauri-apps/api/webviewWindow");
    label = getCurrentWebviewWindow().label;
  } else {
    label = "main";
  }

  const root = ReactDOM.createRoot(document.getElementById("root") as HTMLElement);
  const Surface = label === "tray" ? TrayPopup : Dashboard;

  root.render(
    <React.StrictMode>
      <Suspense fallback={<div className="p-3 text-xs text-[var(--color-text-faint)]">loading…</div>}>
        <Surface />
      </Suspense>
    </React.StrictMode>,
  );
}

bootstrap();
