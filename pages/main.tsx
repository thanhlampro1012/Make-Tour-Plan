/// <reference types="vite/client" />
import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import TravelApp from "../app/travel-app";
import { backupSchema, type Trip } from "../lib/travel";
import "../app/globals.css";

const container = document.getElementById("root");
if (!container) throw new Error("Không tìm thấy vùng hiển thị ứng dụng.");
const root = createRoot(container);
const shared = new URLSearchParams(location.search).get("shared") === "1";

function renderApp(session?: { username: string; storage: Storage }) {
  root.render(
    <StrictMode>
      <TravelApp key={session?.username ?? "personal"} user={null} mode="standalone"
        assetBase={import.meta.env.BASE_URL} sharedSession={session} />
    </StrictMode>,
  );
}

function openShared(username: string, trips: Trip[]): Storage {
  if (!shared) throw new Error("Mở liên kết máy dùng chung để bắt đầu phiên riêng.");
  const data = new Map<string, string>();
  const storage: Storage = {
    get length() { return data.size; },
    key: index => Array.from(data.keys())[index] ?? null,
    getItem: key => data.get(key) ?? null,
    setItem: (key, value) => { data.set(key, value); },
    removeItem: key => { data.delete(key); },
    clear: () => data.clear(),
  };
  const backup = backupSchema.parse({ version: 1, trips });
  storage.setItem("make-tour-plan:shared:v1:preview:clean", JSON.stringify({ ...backup, dirty: false, revision: 1 }));
  renderApp({ username, storage });
  return storage;
}

// The standalone Gist panel and the React editor validate the same backup format.
Object.assign(window, { tourWorkspace: {
  openShared,
  validBackup: (value: unknown) => backupSchema.safeParse(value).success,
} });

if (!shared) renderApp();
