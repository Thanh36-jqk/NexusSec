#!/usr/bin/env bash
# ═══════════════════════════════════════════════════════════════
# NexusSec — End-to-End API Smoke Test
# ═══════════════════════════════════════════════════════════════
#
# Kịch bản:
#   1. Register user (hoặc skip nếu đã tồn tại)
#   2. Login → lấy JWT token
#   3. Create Target (https://scanme.nmap.org)
#   4. Create Scan (scan_type: full)
#   5. Poll GetScan mỗi 10 giây cho đến khi status != RUNNING/PENDING
#   6. Nếu COMPLETED → Fetch Report → In ReportSummary
#
# Yêu cầu: curl, jq phải có sẵn trên PATH.
# Chạy: bash scripts/e2e_smoke_test.sh [GATEWAY_URL]
# Mặc định: GATEWAY_URL=http://localhost:8080
# ═══════════════════════════════════════════════════════════════

set -euo pipefail

# ── Cấu hình ──────────────────────────────────────────────────
GATEWAY="${1:-http://localhost:8080}"
API="${GATEWAY}/api/v1"

# Thông tin test user (có thể override bằng env vars)
TEST_EMAIL="${TEST_EMAIL:-e2e_tester@nexussec.local}"
TEST_USERNAME="${TEST_USERNAME:-e2e_tester}"
TEST_PASSWORD="${TEST_PASSWORD:-NexusS3c_E2E!2026}"

# Target scan
TARGET_URL="https://scanme.nmap.org"
TARGET_NAME="ScanMe Nmap Org (E2E)"
SCAN_TYPE="full"

# Polling
POLL_INTERVAL=10   # giây
MAX_POLL_COUNT=180  # 180 × 10s = 30 phút max (khớp với anti-zombie timeout)

# Màu (dùng cho output đẹp)
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
CYAN='\033[0;36m'
BOLD='\033[1m'
NC='\033[0m' # No Color

# ── Helper functions ──────────────────────────────────────────
info()  { echo -e "${CYAN}[INFO]${NC} $*"; }
ok()    { echo -e "${GREEN}[✅ OK]${NC} $*"; }
warn()  { echo -e "${YELLOW}[⚠️  WARN]${NC} $*"; }
fail()  { echo -e "${RED}[❌ FAIL]${NC} $*"; exit 1; }
header() { echo -e "\n${BOLD}═══════════════════════════════════════════════${NC}"; echo -e "${BOLD} $*${NC}"; echo -e "${BOLD}═══════════════════════════════════════════════${NC}"; }

# Kiểm tra dependencies
command -v curl >/dev/null 2>&1 || fail "curl chưa cài. Cài rồi chạy lại."
command -v jq   >/dev/null 2>&1 || fail "jq chưa cài. Cài rồi chạy lại."

# ═══════════════════════════════════════════════════════════════
# STEP 0: Health Check
# ═══════════════════════════════════════════════════════════════
header "STEP 0: Health Check"
info "Checking gateway at ${GATEWAY}..."

HEALTH_RESP=$(curl -s -o /dev/null -w "%{http_code}" "${GATEWAY}/health/live" 2>/dev/null || true)
if [ "$HEALTH_RESP" != "200" ]; then
    fail "Gateway không phản hồi tại ${GATEWAY}/health/live (HTTP ${HEALTH_RESP}). Hãy chắc chắn docker compose up đã chạy."
fi
ok "Gateway sống tại ${GATEWAY}"

# ═══════════════════════════════════════════════════════════════
# STEP 1: Register
# ═══════════════════════════════════════════════════════════════
header "STEP 1: Register User"
info "Registering ${TEST_EMAIL}..."

REG_RESP=$(curl -s -w "\n%{http_code}" -X POST "${API}/auth/register" \
    -H "Content-Type: application/json" \
    -d "{\"email\":\"${TEST_EMAIL}\",\"username\":\"${TEST_USERNAME}\",\"password\":\"${TEST_PASSWORD}\"}")

REG_HTTP=$(echo "$REG_RESP" | tail -1)
REG_BODY=$(echo "$REG_RESP" | sed '$d')

if [ "$REG_HTTP" = "201" ]; then
    ok "User registered successfully"
elif [ "$REG_HTTP" = "409" ] || [ "$REG_HTTP" = "400" ]; then
    warn "User đã tồn tại (HTTP ${REG_HTTP}), tiếp tục login..."
else
    echo "$REG_BODY" | jq . 2>/dev/null || echo "$REG_BODY"
    fail "Register thất bại với HTTP ${REG_HTTP}"
fi

# ═══════════════════════════════════════════════════════════════
# STEP 2: Login → JWT Token
# ═══════════════════════════════════════════════════════════════
header "STEP 2: Login"
info "Logging in as ${TEST_EMAIL}..."

LOGIN_RESP=$(curl -s -X POST "${API}/auth/login" \
    -H "Content-Type: application/json" \
    -d "{\"email\":\"${TEST_EMAIL}\",\"password\":\"${TEST_PASSWORD}\"}")

TOKEN=$(echo "$LOGIN_RESP" | jq -r '.data.access_token // empty')

if [ -z "$TOKEN" ]; then
    echo "$LOGIN_RESP" | jq . 2>/dev/null || echo "$LOGIN_RESP"
    fail "Login thất bại — không lấy được access_token"
fi

ok "JWT Token obtained (${TOKEN:0:20}...)"

# ═══════════════════════════════════════════════════════════════
# STEP 3: Create Target
# ═══════════════════════════════════════════════════════════════
header "STEP 3: Create Target"
info "Creating target: ${TARGET_URL}"

TARGET_RESP=$(curl -s -X POST "${API}/targets" \
    -H "Content-Type: application/json" \
    -H "Authorization: Bearer ${TOKEN}" \
    -d "{\"name\":\"${TARGET_NAME}\",\"base_url\":\"${TARGET_URL}\",\"description\":\"E2E smoke test target\"}")

TARGET_ID=$(echo "$TARGET_RESP" | jq -r '.data.id // empty')

if [ -z "$TARGET_ID" ]; then
    echo "$TARGET_RESP" | jq . 2>/dev/null || echo "$TARGET_RESP"
    fail "Create Target thất bại — không lấy được target_id"
fi

ok "Target created: ${TARGET_ID}"

# ═══════════════════════════════════════════════════════════════
# STEP 4: Create Scan (Full)
# ═══════════════════════════════════════════════════════════════
header "STEP 4: Create Scan (type: ${SCAN_TYPE})"
info "Kicking off scan for target ${TARGET_ID}..."

SCAN_RESP=$(curl -s -X POST "${API}/scans" \
    -H "Content-Type: application/json" \
    -H "Authorization: Bearer ${TOKEN}" \
    -d "{\"target_id\":\"${TARGET_ID}\",\"scan_type\":\"${SCAN_TYPE}\"}")

SCAN_ID=$(echo "$SCAN_RESP" | jq -r '.data.id // empty')
SCAN_STATUS=$(echo "$SCAN_RESP" | jq -r '.data.status // empty')

if [ -z "$SCAN_ID" ]; then
    echo "$SCAN_RESP" | jq . 2>/dev/null || echo "$SCAN_RESP"
    fail "Create Scan thất bại — không lấy được scan_id"
fi

ok "Scan created: ${SCAN_ID} (status: ${SCAN_STATUS})"

# ═══════════════════════════════════════════════════════════════
# STEP 5: Poll Status
# ═══════════════════════════════════════════════════════════════
header "STEP 5: Polling scan status (${POLL_INTERVAL}s interval, max ${MAX_POLL_COUNT} polls)"

POLL_COUNT=0
FINAL_STATUS=""

while [ $POLL_COUNT -lt $MAX_POLL_COUNT ]; do
    POLL_COUNT=$((POLL_COUNT + 1))

    STATUS_RESP=$(curl -s -X GET "${API}/scans/${SCAN_ID}" \
        -H "Authorization: Bearer ${TOKEN}")

    CURRENT_STATUS=$(echo "$STATUS_RESP" | jq -r '.data.status // empty')
    CURRENT_PROGRESS=$(echo "$STATUS_RESP" | jq -r '.data.progress // 0')
    ERROR_MSG=$(echo "$STATUS_RESP" | jq -r '.data.error_message // empty')

    # Hiển thị tiến trình
    info "[Poll ${POLL_COUNT}/${MAX_POLL_COUNT}] Status: ${CURRENT_STATUS} | Progress: ${CURRENT_PROGRESS}%"

    case "$CURRENT_STATUS" in
        completed|COMPLETED)
            FINAL_STATUS="COMPLETED"
            ok "Scan hoàn tất!"
            break
            ;;
        failed|FAILED)
            FINAL_STATUS="FAILED"
            warn "Scan thất bại: ${ERROR_MSG}"
            break
            ;;
        pending|PENDING|running|RUNNING)
            # Vẫn đang chạy, tiếp tục poll
            sleep $POLL_INTERVAL
            ;;
        *)
            warn "Unknown status: ${CURRENT_STATUS}"
            sleep $POLL_INTERVAL
            ;;
    esac
done

if [ -z "$FINAL_STATUS" ]; then
    fail "Timeout sau ${MAX_POLL_COUNT} polls ($(( MAX_POLL_COUNT * POLL_INTERVAL / 60 )) phút). Scan vẫn chưa xong."
fi

# ═══════════════════════════════════════════════════════════════
# STEP 6: Fetch Report
# ═══════════════════════════════════════════════════════════════
header "STEP 6: Fetch Report"

if [ "$FINAL_STATUS" != "COMPLETED" ]; then
    fail "Scan không COMPLETED (status: ${FINAL_STATUS}). Không thể lấy report."
fi

info "Fetching report for scan ${SCAN_ID}..."

REPORT_RESP=$(curl -s -X GET "${API}/scans/${SCAN_ID}/report" \
    -H "Authorization: Bearer ${TOKEN}")

REPORT_STATUS=$(echo "$REPORT_RESP" | jq -r '.status // empty')

if [ "$REPORT_STATUS" != "success" ]; then
    echo "$REPORT_RESP" | jq . 2>/dev/null || echo "$REPORT_RESP"
    fail "Fetch Report thất bại"
fi

# ═══════════════════════════════════════════════════════════════
# STEP 7: Print Summary
# ═══════════════════════════════════════════════════════════════
header "📊 REPORT SUMMARY"

echo "$REPORT_RESP" | jq -r '
    .data | 
    "┌─────────────────────────────────────────┐",
    "│        NexusSec Scan Report              │",
    "├─────────────────────────────────────────┤",
    "│  Scan ID:    \(.scan_id)  │",
    "├─────────────────────────────────────────┤",
    "│             SEVERITY SUMMARY            │",
    "├─────────────────────────────────────────┤",
    "│  Total:      \(.summary.total // 0) vulnerabilities       │",
    "│  🔴 Critical: \(.summary.critical // 0)                      │",
    "│  🟠 High:     \(.summary.high // 0)                      │",
    "│  🟡 Medium:   \(.summary.medium // 0)                      │",
    "│  🔵 Low:      \(.summary.low // 0)                      │",
    "│  ⚪ Info:     \(.summary.info // 0)                      │",
    "└─────────────────────────────────────────┘"
'

# In chi tiết top 10 vulnerabilities
VULN_COUNT=$(echo "$REPORT_RESP" | jq '.data.vulnerabilities | length')
DISPLAY_COUNT=$((VULN_COUNT > 10 ? 10 : VULN_COUNT))

if [ "$VULN_COUNT" -gt 0 ]; then
    echo ""
    info "Top ${DISPLAY_COUNT} Vulnerabilities (of ${VULN_COUNT} total):"
    echo ""

    echo "$REPORT_RESP" | jq -r --argjson n "$DISPLAY_COUNT" '
        .data.vulnerabilities[:$n] | to_entries[] |
        "  [\(.key + 1)] \(.value.severity | ascii_upcase) | \(.value.name)\n      ID: \(.value.vuln_id) | Tool: \(.value.source_tool)\n      URL: \(.value.url // "N/A")\n"
    '
fi

# ═══════════════════════════════════════════════════════════════
# DONE
# ═══════════════════════════════════════════════════════════════
header "🎯 E2E SMOKE TEST PASSED"
ok "Toàn bộ pipeline hoạt động: Register → Login → Target → Scan → Poll → Report ✅"
echo ""
