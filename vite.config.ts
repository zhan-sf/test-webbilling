import react from '@vitejs/plugin-react'
import { loadEnv } from 'vite'
import { defineConfig } from 'vitest/config'

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), '')
  const proxy = {
    '/api': {
      target: env.PAYMENT_API_TARGET || 'http://localhost:8888',
      changeOrigin: true,
      secure: env.PAYMENT_API_TLS_VERIFY !== 'false',
      rewrite: (path: string) => path.replace(/^\/api/, ''),
    },
    '/mdapi': {
      target: env.MD_WEB_API_TARGET || 'http://localhost:6999',
      changeOrigin: true,
      secure: env.MD_WEB_API_TLS_VERIFY !== 'false',
      rewrite: (path: string) => path.replace(/^\/mdapi/, ''),
    },
  }

  return {
    plugins: [react()],
    server: { proxy },
    preview: { proxy },
    test: {
      environment: 'jsdom',
      setupFiles: './src/test/setup.ts',
      css: true,
      restoreMocks: true,
    },
  }
})
