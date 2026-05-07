import { mockIPC } from "@tauri-apps/api/mocks";
import {
  pickCodexConnection,
  pickCodexDashboard,
  pickCodexTrayStatus,
  pickDashboard,
  pickLogin,
  pickTrayStatus,
  type MockVariant,
} from "./mockData";

declare global {
  interface Window {
    __CCBAR_MOCK_VARIANT__?: MockVariant;
  }
}

const variant = (): MockVariant =>
  (typeof window !== "undefined" && window.__CCBAR_MOCK_VARIANT__) || "default";

mockIPC((cmd) => {
  switch (cmd) {
    case "get_dashboard":
      return pickDashboard(variant());
    case "get_login_info":
      return pickLogin(variant());
    case "get_tray_status":
      return pickTrayStatus(variant());
    case "get_codex_dashboard":
      return pickCodexDashboard(variant());
    case "get_codex_tray_status":
      return pickCodexTrayStatus(variant());
    case "codex_connection":
      return pickCodexConnection(variant());
    case "codex_login":
      // Return a freshly-connected fixture so the gate transitions to data view.
      return pickCodexConnection("codexFresh");
    case "codex_logout":
      return undefined;
    case "quit_app":
      return undefined;
    default:
      return undefined;
  }
});

if (typeof window !== "undefined") {
  // eslint-disable-next-line no-console
  console.info(
    `[ccbar mock] Tauri IPC mocked · variant="${variant()}". Set window.__CCBAR_MOCK_VARIANT__ before reload to switch.`,
  );
}
