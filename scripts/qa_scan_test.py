#!/usr/bin/env python3
"""
=============================================================================
NexusSec QA Automation Script - Scan Verification
=============================================================================
Mục đích: Kiểm thử end-to-end cho Worker Node:
  - Phase 1: Nmap scan → scanme.nmap.org (kỳ vọng thấy Port 22, 80)
  - Phase 2: ZAP full scan → http://testphp.vulnweb.com/ (kỳ vọng SQLi + XSS)

Cách dùng:
  python scripts/qa_scan_test.py --email user@example.com --password yourpass
  python scripts/qa_scan_test.py --phase 1  # Chỉ chạy Phase 1 (Nmap)
  python scripts/qa_scan_test.py --phase 2  # Chỉ chạy Phase 2 (ZAP)

Yêu cầu:
  pip install requests colorama
=============================================================================
"""

import argparse
import json
import subprocess
import sys
import time
from datetime import datetime
from typing import Optional

try:
    import requests
    from colorama import Fore, Style, init as colorama_init
    colorama_init(autoreset=True)
except ImportError:
    print("Lỗi: Cần cài thư viện. Chạy: pip install requests colorama")
    sys.exit(1)

# ── Cấu hình mặc định ────────────────────────────────────────────────────────
DEFAULT_GATEWAY = "http://localhost:8080"
POLL_INTERVAL   = 10   # seconds giữa mỗi lần poll status
NMAP_TIMEOUT    = 600  # 10 phút tối đa cho Nmap
ZAP_TIMEOUT     = 1800 # 30 phút tối đa cho ZAP full scan

NMAP_TARGET = "scanme.nmap.org"
ZAP_TARGET  = "http://testphp.vulnweb.com/"

# Ports bắt buộc thấy trên scanme.nmap.org
REQUIRED_NMAP_PORTS = {22, 80}

# Loại lỗi bắt buộc thấy trên testphp.vulnweb.com
REQUIRED_ZAP_VULNS = [
    "sql injection",
    "cross site scripting",
]

# ── Helpers ──────────────────────────────────────────────────────────────────

def log(level: str, msg: str, data=None):
    """In log có màu ra console."""
    ts = datetime.now().strftime("%H:%M:%S")
    colors = {
        "INFO":  Fore.CYAN,
        "OK":    Fore.GREEN,
        "WARN":  Fore.YELLOW,
        "ERROR": Fore.RED,
        "STEP":  Fore.MAGENTA,
        "DATA":  Fore.WHITE,
    }
    color = colors.get(level, Fore.WHITE)
    print(f"{Fore.LIGHTBLACK_EX}[{ts}]{Style.RESET_ALL} {color}[{level}]{Style.RESET_ALL} {msg}")
    if data is not None:
        print(f"       {Fore.WHITE}{json.dumps(data, indent=2, ensure_ascii=False)}{Style.RESET_ALL}")


def separator(title: str):
    print(f"\n{Fore.YELLOW}{'='*70}")
    print(f"  {title}")
    print(f"{'='*70}{Style.RESET_ALL}\n")


# ── API Client ───────────────────────────────────────────────────────────────

class NexusSecClient:
    def __init__(self, base_url: str):
        self.base = base_url.rstrip("/")
        self.token: Optional[str] = None
        self.session = requests.Session()
        self.session.headers.update({"Content-Type": "application/json"})

    def login(self, email: str, password: str) -> bool:
        """Đăng nhập và lấy JWT token."""
        log("STEP", f"Đăng nhập với email: {email}")
        r = self.session.post(f"{self.base}/api/v1/auth/login", json={
            "email": email,
            "password": password,
        })
        if r.status_code != 200:
            log("ERROR", f"Login thất bại: HTTP {r.status_code}", r.json())
            return False

        body = r.json()
        token = body.get("data", {}).get("token") or body.get("token")
        if not token:
            log("ERROR", "Không tìm thấy token trong response", body)
            return False

        self.token = token
        self.session.headers.update({"Authorization": f"Bearer {token}"})
        log("OK", "Đăng nhập thành công, JWT đã được lưu.")
        return True

    def create_target(self, name: str, base_url: str) -> Optional[dict]:
        """Tạo scan target mới."""
        log("INFO", f"Tạo target: {name} → {base_url}")
        r = self.session.post(f"{self.base}/api/v1/targets", json={
            "name": name,
            "base_url": base_url,
            "description": f"QA Test target - {datetime.now().isoformat()}",
        })
        body = r.json()
        if r.status_code in (200, 201):
            t = body.get("data", body)
            log("OK", f"Target tạo thành công: ID={t.get('id')}")
            return t
        elif r.status_code == 409:
            # Đã tồn tại → list và tìm
            log("WARN", "Target đã tồn tại, đang tìm kiếm trong danh sách...")
            return self._find_target_by_url(base_url)
        else:
            log("ERROR", f"Tạo target thất bại: HTTP {r.status_code}", body)
            return None

    def _find_target_by_url(self, base_url: str) -> Optional[dict]:
        r = self.session.get(f"{self.base}/api/v1/targets")
        if r.status_code != 200:
            return None
        targets = r.json().get("data", [])
        for t in targets:
            if t.get("base_url") == base_url:
                log("OK", f"Tìm thấy target cũ: ID={t.get('id')}")
                return t
        return None

    def create_scan(self, target_id: str, scan_type: str) -> Optional[dict]:
        """Tạo scan job mới."""
        log("INFO", f"Tạo scan: type={scan_type}, target_id={target_id}")
        r = self.session.post(f"{self.base}/api/v1/scans", json={
            "target_id": target_id,
            "scan_type": scan_type,
        })
        body = r.json()
        if r.status_code == 202:
            job = body.get("data", body)
            log("OK", f"Scan job được chấp nhận: ID={job.get('id')}")
            return job
        else:
            log("ERROR", f"Tạo scan thất bại: HTTP {r.status_code}", body)
            return None

    def get_scan_status(self, scan_id: str) -> Optional[dict]:
        """Lấy trạng thái scan job."""
        r = self.session.get(f"{self.base}/api/v1/scans/{scan_id}")
        if r.status_code == 200:
            return r.json().get("data", r.json())
        return None

    def get_report(self, scan_id: str) -> Optional[dict]:
        """Lấy báo cáo vulnerabilities từ MongoDB."""
        r = self.session.get(f"{self.base}/api/v1/scans/{scan_id}/report")
        if r.status_code == 200:
            return r.json().get("data", r.json())
        log("ERROR", f"Lấy report thất bại: HTTP {r.status_code}", r.json())
        return None

    def poll_until_done(self, scan_id: str, timeout: int) -> Optional[str]:
        """
        Poll job status cho đến khi completed/failed hoặc timeout.
        Returns: 'completed', 'failed', hoặc None (timeout)
        """
        log("INFO", f"Đang poll job {scan_id} (timeout={timeout}s, interval={POLL_INTERVAL}s)...")
        elapsed = 0
        last_status = ""

        while elapsed < timeout:
            job = self.get_scan_status(scan_id)
            if job is None:
                log("WARN", "Không lấy được trạng thái job, thử lại...")
                time.sleep(POLL_INTERVAL)
                elapsed += POLL_INTERVAL
                continue

            status = job.get("status", "unknown").lower()
            progress = job.get("progress", 0)

            if status != last_status:
                log("INFO", f"  → Status: {status} | Progress: {progress}% | Elapsed: {elapsed}s")
                last_status = status

            if status == "completed":
                return "completed"
            elif status == "failed":
                err = job.get("error_message", "unknown error")
                log("ERROR", f"Job thất bại: {err}")
                return "failed"

            time.sleep(POLL_INTERVAL)
            elapsed += POLL_INTERVAL

        log("ERROR", f"Timeout sau {timeout}s — job vẫn chưa hoàn thành!")
        return None


# ── Phase 1: Nmap Test ───────────────────────────────────────────────────────

def run_nmap_phase(client: NexusSecClient) -> bool:
    separator("PHASE 1: NMAP SCAN → scanme.nmap.org")

    # 1. Tạo target
    # Nmap cần hostname thuần, không cần http://
    # Nhưng Gateway validate URL format, nên ta dùng http:// prefix
    target = client.create_target(
        name="QA-Nmap-scanme",
        base_url=f"http://{NMAP_TARGET}"
    )
    if not target:
        log("ERROR", "Không thể tạo target Nmap. Dừng Phase 1.")
        return False

    target_id = target.get("id")

    # 2. Tạo scan job type=nmap
    log("STEP", "Gửi scan request (type=nmap) vào Gateway...")
    job = client.create_scan(target_id, "nmap")
    if not job:
        log("ERROR", "Không tạo được scan job. Dừng Phase 1.")
        return False

    scan_id = job.get("id")
    log("INFO", f"Scan ID: {scan_id}")
    log("INFO", "Kiểm tra RabbitMQ: Gateway đã publish message vào queue 'scan_jobs_queue'")
    log("INFO", "Theo dõi Worker log: docker logs nexussec-worker -f")

    # 3. Poll
    result = client.poll_until_done(scan_id, NMAP_TIMEOUT)
    if result != "completed":
        log("ERROR", f"Phase 1 kết thúc với trạng thái: {result}")
        return False

    # 4. Lấy báo cáo
    log("STEP", "Lấy vulnerability report từ MongoDB...")
    report = client.get_report(scan_id)
    if not report:
        log("ERROR", "Không lấy được report Phase 1.")
        return False

    vulns = report.get("vulnerabilities", [])
    summary = report.get("summary", {})

    log("INFO", f"Tổng số findings: {summary.get('total', len(vulns))}")
    log("DATA", "Summary:", summary)

    # 5. Kiểm tra Port 22 và Port 80
    found_ports = set()
    port_findings = []

    for v in vulns:
        port = v.get("port", 0)
        if port in REQUIRED_NMAP_PORTS:
            found_ports.add(port)
            port_findings.append({
                "port":    port,
                "service": v.get("service", "?"),
                "title":   v.get("title", "?"),
                "severity":v.get("severity", "?"),
            })

    separator("KẾT QUẢ PHASE 1")

    if port_findings:
        log("OK", f"Tìm thấy {len(port_findings)} findings cho các port cần kiểm tra:")
        for f in port_findings:
            print(f"  {Fore.GREEN}✓ Port {f['port']}/{f['service']}: {f['title']} [{f['severity']}]{Style.RESET_ALL}")

    missing = REQUIRED_NMAP_PORTS - found_ports
    success = len(missing) == 0

    if success:
        log("OK", "✅ PHASE 1 PASSED: Port 22 (SSH) và Port 80 (HTTP) đều được phát hiện!")
    else:
        log("ERROR", f"❌ PHASE 1 FAILED: Không tìm thấy port(s): {missing}")
        log("WARN", "Gợi ý troubleshoot:")
        log("WARN", "  1. Docker worker có kết nối internet không? Container dùng scan-network")
        log("WARN", "  2. Xem log: docker logs nexussec-worker --tail=100")
        log("WARN", "  3. Azure NSG có block outbound TCP không?")
        log("WARN", "  4. Thử manual: docker run --rm instrumentisto/nmap:latest -F -oX - scanme.nmap.org")

    # In top-20 findings để debug
    if vulns:
        log("DATA", f"Top findings (tối đa 20):",
            [{"port": v.get("port"), "title": v.get("title"), "tool": v.get("source_tool")}
             for v in vulns[:20]])

    return success


# ── Phase 2: ZAP Full Scan Test ──────────────────────────────────────────────

def run_zap_phase(client: NexusSecClient) -> bool:
    separator("PHASE 2: ZAP FULL SCAN → http://testphp.vulnweb.com/")

    # 1. Tạo target
    target = client.create_target(
        name="QA-ZAP-vulnweb",
        base_url=ZAP_TARGET
    )
    if not target:
        log("ERROR", "Không thể tạo target ZAP. Dừng Phase 2.")
        return False

    target_id = target.get("id")

    # 2. Tạo scan job type=full (ZAP + Nmap concurrent)
    # Hoặc type=zap nếu chỉ muốn test ZAP đơn thuần
    log("STEP", "Gửi scan request (type=full) vào Gateway...")
    log("INFO", "Full scan sẽ chạy ZAP và Nmap song song trong Worker")
    log("INFO", "ZAP sẽ: Spider thu thập URL → Active Scan tìm lỗi")

    job = client.create_scan(target_id, "full")
    if not job:
        log("ERROR", "Không tạo được scan job. Dừng Phase 2.")
        return False

    scan_id = job.get("id")
    log("INFO", f"Scan ID: {scan_id}")
    log("WARN", f"ZAP scan có thể mất 15-30 phút. Timeout: {ZAP_TIMEOUT}s")

    # 3. Poll
    result = client.poll_until_done(scan_id, ZAP_TIMEOUT)
    if result != "completed":
        log("ERROR", f"Phase 2 kết thúc với trạng thái: {result}")
        return False

    # 4. Lấy báo cáo
    log("STEP", "Lấy vulnerability report từ MongoDB...")
    report = client.get_report(scan_id)
    if not report:
        log("ERROR", "Không lấy được report Phase 2.")
        return False

    vulns = report.get("vulnerabilities", [])
    summary = report.get("summary", {})

    log("INFO", f"Tổng số findings: {summary.get('total', len(vulns))}")
    log("DATA", "Summary:", summary)

    if not vulns:
        log("ERROR", "❌ Không có vulnerability nào được ghi nhận!")
        log("WARN", "Gợi ý troubleshoot:")
        log("WARN", "  1. XEM LOG WORKER: docker logs nexussec-worker --tail=200")
        log("WARN", "  2. ZAP có khởi động được Docker container không?")
        log("WARN", "     docker run --rm ghcr.io/zaproxy/zaproxy:stable zap-baseline.py -t http://testphp.vulnweb.com/")
        log("WARN", "  3. ZAP dùng -m flag (spider duration). Flag hiện tại: spider.maxDuration=2 (2 phút)")
        log("WARN", "  4. Kiểm tra extractReportFromContainer: ZAP có ghi /zap/wrk/report_<jobID>.json không?")
        return False

    # 5. Kiểm tra SQLi và XSS
    separator("KIỂM TRA KỲ VỌNG - PHASE 2")

    found_vuln_types = set()
    matched_findings = []

    for v in vulns:
        title_lower = v.get("title", "").lower()
        desc_lower  = v.get("description", "").lower()
        combined    = title_lower + " " + desc_lower

        for keyword in REQUIRED_ZAP_VULNS:
            if keyword.lower() in combined:
                found_vuln_types.add(keyword.lower())
                matched_findings.append({
                    "type":     keyword,
                    "title":    v.get("title"),
                    "severity": v.get("severity"),
                    "url":      v.get("url"),
                    "cwe":      v.get("cwe"),
                    "tool":     v.get("source_tool"),
                })
                break

    if matched_findings:
        log("OK", f"Tìm thấy {len(matched_findings)} findings khớp với tiêu chí:")
        for f in matched_findings:
            print(f"  {Fore.GREEN}✓ [{f['type'].upper()}] {f['title']} - {f['severity']} @ {f['url']}{Style.RESET_ALL}")

    missing = [v for v in REQUIRED_ZAP_VULNS if v.lower() not in found_vuln_types]
    success = len(missing) == 0

    if success:
        log("OK", "✅ PHASE 2 PASSED: SQL Injection và XSS đều được phát hiện!")
    else:
        log("ERROR", f"❌ PHASE 2 FAILED: Thiếu loại lỗi: {missing}")
        log("WARN", "Gợi ý troubleshoot:")
        log("WARN", "  1. ZAP baseline chỉ làm Passive Scan + Spider → Active Scan cần -a flag")
        log("WARN", "     Xem worker.go resolveScanConfig('zap'): hiện dùng zap-baseline.py")
        log("WARN", "  2. spider.maxDuration=2 có thể quá ngắn → tăng lên 5")
        log("WARN", "  3. Thử manual: docker run --rm -u root ghcr.io/zaproxy/zaproxy:stable \\")
        log("WARN", "       zap-baseline.py -t http://testphp.vulnweb.com/ -J /tmp/report.json")

    # Tất cả findings (ZAP sorted by severity)
    severity_order = {"critical": 0, "high": 1, "medium": 2, "low": 3, "info": 4}
    all_zap = sorted(
        [v for v in vulns if v.get("source_tool") == "zap"],
        key=lambda x: severity_order.get(x.get("severity", "info"), 5)
    )

    if all_zap:
        log("DATA", f"Tất cả ZAP findings ({len(all_zap)}):",
            [{"title": v.get("title"), "sev": v.get("severity"), "url": v.get("url")} for v in all_zap])

    return success


# ── Docker Log Extraction ─────────────────────────────────────────────────────

def extract_worker_logs(lines: int = 200) -> str:
    """Trích xuất log từ Worker container qua docker CLI."""
    log("STEP", f"Trích xuất {lines} dòng log gần nhất từ Worker container...")
    try:
        result = subprocess.run(
            ["docker", "logs", "nexussec-worker", "--tail", str(lines)],
            capture_output=True, text=True, timeout=15
        )
        combined = (result.stdout or "") + (result.stderr or "")
        return combined
    except subprocess.TimeoutExpired:
        return "Timeout khi lấy docker logs"
    except FileNotFoundError:
        return "Docker CLI không tồn tại trên máy này"
    except Exception as e:
        return f"Lỗi: {e}"


def save_worker_logs(phase: int, logs: str):
    """Lưu Worker logs ra file để audit."""
    filename = f"qa_worker_logs_phase{phase}_{datetime.now().strftime('%Y%m%d_%H%M%S')}.txt"
    try:
        with open(filename, "w", encoding="utf-8") as f:
            f.write(logs)
        log("OK", f"Worker logs đã lưu: {filename}")
    except Exception as e:
        log("WARN", f"Không thể lưu log file: {e}")


# ── Main ──────────────────────────────────────────────────────────────────────

def main():
    parser = argparse.ArgumentParser(
        description="NexusSec QA Scan Test - Xác minh Nmap và ZAP Worker"
    )
    parser.add_argument("--gateway", default=DEFAULT_GATEWAY,
                        help=f"URL Gateway (default: {DEFAULT_GATEWAY})")
    parser.add_argument("--email", required=True,
                        help="Email đăng nhập NexusSec")
    parser.add_argument("--password", required=True,
                        help="Password đăng nhập NexusSec")
    parser.add_argument("--phase", type=int, choices=[1, 2],
                        help="Chỉ chạy phase cụ thể (1=Nmap, 2=ZAP). Mặc định: cả 2")
    parser.add_argument("--save-logs", action="store_true",
                        help="Lưu Worker logs ra file sau mỗi phase")
    args = parser.parse_args()

    separator("NexusSec QA Scanner — Khởi động")
    log("INFO", f"Gateway: {args.gateway}")
    log("INFO", f"Phase: {'1 (Nmap only)' if args.phase == 1 else '2 (ZAP only)' if args.phase == 2 else 'All (1 + 2)'}")

    client = NexusSecClient(args.gateway)

    # Đăng nhập
    if not client.login(args.email, args.password):
        log("ERROR", "Đăng nhập thất bại. Kiểm tra credentials và gateway URL.")
        sys.exit(1)

    results = {}

    # ── Phase 1: Nmap ────────────────────────────────────────────────────────
    if args.phase in (None, 1):
        phase1_ok = run_nmap_phase(client)
        results["phase1_nmap"] = phase1_ok

        if args.save_logs:
            worker_logs = extract_worker_logs(300)
            save_worker_logs(1, worker_logs)

        # Preview worker log
        log("STEP", "Trích xuất Worker Log (cuối Phase 1):")
        raw_logs = extract_worker_logs(50)
        if raw_logs:
            print(f"\n{Fore.LIGHTBLACK_EX}--- Worker Log (tail 50) ---{Style.RESET_ALL}")
            for line in raw_logs.splitlines()[-50:]:
                print(f"  {Fore.WHITE}{line}{Style.RESET_ALL}")
            print()

    # ── Phase 2: ZAP ─────────────────────────────────────────────────────────
    if args.phase in (None, 2):
        phase2_ok = run_zap_phase(client)
        results["phase2_zap"] = phase2_ok

        if args.save_logs:
            worker_logs = extract_worker_logs(500)
            save_worker_logs(2, worker_logs)

        log("STEP", "Trích xuất Worker Log (cuối Phase 2):")
        raw_logs = extract_worker_logs(80)
        if raw_logs:
            print(f"\n{Fore.LIGHTBLACK_EX}--- Worker Log (tail 80) ---{Style.RESET_ALL}")
            for line in raw_logs.splitlines()[-80:]:
                print(f"  {Fore.WHITE}{line}{Style.RESET_ALL}")
            print()

    # ── Tổng kết ────────────────────────────────────────────────────────────
    separator("TỔNG KẾT QA TEST")
    all_passed = all(results.values())

    for phase, ok in results.items():
        icon  = "✅" if ok else "❌"
        color = Fore.GREEN if ok else Fore.RED
        print(f"  {color}{icon} {phase}: {'PASSED' if ok else 'FAILED'}{Style.RESET_ALL}")

    print()
    if all_passed:
        log("OK", "🎉 TẤT CẢ TEST ĐÃ PASS! Worker Node hoạt động đúng kỳ vọng.")
        sys.exit(0)
    else:
        log("ERROR", "⚠️  CÓ TEST THẤT BẠI. Xem log phía trên để troubleshoot.")
        sys.exit(2)


if __name__ == "__main__":
    main()
