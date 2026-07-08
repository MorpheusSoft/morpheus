import pexpect
import sys

ip = "217.216.83.151"
user = "lzambrano"
password = "Pegaso#26"

def run_ssh_command(cmd):
    print(f"\n---> Running on VPS: {cmd}")
    child = pexpect.spawn(f"ssh -o StrictHostKeyChecking=no {user}@{ip} \"{cmd}\"", encoding='utf-8', timeout=60)
    try:
        index = child.expect(['assword:', pexpect.EOF, pexpect.TIMEOUT])
        if index == 0:
            child.sendline(password)
            child.expect(pexpect.EOF)
        print(child.before)
    except Exception as e:
        print(f"Error executing command: {str(e)}")

if __name__ == "__main__":
    # Run curl test to Gemini API
    run_ssh_command("curl -I -m 10 https://generativelanguage.googleapis.com/v1beta/models")
