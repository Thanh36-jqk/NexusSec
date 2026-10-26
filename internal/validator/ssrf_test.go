package validator

import (
	"net"
	"testing"
)

// TestValidateTarget_BlocksUnsafe covers every rejection path of ValidateTarget:
// private/loopback/metadata IPs, blocked hostnames, the userinfo bypass trick,
// disallowed schemes and malformed input. Cases that would hit the network use
// the hostname/userinfo/syntax short-circuits that run before DNS resolution.
func TestValidateTarget_BlocksUnsafe(t *testing.T) {
	cases := []struct {
		name string
		url  string
	}{
		{"loopback", "http://127.0.0.1"},
		{"private 10", "http://10.0.0.1"},
		{"private 192.168 with port", "https://192.168.1.1:8443"},
		{"private 172.16", "http://172.16.0.1"},
		{"metadata ip", "http://169.254.169.254/"},
		{"localhost hostname", "http://localhost"},
		{"gcp metadata hostname", "http://metadata.google.internal/"},
		{"userinfo bypass", "http://public@127.0.0.1"},
		{"disallowed scheme gopher", "gopher://127.0.0.1"},
		{"disallowed scheme file", "file:///etc/passwd"},
		{"malformed", "not-a-url"},
	}
	for _, c := range cases {
		t.Run(c.name, func(t *testing.T) {
			if err := ValidateTarget(c.url); err == nil {
				t.Errorf("expected error for %q, got nil", c.url)
			}
		})
	}
}

// TestValidateTarget_AllowsPublicIP ensures routable public IPs pass (raw-IP
// path, no DNS).
func TestValidateTarget_AllowsPublicIP(t *testing.T) {
	for _, u := range []string{"http://8.8.8.8", "https://1.1.1.1:443/scan"} {
		if err := ValidateTarget(u); err != nil {
			t.Errorf("expected %q to be allowed, got %v", u, err)
		}
	}
}

// TestIsBlockedIP exercises the CIDR/special-address classifier directly across
// RFC-1918, CGNAT, link-local, multicast, reserved and IPv6 ranges, plus a few
// known-good public addresses.
func TestIsBlockedIP(t *testing.T) {
	blocked := []string{
		"127.0.0.1", "10.1.1.1", "172.16.9.9", "192.168.5.5",
		"169.254.1.1", "100.64.0.1", "198.51.100.7", "224.0.0.1",
		"255.255.255.255", "0.0.0.0", "::1", "fc00::1", "fe80::1",
	}
	for _, s := range blocked {
		if !isBlockedIP(net.ParseIP(s)) {
			t.Errorf("expected %s to be blocked", s)
		}
	}
	allowed := []string{"8.8.8.8", "1.1.1.1", "93.184.216.34"}
	for _, s := range allowed {
		if isBlockedIP(net.ParseIP(s)) {
			t.Errorf("expected %s to be allowed", s)
		}
	}
}
