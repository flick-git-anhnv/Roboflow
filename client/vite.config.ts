/// <reference types="vitest" />
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig({
  plugins: [react()],
  server: {
    port: 5173,
    host: true,
    proxy: {
      '/api': 'http://localhost:4000',
      '/uploads': 'http://localhost:4000',
    },
  },
  build: {
    // Khong tu chia manualChunks: cach chia truoc day dua tren id.includes('react')
    // vo tinh gom ca cac goi phu thuoc cua recharts (react-redux, react-is, ...) vao
    // chunk 'vendor-react' rieng, tao vong tham chieu voi chunk 'vendor-utils'
    // (Circular chunk: vendor-utils -> vendor-react -> vendor-utils). Vong nay khien
    // module bi truy cap truoc khi khoi tao luc runtime -> React khong mount duoc gi,
    // trang trang. De Rollup tu quyet dinh chia chunk, tranh tao vong lap.
    chunkSizeWarningLimit: 1000,
  },
  test: {
    globals: true,
    environment: 'jsdom',
    setupFiles: ['./src/test/setup.ts'],
    include: ['src/**/*.{test,spec}.{js,mjs,cjs,ts,mts,cts,jsx,tsx}'],
  },
});
