import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// https://vite.dev/config/
export default defineConfig({
  plugins: [react()],
  server: {
    proxy: {
      // During local dev with `vercel dev`, the API runs on the same port (3000).
      // When using `npm run dev:web` standalone, proxy to vercel dev port.
      '/api': {
        target: 'http://localhost:3000',
        changeOrigin: true,
      },
    },
  },
})
