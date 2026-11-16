package publicfetch

import (
	"crypto/tls"
	"errors"
	"io"
	"net"
	"strings"
	"syscall"
)

// Classify transport errors without exposing request URLs, queries or credentials.
func requestFailure(err error) error {
	var dns *net.DNSError
	if errors.As(err, &dns) {
		if dns.IsTimeout {
			return errors.New("远程资源 DNS 解析超时")
		}
		return errors.New("远程资源 DNS 解析失败")
	}
	var certificate *tls.CertificateVerificationError
	if errors.As(err, &certificate) {
		return errors.New("远程资源 TLS 证书验证失败")
	}
	message := err.Error()
	if strings.Contains(message, "TLS handshake timeout") {
		return errors.New("远程资源 TLS 握手超时")
	}
	if strings.Contains(message, "tls:") {
		return errors.New("远程资源 TLS 连接失败")
	}
	if errors.Is(err, syscall.ECONNRESET) {
		return errors.New("远程服务器重置连接")
	}
	if errors.Is(err, syscall.ECONNREFUSED) {
		return errors.New("远程服务器拒绝连接")
	}
	if errors.Is(err, io.EOF) || errors.Is(err, io.ErrUnexpectedEOF) {
		return errors.New("远程服务器提前关闭连接（EOF）")
	}
	var operation *net.OpError
	if errors.As(err, &operation) && operation.Op == "dial" {
		if operation.Timeout() {
			return errors.New("远程资源 TCP 连接超时")
		}
		return errors.New("远程资源 TCP 连接失败")
	}
	var network net.Error
	if errors.As(err, &network) && network.Timeout() {
		return errors.New("远程资源请求超时")
	}
	for _, safe := range []string{"远程资源地址不能指向内部网络", "远程资源地址无法解析", "远程资源重定向过多", "远程资源重定向不能降级为 HTTP", "远程资源地址无效"} {
		if strings.Contains(message, safe) {
			return errors.New(safe)
		}
	}
	return errors.New("下载远程资源失败，请检查资源地址")
}
