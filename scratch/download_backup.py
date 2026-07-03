import pexpect
import sys
import os

ip = "217.216.83.151"
user = "lzambrano"
password = "Pegaso#26"

local_path = "/home/lzambrano/Desarrollo/Morpheus/qa_backup.dump"
remote_path = f"{user}@{ip}:/tmp/morpheus_qa_backup_sudo.dump"

print(f"[*] Iniciando descarga SCP de {remote_path} a {local_path}...")

cmd = f"scp -o StrictHostKeyChecking=no {remote_path} {local_path}"

child = pexpect.spawn(cmd, encoding='utf-8', timeout=600)
index = child.expect(['assword:', pexpect.EOF, pexpect.TIMEOUT])
if index == 0:
    child.sendline(password)
    child.expect(pexpect.EOF, timeout=600)
    print("[+] Descarga SCP completada con éxito!")
else:
    print(f"[!] Error de conexión o timeout. Salida: {child.before}")
    sys.exit(1)

if os.path.exists(local_path):
    size = os.path.getsize(local_path)
    print(f"[+] Archivo verificado localmente. Tamaño: {size / 1024 / 1024:.2f} MB")
else:
    print("[!] El archivo local no existe después de la descarga.")
    sys.exit(1)
