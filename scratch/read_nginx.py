import pexpect
import sys

ip = "217.216.83.151"
user = "lzambrano"
password = "Pegaso#26"

child = pexpect.spawn(f"ssh -o StrictHostKeyChecking=no {user}@{ip}", encoding='utf-8', timeout=60)
child.expect('assword:')
child.sendline(password)
child.expect(r'lzambrano@.*:.*\$')

# Read Nginx configs
child.sendline("cat /etc/nginx/sites-enabled/*")
child.expect(r'lzambrano@.*:.*\$')
print(child.before)

child.sendline("exit")
child.expect(pexpect.EOF)
