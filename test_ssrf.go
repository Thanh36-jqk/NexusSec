package main

import (
	"fmt"
	"net"
)

func main() {
	ips, err := net.LookupIP("scanme.nmap.org")
	if err != nil {
		fmt.Println(err)
		return
	}
	for _, ip := range ips {
		fmt.Printf("IP: %s\n", ip)
		fmt.Printf("IsPrivate: %v\n", ip.IsPrivate())
		fmt.Printf("IsLoopback: %v\n", ip.IsLoopback())
	}
}
