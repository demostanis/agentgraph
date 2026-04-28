import { defineConfig } from "vite";

export default defineConfig({
  clearScreen: false,
  envPrefix: ["VITE_", "TAURI_"],
  server: {
    host: "0.0.0.0",
    port: 1420,
    strictPort: true,
  },
});
