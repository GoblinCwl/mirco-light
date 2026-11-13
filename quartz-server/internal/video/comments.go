package video

import (
	"context"
	"fmt"
	"net/url"
	"regexp"
	"strconv"
	"strings"
	"time"
)

var replyIDPattern = regexp.MustCompile(`^[1-9][0-9]{0,24}$`)

func commentImage(raw string) string {
	if strings.HasPrefix(raw, "//") {
		raw = "https:" + raw
	}
	u, err := url.Parse(raw)
	if err != nil || u.User != nil || (u.Scheme != "https" && u.Scheme != "http") || !strings.HasSuffix(strings.ToLower(u.Hostname()), ".hdslb.com") {
		return ""
	}
	u.Scheme = "https"
	return u.String()
}
func replyID(row map[string]any, key string) string {
	if id := text(row[key+"_str"]); replyIDPattern.MatchString(id) {
		return id
	}
	n, _ := numeric(row[key])
	if n > 0 {
		return strconv.FormatInt(int64(n), 10)
	}
	return ""
}
func publicReply(raw any, owner string) map[string]any {
	row := object(raw)
	state, _ := numeric(row["state"])
	if row["invisible"] == true || state != 0 || replyID(row, "rpid") == "" {
		return nil
	}
	member := object(row["member"])
	content := object(row["content"])
	mid := text(member["mid"])
	emotes := map[string]string{}
	for label, raw := range object(content["emote"]) {
		if image := commentImage(text(object(raw)["url"])); image != "" {
			emotes[label] = image
		}
	}
	replies := []map[string]any{}
	for _, child := range list(row["replies"]) {
		if reply := publicReply(child, owner); reply != nil {
			replies = append(replies, reply)
		}
	}
	return map[string]any{"id": replyID(row, "rpid"), "mid": mid, "name": text(member["uname"]), "avatar": commentImage(text(member["avatar"])), "message": text(content["message"]), "createdAt": row["ctime"], "likes": row["like"], "replyCount": row["rcount"], "owner": mid == owner, "emotes": emotes, "replies": replies}
}
func (s *Service) Comments(ctx context.Context, bvid, root string, page int, cursors ...string) (map[string]any, error) {
	cursor := "0"
	if len(cursors) > 0 && cursors[0] != "" {
		cursor = cursors[0]
	}
	if !regexp.MustCompile(`^[0-9]{1,16}$`).MatchString(cursor) || root == "" && page > 1 && cursor == "0" {
		return nil, &Problem{"评论游标无效，请从第一页开始", 400}
	}
	if !bvidPattern.MatchString(bvid) || page < 1 || page > 1000 || root != "" && !replyIDPattern.MatchString(root) {
		return nil, &Problem{"评论参数无效", 400}
	}
	if _, err := s.Detail(ctx, bvid); err != nil {
		return nil, err
	}
	key := fmt.Sprintf("%s:%s:%d:%s", bvid, root, page, cursor)
	return s.CommentsCache.Get(ctx, key, 2*time.Minute, false, func(ctx context.Context) (map[string]any, error) {
		// Public comments are fetched anonymously: never expose owner-only moderation data.
		view, err := s.CommentsCache.Get(ctx, "aid:"+bvid, time.Hour, false, func(ctx context.Context) (map[string]any, error) {
			return s.Client.data(ctx, "/x/web-interface/view?bvid="+url.QueryEscape(bvid), "")
		})
		if err != nil {
			return nil, &Problem{"暂时无法读取 Bilibili 评论，请稍后重试", 502}
		}
		aid, _ := numeric(view["aid"])
		if aid <= 0 || text(view["bvid"]) != bvid {
			return nil, &Problem{"视频评论暂不可用", 502}
		}
		ownerN, _ := numeric(object(view["owner"])["mid"])
		owner := strconv.FormatInt(int64(ownerN), 10)
		endpoint := fmt.Sprintf("/x/v2/reply/main?type=1&oid=%.0f&mode=3&next=%s&ps=20", aid, cursor)
		if root != "" {
			endpoint = fmt.Sprintf("/x/v2/reply/reply?type=1&oid=%.0f&root=%s&pn=%d&ps=10", aid, root, page)
		}
		data, err := s.Client.data(ctx, endpoint, "")
		if err != nil {
			return nil, &Problem{"Bilibili 评论暂不可用，评论区可能已关闭或请求受限", 502}
		}
		replies := []map[string]any{}
		seen := map[string]bool{}
		add := func(raw any, pinned bool) {
			if reply := publicReply(raw, owner); reply != nil {
				id := text(reply["id"])
				if !seen[id] {
					seen[id] = true
					reply["pinned"] = pinned
					replies = append(replies, reply)
				}
			}
		}
		if root == "" && page == 1 {
			add(object(data["upper"])["top"], true)
			add(object(data["top"])["upper"], true)
			for _, raw := range list(data["top_replies"]) {
				add(raw, true)
			}
		}
		for _, raw := range list(data["replies"]) {
			add(raw, false)
		}
		paging := object(data["page"])
		total, _ := numeric(paging["count"])
		size := 20
		if root != "" {
			size = 10
		}
		if root == "" {
			c := object(data["cursor"])
			total, _ := numeric(c["all_count"])
			next, _ := numeric(c["next"])
			hasMore := c["is_end"] == false && len(replies) > 0 && next > 0 && strconv.FormatInt(int64(next), 10) != cursor
			pages := page
			if hasMore {
				pages++
			}
			return map[string]any{"items": replies, "page": page, "pages": pages, "total": total, "hasMore": hasMore, "nextCursor": strconv.FormatInt(int64(next), 10)}, nil
		}
		return map[string]any{"items": replies, "page": page, "pages": max(1, (int(total)+size-1)/size), "total": total}, nil
	})
}
