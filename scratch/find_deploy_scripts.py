import pexpect
import sys

ip = "217.216.83.151"
user = "lzambrano"
password = "Pegaso#26"

print("[*] Buscando scripts de actualización en /home/lzambrano/Morpheus...")

child = pexpect.spawn(f"ssh -o StrictHostKeyChecking=no {user}@{ip}", encoding='utf-8', timeout=30)
child.expect('assword:')
child.sendline(password)

child.expect(r'lzambrano@.*:.*\$')
child.sendline("find /home/lzambrano/Morpheus -maxdepth 2 -name '*update*' -o -name '*deploy*' -o -name '*publish*'")
child.expect(r'lzambrano@.*:.*\$')
print(child.before)

child.sendline("ls -la /home/lzambrano/Morpheus")
child.expect(r'lzambrano@.*:.*\$')
print(child.before)

child.sendline("exit")
child.expect(pexpect.EOF)
