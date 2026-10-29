import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'

export default defineConfig({
  // Electron production loads dist/index.html through file://, so asset paths must be relative.
  base: './',
  plugins: [react(), tailwindcss()],
})
