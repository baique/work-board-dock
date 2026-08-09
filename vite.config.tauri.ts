import path from 'node:path'
import react from '@vitejs/plugin-react-swc'
import { defineConfig } from 'vite'

const host = process.env.TAURI_DEV_HOST
const devPort = 5180

export default defineConfig({
  root: './',
  base: '/',

  plugins: [react()],

  resolve: {
    alias: {
      '@': `${path.resolve(__dirname, 'src/renderer')}/`,
      '@renderer/': `${path.resolve(__dirname, 'src/renderer')}/`,
      '@shared/': `${path.resolve(__dirname, 'src/shared')}/`
    }
  },

  // Vite dev server config for Tauri
  server: {
    port: devPort,
    strictPort: true,
    host: host || false,
    watch: {
      ignored: ['**/src-tauri/**']
    }
  },

  build: {
    outDir: 'dist-tauri',
    emptyOutDir: true,
    rollupOptions: {
      input: path.resolve(__dirname, 'tauri-index.html')
    },
    target: 'esnext'
  },

  envPrefix: ['VITE_', 'TAURI_ENV_*']
})
