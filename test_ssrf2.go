//go:build ignore

package main

import (
	"fmt"
	"net"
)

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

func main() {
	ips := []string{"45.33.32.156", "104.18.26.120", "142.250.199.78"}
	for _, ipStr := range ips {
		ip := net.ParseIP(ipStr)
		fmt.Printf("IP: %s\n", ip)
		fmt.Printf("  IsLoopback: %v\n", ip.IsLoopback())
		fmt.Printf("  IsPrivate: %v\n", ip.IsPrivate())
		fmt.Printf("  IsUnspecified: %v\n", ip.IsUnspecified())
		fmt.Printf("  IsLinkLocalUnicast: %v\n", ip.IsLinkLocalUnicast())
		fmt.Printf("  IsLinkLocalMulticast: %v\n", ip.IsLinkLocalMulticast())
		fmt.Printf("  IsMulticast: %v\n", ip.IsMulticast())
		
		for _, network := range blockedCIDRs {
			if network.Contains(ip) {
				fmt.Printf("  BLOCKED BY CIDR: %v\n", network)
			}
		}
	}
}
