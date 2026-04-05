package main

import (
	"fmt"
	"net"
)

func main() {
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

	ip := net.ParseIP("45.33.32.156")

	for _, cidr := range cidrs {
		_, network, _ := net.ParseCIDR(cidr)
		if network.Contains(ip) {
			fmt.Printf("BLOCKED BY CIDR STRING: %s (Parsed as %v)\n", cidr, network)
		}
	}
}
