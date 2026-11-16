ALTER TABLE friends ADD COLUMN review_ready boolean NOT NULL DEFAULT 0 COMMENT '首页、RSS及头像预检查全部通过，才允许审核通过';
