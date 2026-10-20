import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

// base "./" : le site fonctionne aussi bien sur https://<user>.github.io/<repo>/ qu'en local.
export default defineConfig({
  base: "./",
  plugins: [react()],
});
