import pexpect
import sys

ip = "217.216.83.151"
user = "lzambrano"
password = "Pegaso#26"
db_pass = "Pegaso#26"

print("[*] Otorgando privilegios de base de datos a morpheus_admin en QA VPS...")

child = pexpect.spawn(f"ssh -o StrictHostKeyChecking=no {user}@{ip}", encoding='utf-8', timeout=120)
child.expect('assword:')
child.sendline(password)
child.expect(r'lzambrano@.*:.*\$')

grant_sql = """
GRANT ALL PRIVILEGES ON TABLE inv.print_templates TO morpheus_admin;
GRANT USAGE, SELECT, UPDATE ON SEQUENCE inv.print_templates_id_seq TO morpheus_admin;
"""

child.sendline("cat << 'EOF' > /tmp/grant_privileges.sql\n" + grant_sql + "\nEOF")
child.expect(r'lzambrano@.*:.*\$')

child.sendline(f'PGPASSWORD="{db_pass}" psql -h localhost -U postgres -d morpheus_db -f /tmp/grant_privileges.sql')
child.expect(r'lzambrano@.*:.*\$')
print(child.before)

# Clean up
child.sendline("rm -f /tmp/grant_privileges.sql")
child.expect(r'lzambrano@.*:.*\$')
child.sendline("exit")
child.expect(pexpect.EOF)
print("[+] Privilegios otorgados.")
