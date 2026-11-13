package credentials

import (
	"context"
	"net/http"
	"net/http/httptest"
	"testing"
)

func TestGiteaCredentialVerification(t *testing.T) {
	code := 200
	response := `{"id":1}`
	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		if r.URL.Path != "/api/v1/user" || r.Header.Get("Authorization") != "token fixture" || r.Header.Get("Cookie") != "" {
			t.Error("incorrect verification request")
		}
		w.WriteHeader(code)
		w.Write([]byte(response))
	}))
	defer server.Close()
	s := &Store{Client: server.Client(), GiteaURL: func(context.Context) (string, error) { return server.URL, nil }}
	for _, c := range []struct {
		code       int
		body, want string
	}{{200, `{"id":1}`, "valid"}, {401, `{}`, "expired"}, {403, `{}`, "expired"}, {200, `<html>login</html>`, "unavailable"}, {502, `{}`, "unavailable"}} {
		code = c.code
		response = c.body
		state, _ := s.verify(context.Background(), "gitea", "fixture")
		if state != c.want {
			t.Fatal(c, state)
		}
	}
}
