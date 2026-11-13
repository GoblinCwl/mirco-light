// Package friendavatar fetches and optimizes avatars while retaining animation.
package friendavatar

import (
	"context"
	"errors"
	"goblincwl/quartz-server/internal/publicfetch"
	"net/http"
	"regexp"
	"strings"
)

const Prefix = "/api/site/friends/avatar/"
const Directory = "/Vault/MicroLight/avatar"
const MaxSize = 8 << 20

var filename = regexp.MustCompile(`^[a-f0-9]{64}\.(png|jpg|gif|webp|avif)$`)

func Filename(name string) bool { return filename.MatchString(name) }
func Local(address string) bool {
	return strings.HasPrefix(address, Prefix) && Filename(strings.TrimPrefix(address, Prefix))
}
func MIME(data []byte) (string, string, error) {
	mime := http.DetectContentType(data)
	ext := map[string]string{"image/png": "png", "image/jpeg": "jpg", "image/gif": "gif", "image/webp": "webp"}[mime]
	if len(data) >= 16 && string(data[4:8]) == "ftyp" && (string(data[8:12]) == "avif" || string(data[8:12]) == "avis") {
		mime = "image/avif"
		ext = "avif"
	}
	if ext == "" {
		return "", "", errors.New("头像须为 PNG、JPEG、GIF、WebP 或 AVIF 图片")
	}
	return mime, ext, nil
}
func Fetch(ctx context.Context, address string, client *http.Client) ([]byte, string, string, error) {
	const accept = "image/avif,image/webp,image/apng,image/*;q=0.8"
	response, err := publicfetch.FetchResponse(ctx, address, client, MaxSize, accept)
	if err != nil {
		return nil, "", "", err
	}
	if cookies := edgeOneCookies(response.Data); len(cookies) > 0 {
		response, err = publicfetch.FetchResponseWithCookies(ctx, response.URL.String(), client, MaxSize, accept, cookies)
		if err != nil {
			return nil, "", "", err
		}
	}
	data := response.Data
	mime, ext, err := MIME(data)
	if err != nil && strings.HasPrefix(http.DetectContentType(data), "text/html") {
		if len(edgeOneCookies(data)) > 0 {
			err = errors.New("头像站点返回访问验证页，未能取得图片，请稍后重试")
		} else {
			err = errors.New("头像地址返回了网页而非图片，请检查地址或站点访问限制")
		}
	}
	return data, mime, ext, err
}
