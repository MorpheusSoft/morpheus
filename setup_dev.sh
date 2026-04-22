#!/bin/bash

# Colores para output
GREEN='\033[0;32m'
RED='\033[0;31m'
NC='\033[0m' # No Color

echo -e "${GREEN}Iniciando configuración del entorno de desarrollo...${NC}"

# 1. Verificar dependencias del sistema
echo -e "\n${GREEN}[1/4] Verificando dependencias del sistema...${NC}"

if ! command -v python3 &> /dev/null; then
    echo -e "${RED}Error: Python 3 no está instalado.${NC}"
    exit 1
fi

if ! command -v npm &> /dev/null; then
    echo -e "${RED}Error: npm no está instalado.${NC}"
    exit 1
fi

# Verificar venv module
if ! python3 -c "import venv" &> /dev/null; then
    echo -e "${RED}Error: El módulo 'venv' de Python no está disponible.${NC}"
    echo "Por favor instala python3-venv (ej: sudo apt install python3-venv)"
    exit 1
fi

# 2. Configurar Backend
echo -e "\n${GREEN}[2/4] Configurando Backend...${NC}"

if [ -d ".venv" ]; then
    echo "El entorno virtual ya existe."
    # Opcional: Verificar si está roto y recrearlo
else
    echo "Creando entorno virtual..."
    if ! python3 -m venv .venv; then
        echo -e "${RED}Error al crear el entorno virtual.${NC}"
        echo -e "Es probable que falte 'python3-venv'. Instálalo con:\n"
        echo -e "  sudo apt install python3-venv\n"
        exit 1
    fi
fi

echo "Instalando dependencias de Python..."
./.venv/bin/pip install --upgrade pip
./.venv/bin/pip install -r backend/requirements.txt

# 3. Configurar Frontend
echo -e "\n${GREEN}[3/4] Configurando Frontend...${NC}"
cd frontend
if [ ! -d "node_modules" ]; then
    echo "Instalando dependencias de Node..."
    npm install
else
    echo "node_modules ya existe. Saltando npm install."
fi
cd ..

# 4. Finalización
echo -e "\n${GREEN}[4/4] Configuración completada con éxito!${NC}"
echo -e "Para iniciar la aplicación ejecuta:\n"
echo -e "  make start\n"
echo -e "O manualmente:\n"
echo -e "  ./.venv/bin/python run.py &"
echo -e "  cd frontend && npm start"
