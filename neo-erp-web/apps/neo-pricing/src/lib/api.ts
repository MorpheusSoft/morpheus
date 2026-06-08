import axios from 'axios';

const api = axios.create({
  baseURL: process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8000/api/v1',
  headers: {
    'Content-Type': 'application/json',
  },
});

api.interceptors.request.use((config) => {
  if (typeof window !== 'undefined') {
    let token = null;
    
    // 1. Prioridad: Cookie (Mantenida por Next.js y sincronizada en subdominios)
    const match = document.cookie.match(/(?:^|;\s*)access_token=([^;]*)/);
    if (match && match[1]) {
      token = match[1];
      // Sincronizar localstorage para que otros tabs viejos no fallen
      localStorage.setItem('token', token);
    } else {
      token = localStorage.getItem('token');
    }

    if (token) {
      config.headers.Authorization = `Bearer ${token}`;
    }
  }
  return config;
});

api.interceptors.response.use(
  (response) => response,
  (error) => {
    if (error.response && (error.response.status === 401 || error.response.status === 403)) {
      if (typeof window !== 'undefined') {
        localStorage.removeItem('token');
        const isProd = window.location.hostname.includes('.morpheussoft.net');
        const domain = isProd ? 'domain=.morpheussoft.net;' : '';
        document.cookie = `access_token=; Max-Age=0; path=/; ${domain}`;
        
        const loginUrl = isProd 
          ? 'http://hub.qa.morpheussoft.net/login' 
          : 'http://localhost:4000/login';
          
        window.location.href = loginUrl;
      }
    }
    return Promise.reject(error);
  }
);

export default api;
