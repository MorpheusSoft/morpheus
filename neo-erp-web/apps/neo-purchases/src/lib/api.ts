import axios from 'axios';

const api = axios.create({
  baseURL: process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8000/api/v1',
  headers: {
    'Content-Type': 'application/json',
  },
});

// Request interceptor for API calls
api.interceptors.request.use(
  (config) => {
    let token = null;
    
    // 1. Prioridad absoluta: Cookie de sesión global
    if (typeof document !== 'undefined') {
      const match = document.cookie.match(new RegExp('(^| )access_token=([^;]+)'));
      if (match) token = match[2];
    }
    
    // 2. Falback a localStorage si la cookie caducó (y limpiar localStorage si está sucio)
    if (!token && typeof window !== 'undefined') {
      token = localStorage.getItem('access_token') || localStorage.getItem('token');
    }
    
    if (token) {
      config.headers.Authorization = `Bearer ${token}`;
    }
    return config;
  },
  (error) => {
    return Promise.reject(error);
  }
);

// Response interceptor for API calls
api.interceptors.response.use(
  (response) => {
    return response;
  },
  (error) => {
    // Handle global errors here globally (e.g., 401 Unauthorized)
    return Promise.reject(error);
  }
);

export default api;
