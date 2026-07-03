import glob
import re

files = glob.glob('/home/lzambrano/Desarrollo/Morpheus/neo-erp-web/apps/*/src/components/layout/AppSwitcher.tsx')

for file in files:
    with open(file, 'r') as f:
        content = f.read()

    # Update Neo Core
    content = re.sub(r'http://hub\.qa\.morpheussoft\.net(/dashboard)?', r'https://hub.qa.morpheussoft.net\1', content)

    # Update Neo Inventario
    content = re.sub(r'http://inventario\.qa\.morpheussoft\.net(/products)?', r'https://inventario.qa.morpheussoft.net/inventario', content)

    # Update Neo Compras
    content = re.sub(r'http://compras\.qa\.morpheussoft\.net/?', r'https://compras.qa.morpheussoft.net/compras', content)

    # Update Neo Logistica
    content = re.sub(r'http://logistica\.qa\.morpheussoft\.net/?', r'https://logistica.qa.morpheussoft.net/wms', content)

    # Update Costos
    content = re.sub(r'http://costos\.qa\.morpheussoft\.net/?', r'https://costos.qa.morpheussoft.net/costos', content)

    with open(file, 'w') as f:
        f.write(content)

print("Updated AppSwitcher.tsx in all apps")
