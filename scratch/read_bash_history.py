import pexpect
import sys

ip = "217.216.83.151"
user = "lzambrano"
password = "Pegaso#26"

print("[*] Leyendo .bash_history del VPS...")

child = pexpect.spawn(f"ssh -o StrictHostKeyChecking=no {user}@{ip}", encoding='utf-8', timeout=30)
child.expect('assword:')
child.sendline(password)

child.expect(r'lzambrano@.*:.*\$')
child.sendline("tail -n 100 /home/lzambrano/.bash_history")
child.expect(r'lzambrano@.*:.*\$')
print(child.before)

child.sendline("exit")
child.expect(pexpect.EOF)
