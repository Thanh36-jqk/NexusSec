package validator

import (
	"errors"
	"fmt"
	"net"
	"net/url"
	"strings"
)

// blockedHostnames is a set of hostnames that MUST be blocked regardless of DNS resolution.
// These are common SSRF targets that attackers use to probe internal services.
var blockedHostnames = map[string]bool{
	"localhost":                true,
	"localhost.localdomain":    true,
	"ip6-localhost":            true,
	"ip6-loopback":            true,
	"metadata.google.internal": true, // GCP metadata
	"169.254.169.254":          true, // AWS/Azure/GCP metadata endpoint
}

// blockedCIDRs defines network ranges that are forbidden as scan targets.
// Any target resolving to an IP within these ranges will be rejected.
var blockedCIDRs []*net.IPNet

func init() {
	cidrs := []string{
		"127.0.0.0/8",     // IPv4 loopback
		"10.0.0.0/8",      // RFC 1918 private
		"172.16.0.0/12",   // RFC 1918 private
		"192.168.0.0/16",  // RFC 1918 private
		"169.254.0.0/16",  // Link-local (AWS metadata lives here)
		"0.0.0.0/8",       // "This" network
		"100.64.0.0/10",   // Carrier-grade NAT (RFC 6598)
		"192.0.0.0/24",    // IETF protocol assignments
		"192.0.2.0/24",    // TEST-NET-1 (RFC 5737)
		"198.51.100.0/24", // TEST-NET-2 (RFC 5737)
		"203.0.113.0/24",  // TEST-NET-3 (RFC 5737)
		"224.0.0.0/4",     // Multicast
		"240.0.0.0/4",     // Reserved
		"255.255.255.255/32", // Broadcast
		"::1/128",         // IPv6 loopback
		"fc00::/7",        // IPv6 unique local (private)
		"fe80::/10",       // IPv6 link-local
		"::ffff:0:0/96",   // IPv4-mapped IPv6
	}

	for _, cidr := range cidrs {
		_, network, err := net.ParseCIDR(cidr)
		if err != nil {
			panic(fmt.Sprintf("ssrf: invalid CIDR in blocklist: %s", cidr))
		}
		blockedCIDRs = append(blockedCIDRs, network)
	}
}

// ValidateTarget kiểm tra URL đầu vào để chặn SSRF.
// Phân giải hostname ra IP thật, rồi block tất cả IP thuộc mạng nội bộ.
//
// Kiểm tra nhiều lớp:
//  1. URL syntax + scheme (chỉ http/https)
//  2. Blocked hostnames (localhost, metadata endpoints)
//  3. URL tricks (userinfo bypass: http://public@127.0.0.1)
//  4. DNS resolution → block ALL resolved IPs if any is private/reserved
func ValidateTarget(rawURL string) error {
	// 1. Kiểm tra cú pháp URL
	parsedURL, err := url.ParseRequestURI(rawURL)
	if err != nil {
		return errors.New("định dạng URL không hợp lệ")
	}

	// 2. Chỉ cho phép HTTP/HTTPS, chặn các scheme nguy hiểm như file://, gopher://
	if parsedURL.Scheme != "http" && parsedURL.Scheme != "https" {
		return errors.New("chỉ chấp nhận giao thức http hoặc https")
	}

	// 3. Chặn URL có userinfo (http://evil@127.0.0.1 bypass trick)
	if parsedURL.User != nil {
		return errors.New("URL không được chứa thông tin xác thực (user:password@)")
	}

	hostname := parsedURL.Hostname()
	if hostname == "" {
		return errors.New("URL thiếu hostname")
	}

	// 4. Chặn hostname trong danh sách cấm (case-insensitive)
	if blockedHostnames[strings.ToLower(hostname)] {
		return fmt.Errorf("truy cập bị từ chối: hostname '%s' nằm trong danh sách cấm", hostname)
	}

	// 5. Nếu hostname là IP trực tiếp, kiểm tra ngay
	if ip := net.ParseIP(hostname); ip != nil {
		if isBlockedIP(ip) {
			return fmt.Errorf("truy cập bị từ chối: IP %s thuộc mạng nội bộ/cấm", ip.String())
		}
		return nil
	}

	// 6. Phân giải Hostname ra IP thật (chống trò lừa trỏ Domain public về IP private)
	ips, err := net.LookupIP(hostname)
	if err != nil {
		return fmt.Errorf("không thể phân giải hostname '%s': %v", hostname, err)
	}

	if len(ips) == 0 {
		return fmt.Errorf("hostname '%s' không phân giải được IP nào", hostname)
	}

	// 7. Kiểm tra TẤT CẢ IP — nếu BẤT KỲ IP nào rơi vào dải cấm thì block
	for _, ip := range ips {
		if isBlockedIP(ip) {
			return fmt.Errorf("truy cập bị từ chối: IP %s (phân giải từ %s) thuộc mạng nội bộ/cấm", ip.String(), hostname)
		}
	}

	return nil
}

// isBlockedIP checks if the given IP falls within any blocked CIDR range
// or matches special-purpose addresses.
func isBlockedIP(ip net.IP) bool {
	// Check standard library helpers first
	if ip.IsLoopback() || ip.IsPrivate() || ip.IsUnspecified() ||
		ip.IsLinkLocalUnicast() || ip.IsLinkLocalMulticast() ||
		ip.IsMulticast() {
		return true
	}

	// Check against all blocked CIDR ranges
	for _, network := range blockedCIDRs {
		if network.Contains(ip) {
			return true
		}
	}

	return false
}
