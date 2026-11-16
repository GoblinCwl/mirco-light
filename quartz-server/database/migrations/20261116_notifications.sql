CREATE TABLE IF NOT EXISTS notification_tokens (
 id tinyint NOT NULL PRIMARY KEY,
 envelope json NOT NULL,
 created_at varchar(40) NOT NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_bin;
CREATE TABLE IF NOT EXISTS notification_outbox (
 id varchar(36) NOT NULL PRIMARY KEY,
 kind varchar(32) NOT NULL,
 record_id varchar(191) NOT NULL,
 payload json NOT NULL,
 state varchar(16) NOT NULL DEFAULT 'pending',
 attempts int NOT NULL DEFAULT 0,
 available_at bigint NOT NULL,
 created_at varchar(40) NOT NULL,
 last_error varchar(255) NOT NULL DEFAULT '',
 KEY notification_due (state,available_at)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_bin;
ALTER TABLE notification_tokens
 MODIFY id tinyint NOT NULL COMMENT '固定为1的通知凭据记录',
 MODIFY envelope json NOT NULL COMMENT '使用凭据主密钥加密的本站API Token信封',
 MODIFY created_at varchar(40) NOT NULL COMMENT '最近生成时间UTC ISO 8601',
 COMMENT='本站API与AstrBot通知集成凭据，仅生成时返回明文';
ALTER TABLE notification_outbox
 MODIFY id varchar(36) NOT NULL COMMENT '投递事件UUID，重试保持不变',
 MODIFY kind varchar(32) NOT NULL COMMENT 'alerts、feedback或friends通知分类',
 MODIFY record_id varchar(191) NOT NULL COMMENT '关联业务记录编号',
 MODIFY payload json NOT NULL COMMENT '版本化通知摘要，不包含反馈邮箱',
 MODIFY state varchar(16) NOT NULL DEFAULT 'pending' COMMENT 'pending待投递、delivered插件已接收、failed需重试',
 MODIFY attempts int NOT NULL DEFAULT 0 COMMENT '自上次手动重试以来的投递尝试次数',
 MODIFY available_at bigint NOT NULL COMMENT '下次可投递的UTC毫秒时间戳',
 MODIFY created_at varchar(40) NOT NULL COMMENT '事件创建时间UTC ISO 8601',
 MODIFY last_error varchar(255) NOT NULL DEFAULT '' COMMENT '最近失败说明，不记录目标地址和认证信息',
 COMMENT='Go到AstrBot的持久通知投递队列';
