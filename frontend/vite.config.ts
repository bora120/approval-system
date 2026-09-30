import react from '@vitejs/plugin-react'
import { defineConfig } from 'vite'

export default defineConfig({
  plugins: [react()],
  server: {
    port: 5173,
    // /api 요청을 Spring Boot(8080)로 전달 → 같은 출처라 CORS 설정 불필요, 세션 쿠키도 그대로 동작
    proxy: {
      '/api': 'http://localhost:8080',
    },
  },
})
