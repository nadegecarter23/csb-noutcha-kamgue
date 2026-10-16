import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';
import { fileURLToPath } from 'node:url';

export default defineConfig(({ mode }) => ({
  plugins: [react(), tailwindcss()],
  resolve: {
    alias: {
      '@': fileURLToPath(new URL('./src', import.meta.url)),
    },
  },
  server: {
    port: 5173,
    strictPort: true,
    proxy: {
      // Évite toute question de CORS en développement : le front appelle
      // /api et Vite relaie vers l'API locale.
      '/api': {
        target: 'http://localhost:3000',
        changeOrigin: true,
      },
    },
  },
  build: {
    outDir: 'dist',
    chunkSizeWarningLimit: 500,
    rollupOptions: {
      output: {
        manualChunks(id) {
          if (!id.includes('node_modules')) return undefined;
          if (
            id.includes('@tanstack/react-query') ||
            id.includes('react-router') ||
            id.includes('react-dom') ||
            id.includes('/react/') ||
            id.includes('use-sync-external-store')
          )
            return 'react';
          if (id.includes('i18next')) return 'i18n';
          if (id.includes('qrcode')) return 'qrcode';
          return undefined;
        },
      },
    },
    // Les sources restent disponibles en développement, mais ne sont pas
    // publiées avec le dashboard de production sur Vercel.
    sourcemap: mode !== 'production',
  },
}));
