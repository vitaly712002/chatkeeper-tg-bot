import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// В режиме разработки (npm run dev) фронт работает на :5173, а запросы к /api
// проксируются на Go-бэкенд (:8080). Так не нужно думать про CORS.
export default defineConfig({
  plugins: [react()],
  server: {
    port: 5173,
    proxy: {
      '/api': {
        target: 'http://localhost:8080',
        changeOrigin: true,
        ws: true,
      },
    },
  },
})
