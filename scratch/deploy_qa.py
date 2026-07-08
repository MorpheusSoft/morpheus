import pexpect
import sys

ip = "217.216.83.151"
user = "lzambrano"
password = "Pegaso#26"

def run_ssh_commands(cmds):
    for cmd in cmds:
        print(f"\n---> Running: {cmd}")
        child = pexpect.spawn(f"ssh -o StrictHostKeyChecking=no {user}@{ip} \"{cmd}\"", encoding='utf-8', timeout=90)
        try:
            index = child.expect(['assword:', pexpect.EOF, pexpect.TIMEOUT])
            if index == 0:
                child.sendline(password)
                child.expect(pexpect.EOF)
            print(child.before)
        except Exception as e:
            print(f"Error executing command: {str(e)}")

cmds = [
    "cd ~/Morpheus && git pull origin main",
    "cd ~/Morpheus && .venv/bin/python backend/app/db/add_print_templates_promo_columns.py",
    "cd ~/Morpheus && .venv/bin/python backend/app/db/create_campaign_tables.py",
    "pm2 restart neo-api",
    "pm2 restart hub-core compras inventario logistica",
    "pm2 status"
]

if __name__ == "__main__":
    run_ssh_commands(cmds)
