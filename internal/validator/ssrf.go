package validator

import (
	"errors"
	"fmt"
	"net"
	"net/url"
)

// ValidateTarget kiểm tra URL đầu vào để chặn SSRF.
// Phân giải hostname ra IP thật, rồi block tất cả IP thuộc mạng nội bộ.
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

	// 3. Phân giải Hostname ra IP thật (chống trò lừa trỏ Domain public về IP private)
	hostname := parsedURL.Hostname()
	ips, err := net.LookupIP(hostname)
	if err != nil {
		return fmt.Errorf("không thể phân giải hostname: %v", err)
	}

	// 4. Kiểm tra từng IP xem có rơi vào dải cấm không
	for _, ip := range ips {
		// Bắt chết 127.0.0.1, 10.x.x.x, 192.168.x.x, 169.254.x.x, 0.0.0.0, v.v...
		if ip.IsLoopback() || ip.IsPrivate() || ip.IsUnspecified() || ip.IsLinkLocalUnicast() {
			return fmt.Errorf("truy cập bị từ chối: IP %s thuộc mạng nội bộ/cấm", ip.String())
		}
	}

	return nil
}
