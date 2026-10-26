package validator

import (
	"net"
	"testing"
)

// TestValidateTargetURL_BlocksUnsafe ensures loopback, private, metadata and
// malformed/disallowed-scheme targets are rejected. All cases use bare IP
// literals or syntax errors so the test never depends on live DNS.
func TestValidateTargetURL_BlocksUnsafe(t *testing.T) {
	cases := []struct {
		name   string
		target string
	}{
		{"loopback IPv4", "http://127.0.0.1"},
		{"loopback with port", "http://127.0.0.1:8080"},
		{"private 10.x", "http://10.0.0.5"},
		{"private 192.168.x", "https://192.168.1.1"},
		{"private 172.16.x", "http://172.16.0.1"},
		{"aws/gcp metadata", "http://169.254.169.254/latest/meta-data/"},
		{"unspecified", "http://0.0.0.0"},
		{"disallowed scheme file", "file:///etc/passwd"},
		{"disallowed scheme gopher", "gopher://127.0.0.1"},
		{"missing host", "http://"},
		{"malformed", "://bad"},
	}
	for _, c := range cases {
		t.Run(c.name, func(t *testing.T) {
			if err := ValidateTargetURL(c.target); err == nil {
				t.Errorf("expected error for %q, got nil", c.target)
			}
		})
	}
}

// TestValidateTargetURL_AllowsPublicIP ensures routable public IPs pass without
// requiring DNS (raw-IP fast path).
func TestValidateTargetURL_AllowsPublicIP(t *testing.T) {
	for _, target := range []string{"http://8.8.8.8", "https://1.1.1.1:443"} {
		if err := ValidateTargetURL(target); err != nil {
			t.Errorf("expected %q to be allowed, got %v", target, err)
		}
	}
}

// TestCheckIP exercises the per-IP filter directly (white-box) across every
// rejection category and a few known-good public addresses.
func TestCheckIP(t *testing.T) {
	blocked := []string{
		"127.0.0.1", "10.1.2.3", "192.168.0.1", "172.16.5.5",
		"169.254.169.254", "0.0.0.0", "::1", "fd00:ec2::254",
	}
	for _, s := range blocked {
		if err := checkIP(net.ParseIP(s)); err == nil {
			t.Errorf("expected %s to be blocked, got nil", s)
		}
	}
	allowed := []string{"8.8.8.8", "1.1.1.1", "93.184.216.34"}
	for _, s := range allowed {
		if err := checkIP(net.ParseIP(s)); err != nil {
			t.Errorf("expected %s to be allowed, got %v", s, err)
		}
	}
}
