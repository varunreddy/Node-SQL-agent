import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import { nodePolyfills } from 'vite-plugin-node-polyfills'

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
          return '\0virtual:async_hooks'
        }
      },
      load(id) {
        if (id === '\0virtual:async_hooks') {
          return `
            export class AsyncLocalStorage {
              disable() {}
              getStore() { return undefined; }
              run(_store, callback) { return callback(); }
              exit(callback) { return callback(); }
              enterWith(_store) {}
            }
            export class AsyncResource {
              constructor(type, triggerAsyncId) {}
              runInAsyncScope(fn, thisArg, ...args) { return fn.apply(thisArg, args); }
              emitDestroy() {}
              asyncId() { return 0; }
              triggerAsyncId() { return 0; }
            }
            export function executionAsyncId() { return 0; }
            export function triggerAsyncId() { return 0; }
          `
        }
      }
    }
  ],
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
