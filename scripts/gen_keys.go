package main

import (
	"crypto/rand"
	"crypto/rsa"
	"crypto/x509"
	"encoding/pem"
	"log"
	"os"
)

func main() {
	privateKey, err := rsa.GenerateKey(rand.Reader, 2048)
	if err != nil {
		log.Fatal(err)
	}

	privateKeyBytes := x509.MarshalPKCS1PrivateKey(privateKey)
	privateKeyBlock := &pem.Block{
		Type:  "RSA PRIVATE KEY",
		Bytes: privateKeyBytes,
	}

	privFile, err := os.Create("deployments/jwt/private.pem")
	if err != nil {
		log.Fatal(err)
	}
	defer privFile.Close()
	pem.Encode(privFile, privateKeyBlock)

	publicKeyBytes, err := x509.MarshalPKIXPublicKey(&privateKey.PublicKey)
	if err != nil {
		log.Fatal(err)
	}
	publicKeyBlock := &pem.Block{
		Type:  "PUBLIC KEY",
		Bytes: publicKeyBytes,
	}

	pubFile, err := os.Create("deployments/jwt/public.pem")
	if err != nil {
		log.Fatal(err)
	}
	defer pubFile.Close()
	pem.Encode(pubFile, publicKeyBlock)
}
