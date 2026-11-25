import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

// Vite configuration for CollabFlow Frontend
// https://vitejs.dev/config/
export default defineConfig({
  plugins: [react()],
  server: {
    port: 5173, // Enforcing port 5173 as required by Phase 1 specification
    strictPort: true, // If 5173 is in use, throw error rather than silently picking another port
  },
});
