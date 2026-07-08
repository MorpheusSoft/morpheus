import pexpect
import sys

ip = "217.216.83.151"
user = "lzambrano"
password = "Pegaso#26"

def run_ssh_sudo_commands(cmds):
    for cmd in cmds:
        print(f"\n---> Running: {cmd}")
        child = pexpect.spawn(f"ssh -t -o StrictHostKeyChecking=no {user}@{ip} \"{cmd}\"", encoding='utf-8', timeout=60)
        try:
            # Wait for SSH password prompt
            index = child.expect(['[aA]ssword:', pexpect.EOF, pexpect.TIMEOUT])
            if index == 0:
                child.sendline(password)
            
            # Wait for sudo password prompt
            index2 = child.expect(['[sS]udo.*password', 'password for', pexpect.EOF, pexpect.TIMEOUT])
            if index2 in (0, 1):
                child.sendline(password)
                
            child.expect(pexpect.EOF)
            print(child.before)
        except Exception as e:
            print(f"Error executing command: {str(e)}")

def fix_nginx_config_timeout():
    # 1. Download current config
    child = pexpect.spawn(f"ssh -o StrictHostKeyChecking=no {user}@{ip} \"cat /etc/nginx/sites-available/morpheus\"", encoding='utf-8', timeout=60)
    try:
        index = child.expect(['assword:', pexpect.EOF, pexpect.TIMEOUT])
        if index == 0:
            child.sendline(password)
            child.expect(pexpect.EOF)
        content = child.before
    except Exception as e:
        print(f"Error downloading config: {str(e)}")
        return

    # Clean lines
    lines = content.split('\r\n')
    full_content = "\n".join(lines)
    
    # Let's replace the location block for the backend (FastAPI proxy to 8000)
    target = """    location / {
        proxy_pass http://127.0.0.1:8000;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
    }"""

    replacement = """    location / {
        proxy_pass http://127.0.0.1:8000;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
        proxy_read_timeout 300s;
        proxy_connect_timeout 300s;
        proxy_send_timeout 300s;
    }"""

    if target in full_content:
        modified_content = full_content.replace(target, replacement)
        print("Target API proxy block found and updated.")
    else:
        # Fallback if whitespace differs
        print("Target API proxy block not found by exact match. Trying regex replacement...")
        import re
        modified_content = re.sub(
            r'(proxy_pass\s+http://127\.0\.0\.1:8000;[^\}]+)',
            r'\1\n        proxy_read_timeout 300s;\n        proxy_connect_timeout 300s;\n        proxy_send_timeout 300s;',
            full_content
        )

    # Save to a local temporary file first
    local_temp = "scratch/morpheus_nginx_timeout_fixed"
    with open(local_temp, "w") as f:
        f.write(modified_content)

    print("Nginx timeout config modified locally. Uploading to VPS...")

    # Upload local_temp to remote temp location
    child = pexpect.spawn(f"scp -o StrictHostKeyChecking=no {local_temp} {user}@{ip}:/tmp/morpheus_nginx_timeout", encoding='utf-8', timeout=60)
    try:
        index = child.expect(['assword:', pexpect.EOF, pexpect.TIMEOUT])
        if index == 0:
            child.sendline(password)
            child.expect(pexpect.EOF)
        print("Upload successful.")
    except Exception as e:
        print(f"Error uploading: {str(e)}")
        return

    # Move to /etc/nginx/sites-available/morpheus and test/reload nginx
    cmds = [
        "sudo cp /tmp/morpheus_nginx_timeout /etc/nginx/sites-available/morpheus",
        "sudo nginx -t",
        "sudo systemctl reload nginx"
    ]
    run_ssh_sudo_commands(cmds)

if __name__ == "__main__":
    fix_nginx_config_timeout()
