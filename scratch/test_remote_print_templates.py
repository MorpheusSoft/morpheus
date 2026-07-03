import pexpect
import sys

ip = "217.216.83.151"
user = "lzambrano"
password = "Pegaso#26"

print("[*] Iniciando prueba remota de consulta de plantillas en QA VPS...")

child = pexpect.spawn(f"ssh -o StrictHostKeyChecking=no {user}@{ip}", encoding='utf-8', timeout=120)
child.expect('assword:')
child.sendline(password)
child.expect(r'lzambrano@.*:.*\$')

# Internal script content to execute on VPS
internal_script = """
import sys
import os
sys.path.insert(0, '/home/lzambrano/Morpheus/backend')
try:
    from fastapi.testclient import TestClient
    from app.main import app
    client = TestClient(app)
    # Bypass auth dependency by getting db directly or mock token
    # Let's see if GET is protected. If yes, it will return 401/403, which still validates the route exists!
    res = client.get("/api/v1/print-templates")
    print("API Response status:", res.status_code)
    print("API Response text:", res.text[:200])
except Exception as e:
    print("[!] Error testing API endpoint:", e)
"""

# Write internal script to /tmp/test_templates.py on VPS
print("[*] Escribiendo script de prueba en /tmp/test_templates.py en el VPS...")
child.sendline("cat << 'EOF' > /tmp/test_templates.py\n" + internal_script + "\nEOF")
child.expect(r'lzambrano@.*:.*\$')

# Run internal script using remote virtualenv python with PYTHONPATH
print("[*] Ejecutando script de prueba en el VPS...")
child.sendline("cd /home/lzambrano/Morpheus/backend && PYTHONPATH=. .venv/bin/python /tmp/test_templates.py")
child.expect(r'lzambrano@.*:.*\$')
print(child.before)

# Clean up
child.sendline("rm -f /tmp/test_templates.py")
child.expect(r'lzambrano@.*:.*\$')
child.sendline("exit")
child.expect(pexpect.EOF)
print("[+] Prueba completada.")
