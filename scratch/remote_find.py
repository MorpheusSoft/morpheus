import pexpect
import sys

ip = "217.216.83.151"
user = "lzambrano"
password = "Pegaso#26"

child = pexpect.spawn(f"ssh -o StrictHostKeyChecking=no {user}@{ip}", encoding='utf-8', timeout=60)
child.expect('assword:')
child.sendline(password)
child.expect(r'lzambrano@.*:.*\$')

child.sendline("find /home/lzambrano/Morpheus/neo-erp-web -name \"middleware.ts\" -not -path \"*/node_modules/*\"")
child.expect(r'lzambrano@.*:.*\$')
print("FIND OUTPUT:")
print(child.before)

child.sendline("exit")
child.expect(pexpect.EOF)
