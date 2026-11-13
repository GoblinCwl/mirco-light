package friendavatar

import (
	"net/http"
	"regexp"
	"strconv"
	"strings"
)

var edgeNumbers = regexp.MustCompile(`\b[A-Za-z_$][A-Za-z0-9_$]*\s*:\s*([0-9]{1,10})\s*[,}]`)
var edgeSession = regexp.MustCompile(`\(\s*[A-Za-z_$][A-Za-z0-9_$]*\s*,\s*([0-9]{1,10})\s*\)`)
var edgeAddition = regexp.MustCompile(`return\s+[A-Za-z_$][A-Za-z0-9_$]*\s*\+\s*[A-Za-z_$][A-Za-z0-9_$]*\s*}`)

// Recognize only EdgeOne's small additive cookie challenge, without evaluating remote JavaScript.
func edgeOneCookies(data []byte) []*http.Cookie {
	if len(data) > 8192 {
		return nil
	}
	body := string(data)
	for _, marker := range []string{"<script>", "EO_Bot_Ssid=", "__tst_status=", "document[", "setTimeout("} {
		if !strings.Contains(body, marker) {
			return nil
		}
	}
	if !edgeAddition.MatchString(body) {
		return nil
	}
	numbers, session := edgeNumbers.FindAllStringSubmatch(body, -1), edgeSession.FindAllStringSubmatch(body, -1)
	if len(numbers) != 3 || len(session) != 1 {
		return nil
	}
	var total uint64
	for _, value := range numbers {
		n, err := strconv.ParseUint(value[1], 10, 32)
		if err != nil {
			return nil
		}
		total += n
	}
	if _, err := strconv.ParseUint(session[0][1], 10, 32); err != nil {
		return nil
	}
	return []*http.Cookie{{Name: "__tst_status", Value: strconv.FormatUint(total, 10) + "#"}, {Name: "EO_Bot_Ssid", Value: session[0][1]}}
}
