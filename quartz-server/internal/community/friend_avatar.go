package community

import (
	"context"
	"errors"
	"strings"
	"time"

	"goblincwl/quartz-server/internal/friendavatar"
)

// RefreshAvatar only changes the avatar; moderation, RSS and homepage checks are untouched.
func (s Store) RefreshAvatar(ctx context.Context, id string) (bool, error) {
	friend, err := s.friendByID(ctx, id)
	if err != nil {
		return false, err
	}
	source := friend.AvatarSource
	if source == "" && !friendavatar.Local(friend.Avatar) && !strings.HasPrefix(friend.Avatar, "/static/") {
		source = friend.Avatar
	}
	if source == "" {
		return false, errors.New("请先在编辑友链中填写原始头像地址")
	}
	if s.StoreAvatar == nil {
		return false, errors.New("头像存储尚未配置")
	}
	own, cancel := context.WithTimeout(ctx, 60*time.Second)
	defer cancel()
	// StoreAvatar compresses using current settings, then compares the SHA-256
	// content address with existing storage, avoiding duplicate uploads.
	address, err := s.StoreAvatar(own, source)
	if err != nil {
		return false, err
	}
	if address == friend.Avatar {
		return false, nil
	}
	result, err := s.DB.ExecContext(ctx, "UPDATE friends SET avatar=? WHERE id=? AND avatar=? AND avatar_source=?", address, id, friend.Avatar, friend.AvatarSource)
	if err != nil {
		return false, err
	}
	count, err := result.RowsAffected()
	if err != nil {
		return false, err
	}
	if count == 0 {
		return false, errors.New("友链已被修改，请刷新列表后重试")
	}
	return true, nil
}
