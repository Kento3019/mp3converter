import react from '@vitejs/plugin-react'
import { defineConfig } from 'vite'

/** dev 時、画面から /api を叩くと常駐サーバへ転送する。 */
const apiPort = Number(process.env.PORT ?? 5487)

export default defineConfig({
  root: 'client',
  plugins: [react()],
  build: {
    outDir: '../dist/client',
    emptyOutDir: true,
  },
  server: {
    // 明示しないと環境によって IPv6 の [::1] だけに張り、
    // http://127.0.0.1:5173 で開けなくなる。
    host: '127.0.0.1',
    port: 5173,
    strictPort: true,
    proxy: {
      '/api': {
        target: `http://127.0.0.1:${apiPort}`,
        changeOrigin: false,
      },
    },
  },
})
