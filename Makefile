
# Variables
PYTHON = .venv/bin/python
PIP = .venv/bin/pip
NPM = npm

# Commands
.PHONY: install start clean help

help:
	@echo "Comandos disponibles:"
	@echo "  make install  - Instala todas las dependencias y configura el entorno"
	@echo "  make start    - Inicia el backend y frontend simultáneamente"
	@echo "  make clean    - Limpia archivos temporales y entornos virtuales"

install:
	@chmod +x setup_dev.sh
	@./setup_dev.sh

start:
	@echo "Iniciando servicios..."
	@trap 'kill %1; kill %2' SIGINT; \
	$(PYTHON) run.py & \
	cd neo-erp-web && npm run dev & \
	wait

clean:
	@echo "Limpiando entorno..."
	@rm -rf .venv
	@rm -rf frontend/node_modules
	@rm -rf frontend/dist
	@find . -type d -name "__pycache__" -exec rm -rf {} +
	@echo "Limpieza completada."
