import { defineConfig, loadEnv, type UserConfig } from 'vite';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';
import { fileURLToPath } from 'node:url';

/**
 * Garde-fou Vercel : un build sans adresse d'API publique produirait un
 * dashboard qui appelle /api/v1 sur Vercel lui-même (page blanche à la
 * connexion). Le build échoue donc avec un message clair. Les builds locaux et
 * la CI, sans variable VERCEL, ne sont pas concernés.
 */
function assertVercelEnvironment(mode: string) {
  if (!process.env.VERCEL) return;
  const env = { ...loadEnv(mode, process.cwd(), 'VITE_'), ...process.env };
  const apiUrl = env.VITE_API_BASE_URL ?? '';
  if (!/^https:\/\/[^/]+.*\/api\/v1\/?$/.test(apiUrl))
    throw new Error(
      'VITE_API_BASE_URL doit être définie dans Vercel avec l’URL HTTPS de l’API, par exemple https://api.exemple.cm/api/v1.',
    );
  if (process.env.VERCEL_ENV === 'production' && env.VITE_ENABLE_DEMO_MODE === 'true')
    throw new Error('VITE_ENABLE_DEMO_MODE doit valoir false en production.');
}

export default defineConfig(({ mode }) => {
  assertVercelEnvironment(mode);
  return config(mode);
});

const config = (mode: string): UserConfig => ({
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
});
