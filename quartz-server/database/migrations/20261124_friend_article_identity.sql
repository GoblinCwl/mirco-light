ALTER TABLE friend_articles
  ADD COLUMN cover varchar(1500) NOT NULL DEFAULT '',
  ADD COLUMN guid varchar(1500) NOT NULL DEFAULT '',
  MODIFY url_hash binary(32) NOT NULL COMMENT 'SHA-256 of feed entry ID, or article URL when absent';
