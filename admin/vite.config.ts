import { defineConfig } from 'vite';
import vue from '@vitejs/plugin-vue';
import tailwindcss from '@tailwindcss/vite';
import { fileURLToPath, URL } from 'node:url';
import { randomUUID } from 'node:crypto';

const adminBuildId = randomUUID();

export default defineConfig({
  plugins: [vue(), tailwindcss(), {
    name: 'admin-build-version',
    generateBundle() {
      this.emitFile({ type: 'asset', fileName: 'admin-version.json', source: JSON.stringify({ schema: 1, buildId: adminBuildId }) });
    },
  }],
  define: { __ADMIN_BUILD_ID__: JSON.stringify(adminBuildId) },
  resolve: {
    alias: {
      '@': fileURLToPath(new URL('./src', import.meta.url))
    }
  },
  server: {
    port: 5173,
    proxy: {
      // 开发期把 /api 代理到后端，避免跨域
      '/api': {
        target: process.env.ADMIN_API_PROXY_TARGET || 'http://localhost:8000',
        changeOrigin: true
      }
    }
  }
});
