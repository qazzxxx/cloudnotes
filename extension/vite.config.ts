import { defineConfig } from 'vite';
import { crx } from '@crxjs/vite-plugin';
import manifest from './manifest.config';

// crxjs：处理 popup/options（HTML 入口）、background（module service worker）、
// content script，并把每个入口打包成扩展可用的独立文件（HMR、manifest 校验都自带）。
export default defineConfig({
  plugins: [crx({ manifest })],
  build: {
    outDir: 'dist',
    emptyOutDir: true,
    sourcemap: false,
  },
});
