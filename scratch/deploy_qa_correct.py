import pexpect
import sys

ip = "217.216.83.151"
user = "lzambrano"
password = "Pegaso#26"

print("[*] Iniciando despliegue de backend y frontend en QA VPS...")

child = pexpect.spawn(f"ssh -o StrictHostKeyChecking=no {user}@{ip}", encoding='utf-8', timeout=600)
child.expect('assword:')
child.sendline(password)
child.expect(r'lzambrano@.*:.*\$')

# 1. cd y pull
print("[*] Ejecutando git pull...")
child.sendline("cd /home/lzambrano/Morpheus && git pull origin main")
child.expect(r'lzambrano@.*:.*\$')
print(child.before)

# 2. npm run build
print("[*] Compilando frontend monorepo con Next.js/Turbo...")
child.sendline("cd /home/lzambrano/Morpheus/neo-erp-web && npm run build")
child.expect(r'lzambrano@.*:.*\$', timeout=400)
print(child.before)

# 3. pm2 restart
print("[*] Reiniciando todos los procesos en PM2...")
child.sendline("pm2 restart all")
child.expect(r'lzambrano@.*:.*\$')
print(child.before)

print("[+] Despliegue completo con éxito!")
child.sendline("exit")
child.expect(pexpect.EOF)
