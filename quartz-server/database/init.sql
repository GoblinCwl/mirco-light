-- 本站 MySQL 结构快照；只含结构，不含业务数据。
-- 当前结构初始化文件：quartz-server/database/init.sql；重新生成：python3 quartz-server/tools/schema_docs.py
SET NAMES utf8mb4;

CREATE TABLE `adapter_snapshots` (
  `name` varchar(191) CHARACTER SET utf8mb4 COLLATE utf8mb4_bin NOT NULL COMMENT '公开适配结果的缓存名称',
  `value` json NOT NULL COMMENT '快照 JSON',
  `updated_at` varchar(40) CHARACTER SET utf8mb4 COLLATE utf8mb4_bin NOT NULL COMMENT '快照成功更新时间',
  PRIMARY KEY (`name`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_bin COMMENT='首页等公开适配数据的持久化快照及更新时间';

CREATE TABLE `alerts` (
  `id` bigint unsigned NOT NULL AUTO_INCREMENT COMMENT '告警记录标识',
  `fingerprint` binary(32) NOT NULL COMMENT '同类异常摘要，不含凭据或请求参数',
  `kind` varchar(16) CHARACTER SET utf8mb4 COLLATE utf8mb4_bin NOT NULL COMMENT 'service 服务、api 外部接口、task 后台任务、runtime 后端运行异常',
  `level` varchar(10) CHARACTER SET utf8mb4 COLLATE utf8mb4_bin NOT NULL COMMENT 'warning 警告或 error 错误',
  `source` varchar(100) CHARACTER SET utf8mb4 COLLATE utf8mb4_bin NOT NULL COMMENT '异常来源服务或任务',
  `title` varchar(200) CHARACTER SET utf8mb4 COLLATE utf8mb4_bin NOT NULL COMMENT '告警标题',
  `message` text CHARACTER SET utf8mb4 COLLATE utf8mb4_bin NOT NULL COMMENT '安全异常摘要，不保存响应正文或请求凭据',
  `target` varchar(255) CHARACTER SET utf8mb4 COLLATE utf8mb4_bin NOT NULL COMMENT '目标站点，不含查询参数和资源令牌',
  `status_code` int NOT NULL DEFAULT '0' COMMENT 'HTTP 或业务错误码，0 表示未提供',
  `first_seen` varchar(40) CHARACTER SET utf8mb4 COLLATE utf8mb4_bin NOT NULL COMMENT '本组异常首次发生时间',
  `last_seen` varchar(40) CHARACTER SET utf8mb4 COLLATE utf8mb4_bin NOT NULL COMMENT '本组异常最近发生时间',
  `occurrences` bigint unsigned NOT NULL DEFAULT '1' COMMENT '合并记录的累计次数',
  PRIMARY KEY (`id`),
  KEY `alerts_fingerprint` (`fingerprint`,`last_seen`),
  KEY `alerts_recent` (`last_seen` DESC,`id` DESC),
  CONSTRAINT `alerts_kind` CHECK ((`kind` in (_utf8mb4'service',_utf8mb4'api',_utf8mb4'task',_utf8mb4'runtime'))),
  CONSTRAINT `alerts_level` CHECK ((`level` in (_utf8mb4'warning',_utf8mb4'error')))
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_bin COMMENT='本站告警记录；连续同类异常合并，事件写入时保留最近1000条';

CREATE TABLE `auth_attempts` (
  `identity` char(64) CHARACTER SET utf8mb4 COLLATE utf8mb4_bin NOT NULL COMMENT '认证限流身份摘要',
  `attempts` bigint NOT NULL COMMENT '失败次数',
  `expires_at` bigint NOT NULL COMMENT '限流记录过期时间，Unix 毫秒',
  PRIMARY KEY (`identity`),
  KEY `auth_attempts_expiry` (`expires_at`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_bin COMMENT='管理员认证失败次数及限流过期状态';

CREATE TABLE `auth_sessions` (
  `token_hash` char(64) CHARACTER SET utf8mb4 COLLATE utf8mb4_bin NOT NULL COMMENT '会话令牌的 SHA-256 摘要，不保存原始令牌',
  `version` char(64) CHARACTER SET utf8mb4 COLLATE utf8mb4_bin NOT NULL COMMENT '绑定密码及验证器版本的摘要，版本变化撤销旧会话',
  `expires_at` bigint NOT NULL COMMENT '会话过期时间，Unix 毫秒',
  PRIMARY KEY (`token_hash`),
  KEY `auth_sessions_expiry` (`expires_at`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_bin COMMENT='管理员登录会话令牌摘要、认证版本及过期时间';

CREATE TABLE `auth_state` (
  `key` varchar(40) CHARACTER SET utf8mb4 COLLATE utf8mb4_bin NOT NULL COMMENT '认证状态名称',
  `value` json NOT NULL COMMENT '密码校验参数、加密 TOTP、恢复码校验或绑定状态等 JSON；不是明文密码',
  PRIMARY KEY (`key`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_bin COMMENT='管理员密码校验参数、TOTP绑定、恢复码及认证版本状态';

CREATE TABLE `content` (
  `id` varchar(191) CHARACTER SET utf8mb4 COLLATE utf8mb4_bin NOT NULL COMMENT '本站内容稳定标识，也是标签调整关联标识',
  `type` varchar(16) CHARACTER SET utf8mb4 COLLATE utf8mb4_bin NOT NULL COMMENT 'article / share / repo / video',
  `source_id` varchar(700) CHARACTER SET utf8mb4 COLLATE utf8mb4_bin NOT NULL COMMENT '内容来源系统中的标识，结合 type 唯一',
  `slug` varchar(768) CHARACTER SET utf8mb4 COLLATE utf8mb4_bin NOT NULL COMMENT '本站内容路径标识，唯一',
  `href` text CHARACTER SET utf8mb4 COLLATE utf8mb4_bin NOT NULL COMMENT '本站跳转地址',
  `title` text CHARACTER SET utf8mb4 COLLATE utf8mb4_bin NOT NULL COMMENT '显示标题',
  `content` longtext CHARACTER SET utf8mb4 COLLATE utf8mb4_bin NOT NULL COMMENT '可公开索引的正文；加密内容不保留未授权正文',
  `description` longtext CHARACTER SET utf8mb4 COLLATE utf8mb4_bin NOT NULL COMMENT '内容摘要；加密内容不保留未授权摘要',
  `tags` json NOT NULL COMMENT '项目最终标签列表 JSON，由来源同步或管理员直接维护',
  `links` json NOT NULL COMMENT '站内关联链接列表 JSON',
  `published_at` varchar(40) CHARACTER SET utf8mb4 COLLATE utf8mb4_bin DEFAULT NULL COMMENT '创建、发布或分享时间',
  `updated_at` varchar(40) CHARACTER SET utf8mb4 COLLATE utf8mb4_bin DEFAULT NULL COMMENT '内容更新时间',
  `encrypted` tinyint unsigned NOT NULL COMMENT '加密标记，0/1',
  `revision` text CHARACTER SET utf8mb4 COLLATE utf8mb4_bin NOT NULL COMMENT '内容语义版本摘要，用于识别索引变化',
  `event_revision` text CHARACTER SET utf8mb4 COLLATE utf8mb4_bin NOT NULL COMMENT '变化事件版本，用于避免缓存刷新产生重复纪事',
  `search_text` longtext CHARACTER SET utf8mb4 COLLATE utf8mb4_bin NOT NULL COMMENT '供本站搜索使用的规范化文本',
  `extra` json NOT NULL COMMENT '类型特有附加信息 JSON',
  PRIMARY KEY (`id`),
  UNIQUE KEY `slug` (`slug`),
  UNIQUE KEY `content_source` (`type`,`source_id`),
  KEY `content_dates` (`updated_at` DESC,`id`),
  CONSTRAINT `content_encrypted` CHECK ((`encrypted` in (0,1))),
  CONSTRAINT `content_type` CHECK ((`type` in (_utf8mb4'article',_utf8mb4'share',_utf8mb4'repo',_utf8mb4'video')))
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_bin COMMENT='文章、分享首页、仓库和视频的服务器统一内容索引';

CREATE TABLE `content_meta` (
  `key` varchar(191) CHARACTER SET utf8mb4 COLLATE utf8mb4_bin NOT NULL COMMENT '元数据名称，如 feed_hash、feed_updated',
  `value` longtext CHARACTER SET utf8mb4 COLLATE utf8mb4_bin NOT NULL COMMENT '对应索引/订阅元数据值',
  PRIMARY KEY (`key`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_bin COMMENT='统一内容索引与RSS订阅的版本及更新时间元数据';

CREATE TABLE `content_sources` (
  `type` varchar(16) CHARACTER SET utf8mb4 COLLATE utf8mb4_bin NOT NULL COMMENT '来源类型',
  `checked_at` varchar(40) CHARACTER SET utf8mb4 COLLATE utf8mb4_bin NOT NULL COMMENT '来源首次初始化或实际更新索引的时间；无变化不改写',
  PRIMARY KEY (`type`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_bin COMMENT='各类内容来源最近一次成功索引检查时间';

CREATE TABLE `feedback` (
  `id` varchar(80) CHARACTER SET utf8mb4 COLLATE utf8mb4_bin NOT NULL COMMENT '反馈唯一标识',
  `email` text CHARACTER SET utf8mb4 COLLATE utf8mb4_bin NOT NULL COMMENT '联系邮箱',
  `browser` text CHARACTER SET utf8mb4 COLLATE utf8mb4_bin NOT NULL COMMENT '浏览器识别描述',
  `user_agent` text CHARACTER SET utf8mb4 COLLATE utf8mb4_bin NOT NULL COMMENT '原始 User-Agent',
  `description` text CHARACTER SET utf8mb4 COLLATE utf8mb4_bin NOT NULL COMMENT '问题描述',
  `status` varchar(16) CHARACTER SET utf8mb4 COLLATE utf8mb4_bin NOT NULL DEFAULT '待处理' COMMENT '待处理 / 已解决',
  `created_at` varchar(40) CHARACTER SET utf8mb4 COLLATE utf8mb4_bin NOT NULL COMMENT '提交时间',
  PRIMARY KEY (`id`),
  KEY `feedback_created` (`created_at` DESC,`id`),
  CONSTRAINT `feedback_status` CHECK ((`status` in (_utf8mb4'待处理',_utf8mb4'已解决')))
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_bin COMMENT='访客问题反馈、联系邮箱、浏览器信息及处理状态';

CREATE TABLE `friends` (
  `id` varchar(80) CHARACTER SET utf8mb4 COLLATE utf8mb4_bin NOT NULL COMMENT '友链唯一标识',
  `number` int unsigned NOT NULL AUTO_INCREMENT COMMENT '友链固定编号，用于卡片编号，不随 RSS 排序变化',
  `name` text CHARACTER SET utf8mb4 COLLATE utf8mb4_bin NOT NULL COMMENT '网站名称',
  `url` varchar(1500) CHARACTER SET utf8mb4 COLLATE utf8mb4_bin NOT NULL COMMENT '网站 HTTPS 地址',
  `backlink_url` varchar(1500) CHARACTER SET utf8mb4 COLLATE utf8mb4_bin NOT NULL DEFAULT '' COMMENT '包含本站友链的页面 HTTPS 地址',
  `rss_url` varchar(1500) CHARACTER SET utf8mb4 COLLATE utf8mb4_bin NOT NULL DEFAULT '' COMMENT 'RSS 订阅地址，选填 HTTP 或 HTTPS 链接',
  `avatar` text CHARACTER SET utf8mb4 COLLATE utf8mb4_bin NOT NULL COMMENT '网站头像 HTTPS 地址',
  `avatar_source` varchar(1500) CHARACTER SET utf8mb4 COLLATE utf8mb4_bin NOT NULL DEFAULT '' COMMENT '原始头像 HTTP 或 HTTPS 地址，空值不参与每日刷新',
  `latest_update` varchar(32) CHARACTER SET utf8mb4 COLLATE utf8mb4_bin NOT NULL DEFAULT '' COMMENT 'RSS 最新文章时间，UTC ISO 8601，空值表示未知',
  `description` text CHARACTER SET utf8mb4 COLLATE utf8mb4_bin NOT NULL COMMENT '网站简介',
  `example` tinyint unsigned NOT NULL COMMENT '示例数据标记，保留旧数据契约',
  `status` varchar(16) CHARACTER SET utf8mb4 COLLATE utf8mb4_bin NOT NULL DEFAULT '展示中' COMMENT '展示中 / 待审核 / 已失效',
  `review_result` varchar(255) CHARACTER SET utf8mb4 COLLATE utf8mb4_bin NOT NULL DEFAULT '' COMMENT '最近一次友链审核结果说明',
  `review_checked_at` varchar(32) CHARACTER SET utf8mb4 COLLATE utf8mb4_bin NOT NULL DEFAULT '' COMMENT '最近一次友链审核时间，UTC ISO 8601',
  `health_failures` tinyint unsigned NOT NULL DEFAULT '0' COMMENT '首页连续失败天数，0 为正常，7 次后停止重试',
  `health_checked_on` varchar(10) CHARACTER SET utf8mb4 COLLATE utf8mb4_bin NOT NULL DEFAULT '' COMMENT '最近首页检查日期，北京时间 YYYY-MM-DD，同日不重复计数',
  `health_error` varchar(255) CHARACTER SET utf8mb4 COLLATE utf8mb4_bin NOT NULL DEFAULT '' COMMENT '最近首页检查失败原因',
  `url_hash` binary(32) GENERATED ALWAYS AS (unhex(sha2(`url`,256))) STORED COMMENT 'URL 的 SHA-256 二进制生成列，用于唯一约束',
  PRIMARY KEY (`id`),
  UNIQUE KEY `friends_number` (`number`),
  UNIQUE KEY `friends_url_hash` (`url_hash`),
  KEY `friends_updated` (`latest_update`,`number`),
  CONSTRAINT `friends_example` CHECK ((`example` in (0,1))),
  CONSTRAINT `friends_status` CHECK ((`status` in (_utf8mb4'展示中',_utf8mb4'待审核',_utf8mb4'已失效')))
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_bin COMMENT='友链资料、固定编号及审核状态';

CREATE TABLE `geoip_datasets` (
  `ip_version` tinyint unsigned NOT NULL COMMENT 'IP åè®®ç‰ˆæœ¬ï¼Œ4 æˆ– 6',
  `compression` varchar(8) COLLATE utf8mb4_bin NOT NULL COMMENT 'æ•°æ®åŽ‹ç¼©æ ¼å¼ï¼Œç›®å‰ä¸º gzip',
  `data` longblob NOT NULL COMMENT 'åŽ‹ç¼©åŽçš„å®Œæ•´ ip2region XDB å‚è€ƒæ•°æ®åº“',
  `checksum` char(64) COLLATE utf8mb4_bin NOT NULL COMMENT 'è§£åŽ‹åŽ XDB å†…å®¹ SHA-256 æ ¡éªŒå€¼',
  `original_size` bigint unsigned NOT NULL COMMENT 'è§£åŽ‹åŽå­—èŠ‚æ•°ï¼Œç”¨äºŽæ ¡éªŒå’Œé™åˆ¶å†…å­˜åˆ†é…',
  `source` json NOT NULL COMMENT 'æ•°æ®æ¥æºä»“åº“ã€ç‰ˆæœ¬åŠåˆå§‹åŒ–ä¿¡æ¯',
  `updated_at` varchar(40) COLLATE utf8mb4_bin NOT NULL COMMENT 'æ•°æ®å¯¼å…¥å®Œæˆæ—¶é—´ï¼ŒISO 8601 UTC',
  PRIMARY KEY (`ip_version`),
  CONSTRAINT `geoip_ip_version` CHECK ((`ip_version` in (4,6)))
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_bin COMMENT='IPv4 å’Œ IPv6 åœ°ç†å½’å±žåœ°å‚è€ƒæ•°æ®ï¼Œå¯åŠ¨åŠ è½½å†…å­˜ç”¨äºŽæœ¬åœ°æŸ¥è¯¢';

CREATE TABLE `journal` (
  `id` bigint NOT NULL AUTO_INCREMENT COMMENT '自增纪事标识',
  `kind` varchar(16) CHARACTER SET utf8mb4 COLLATE utf8mb4_bin NOT NULL COMMENT 'content 内容 / site 站点 / service 服务',
  `completed_at` varchar(40) CHARACTER SET utf8mb4 COLLATE utf8mb4_bin NOT NULL COMMENT '事件完成时间',
  `payload` json NOT NULL COMMENT '对应事件展示信息 JSON',
  `source_key` varchar(191) CHARACTER SET utf8mb4 COLLATE utf8mb4_bin DEFAULT NULL COMMENT '来源事件去重键，允许 NULL，非空值唯一',
  PRIMARY KEY (`id`),
  UNIQUE KEY `journal_source_key` (`source_key`),
  KEY `journal_completed` (`completed_at` DESC,`id` DESC),
  CONSTRAINT `journal_kind` CHECK ((`kind` in (_utf8mb4'content',_utf8mb4'site',_utf8mb4'service')))
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_bin COMMENT='运行纪事，保留最近十条内容更新、站点更新及服务恢复事件';

CREATE TABLE `provider_credentials` (
  `provider` varchar(40) CHARACTER SET utf8mb4 COLLATE utf8mb4_bin NOT NULL COMMENT '平台名称，如 GitHub、Bilibili',
  `envelope` json NOT NULL COMMENT '平台凭据的加密信封 JSON',
  `status` varchar(40) CHARACTER SET utf8mb4 COLLATE utf8mb4_bin NOT NULL DEFAULT 'unchecked' COMMENT '凭据检查状态',
  `checked_at` varchar(40) CHARACTER SET utf8mb4 COLLATE utf8mb4_bin DEFAULT NULL COMMENT '最近检查时间',
  PRIMARY KEY (`provider`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_bin COMMENT='平台访问凭据的加密信封、检查状态及最近检查时间';

CREATE TABLE `repo_avatar` (
  `id` bigint NOT NULL COMMENT '本地头像缓存标识',
  `source` text CHARACTER SET utf8mb4 COLLATE utf8mb4_bin COMMENT '上游头像地址',
  `etag` text CHARACTER SET utf8mb4 COLLATE utf8mb4_bin COMMENT '上游资源 ETag',
  `mime` varchar(100) CHARACTER SET utf8mb4 COLLATE utf8mb4_bin DEFAULT NULL COMMENT '头像 MIME 类型',
  `hash` char(64) CHARACTER SET utf8mb4 COLLATE utf8mb4_bin DEFAULT NULL COMMENT '头像内容 SHA-256 摘要',
  `data` longblob COMMENT '头像二进制内容',
  PRIMARY KEY (`id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_bin COMMENT='仓库平台用户头像的本地二进制缓存及来源版本信息';

CREATE TABLE `repo_snapshots` (
  `key` varchar(191) CHARACTER SET utf8mb4 COLLATE utf8mb4_bin NOT NULL COMMENT '仓库平台快照名称',
  `value` json NOT NULL COMMENT '用户、活动等快照 JSON，按键解释',
  PRIMARY KEY (`key`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_bin COMMENT='GitHub用户资料、活动及仓库相关公开快照缓存';

CREATE TABLE `resource_locks` (
  `name` varchar(80) CHARACTER SET utf8mb4 COLLATE utf8mb4_bin NOT NULL COMMENT '用于 SELECT FOR UPDATE 的固定业务资源锁名称',
  PRIMARY KEY (`name`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_bin COMMENT='业务资源事务锁标记，用于串行化排序与索引等并发写入';

CREATE TABLE `runtime_state` (
  `name` varchar(100) CHARACTER SET utf8mb4 COLLATE utf8mb4_bin NOT NULL COMMENT '私有运行状态名称',
  `value` longtext CHARACTER SET utf8mb4 COLLATE utf8mb4_bin NOT NULL COMMENT '构建基线、已消费容器事件或评论权限检查点 JSON',
  `updated_at` varchar(40) CHARACTER SET utf8mb4 COLLATE utf8mb4_bin NOT NULL COMMENT '运行状态更新时间',
  PRIMARY KEY (`name`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_bin COMMENT='私有运行检查点，包括构建基线、容器事件及评论权限同步状态';

CREATE TABLE `service_credentials` (
  `id` varchar(64) CHARACTER SET utf8mb4 COLLATE utf8mb4_bin NOT NULL COMMENT '认证配置标识',
  `name` varchar(100) CHARACTER SET utf8mb4 COLLATE utf8mb4_bin NOT NULL COMMENT '认证配置名称',
  `auth_type` varchar(16) CHARACTER SET utf8mb4 COLLATE utf8mb4_bin NOT NULL COMMENT '认证方式：basic、bearer 或 header',
  `username` varchar(500) CHARACTER SET utf8mb4 COLLATE utf8mb4_bin NOT NULL DEFAULT '' COMMENT 'Basic 认证账号',
  `header_name` varchar(100) CHARACTER SET utf8mb4 COLLATE utf8mb4_bin NOT NULL DEFAULT '' COMMENT '自定义认证请求头名称',
  `envelope` json NOT NULL COMMENT '密码或密钥的 AES-GCM 加密信封，接口不返回明文',
  PRIMARY KEY (`id`),
  CONSTRAINT `service_auth_type` CHECK ((`auth_type` in (_utf8mb4'basic',_utf8mb4'bearer',_utf8mb4'header')))
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_bin COMMENT='服务状态检测专用认证，与平台接入凭据独立';

CREATE TABLE `settings` (
  `key` varchar(191) CHARACTER SET utf8mb4 COLLATE utf8mb4_bin NOT NULL COMMENT '模块配置名称',
  `value` json NOT NULL COMMENT '配置值的 JSON 表示；涉及私密配置，不作为公开全集输出',
  PRIMARY KEY (`key`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_bin COMMENT='站点模块配置及内部服务接入设置，仅通过授权接口管理';

CREATE TABLE `share_identities` (
  `source_id` varchar(700) CHARACTER SET utf8mb4 COLLATE utf8mb4_bin NOT NULL COMMENT 'OpenList 分享来源标识',
  `uid` varchar(191) CHARACTER SET utf8mb4 COLLATE utf8mb4_bin NOT NULL COMMENT '本站分配的稳定分享标识，唯一',
  PRIMARY KEY (`source_id`),
  UNIQUE KEY `uid` (`uid`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_bin COMMENT='OpenList分享来源与本站稳定内容标识的映射';

CREATE TABLE `task_runs` (
  `id` bigint unsigned NOT NULL AUTO_INCREMENT COMMENT '执行记录编号',
  `task_key` varchar(80) CHARACTER SET utf8mb4 COLLATE utf8mb4_bin NOT NULL COMMENT '固定任务标识',
  `run_key` varchar(96) CHARACTER SET utf8mb4 COLLATE utf8mb4_bin DEFAULT NULL COMMENT '外部观察器执行去重标识，本地执行为空',
  `started_at` varchar(40) CHARACTER SET utf8mb4 COLLATE utf8mb4_bin NOT NULL COMMENT '开始时间，UTC ISO 8601',
  `finished_at` varchar(40) CHARACTER SET utf8mb4 COLLATE utf8mb4_bin NOT NULL DEFAULT '' COMMENT '结束时间，运行中为空',
  `status` varchar(16) CHARACTER SET utf8mb4 COLLATE utf8mb4_bin NOT NULL COMMENT 'running / success / failed / interrupted',
  `duration_ms` bigint unsigned NOT NULL DEFAULT '0' COMMENT '执行耗时，毫秒',
  `error` text CHARACTER SET utf8mb4 COLLATE utf8mb4_bin NOT NULL COMMENT '经过凭据过滤的错误，最多4000字',
  `logs` text CHARACTER SET utf8mb4 COLLATE utf8mb4_bin NOT NULL COMMENT '经过凭据过滤的执行日志，最多12000字',
  PRIMARY KEY (`id`),
  UNIQUE KEY `task_run_external` (`task_key`,`run_key`),
  KEY `task_run_history` (`task_key`,`id` DESC),
  CONSTRAINT `task_run_status` CHECK ((`status` in (_utf8mb4'running',_utf8mb4'success',_utf8mb4'failed',_utf8mb4'interrupted')))
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_bin COMMENT='后台任务最近十次真实执行记录';

CREATE TABLE `video_assets` (
  `name` varchar(191) CHARACTER SET utf8mb4 COLLATE utf8mb4_bin NOT NULL COMMENT '图片缓存名称',
  `source` text CHARACTER SET utf8mb4 COLLATE utf8mb4_bin COMMENT '上游图片地址',
  `etag` text CHARACTER SET utf8mb4 COLLATE utf8mb4_bin COMMENT '上游资源 ETag',
  `mime` varchar(100) CHARACTER SET utf8mb4 COLLATE utf8mb4_bin DEFAULT NULL COMMENT '图片 MIME 类型',
  `hash` char(64) CHARACTER SET utf8mb4 COLLATE utf8mb4_bin DEFAULT NULL COMMENT '图片内容 SHA-256 摘要',
  `data` longblob COMMENT '本地图片二进制内容',
  PRIMARY KEY (`name`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_bin COMMENT='Bilibili头像和封面等本地图片缓存及来源版本信息';

CREATE TABLE `video_meta` (
  `key` varchar(191) CHARACTER SET utf8mb4 COLLATE utf8mb4_bin NOT NULL COMMENT '视频元数据或缓存项名称',
  `value` longtext CHARACTER SET utf8mb4 COLLATE utf8mb4_bin NOT NULL COMMENT '系列、分集、详情、用户资料、动态或同步控制值，按键解释',
  PRIMARY KEY (`key`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_bin COMMENT='Bilibili系列、分集、详情、用户动态及同步控制元数据';

CREATE TABLE `videos` (
  `bvid` char(12) CHARACTER SET utf8mb4 COLLATE utf8mb4_bin NOT NULL COMMENT 'Bilibili BV 号，主键',
  `title` text CHARACTER SET utf8mb4 COLLATE utf8mb4_bin NOT NULL COMMENT '视频标题',
  `cover` text CHARACTER SET utf8mb4 COLLATE utf8mb4_bin NOT NULL COMMENT '封面来源地址',
  `duration` bigint NOT NULL DEFAULT '0' COMMENT '视频时长，秒',
  `published_at` varchar(40) CHARACTER SET utf8mb4 COLLATE utf8mb4_bin DEFAULT NULL COMMENT '视频发布时间',
  `play` bigint NOT NULL DEFAULT '0' COMMENT '播放数缓存',
  `danmaku` bigint NOT NULL DEFAULT '0' COMMENT '弹幕数缓存',
  `comment_count` bigint NOT NULL DEFAULT '0' COMMENT '评论数缓存',
  `fetched_at` varchar(40) CHARACTER SET utf8mb4 COLLATE utf8mb4_bin NOT NULL COMMENT '本条资料最近获取时间',
  `description` longtext CHARACTER SET utf8mb4 COLLATE utf8mb4_bin NOT NULL COMMENT '视频简介',
  PRIMARY KEY (`bvid`),
  KEY `videos_published` (`published_at` DESC,`bvid`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_bin COMMENT='Bilibili视频基础资料、简介、发布时间及播放弹幕统计缓存';

CREATE TABLE `visitors` (
  `identity` char(64) CHARACTER SET utf8mb4 COLLATE utf8mb4_bin NOT NULL COMMENT '访客身份摘要，主键',
  `meteor_id` char(24) CHARACTER SET utf8mb4 COLLATE utf8mb4_bin NOT NULL COMMENT '公开彗星标识，唯一',
  `first_seen` varchar(40) CHARACTER SET utf8mb4 COLLATE utf8mb4_bin NOT NULL COMMENT '首次来访时间',
  `last_seen` varchar(40) CHARACTER SET utf8mb4 COLLATE utf8mb4_bin NOT NULL COMMENT '最近来访时间',
  `region` text CHARACTER SET utf8mb4 COLLATE utf8mb4_bin COMMENT '解析后的地区文本',
  `ip` varchar(64) CHARACTER SET utf8mb4 COLLATE utf8mb4_bin DEFAULT NULL COMMENT '最近记录的 IP 地址',
  `geo_status` text CHARACTER SET utf8mb4 COLLATE utf8mb4_bin COMMENT '地区解析状态',
  `geo_raw` longtext CHARACTER SET utf8mb4 COLLATE utf8mb4_bin COMMENT '地区解析原始结果',
  `geo_error` text CHARACTER SET utf8mb4 COLLATE utf8mb4_bin COMMENT '地区解析错误摘要',
  `browser` text CHARACTER SET utf8mb4 COLLATE utf8mb4_bin COMMENT '浏览器描述',
  PRIMARY KEY (`identity`),
  UNIQUE KEY `meteor_id` (`meteor_id`),
  KEY `visitors_seen` (`last_seen` DESC,`meteor_id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_bin COMMENT='彗星来访者身份、首次及最近访问、地区与浏览器信息';

CREATE TABLE `daily_visitors` (
  `day` char(10) CHARACTER SET utf8mb4 COLLATE utf8mb4_bin NOT NULL COMMENT '统计日期，YYYY-MM-DD，按业务时区归日',
  `identity` char(64) CHARACTER SET utf8mb4 COLLATE utf8mb4_bin NOT NULL COMMENT '关联 visitors.identity；同日同访客只存一次',
  PRIMARY KEY (`day`,`identity`),
  KEY `visitor_days` (`identity`,`day`),
  CONSTRAINT `daily_visitors_parent` FOREIGN KEY (`identity`) REFERENCES `visitors` (`identity`) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_bin COMMENT='按日期和访客身份去重的每日来访明细';

CREATE TABLE `friend_jobs` (
  `friend_id` varchar(80) CHARACTER SET utf8mb4 COLLATE utf8mb4_bin NOT NULL COMMENT '待处理友链标识',
  `generation` bigint unsigned NOT NULL DEFAULT '1' COMMENT '任务版本，重复提交递增以保护新任务',
  `state` varchar(16) CHARACTER SET utf8mb4 COLLATE utf8mb4_bin NOT NULL DEFAULT 'pending' COMMENT 'pending / running',
  `attempts` int unsigned NOT NULL DEFAULT '0' COMMENT '后台处理失败次数',
  `available_at` bigint NOT NULL DEFAULT '0' COMMENT '下次可处理的 Unix 毫秒时间，0 表示立即',
  `last_error` varchar(1000) CHARACTER SET utf8mb4 COLLATE utf8mb4_bin NOT NULL DEFAULT '' COMMENT '最近处理失败原因',
  `enqueued_at` varchar(32) CHARACTER SET utf8mb4 COLLATE utf8mb4_bin NOT NULL DEFAULT '' COMMENT '任务提交时间，UTC ISO 8601',
  PRIMARY KEY (`friend_id`),
  KEY `friend_jobs_ready` (`state`,`available_at`,`enqueued_at`),
  CONSTRAINT `friend_jobs_friend` FOREIGN KEY (`friend_id`) REFERENCES `friends` (`id`) ON DELETE CASCADE,
  CONSTRAINT `friend_jobs_state` CHECK ((`state` in (_utf8mb4'pending',_utf8mb4'running')))
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_bin COMMENT='友链头像、RSS 和自动审核持久化队列';

CREATE TABLE `monitored_services` (
  `id` varchar(64) CHARACTER SET utf8mb4 COLLATE utf8mb4_bin NOT NULL COMMENT '服务列表条目标识',
  `name` varchar(100) CHARACTER SET utf8mb4 COLLATE utf8mb4_bin NOT NULL COMMENT '公开显示名称',
  `integration` varchar(32) CHARACTER SET utf8mb4 COLLATE utf8mb4_bin NOT NULL DEFAULT '' COMMENT '已集成服务类型，空字符串表示其他服务',
  `icon_svg` text CHARACTER SET utf8mb4 COLLATE utf8mb4_bin NOT NULL DEFAULT (_utf8mb4'') COMMENT '自定义 SVG 图标源码，留空使用服务来源图标',
  `container_name` varchar(128) CHARACTER SET utf8mb4 COLLATE utf8mb4_bin NOT NULL DEFAULT '' COMMENT 'Beszel 容器匹配名称，留空仅使用 HTTP',
  `http_url` varchar(2000) CHARACTER SET utf8mb4 COLLATE utf8mb4_bin NOT NULL DEFAULT '' COMMENT 'HTTP 检测地址，集成服务留空则引用原接入配置',
  `strict_status` tinyint(1) NOT NULL DEFAULT '1' COMMENT '是否仅将 HTTP 2xx 判定为正常',
  `credential_id` varchar(64) CHARACTER SET utf8mb4 COLLATE utf8mb4_bin DEFAULT NULL COMMENT '可选检测认证配置标识',
  `enabled` tinyint(1) NOT NULL DEFAULT '1' COMMENT '是否展示并检测此服务',
  `sort_order` int unsigned NOT NULL DEFAULT '0' COMMENT '列表排序，数字小的在前',
  PRIMARY KEY (`id`),
  KEY `monitored_services_order` (`enabled`,`sort_order`,`id`),
  KEY `monitored_services_credential` (`credential_id`),
  CONSTRAINT `monitored_services_credential` FOREIGN KEY (`credential_id`) REFERENCES `service_credentials` (`id`) ON DELETE RESTRICT
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_bin COMMENT='可增删、启停和排序的公开服务状态列表';

CREATE TABLE `visitor_fixtures` (
  `identity` char(64) CHARACTER SET utf8mb4 COLLATE utf8mb4_bin NOT NULL COMMENT '被标记为测试数据的访客身份',
  `batch` text CHARACTER SET utf8mb4 COLLATE utf8mb4_bin NOT NULL COMMENT '测试数据批次',
  PRIMARY KEY (`identity`),
  CONSTRAINT `visitor_fixtures_parent` FOREIGN KEY (`identity`) REFERENCES `visitors` (`identity`) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_bin COMMENT='访客测试数据的身份及批次标记';

INSERT INTO resource_locks(name) VALUES('friends'),('journal'),('content'),('alerts');


-- Initial service-list data. Runtime edits never reseed these rows.
INSERT INTO monitored_services(id,name,integration,container_name,http_url,strict_status,enabled,sort_order) VALUES
('artalk','Artalk','artalk','artalk','',0,1,10),
('openlist','OpenList','openlist','openlist','',0,1,20),
('danmu','DanmuApi','danmu','danmu-api','',0,1,30),
('jellyfin','Jellyfin','jellyfin','jellyfin','',1,1,40),
('fontinass','Fontinass','fontinass','fontinass','',0,1,50),
('syncthing','Syncthing','','syncthing','http://syncthing:8384/rest/noauth/health',1,1,60),
('gitea','Gitea','gitea','gitea','',1,1,70),
('activitywatch','ActivityWatch','activitywatch','activitywatch','',1,1,80),
('astrbot','AstrBot','astrbot','astrbot','',0,1,90),
('napcat','NapCat','napcat','napcat','',0,1,100),
('beszel','Beszel','beszel','beszel','',1,1,110);
