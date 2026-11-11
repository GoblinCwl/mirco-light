package config

import (
	"github.com/go-sql-driver/mysql"
	"strings"
	"testing"
)

func TestEnvironment(t *testing.T) {
	env := map[string]string{"MYSQL_PASSWORD": "a-secure-password-with-@:/?&-characters"}
	get := func(k string) string { return env[k] }
	c, err := FromEnvironment(get)
	if err != nil {
		t.Fatal(err)
	}
	db, err := mysql.ParseDSN(c.DatabaseDSN)
	if err != nil {
		t.Fatal(err)
	}
	if db.Passwd != "a-secure-password-with-@:/?&-characters" || db.MultiStatements || db.DBName != "quartz" {
		t.Fatal("unsafe or corrupted database configuration")
	}
	for _, bad := range []string{"https://a/b", "https://a?x=1", "https://user:pass@a", "ftp://a", "bad"} {
		env["SITE_ORIGIN"] = bad
		if _, err := FromEnvironment(get); err == nil {
			t.Errorf("accepted origin %q", bad)
		}
	}
	delete(env, "SITE_ORIGIN")
	delete(env, "MYSQL_PASSWORD")
	if _, err := FromEnvironment(get); err == nil || !strings.Contains(err.Error(), "MYSQL_PASSWORD") {
		t.Fatal("missing secret accepted")
	}
}
