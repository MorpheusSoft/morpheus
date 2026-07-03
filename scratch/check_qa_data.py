import pexpect
import sys

ip = "217.216.83.151"
user = "lzambrano"
password = "Pegaso#26"

print("[*] Listando tablas del esquema inv...")

sql_query = """
SELECT table_name FROM information_schema.tables WHERE table_schema='inv';
"""

child = pexpect.spawn(f"ssh -o StrictHostKeyChecking=no {user}@{ip}", encoding='utf-8', timeout=30)
child.expect('assword:')
child.sendline(password)

child.expect(r'lzambrano@.*:.*\$')

# Crear query.sql
child.sendline("cat << 'EOF' > /tmp/query.sql")
child.sendline(sql_query)
child.sendline("EOF")
child.expect(r'lzambrano@.*:.*\$')

# Ejecutar psql
child.sendline("PAGER=cat PGPASSWORD='Think#1972' psql -h localhost -U morpheus_admin -d morpheus_db --pset=pager=off -f /tmp/query.sql")
child.expect(r'lzambrano@.*:.*\$')
print(child.before)

# Limpiar y cerrar
child.sendline("rm /tmp/query.sql")
child.expect(r'lzambrano@.*:.*\$')
child.sendline("exit")
child.expect(pexpect.EOF)
