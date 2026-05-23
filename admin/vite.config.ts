import { defineConfig } from 'vite';
import vue from '@vitejs/plugin-vue';
import { fileURLToPath, URL } from 'node:url';

export default defineConfig({
  plugins: [vue()],
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
        target: 'http://localhost:8000',
        changeOrigin: true
      }
    }
  }
});
