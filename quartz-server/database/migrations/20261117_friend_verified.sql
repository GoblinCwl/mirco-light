ALTER TABLE friends ADD COLUMN verified tinyint unsigned NOT NULL DEFAULT 0 COMMENT '回链验证标记，自动审核通过默认验证，人工审核默认未验，管理员可切换';
UPDATE friends SET verified=1 WHERE status='展示中' AND review_result='已检测到指向本站的友链，自动审核通过';
