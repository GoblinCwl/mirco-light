CREATE TABLE IF NOT EXISTS friend_articles (
  friend_id varchar(80) NOT NULL,
  url_hash binary(32) NOT NULL,
  title varchar(500) NOT NULL,
  url varchar(1500) NOT NULL,
  published_at char(24) NOT NULL,
  PRIMARY KEY (friend_id,url_hash),
  KEY friend_articles_recent (published_at DESC,friend_id,url_hash),
  CONSTRAINT friend_articles_friend FOREIGN KEY (friend_id) REFERENCES friends(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_bin;
