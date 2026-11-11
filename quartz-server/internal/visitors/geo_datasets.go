package visitors

import (
	"bytes"
	"compress/gzip"
	"context"
	"crypto/sha256"
	"database/sql"
	"encoding/hex"
	"encoding/json"
	"errors"
	"fmt"
	"github.com/lionsoul2014/ip2region/binding/golang/xdb"
	"io"
	"os"
	"path/filepath"
	"time"
)

const maxGeoSize = 128 << 20

// ImportGeo replaces the IPv4/IPv6 pair atomically. Only this explicit local
// maintenance operation reads files; normal server startup reads MySQL only.
func ImportGeo(ctx context.Context, db *sql.DB, directory string) error {
	source, err := os.ReadFile(filepath.Join(directory, "source.json"))
	if err != nil {
		return err
	}
	var metadata map[string]any
	if json.Unmarshal(source, &metadata) != nil || metadata == nil {
		return errors.New("invalid GeoIP source metadata")
	}
	tx, err := db.BeginTx(ctx, nil)
	if err != nil {
		return err
	}
	defer tx.Rollback()
	for _, version := range []*xdb.Version{xdb.IPv4, xdb.IPv6} {
		filename := filepath.Join(directory, fmt.Sprintf("ip2region_v%d.xdb", version.Id))
		if err = xdb.VerifyFromFile(filename); err != nil {
			return err
		}
		raw, err := os.ReadFile(filename)
		if err != nil {
			return err
		}
		if len(raw) > maxGeoSize {
			return errors.New("GeoIP dataset exceeds size limit")
		}
		sum := sha256.Sum256(raw)
		var packed bytes.Buffer
		writer, _ := gzip.NewWriterLevel(&packed, gzip.BestSpeed)
		if _, err = writer.Write(raw); err != nil {
			return err
		}
		if err = writer.Close(); err != nil {
			return err
		}
		_, err = tx.ExecContext(ctx, "INSERT INTO geoip_datasets(ip_version,compression,data,checksum,original_size,source,updated_at) VALUES(?,'gzip',?,?,?,?,?) ON DUPLICATE KEY UPDATE compression=VALUES(compression),data=VALUES(data),checksum=VALUES(checksum),original_size=VALUES(original_size),source=VALUES(source),updated_at=VALUES(updated_at)", version.Id, packed.Bytes(), hex.EncodeToString(sum[:]), len(raw), string(source), time.Now().UTC().Format("2006-01-02T15:04:05.000Z"))
		if err != nil {
			return err
		}
	}
	return tx.Commit()
}
func loadGeoBuffer(ctx context.Context, db *sql.DB, version int) ([]byte, error) {
	var packed []byte
	var checksum, compression string
	var expected int64
	if err := db.QueryRowContext(ctx, "SELECT data,checksum,compression,original_size FROM geoip_datasets WHERE ip_version=?", version).Scan(&packed, &checksum, &compression, &expected); err != nil {
		return nil, err
	}
	if compression != "gzip" || expected <= 0 || expected > maxGeoSize {
		return nil, errors.New("invalid GeoIP dataset metadata")
	}
	reader, err := gzip.NewReader(bytes.NewReader(packed))
	if err != nil {
		return nil, err
	}
	defer reader.Close()
	raw, err := io.ReadAll(io.LimitReader(reader, maxGeoSize+1))
	if err != nil {
		return nil, err
	}
	sum := sha256.Sum256(raw)
	if int64(len(raw)) != expected || hex.EncodeToString(sum[:]) != checksum {
		return nil, errors.New("GeoIP dataset checksum mismatch")
	}
	header, err := xdb.LoadHeaderFromBuff(raw)
	if err != nil || header == nil {
		return nil, errors.New("invalid GeoIP header")
	}
	return raw, nil
}
