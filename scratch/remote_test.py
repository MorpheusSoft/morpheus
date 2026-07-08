import pexpect
import sys

ip = "217.216.83.151"
user = "lzambrano"
password = "Pegaso#26"

def run_ssh(cmd):
    print(f"\n---> Running: {cmd}")
    child = pexpect.spawn(f"ssh -o StrictHostKeyChecking=no {user}@{ip} \"{cmd}\"", encoding='utf-8', timeout=240)
    try:
        index = child.expect(['assword:', pexpect.EOF, pexpect.TIMEOUT])
        if index == 0:
            child.sendline(password)
            child.expect(pexpect.EOF)
        print(child.before)
    except Exception as e:
        print(f"Error executing command: {str(e)}")

def run_scp(local_path, remote_path):
    print(f"\n---> Uploading: {local_path} -> {remote_path}")
    child = pexpect.spawn(f"scp -o StrictHostKeyChecking=no \"{local_path}\" {user}@{ip}:\"{remote_path}\"", encoding='utf-8', timeout=120)
    try:
        index = child.expect(['assword:', pexpect.EOF, pexpect.TIMEOUT])
        if index == 0:
            child.sendline(password)
            child.expect(pexpect.EOF)
        print(child.before)
    except Exception as e:
        print(f"Error uploading: {str(e)}")

if __name__ == "__main__":
    # Create scratch folder on VPS
    run_ssh("mkdir -p ~/Morpheus/backend/scratch")
    
    # Upload excel file
    run_scp("/home/lzambrano/Downloads/LP A&B N° 20 Vigente 02.07.2026.xlsx", "~/Morpheus/backend/scratch/LP.xlsx")
    
    # Upload test script
    # Modify test script path inside it first
    with open("scratch/test_gemini_parse.py", "r") as f:
        code = f.read()
    
    # Replace path to point to VPS file
    code = code.replace(
        'path = "/home/lzambrano/Downloads/LP A&B N° 20 Vigente 02.07.2026.xlsx"',
        'path = "/home/lzambrano/Morpheus/backend/scratch/LP.xlsx"'
    )
    # Replace env path to point to VPS env
    code = code.replace(
        'env_path = "/home/lzambrano/Desarrollo/Morpheus/backend/.env"',
        'env_path = "/home/lzambrano/Morpheus/backend/.env"'
    )
    
    with open("scratch/test_gemini_parse_vps.py", "w") as f:
        f.write(code)
        
    run_scp("scratch/test_gemini_parse_vps.py", "~/Morpheus/backend/scratch/test_gemini_parse_vps.py")
    
    # Run test script on VPS using backend virtualenv python
    run_ssh("cd ~/Morpheus/backend && .venv/bin/python scratch/test_gemini_parse_vps.py")
