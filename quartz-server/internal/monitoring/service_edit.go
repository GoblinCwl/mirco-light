package monitoring

import (
	"context"
	"database/sql"
	"encoding/json"
	"errors"

	"github.com/google/uuid"
	"goblincwl/quartz-server/internal/secretbox"
)

// Service and its optional authentication are one edit and one transaction.
// Editing a previously shared credential creates a private copy for this row.
func (r *Registry) SaveConfiguredService(ctx context.Context, value ServiceConfig, auth *Credential, create bool) error {
	tx, err := r.DB.BeginTx(ctx, nil)
	if err != nil {
		return err
	}
	defer tx.Rollback()
	registry := &Registry{DB: r.DB, Key: r.Key, tx: tx}
	var previous string
	if !create {
		if err = tx.QueryRowContext(ctx, "SELECT COALESCE(credential_id,'') FROM monitored_services WHERE id=? FOR UPDATE", value.ID).Scan(&previous); err != nil {
			if err == sql.ErrNoRows {
				return errors.New("服务不存在")
			}
			return err
		}
	}
	value.CredentialID = previous
	if auth != nil {
		value.CredentialID = ""
		if auth.Type != "" {
			credential := *auth
			credential.Name = value.Name
			credential.ID = previous
			fresh := previous == ""
			if !fresh {
				var others int
				if err = tx.QueryRowContext(ctx, "SELECT COUNT(*) FROM monitored_services WHERE credential_id=? AND id<>?", previous, value.ID).Scan(&others); err != nil {
					return err
				}
				if others > 0 {
					if credential.Secret == "" {
						var raw, oldType, username, header string
						if err = tx.QueryRowContext(ctx, "SELECT envelope,auth_type,username,header_name FROM service_credentials WHERE id=?", previous).Scan(&raw, &oldType, &username, &header); err != nil {
							return err
						}
						if oldType != credential.Type || username != credential.Username || header != credential.Header {
							return errors.New("更换认证类型或账号时请重新填写密钥")
						}
						var envelope secretbox.Envelope
						if err = json.Unmarshal([]byte(raw), &envelope); err != nil {
							return err
						}
						credential.Secret, err = secretbox.Open(envelope, r.Key, []byte("quartz:service-credential:"+previous))
						if err != nil {
							return err
						}
					}
					fresh = true
				}
			}
			if fresh {
				credential.ID = uuid.NewString()
			}
			if err = registry.SaveCredential(ctx, credential, fresh); err != nil {
				return err
			}
			value.CredentialID = credential.ID
		}
	}
	if err = registry.SaveService(ctx, value, create); err != nil {
		return err
	}
	if previous != "" && previous != value.CredentialID {
		if _, err = tx.ExecContext(ctx, "DELETE FROM service_credentials WHERE id=? AND NOT EXISTS(SELECT 1 FROM monitored_services WHERE credential_id=?)", previous, previous); err != nil {
			return err
		}
	}
	return tx.Commit()
}
