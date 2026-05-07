import { invoke } from "@tauri-apps/api/core";
import type {
  CodexConnection,
  CodexDashboardSummary,
  CodexTrayStatus,
  DashboardSummary,
  LoginInfo,
  TrayStatus,
} from "./types";

export async function getDashboard(): Promise<DashboardSummary> {
  return invoke<DashboardSummary>("get_dashboard");
}

export async function getLoginInfo(): Promise<LoginInfo> {
  return invoke<LoginInfo>("get_login_info");
}

export async function getTrayStatus(): Promise<TrayStatus> {
  return invoke<TrayStatus>("get_tray_status");
}

export async function quitApp(): Promise<void> {
  return invoke<void>("quit_app");
}

export async function getCodexDashboard(): Promise<CodexDashboardSummary> {
  return invoke<CodexDashboardSummary>("get_codex_dashboard");
}

export async function getCodexTrayStatus(): Promise<CodexTrayStatus> {
  return invoke<CodexTrayStatus>("get_codex_tray_status");
}

export async function codexLogin(): Promise<CodexConnection> {
  return invoke<CodexConnection>("codex_login");
}

export async function codexLogout(): Promise<void> {
  return invoke<void>("codex_logout");
}

export async function codexConnection(): Promise<CodexConnection> {
  return invoke<CodexConnection>("codex_connection");
}
