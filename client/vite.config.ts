import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig({
  plugins: [react()],
  server: {
    port: 5173,
    // Bind ra 0.0.0.0 (mọi network interface) — mặc định Vite chỉ bind
    // localhost, khiến máy khác trong LAN không kết nối được dù đã mở
    // firewall (firewall chỉ chặn ở tầng OS, không liên quan việc Vite có
    // LẮNG NGHE trên interface LAN hay không).
    host: true,
    proxy: {
      '/api': 'http://localhost:4000',
      '/uploads': 'http://localhost:4000',
    },
  },
});
