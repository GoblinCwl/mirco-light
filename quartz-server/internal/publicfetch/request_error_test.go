package publicfetch

import (
	"crypto/tls"
	"errors"
	"io"
	"net"
	"net/url"
	"strings"
	"syscall"
	"testing"
)

func TestRequestFailureReportsSafeTransportReason(t *testing.T) {
	for _, tc := range []struct {
		err    error
		reason string
	}{
		{&net.DNSError{Err: "timeout", Name: "example.test", IsTimeout: true}, "DNS 解析超时"},
		{&net.DNSError{Err: "not found", Name: "example.test"}, "DNS 解析失败"},
		{&tls.CertificateVerificationError{Err: errors.New("private certificate")}, "TLS 证书验证失败"},
		{errors.New("net/http: TLS handshake timeout"), "TLS 握手超时"},
		{syscall.ECONNRESET, "重置连接"}, {syscall.ECONNREFUSED, "拒绝连接"}, {io.EOF, "EOF"},
	} {
		raw := &url.Error{Op: "Get", URL: "https://user:secret@example.test/path?api_key=private", Err: tc.err}
		result := requestFailure(raw).Error()
		if !strings.Contains(result, tc.reason) || strings.Contains(result, "secret") || strings.Contains(result, "private") {
			t.Fatal(result, tc.reason)
		}
	}
}
