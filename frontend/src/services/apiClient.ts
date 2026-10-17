import axios from 'axios';
import { env } from '../config/env';

export const apiClient = axios.create({
  baseURL: env.apiBaseUrl,
  timeout: env.apiTimeoutMs,
  headers: {
    'Content-Type': 'application/json',
  },
});

apiClient.interceptors.response.use(
  (response) => response,
  (error) => {
    console.warn('[TEEVRA Backend API Call]', error.config?.url, error.message);
    return Promise.reject(error);
  }
);

export default apiClient;
