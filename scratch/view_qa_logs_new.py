import pexpect
import sys

ip = "217.216.83.151"
user = "lzambrano"
password = "Pegaso#26"

print("[*] Leyendo traceback del error 500 más reciente...")

cmd = "tail -n 100 /home/lzambrano/.pm2/logs/neo-api-error.log"

child = pexpect.spawn(f"ssh -o StrictHostKeyChecking=no {user}@{ip}", encoding='utf-8', timeout=30)
child.expect('assword:')
child.sendline(password)

child.expect(r'lzambrano@.*:.*\$')
child.sendline(cmd)
child.expect(r'lzambrano@.*:.*\$')
print(child.before)

child.sendline("exit")
child.expect(pexpect.EOF)
