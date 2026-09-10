'use client';
import React from 'react';
import { DigitalWorkerCopilot } from '../copilot/DigitalWorkerCopilot';

export function ClaraCopilot() {
  return (
    <DigitalWorkerCopilot
      name="Clara"
      role="Especialista Digital de Compras"
      avatarIcon="pi pi-sparkles"
      themeColor="emerald"
      welcomeMessage={`👋 ¡Hola! Soy **Clara**, tu trabajadora digital de **Compras**.\n\nPuedo ayudarte a diagnosticar proveedores en quiebre de stock, revisar órdenes de compra, analizar costos de reposición y consultar el estado de tu inventario.\n\n¿En qué te puedo colaborar hoy?`}
      quickChips={[
        "🔴 Proveedores en quiebre crítico",
        "📊 ¿Cuál es el monto total comprado este mes?",
        "📦 Muestra las últimas órdenes de compra creadas",
        "💡 ¿Cómo generar una orden de compra?"
      ]}
    />
  );
}
