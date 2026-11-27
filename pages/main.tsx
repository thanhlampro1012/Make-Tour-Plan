/// <reference types="vite/client" />
import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import TravelApp from "../app/travel-app";
import "../app/globals.css";

const container = document.getElementById("root");
if (!container) throw new Error("Không tìm thấy vùng hiển thị ứng dụng.");

createRoot(container).render(
  <StrictMode>
    <TravelApp user={null} mode="standalone" assetBase={import.meta.env.BASE_URL} />
  </StrictMode>,
);
