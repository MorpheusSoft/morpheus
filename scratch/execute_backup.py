import pexpect
import sys

ip = "217.216.83.151"
user = "lzambrano"
password = "Pegaso#26"

print("[*] Limpiando archivos temporales en el VPS...")

cmd = "sudo rm -f /tmp/morpheus_qa_backup.dump /tmp/morpheus_qa_backup_sudo.dump"

child = pexpect.spawn(f"ssh -o StrictHostKeyChecking=no {user}@{ip}", encoding='utf-8', timeout=600)
child.expect('assword:')
child.sendline(password)

child.expect(r'lzambrano@.*:.*\$')
child.sendline(cmd)

index = child.expect([r'\[sudo\] password for lzambrano:', r'lzambrano@.*:.*\$'], timeout=30)
if index == 0:
    child.sendline(password)
    child.expect(r'lzambrano@.*:.*\$', timeout=60)

print("[+] Archivos temporales eliminados en el VPS.")
print(child.before)

child.sendline("exit")
child.expect(pexpect.EOF)
