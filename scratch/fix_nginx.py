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

# Read the file from remote, modify it locally, and write it back
def fix_nginx_config():
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

    # Remove SSH connection headers from the output if any, and clean lines
    lines = content.split('\r\n')
    cleaned_lines = []
    for line in lines:
        cleaned_lines.append(line)
    
    full_content = "\n".join(cleaned_lines)
    
    # Let's insert client_max_body_size 100M; in all server blocks
    import re
    # We want to find server_name ...; and insert client_max_body_size 100M; right after it
    modified_content = re.sub(
        r'(server_name\s+[^;]+;)',
        r'\1\n    client_max_body_size 100M;',
        full_content
    )

    # Save to a local temporary file first
    local_temp = "scratch/morpheus_nginx_fixed"
    with open(local_temp, "w") as f:
        f.write(modified_content)

    print("Nginx config modified locally. Uploading to VPS...")

    # Upload local_temp to remote temp location
    child = pexpect.spawn(f"scp -o StrictHostKeyChecking=no {local_temp} {user}@{ip}:/tmp/morpheus_nginx", encoding='utf-8', timeout=60)
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
        "sudo cp /tmp/morpheus_nginx /etc/nginx/sites-available/morpheus",
        "sudo nginx -t",
        "sudo systemctl reload nginx"
    ]
    run_ssh_sudo_commands(cmds)

if __name__ == "__main__":
    fix_nginx_config()
