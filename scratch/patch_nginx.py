import pexpect
import sys

ip = "217.216.83.151"
user = "lzambrano"
password = "Pegaso#26"

print("Connecting to VPS to patch Nginx configuration...")

# We will write a python script on the remote VPS to modify the Nginx config file,
# then run it with sudo, check config, and reload.

remote_script_code = """
import os

config_path = '/etc/nginx/sites-available/morpheus'
with open(config_path, 'r') as f:
    content = f.read()

target = '''# BACKEND (FastAPI - Puerto 8000)
server {
    server_name api.qa.morpheussoft.net;

    location / {
        proxy_pass http://127.0.0.1:8000;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
    }'''

replacement = '''# BACKEND (FastAPI - Puerto 8000)
server {
    server_name api.qa.morpheussoft.net;

    location / {
        proxy_pass http://127.0.0.1:8000;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
        proxy_read_timeout 300s;
        proxy_connect_timeout 300s;
        proxy_send_timeout 300s;
    }'''

if target in content:
    content = content.replace(target, replacement)
    with open(config_path, 'w') as f:
        f.write(content)
    print("PATCH_SUCCESS")
else:
    print("PATCH_NOT_NEEDED_OR_TARGET_NOT_FOUND")
"""

# Let's write this remote script to /tmp/patch_nginx.py on VPS
write_cmd = f"cat << 'EOF' > /tmp/patch_nginx.py\n{remote_script_code}\nEOF"

child = pexpect.spawn(f"ssh -o StrictHostKeyChecking=no {user}@{ip}", encoding='utf-8', timeout=30)
try:
    child.expect('assword:')
    child.sendline(password)
    child.expect(r'\$')
    
    # Write remote script
    child.sendline(write_cmd)
    child.expect(r'\$')
    
    # Run the script with sudo
    print("Running patch script with sudo...")
    child.sendline("sudo python3 /tmp/patch_nginx.py")
    idx = child.expect(['assword:', r'\$'])
    if idx == 0:
        child.sendline(password)
        child.expect(r'\$')
    print(child.before)
    
    # Verify Nginx config
    print("Testing Nginx configuration...")
    child.sendline("sudo nginx -t")
    child.expect(r'\$')
    print(child.before)
    
    # Reload Nginx
    print("Reloading Nginx...")
    child.sendline("sudo systemctl reload nginx")
    child.expect(r'\$')
    print(child.before)
    
    print("Done!")
except Exception as e:
    print(f"Error during patching: {e}")
    sys.exit(1)
