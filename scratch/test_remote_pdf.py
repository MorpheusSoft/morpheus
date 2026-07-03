import pexpect
import sys

ip = "217.216.83.151"
user = "lzambrano"
password = "Pegaso#26"

print("[*] Conectando a QA VPS para ejecutar script de depuración de PDF...")

child = pexpect.spawn(f"ssh -o StrictHostKeyChecking=no {user}@{ip}", encoding='utf-8', timeout=120)
child.expect('assword:')
child.sendline(password)
child.expect(r'lzambrano@.*:.*\$')

# Escribir un script de prueba de python en el VPS
test_script_content = """
import sys
sys.path.append('/home/lzambrano/Morpheus/backend')
from app.db.session import SessionLocal
from app.services.pdf_service import generate_purchase_order_pdf

try:
    print("Iniciando prueba de PDF para la orden 7...")
    db = SessionLocal()
    pdf_bytes = generate_purchase_order_pdf(7, db)
    print(f"EXITO: PDF generado con {len(pdf_bytes)} bytes!")
except Exception as e:
    import traceback
    print("ERROR GENERANDO PDF:")
    traceback.print_exc()
"""

# Guardar el script de prueba en /tmp/test_pdf.py en el VPS
child.sendline("cat << 'EOF' > /tmp/test_pdf.py")
child.sendline(test_script_content)
child.sendline("EOF")
child.expect(r'lzambrano@.*:.*\$')

# Ejecutar el script con el virtualenv del backend
child.sendline("cd /home/lzambrano/Morpheus/backend && /home/lzambrano/.local/share/virtualenvs/backend-*/bin/python /tmp/test_pdf.py || python3 /tmp/test_pdf.py")
try:
    child.expect(r'lzambrano@.*:.*\$', timeout=20)
    print(child.before)
except Exception as e:
    print("Timeout or finished. Output:")
    print(child.before)

child.sendline("exit")
child.expect(pexpect.EOF)
