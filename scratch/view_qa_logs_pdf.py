import pexpect
import sys

ip = "217.216.83.151"
user = "lzambrano"
password = "Pegaso#26"

print("[*] Conectando a QA VPS para obtener logs de PM2...")

child = pexpect.spawn(f"ssh -o StrictHostKeyChecking=no {user}@{ip}", encoding='utf-8', timeout=120)
child.expect('assword:')
child.sendline(password)
child.expect(r'lzambrano@.*:.*\$')

print("[*] Obteniendo ultimas lineas de logs de neo-api...")
child.sendline("pm2 logs neo-api --lines 80 --raw")
# We will wait for a bit and print the output
try:
    child.expect(r'lzambrano@.*:.*\$', timeout=10)
    print(child.before)
except Exception as e:
    print("Timeout or finished. Current output:")
    print(child.before)

child.sendline("exit")
child.expect(pexpect.EOF)
