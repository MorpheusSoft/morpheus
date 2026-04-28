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

export default api;
