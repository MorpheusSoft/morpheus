import axios from 'axios';
import { clearAuthCookies, getLoginUrl, getPublicApiUrl, getInternalApiUrl } from './domain';

const api = axios.create({
  headers: {
    'Content-Type': 'application/json',
  },
});

api.interceptors.request.use((config) => {
  if (typeof window !== 'undefined') {
    if (!config.baseURL || config.baseURL.includes('127.0.0.1:8000') || config.baseURL.includes('localhost:8000')) {
      config.baseURL = getPublicApiUrl(window.location.host);
    }
    let token = null;
    
    // 1. Prioridad: Cookie (Mantenida por Next.js y sincronizada en subdominios)
    const match = document.cookie.match(/(?:^|;\s*)access_token=([^;]*)/);
    if (match && match[1]) {
      token = match[1];
      localStorage.setItem('token', token);
    } else {
      token = localStorage.getItem('token');
    }

    if (token) {
      config.headers.Authorization = `Bearer ${token}`;
    }
  } else {
    if (!config.baseURL) {
      config.baseURL = getInternalApiUrl();
    }
  }
  return config;
});

api.interceptors.response.use(
  (response) => response,
  (error) => {
    if (error.response) {
      const status = error.response.status;
      const detail = error.response.data?.detail;
      const isAuthFailure =
        status === 401 ||
        (status === 403 &&
          (detail === 'Could not validate credentials' ||
            detail === 'Not authenticated' ||
            detail === 'Inactive user'));

      if (isAuthFailure && typeof window !== 'undefined') {
        localStorage.removeItem('token');
        clearAuthCookies();
        const currentUrl = window.location.href;
        const loginUrl = getLoginUrl(currentUrl);
        window.location.href = loginUrl;
      }
    }
    return Promise.reject(error);
  }
);

export default api;
