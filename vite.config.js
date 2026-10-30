import { defineConfig } from "vite";

// Vite is only the development/build tool. The application uses React,
// plain JavaScript, semantic HTML, and a single ordinary CSS stylesheet.
export default defineConfig({
  esbuild: { jsx: "automatic" },
  server: {
    port: 5173,
    strictPort: true,
    proxy: { "/api": "http://127.0.0.1:3000" },
  },
  preview: { proxy: { "/api": "http://127.0.0.1:3000" } },
});
