import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig({
  plugins: [react()],
  server: {
    // 後端 CORS 只允許 http://localhost:3000，所以固定用 3000。
    port: 3000,
    strictPort: true,
  },
  build: {
    // 沿用 Create React App 的輸出資料夾名稱。
    outDir: 'build',
  },
  test: {
    environment: 'jsdom',
    globals: true,
    setupFiles: './src/setupTests.js',
  },
});
