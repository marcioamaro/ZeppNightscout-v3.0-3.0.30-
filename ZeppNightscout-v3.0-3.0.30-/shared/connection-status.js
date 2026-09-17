import { localStorage } from "./storage";
import { loadSettings } from "./settings";

const GREEN = 0x00CC66;
const YELLOW = 0xFFAA00;
const RED = 0xFF5555;

function number(value) { const n = Number(value); return isFinite(n) && n > 0 ? n : 0; }
function timestamp(value) {
  if (typeof value === "number") return value > 0 && value < 100000000000 ? value * 1000 : value;
  const numeric = number(value);
  if (numeric) return numeric < 100000000000 ? numeric * 1000 : numeric;
  const parsed = Date.parse(value || "");
  return isFinite(parsed) ? parsed : 0;
}
function ageMinutes(value, now) { const time = timestamp(value); return time ? Math.max(0, Math.floor((now - time) / 60000)) : -1; }
function ageText(minutes) { return minutes < 0 ? "SEM DADO" : minutes === 0 ? "AGORA" : minutes + " MIN"; }
function storedJson(key) { try { return JSON.parse(localStorage.getItem(key) || "null"); } catch (e) { return null; } }
function httpPort(url) { const match = String(url || "").match(/^https?:\/\/[^/:]+(?::(\d+))?/i); if (match && match[1]) return match[1]; return /^https:/i.test(String(url || "")) ? "443" : "80"; }

export function getConnectionStatus(settings, now) {
  const config = settings || loadSettings();
  const current = now || Date.now();
  const interval = Number(config.backgroundInterval) || 5;
  // A reading is still usable for ten full minutes. Delayed is deliberately
  // reserved for readings older than that; expired is a separate, later state.
  const delayedMinutes = 10;
  const staleMinutes = Math.max(20, interval * 4);
  const reading = storedJson("zightscout_last_data");
  const readingMinutes = ageMinutes(reading && reading.readingTimestamp, current);
  const fetchAt = number(localStorage.getItem("zightscout_last_fetch_at"));
  const fetchMinutes = fetchAt ? Math.max(0, Math.floor((current - fetchAt) / 60000)) : -1;
  const lastContact = number(localStorage.getItem("zightscout_ble_last_contact"));
  const blePort = number(localStorage.getItem("zightscout_ble_port"));
  const httpPortValue = httpPort(config.apiUrl);
  const lastDisconnect = number(localStorage.getItem("zightscout_ble_last_disconnect"));
  const contactMinutes = lastContact ? Math.max(0, Math.floor((current - lastContact) / 60000)) : -1;
  const connectionLimitMs = Math.max(120000, interval * 90000);
  const bleDisconnected = lastDisconnect && lastDisconnect >= lastContact;
  const ble = bleDisconnected ? { label: "BLE OFF", detail: "desconectado", color: RED, level: "red" } : !lastContact ? { label: "BLE AGUARDA", detail: "aguardando telefone", color: YELLOW, level: "yellow" } : current - lastContact > connectionLimitMs ? { label: "BLE AGUARDA", detail: "sem contato recente", color: YELLOW, level: "yellow" } : { label: "BLE OK", detail: "contato há " + ageText(contactMinutes), color: GREEN, level: "green" };
  const lastError = storedJson("zightscout_last_fetch_error");
  const http = !config.apiUrl ? { label: "HTTP URL", detail: "URL não configurada", color: RED, level: "red" } : lastError ? { label: "HTTP ERRO", detail: String(lastError.message || "consulta falhou"), color: RED, level: "red" } : fetchMinutes < 0 ? { label: "HTTP AGUARDA", detail: "sem consulta", color: YELLOW, level: "yellow" } : fetchMinutes >= staleMinutes ? { label: "HTTP AGUARDA", detail: "consulta há " + ageText(fetchMinutes), color: YELLOW, level: "yellow" } : { label: "HTTP OK", detail: "consulta há " + ageText(fetchMinutes), color: GREEN, level: "green" };
  // The precise update time is displayed in its own line. Keeping an age here
  // made the compact BLE/HTTP line repeat that information on every refresh.
  const readingState = readingMinutes < 0 ? { label: "SEM LEITURA", detail: "aguardando glicemia", color: YELLOW, level: "yellow" } : readingMinutes >= staleMinutes ? { label: "VENCIDO", detail: "leitura há " + ageText(readingMinutes), color: RED, level: "red" } : readingMinutes > delayedMinutes ? { label: "ATRASADO", detail: "leitura há " + ageText(readingMinutes), color: YELLOW, level: "yellow" } : { label: "ATUAL", detail: "leitura atualizada", color: GREEN, level: "green" };
  const level = [ble, http, readingState].some(item => item.level === "red") ? "red" : [ble, http, readingState].some(item => item.level === "yellow") ? "yellow" : "green";
  const color = level === "red" ? RED : level === "yellow" ? YELLOW : GREEN;
  const bleText = ble.label + (blePort ? " P" + blePort : "");
  const httpText = http.label + (config.apiUrl ? ":" + httpPortValue : "");
  return { ble, http, reading: readingState, level, color, text: bleText + " | " + httpText + " | " + readingState.label, detail: "BLE: " + ble.detail + (blePort ? " (porta " + blePort + ")" : "") + " • HTTP: " + http.detail + (config.apiUrl ? " (porta " + httpPortValue + ")" : "") + " • " + readingState.detail };
}
