import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import { studioTagger } from "./plugins/studioTagger";

export default defineConfig({
  plugins: [react(), studioTagger()],
  server: {
    host: "127.0.0.1"
  }
});
