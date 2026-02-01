import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import { nodePolyfills } from 'vite-plugin-node-polyfills'
import path from 'path'

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
  ],
  resolve: {
    alias: {
      'async_hooks': path.resolve(__dirname, './src/shims/async_hooks.ts'),
      'node:async_hooks': path.resolve(__dirname, './src/shims/async_hooks.ts'),
    }
  },
  define: {
    'process.env': {},
    'global': 'globalThis',
  },
  server: {
    proxy: {
      '/api': {
        target: 'http://localhost:3001',
        changeOrigin: true,
        secure: false,
      }
    }
  },
  build: {
    chunkSizeWarningLimit: 1500,
    rollupOptions: {
      output: {
        manualChunks(id) {
          if (id.includes('node_modules')) {
            if (id.includes('@langchain')) {
              return 'langchain';
            }
            if (id.includes('lucide-react')) {
              return 'icons';
            }
            if (id.includes('react-syntax-highlighter') ||
              id.includes('prismjs') ||
              id.includes('react-markdown') ||
              id.includes('unified') ||
              id.includes('remark') ||
              id.includes('micromark') ||
              id.includes('vfile')) {
              return 'renderers';
            }
            if (id.includes('zod') || id.includes('axios')) {
              return 'utils';
            }
            // Group polyfills together
            if (id.includes('polyfill') || id.includes('node-libs-browser')) {
              return 'polyfills';
            }
            return 'vendor';
          }
        }
      }
    }
  }
})
