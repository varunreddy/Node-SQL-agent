import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import { nodePolyfills } from 'vite-plugin-node-polyfills'
import path from 'path'
import { fileURLToPath } from 'url'

const __dirname = path.dirname(fileURLToPath(import.meta.url))

// https://vite.dev/config/
export default defineConfig({
  plugins: [
    react(),
    nodePolyfills({
      globals: {
        Buffer: true,
        global: true,
        process: true,
      },
    }),
    {
      name: 'force-async-hooks-mock',
      enforce: 'pre',
      resolveId(id) {
        if (id === 'node:async_hooks' || id === 'async_hooks') {
          return path.resolve(__dirname, 'src/async_hooks_mock.ts')
        }
      }
    }
  ],
  resolve: {
    alias: {
      "node:async_hooks": path.resolve(__dirname, 'src/async_hooks_mock.ts'),
      "async_hooks": path.resolve(__dirname, 'src/async_hooks_mock.ts'),
    },
  },
  server: {
    proxy: {
      '/api': {
        target: 'http://localhost:3001',
        changeOrigin: true,
        secure: false,
      }
    }
  }
})
