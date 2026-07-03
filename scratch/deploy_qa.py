import pexpect
import sys

ip = "217.216.83.151"
user = "lzambrano"
password = "Pegaso#26"

print("[*] Iniciando despliegue de backend en QA...")

child = pexpect.spawn(f"ssh -o StrictHostKeyChecking=no {user}@{ip}", encoding='utf-8', timeout=180)
child.expect('assword:')
child.sendline(password)
child.expect(r'lzambrano@.*:.*\$')

print("[*] Ejecutando script de actualización en el VPS...")
child.sendline("python3 /home/lzambrano/update_qa.py")

# El script podría pedir sudo o tardar un rato compilando
index = child.expect([r'\[sudo\] password for lzambrano:', r'lzambrano@.*:.*\$', pexpect.TIMEOUT], timeout=120)
if index == 0:
    child.sendline(password)
    child.expect(r'lzambrano@.*:.*\$', timeout=120)

print("[+] Despliegue de backend completado con éxito en QA VPS!")
child.sendline("exit")
child.expect(pexpect.EOF)
