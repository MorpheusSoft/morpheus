'use client';
import React from 'react';
import { PrimeReactProvider } from 'primereact/api';
import 'primereact/resources/themes/lara-light-blue/theme.css';
import 'primereact/resources/primereact.min.css';
import 'primeicons/primeicons.css';

export function Providers({ children }: { children: React.ReactNode }) {
  React.useEffect(() => {
    if ('serviceWorker' in navigator && typeof window !== 'undefined') {
      const swUrl = `/costos/sw.js`;
      navigator.serviceWorker.register(swUrl)
        .then((reg) => console.log('PWA Service Worker registrado con éxito:', reg.scope))
        .catch((err) => console.error('Error al registrar PWA Service Worker:', err));
    }
  }, []);

  return <PrimeReactProvider>{children}</PrimeReactProvider>;
}
