import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';
import path from 'node:path';

export default defineConfig({
  base: '/',
  plugins: [react(), tailwindcss()],
  resolve: {
    alias: {
      '@core': path.resolve(__dirname, 'src/core'),
      '@render': path.resolve(__dirname, 'src/render'),
      '@app': path.resolve(__dirname, 'src/app'),
      '@host': path.resolve(__dirname, 'src/host'),
      '@content': path.resolve(__dirname, 'src/content'),
    },
  },
  build: {
    outDir: 'dist',
    assetsDir: 'assets',
    target: 'es2022',
  },
  worker: {
    format: 'es',
  },
  preview: {
    allowedHosts: ['transit.ahousedividedgame.com', 'localhost', '127.0.0.1'],
  },
});
