CREATE TABLE IF NOT EXISTS friend_avatar_cache (
 cache_key char(64) CHARACTER SET ascii COLLATE ascii_bin NOT NULL COMMENT '源头像 SHA-256、压缩版本、配置与存储地址的组合哈希',
 filename varchar(70) CHARACTER SET ascii COLLATE ascii_bin NOT NULL COMMENT '已存储的压缩结果文件名',
 PRIMARY KEY(cache_key)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_bin COMMENT='头像源文件哈希与压缩结果的可重建缓存';
