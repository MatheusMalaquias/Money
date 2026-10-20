import { defineConfig } from 'vitest/config'
import react from '@vitejs/plugin-react'

export default defineConfig({
  base: './', // funciona em qualquer subcaminho, como usuario.github.io/Money/
  plugins: [react()],
  test: { environment: 'node', passWithNoTests: true },
})
