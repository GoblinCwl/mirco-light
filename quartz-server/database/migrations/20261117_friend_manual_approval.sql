ALTER TABLE friend_jobs ADD COLUMN manual_approval tinyint unsigned NOT NULL DEFAULT 0 COMMENT '人工请求先检查首页头像RSS，通过后直接审核，不执行回链自动审批';
