package config

import (
	"errors"
	"net/url"
	"os"
	"strings"
	"time"

	"github.com/go-sql-driver/mysql"
)

type Config struct {
	Listen, Origin, DatabaseDSN, AuthDir string
	ShutdownTimeout                      time.Duration
}

func Load() (Config, error) { return FromEnvironment(os.Getenv) }
func FromEnvironment(get func(string) string) (Config, error) {
	value := func(key, fallback string) string {
		if v := get(key); v != "" {
			return v
		}
		return fallback
	}
	c := Config{Listen: value("HTTP_ADDR", ":8080"), Origin: value("SITE_ORIGIN", "https://goblincwl.site"), AuthDir: value("AUTH_DIR", "/data/auth"), ShutdownTimeout: 30 * time.Second}
	origin, err := url.Parse(c.Origin)
	if err != nil || origin.Host == "" || (origin.Scheme != "https" && origin.Scheme != "http") || origin.RawQuery != "" || origin.Fragment != "" || origin.User != nil || (origin.Path != "" && origin.Path != "/") {
		return c, errors.New("SITE_ORIGIN must be an HTTP origin")
	}
	c.Origin = strings.TrimSuffix(c.Origin, "/")
	password := get("MYSQL_PASSWORD")
	if len(password) < 24 {
		return c, errors.New("MYSQL_PASSWORD must contain at least 24 characters")
	}

	db := mysql.NewConfig()
	db.Net = "tcp"
	db.Addr = value("MYSQL_ADDR", "mysql:3306")
	db.User = value("MYSQL_USER", "quartz")
	db.Passwd = password
	db.DBName = value("MYSQL_DATABASE", "quartz")
	db.Collation = "utf8mb4_bin"
	db.Timeout = 5 * time.Second
	db.ReadTimeout = 30 * time.Second
	db.WriteTimeout = 30 * time.Second
	db.ParseTime = true
	db.Loc = time.UTC
	db.AllowNativePasswords = true
	db.MultiStatements = false
	db.CheckConnLiveness = true
	db.Params = map[string]string{"charset": "utf8mb4", "time_zone": "'+00:00'"}
	c.DatabaseDSN = db.FormatDSN()
	return c, nil
}
