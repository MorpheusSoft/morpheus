import pexpect
import sys

ip = "217.216.83.151"
user = "lzambrano"
password = "Pegaso#26"

print("[*] Iniciando proceso de respaldo de base de datos en QA...")

child = pexpect.spawn(f"ssh -o StrictHostKeyChecking=no {user}@{ip}", encoding='utf-8', timeout=600)
child.expect('assword:')
child.sendline(password)
child.expect(r'lzambrano@.*:.*\$')

# 1. Eliminar respaldos viejos si existen
print("[*] Eliminando respaldos temporales anteriores...")
child.sendline("sudo rm -f /tmp/morpheus_qa_backup_sudo.dump")
index = child.expect([r'\[sudo\] password for lzambrano:', r'lzambrano@.*:.*\$'], timeout=30)
if index == 0:
    child.sendline(password)
    child.expect(r'lzambrano@.*:.*\$', timeout=60)

# 2. Ejecutar pg_dump
print("[*] Ejecutando pg_dump para morpheus_db...")
child.sendline("sudo -u postgres pg_dump -d morpheus_db -Fc -f /tmp/morpheus_qa_backup_sudo.dump")
child.expect(r'lzambrano@.*:.*\$', timeout=300)

# 3. Cambiar permisos y propietario
print("[*] Ajustando permisos y propietario del archivo...")
child.sendline("sudo chown lzambrano:lzambrano /tmp/morpheus_qa_backup_sudo.dump")
child.expect(r'lzambrano@.*:.*\$', timeout=60)
child.sendline("sudo chmod 644 /tmp/morpheus_qa_backup_sudo.dump")
child.expect(r'lzambrano@.*:.*\$', timeout=60)

print("[+] Proceso de respaldo completado con éxito en el servidor de QA!")
child.sendline("exit")
child.expect(pexpect.EOF)
