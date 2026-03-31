package validator

import (
	"errors"
	"fmt"
	"net"
	"net/url"
)

// blockedIPs is the set of well-known cloud instance metadata endpoints that
// must always be rejected regardless of os-level DNS resolution results.
var blockedIPs = []string{
	"169.254.169.254", // AWS, Azure, GCP instance metadata
	"fd00:ec2::254",   // AWS IPv6 metadata
}

// ValidateTargetURL performs a multi-stage SSRF check on the provided URL
// string. It returns a non-nil error if the URL is malformed, uses a
// disallowed scheme, or resolves to any internal/private/loopback address.
func ValidateTargetURL(target string) error {
	// ── Stage 1: URL parsing & scheme validation ──────────────────────────────
	parsed, err := url.Parse(target)
	if err != nil {
		return fmt.Errorf("invalid URL: %w", err)
	}

	if parsed.Host == "" {
		return errors.New("invalid URL: missing host")
	}

	switch parsed.Scheme {
	case "http", "https":
		// allowed
	default:
		return fmt.Errorf("disallowed scheme %q: only http and https are permitted", parsed.Scheme)
	}

	// ── Stage 2: Hostname extraction (strip optional port) ────────────────────
	host, _, err := net.SplitHostPort(parsed.Host)
	if err != nil {
		// No port present — the host field is already the bare hostname/IP.
		host = parsed.Host
	}

	// ── Stage 3: Reject bare IP literals that are in the block-list ──────────
	// This catches cases where the user supplies a raw IP, bypassing DNS.
	if ip := net.ParseIP(host); ip != nil {
		if err := checkIP(ip); err != nil {
			return err
		}
		// Raw IP passed all checks — no DNS resolution needed.
		return nil
	}

	// ── Stage 4: DNS resolution ───────────────────────────────────────────────
	ips, err := net.LookupIP(host)
	if err != nil {
		return fmt.Errorf("DNS resolution failed for %q: %w", host, err)
	}

	if len(ips) == 0 {
		return fmt.Errorf("DNS resolution returned no addresses for %q", host)
	}

	for _, ip := range ips {
		if err := checkIP(ip); err != nil {
			return err
		}
	}

	return nil
}

// checkIP applies the full set of SSRF filtering rules to a single resolved IP.
// Any match returns a descriptive error; nil means the IP is safe to target.
func checkIP(ip net.IP) error {
	if ip.IsLoopback() {
		return fmt.Errorf("SSRF detected: target resolves to loopback address %s", ip)
	}

	if ip.IsPrivate() {
		return fmt.Errorf("SSRF detected: target resolves to private network address %s", ip)
	}

	if ip.IsUnspecified() {
		return fmt.Errorf("SSRF detected: target resolves to unspecified address %s", ip)
	}

	if ip.IsLinkLocalUnicast() || ip.IsLinkLocalMulticast() {
		return fmt.Errorf("SSRF detected: target resolves to link-local address %s", ip)
	}

	for _, blocked := range blockedIPs {
		if ip.Equal(net.ParseIP(blocked)) {
			return fmt.Errorf("SSRF detected: target resolves to blocked metadata address %s", ip)
		}
	}

	return nil
}
