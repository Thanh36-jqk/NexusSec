#!/usr/bin/env python3
"""
=============================================================================
NexusSec QA — Worker Diagnostics & Troubleshoot Tool
=============================================================================
Script này KHÔNG yêu cầu auth. Chỉ cần Docker CLI để kiểm tra Worker.

Mục đích:
1. Kiểm tra Docker container Worker đang chạy không
2. Test Nmap trực tiếp trong Docker (bypass Gateway/RabbitMQ)
3. Test ZAP trực tiếp trong Docker
4. Phân tích Worker logs để tìm bug
5. Kiểm tra RabbitMQ queue có message không

Cách dùng:
  python scripts/qa_worker_diagnostics.py --check all
  python scripts/qa_worker_diagnostics.py --check nmap
  python scripts/qa_worker_diagnostics.py --check zap
  python scripts/qa_worker_diagnostics.py --check logs
  python scripts/qa_worker_diagnostics.py --check rabbitmq
=============================================================================
"""

import argparse
import json
import subprocess
import sys
import time
from datetime import datetime

try:
    from colorama import Fore, Style, init as colorama_init
    colorama_init(autoreset=True)
except ImportError:
    print("Cài đặt: pip install colorama")


def log(level, msg, extra=""):
    ts = datetime.now().strftime("%H:%M:%S")
    colors = {"INFO": Fore.CYAN, "OK": Fore.GREEN, "WARN": Fore.YELLOW,
              "ERROR": Fore.RED, "STEP": Fore.MAGENTA}
    c = colors.get(level, Fore.WHITE)
    print(f"{Fore.LIGHTBLACK_EX}[{ts}]{Style.RESET_ALL} {c}[{level}]{Style.RESET_ALL} {msg}")
    if extra:
        print(f"       {Fore.LIGHTBLACK_EX}{extra}{Style.RESET_ALL}")


def separator(title):
    print(f"\n{Fore.YELLOW}{'─'*65}")
    print(f"  {title}")
    print(f"{'─'*65}{Style.RESET_ALL}\n")


def run_cmd(cmd: list, timeout=30) -> tuple[int, str, str]:
    """Chạy command và trả về (returncode, stdout, stderr)."""
    try:
        r = subprocess.run(cmd, capture_output=True, text=True, timeout=timeout)
        return r.returncode, r.stdout.strip(), r.stderr.strip()
    except subprocess.TimeoutExpired:
        return -1, "", f"Timeout sau {timeout}s"
    except FileNotFoundError:
        return -1, "", f"Command không tìm thấy: {cmd[0]}"
    except Exception as e:
        return -1, "", str(e)


# ── Check 1: Docker Status ────────────────────────────────────────────────────

def check_docker_status():
    separator("CHECK 1: Docker Container Status")
    
    containers = [
        "nexussec-worker",
        "nexussec-gateway",
        "nexussec-rabbitmq",
        "nexussec-mongodb",
        "nexussec-postgres",
    ]
    
    for name in containers:
        code, out, err = run_cmd(["docker", "inspect", "--format",
                                   "{{.State.Status}} {{.State.Health.Status}}", name])
        if code == 0:
            parts = out.split()
            state = parts[0] if parts else "?"
            health = parts[1] if len(parts) > 1 else "n/a"
            
            if state == "running":
                log("OK", f"{name}: running (health: {health})")
            else:
                log("ERROR", f"{name}: {state}")
        else:
            log("WARN", f"{name}: container không tồn tại hoặc not found")
    
    # Kiểm tra scan-network tồn tại không
    code, out, _ = run_cmd(["docker", "network", "ls", "--filter", "name=scan-network",
                               "--format", "{{.Name}}"])
    if "scan-network" in out:
        log("OK", "Docker network 'scan-network' tồn tại")
    else:
        log("WARN", "Docker network 'scan-network' KHÔNG tồn tại! Worker sẽ fail khi tạo scan container")
        log("INFO", "Fix: docker network create scan-network")


# ── Check 2: Direct Nmap Test ────────────────────────────────────────────────

def check_nmap_direct():
    separator("CHECK 2: Nmap Docker Test (Direct — bypass Gateway)")
    
    log("STEP", "Chạy Nmap container trực tiếp (--top-ports 100 cho nhanh)...")
    log("INFO", "Target: scanme.nmap.org")
    log("WARN", "Lệnh này sẽ mất 1-3 phút...")
    
    cmd = [
        "docker", "run", "--rm",
        "--network", "bridge",
        "instrumentisto/nmap:latest",
        "-T4",
        "--top-ports", "100",
        "-oX", "-",
        "scanme.nmap.org"
    ]
    
    log("INFO", f"Lệnh: {' '.join(cmd)}")
    code, stdout, stderr = run_cmd(cmd, timeout=300)
    
    if code != 0:
        log("ERROR", f"Nmap container exit code: {code}")
        log("ERROR", f"Stderr: {stderr[:500]}")
        log("WARN", "Nguyên nhân có thể:")
        log("WARN", "  - 'instrumentisto/nmap:latest' chưa được pull")
        log("WARN", "  - Scan-network block outbound DNS/TCP")
        log("WARN", "  - Docker daemon không có internet")
        return False
    
    if not stdout:
        log("ERROR", "Nmap trả về stdout rỗng!")
        log("WARN", f"Stderr: {stderr[:500]}")
        return False
    
    # Parse cơ bản: tìm port 22 và 80
    import xml.etree.ElementTree as ET
    try:
        root = ET.fromstring(stdout)
        open_ports = []
        for host in root.findall(".//host"):
            for port in host.findall(".//port"):
                state = port.find("state")
                if state is not None and state.get("state") == "open":
                    portid = int(port.get("portid", 0))
                    svc = port.find("service")
                    svc_name = svc.get("name", "?") if svc is not None else "?"
                    open_ports.append((portid, svc_name))
        
        log("OK", f"Nmap XML parse thành công. Tìm thấy {len(open_ports)} open ports.")
        
        for p, s in sorted(open_ports)[:20]:
            marker = "⭐" if p in (22, 80) else "  "
            print(f"    {marker} Port {p:5d} / {s}")
        
        found_22  = any(p == 22  for p, _ in open_ports)
        found_80  = any(p == 80  for p, _ in open_ports)
        
        if found_22 and found_80:
            log("OK", "✅ Port 22 (SSH) và Port 80 (HTTP) đều thấy → Nmap hoạt động đúng!")
            return True
        else:
            missing = []
            if not found_22: missing.append("22")
            if not found_80: missing.append("80")
            log("WARN", f"Không thấy port: {missing}")
            log("WARN", "Có thể do firewall Azure block hoặc scanme.nmap.org đang offline")
            return False
            
    except ET.ParseError as e:
        log("ERROR", f"Không parse được XML từ Nmap: {e}")
        log("DATA", f"Stdout đầu (500 chars): {stdout[:500]}")
        return False


# ── Check 3: Direct ZAP Test ─────────────────────────────────────────────────

def check_zap_direct():
    separator("CHECK 3: ZAP Docker Test (Direct — bypass Gateway)")
    
    log("STEP", "Chạy ZAP container trực tiếp...")
    log("INFO", "Target: http://testphp.vulnweb.com/")
    log("WARN", "ZAP baseline scan mất 5-15 phút! Timeout = 900s")
    
    cmd = [
        "docker", "run", "--rm",
        "-u", "root",
        "--network", "bridge",
        "--memory", "1g",
        "ghcr.io/zaproxy/zaproxy:stable",
        "zap-baseline.py",
        "-t", "http://testphp.vulnweb.com/",
        "-J", "-",  # output JSON to stdout
        "-z", "-config scanner.threadPerHost=2",
    ]
    
    log("INFO", f"Lệnh: {' '.join(cmd)}")
    code, stdout, stderr = run_cmd(cmd, timeout=1200)
    
    # ZAP exit code 2 = có alerts (bình thường), 0 = no alerts, 1 = error
    if code == 1:
        log("ERROR", f"ZAP lỗi (exit code 1)")
        log("WARN", f"Stderr (tail): {stderr[-1000:]}")
        return False
    
    if not stdout:
        log("WARN", "ZAP stdout rỗng — thử trích xuất từ stderr")
        # ZAP sometimes prints JSON to stderr
        stdout = stderr

    # Parse ZAP JSON
    try:
        # ZAP JSON thường có dạng {"site": [...]}
        report = json.loads(stdout)
        sites = report.get("site", [])
        total_alerts = sum(len(s.get("alerts", [])) for s in sites)
        
        log("OK", f"ZAP JSON parse thành công. Sites: {len(sites)}, Alerts: {total_alerts}")
        
        found_sqli = False
        found_xss  = False
        
        for site in sites:
            for alert in site.get("alerts", []):
                name_lower = alert.get("name", "").lower()
                if "sql" in name_lower and "injection" in name_lower:
                    found_sqli = True
                    log("OK", f"  ✓ SQL Injection: {alert.get('name')} [{alert.get('riskdesc')}]")
                if "cross site scripting" in name_lower or "xss" in name_lower:
                    found_xss = True
                    log("OK", f"  ✓ XSS: {alert.get('name')} [{alert.get('riskdesc')}]")
        
        if found_sqli and found_xss:
            log("OK", "✅ ZAP tìm thấy cả SQLi và XSS — ZAP Docker hoạt động đúng!")
            return True
        else:
            if not found_sqli: log("WARN", "Không thấy SQL Injection")
            if not found_xss:  log("WARN", "Không thấy XSS")
            log("WARN", "Nguyên nhân có thể:")
            log("WARN", "  - ZAP baseline chỉ passive scan, cần -a flag cho active scan")
            log("WARN", "  - Spider maxDuration quá ngắn")
            return False
            
    except json.JSONDecodeError as e:
        log("ERROR", f"Không parse được JSON từ ZAP: {e}")
        log("DATA", f"Stdout đầu (1000 chars): {stdout[:1000]}")
        
        # Kiểm tra ZAP-baseline exit code meaning
        log("INFO", "ZAP exit codes: 0=OK 1=Fail 2=Warned 3=Fail+Warned")
        log("INFO", f"Exit code nhận được: {code}")
        
        # Xem ZAP có output JSON vào file không
        log("WARN", "Vấn đề: ZAP baseline.py mặc định ghi report vào /zap/wrk/")
        log("WARN", "Worker dùng extractReportFromContainer() để đọc file đó")
        log("WARN", "Test manual với -J flag: zap-baseline.py -t URL -J report.json")
        return False


# ── Check 4: Worker Logs Analysis ────────────────────────────────────────────

def check_worker_logs():
    separator("CHECK 4: Worker Log Analysis")
    
    code, stdout, stderr = run_cmd(
        ["docker", "logs", "nexussec-worker", "--tail", "500"],
        timeout=15
    )
    
    logs = stdout + "\n" + stderr
    
    if not logs.strip():
        log("WARN", "Không lấy được Worker logs. Container có đang chạy không?")
        return
    
    lines = logs.splitlines()
    log("INFO", f"Tổng số dòng log: {len(lines)}")
    
    # Phân tích các pattern quan trọng
    patterns = {
        "pulling scan image":         ("INFO", "✓ Docker pulling image scan"),
        "creating scan container":    ("INFO", "✓ Tạo container scan"),
        "starting scan container":    ("INFO", "✓ Start container"),
        "scan container finished":    ("OK",   "✓ Container xong"),
        "successfully parsed":        ("OK",   "✓ Parse kết quả OK"),
        "processing scan job":        ("INFO", "✓ Worker xử lý job"),
        "scanner worker pool started":("OK",   "✓ Worker pool khởi động"),
        "failed":                     ("WARN", "⚠ Có lỗi"),
        "error":                      ("WARN", "⚠ Có lỗi"),
        "nack":                       ("WARN", "⚠ Message bị nack"),
        "scan produced empty output": ("ERROR","❌ Scan trả về rỗng!"),
        "failed to parse":            ("ERROR","❌ Parse thất bại!"),
        "daemon unreachable":         ("ERROR","❌ Docker daemon lỗi!"),
        "scan container crashed":     ("ERROR","❌ Container crash!"),
        "container wait failed":      ("ERROR","❌ Container timeout!"),
    }
    
    found = {k: [] for k in patterns}
    
    for line in lines:
        line_lower = line.lower()
        for pattern, (_, desc) in patterns.items():
            if pattern in line_lower:
                found[pattern].append(line)
    
    log("STEP", "Kết quả phân tích log:")
    for pattern, (level, desc) in patterns.items():
        count = len(found[pattern])
        if count > 0:
            log(level, f"{desc} ({count} lần)")
            # Show last occurrence
            last = found[pattern][-1]
            print(f"       {Fore.LIGHTBLACK_EX}last: {last[:120]}{Style.RESET_ALL}")
    
    # Show last 30 lines
    log("STEP", "30 dòng log gần nhất:")
    print(f"\n{Fore.LIGHTBLACK_EX}{'─'*60}{Style.RESET_ALL}")
    for line in lines[-30:]:
        # Color error lines
        if any(k in line.lower() for k in ["error", "failed", "crash"]):
            print(f"  {Fore.RED}{line}{Style.RESET_ALL}")
        elif any(k in line.lower() for k in ["success", "completed", "ok"]):
            print(f"  {Fore.GREEN}{line}{Style.RESET_ALL}")
        else:
            print(f"  {Fore.WHITE}{line}{Style.RESET_ALL}")
    print(f"{Fore.LIGHTBLACK_EX}{'─'*60}{Style.RESET_ALL}\n")


# ── Check 5: RabbitMQ ────────────────────────────────────────────────────────

def check_rabbitmq():
    separator("CHECK 5: RabbitMQ Queue Status")
    
    # Dùng rabbitmqctl qua docker exec
    code, out, err = run_cmd([
        "docker", "exec", "nexussec-rabbitmq",
        "rabbitmqctl", "list_queues", "name", "messages", "consumers",
    ], timeout=10)
    
    if code != 0:
        log("ERROR", f"Không chạy được rabbitmqctl: {err}")
        return
    
    log("INFO", "RabbitMQ Queues:")
    print(f"\n{Fore.WHITE}{out}{Style.RESET_ALL}\n")
    
    if "scan_jobs_queue" in out:
        # Parse số messages
        for line in out.splitlines():
            if "scan_jobs_queue" in line:
                parts = line.split()
                if len(parts) >= 3:
                    msgs = parts[1]
                    consumers = parts[2]
                    log("INFO", f"  scan_jobs_queue: {msgs} messages, {consumers} consumers")
                    
                    if int(msgs) > 0:
                        log("WARN", f"Có {msgs} message chưa được xử lý trong queue!")
                        log("WARN", "Worker có đang chạy và consume không?")
                    else:
                        log("OK", "Queue rỗng (đã được xử lý hết)")
                    
                    if int(consumers) == 0:
                        log("ERROR", "KHÔNG có consumer nào! Worker không kết nối vào RabbitMQ!")
                    else:
                        log("OK", f"{consumers} consumer đang active")
    else:
        log("WARN", "Queue 'scan_jobs_queue' chưa được khai báo")
        log("WARN", "Worker chưa khởi động hoặc chưa kết nối vào RabbitMQ")


# ── Main ─────────────────────────────────────────────────────────────────────

def main():
    parser = argparse.ArgumentParser(
        description="NexusSec Worker Diagnostics Tool"
    )
    parser.add_argument("--check", default="all",
                        choices=["all", "docker", "nmap", "zap", "logs", "rabbitmq"],
                        help="Loại kiểm tra (default: all)")
    args = parser.parse_args()

    separator("NexusSec Worker Diagnostics")
    log("INFO", f"Check: {args.check}")

    check = args.check

    if check in ("all", "docker"):
        check_docker_status()

    if check in ("all", "logs"):
        check_worker_logs()

    if check in ("all", "rabbitmq"):
        check_rabbitmq()

    if check in ("all", "nmap"):
        check_nmap_direct()

    if check in ("all", "zap"):
        check_zap_direct()

    separator("Diagnostics hoàn thành")
    log("INFO", "Để chạy QA test đầy đủ:")
    log("INFO", "  python scripts/qa_scan_test.py --email EMAIL --password PASS")


if __name__ == "__main__":
    main()
