import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// In dev, PocketBase runs separately on :8090 — proxy its routes.
export default defineConfig({
  plugins: [react()],
  server: {
    proxy: {
      '/api': 'http://127.0.0.1:8090',
      '/_': 'http://127.0.0.1:8090',
    },
  },
})
