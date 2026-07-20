import { defineConfig } from '@tarojs/cli';
import * as path from 'path';

export default defineConfig({
  projectName: 'wuxing-music',
  date: '2026-5-23',
  designWidth: 750,
  deviceRatio: { 640: 2.34 / 2, 750: 1, 828: 1.81 / 2 },
  sourceRoot: 'src',
  outputRoot: 'dist',
  plugins: [],
  defineConstants: {},
  copy: { patterns: [], options: {} },
  framework: 'react',
  compiler: 'vite',
  alias: {
    '@': path.resolve(__dirname, '..', 'src')
  },
  mini: {
    postcss: {
      pxtransform: { enable: true, config: {} },
      cssModules: { enable: false }
    }
  },
  h5: {
    publicPath: '/',
    staticDirectory: 'static',
    // dev:h5 时 API_BASE 为空（同源），本地需把 /api、/uploads 代理到后端。
    // 改成你的本地后端地址；生产由容器内 nginx 反代（见 docker/h5.nginx.conf）。
    devServer: {
      proxy: {
        '/api': { target: 'http://127.0.0.1:8000', changeOrigin: true },
        '/uploads': { target: 'http://127.0.0.1:8000', changeOrigin: true }
      }
    },
    postcss: {
      autoprefixer: { enable: true },
      cssModules: { enable: false }
    }
  }
});
