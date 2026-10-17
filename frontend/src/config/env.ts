export const env = {
  apiBaseUrl: import.meta.env.VITE_API_BASE_URL || 'http://localhost:8000/api/v1',
  backendUrl: import.meta.env.VITE_BACKEND_URL || 'http://localhost:8000',
  apiTimeoutMs: Number(import.meta.env.VITE_API_TIMEOUT_MS) || 8000,
  geminiApiKey: import.meta.env.VITE_GEMINI_API_KEY || import.meta.env.GEMINI_API_KEY || '',
};
