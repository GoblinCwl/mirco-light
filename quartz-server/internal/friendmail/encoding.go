package friendmail

import (
	"encoding/base64"
	"strings"
)

func encodeBody(body string) string {
	raw := base64.StdEncoding.EncodeToString([]byte(body))
	var b strings.Builder
	for len(raw) > 76 {
		b.WriteString(raw[:76])
		b.WriteString("\r\n")
		raw = raw[76:]
	}
	b.WriteString(raw)
	return b.String()
}
