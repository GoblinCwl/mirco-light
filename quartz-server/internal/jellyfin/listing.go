package jellyfin

import (
	"context"
	"database/sql"
	"encoding/json"
	"errors"
	"goblincwl/quartz-server/internal/openlist"
	"path"
	"strings"
)

type shareSource struct {
	ID, Base string
	Files    []string
	Access   Access
}

func (s *Service) mediaShare(ctx context.Context, body map[string]any) (shareSource, error) {
	out := shareSource{}
	virtual, err := NormalPath(text(body["path"]))
	if err != nil {
		return out, err
	}
	parts := strings.Split(virtual, "/")
	if len(parts) < 3 || parts[1] != "@s" || parts[2] == "" {
		return out, errors.New("媒体解析仅适用于分享")
	}
	out.ID = parts[2]
	out.Access = Access{Path: virtual, Password: text(body["password"])}
	var remark, files string
	err = s.Backend.OpenList.DB.QueryRowContext(ctx, "SELECT s.remark,s.files_raw,u.base_path FROM x_sharing_dbs s JOIN x_users u ON u.id=s.creator_id WHERE s.id=?", out.ID).Scan(&remark, &files, &out.Base)
	if err == sql.ErrNoRows {
		return out, errors.New("此分享未启用 Jellyfin 解析")
	} else if err != nil {
		return out, err
	}
	meta, err := openlist.ParseMetadata(remark, false)
	if err != nil || meta.Jellyfin == nil || !*meta.Jellyfin {
		return out, errors.New("此分享未启用 Jellyfin 解析")
	}
	if err = json.Unmarshal([]byte(files), &out.Files); err != nil {
		return out, err
	}
	return out, nil
}
func (s *Service) listFiles(ctx context.Context, access Access) ([]map[string]any, error) {
	value, err := s.Backend.Shares.API(ctx, "fs/list", map[string]any{"path": access.Path, "password": access.Password, "page": 1, "per_page": 0}, access.Token)
	if err != nil {
		return nil, err
	}
	files := []map[string]any{}
	for _, raw := range list(value["content"]) {
		if entry := object(raw); entry != nil {
			files = append(files, entry)
		}
	}
	return files, nil
}
func (s *Service) MediaListing(ctx context.Context, body map[string]any) (map[string]any, error) {
	share, err := s.mediaShare(ctx, body)
	if err != nil {
		return nil, err
	}
	physical, meta, err := s.Backend.ResolveAccess(ctx, share.Access, true)
	if err != nil {
		return nil, err
	}
	children := []map[string]any{}
	if meta["is_dir"] == true {
		children, err = s.listFiles(ctx, share.Access)
		if err != nil {
			return nil, err
		}
	}
	relative := strings.Split(share.Access.Path, "/")[3:]
	ancestors := []Ancestor{}
	if physical != "" {
		start := 0
		if len(share.Files) > 1 {
			start = 1
		}
		for depth := start; depth < len(relative); depth++ {
			parent := physical
			for remaining := depth; remaining < len(relative); remaining++ {
				parent = path.Dir(parent)
			}
			ancestors = append(ancestors, Ancestor{Path: "/" + strings.Join(relative[:depth], "/"), Physical: parent})
		}
	}
	input := Listing{Physical: physical, Meta: meta, Children: children, Access: share.Access, Ancestors: ancestors, ChildPath: func(ctx context.Context, entry map[string]any) (string, error) {
		if physical != "" {
			return NormalPath(path.Join(physical, text(entry["name"])))
		}
		if len(share.Files) > 1 && share.Access.Path == "/@s/"+share.ID {
			for _, source := range share.Files {
				if path.Base(strings.TrimRight(source, "/")) == text(entry["name"]) {
					return s.Backend.PhysicalPath(ctx, path.Join(share.Base, source))
				}
			}
		}
		return "", nil
	}}
	if meta["is_dir"] != true && len(relative) > 0 {
		input.Siblings = func(ctx context.Context) ([]map[string]any, error) {
			access := share.Access
			access.Path = path.Dir(access.Path)
			return s.listFiles(ctx, access)
		}
	}
	return s.Catalog.Listing(ctx, input)
}
func (s *Service) Aliases(ctx context.Context, body map[string]any, token string) (map[string]any, error) {
	virtual, err := NormalPath(text(body["path"]))
	if err != nil {
		return nil, err
	}
	parts := strings.Split(virtual, "/")
	if len(parts) != 3 || parts[1] != "@s" || parts[2] == "" {
		return nil, errors.New("无效的分享路径")
	}
	if _, err = s.Backend.Authorize(ctx, Access{Path: virtual, Password: text(body["password"]), Token: token}, true); err != nil {
		return nil, err
	}
	var remark string
	err = s.Backend.OpenList.DB.QueryRowContext(ctx, "SELECT remark FROM x_sharing_dbs WHERE id=?", parts[2]).Scan(&remark)
	if err != nil {
		return nil, err
	}
	meta, err := openlist.ParseMetadata(remark, false)
	if err != nil {
		return nil, err
	}
	aliases := meta.Aliases
	if aliases == nil {
		aliases = map[string]string{}
	}
	return map[string]any{"aliases": aliases}, nil
}
