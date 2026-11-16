ALTER TABLE friends ADD COLUMN inspection_failures int NOT NULL DEFAULT 0 COMMENT '已收录友链巡检累计失败次数，3次置灰、7次移除';
UPDATE friends SET inspection_failures=processing_failures WHERE status='展示中';
