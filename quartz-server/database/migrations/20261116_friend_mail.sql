ALTER TABLE friends ADD COLUMN email varchar(254) NOT NULL DEFAULT '' COMMENT '申请通知邮箱，不公开';
CREATE TABLE friend_mail_outbox (
 id char(36) NOT NULL PRIMARY KEY COMMENT '邮件事件 UUID',
 friend_id char(36) NOT NULL COMMENT '关联友链 UUID，删除友链后仍可发送结果',
 recipient varchar(254) NOT NULL COMMENT '审核结果接收邮箱',
 name varchar(80) NOT NULL COMMENT '申请网站名称',
 accepted boolean NOT NULL COMMENT '是否审核通过',
 reason varchar(1000) NOT NULL COMMENT '面向申请人的审核结果说明',
 state varchar(16) NOT NULL DEFAULT 'pending' COMMENT 'pending 待投递、sent 已发送、failed 失败',
 attempts int NOT NULL DEFAULT 0 COMMENT '邮件发送尝试次数',
 available_at bigint NOT NULL DEFAULT 0 COMMENT '下次投递时间，Unix 毫秒',
 created_at varchar(40) NOT NULL COMMENT '入队时间，UTC ISO 8601',
 last_error varchar(255) NOT NULL DEFAULT '' COMMENT '不含凭据的发送错误说明',
 KEY delivery(state,available_at)
) COMMENT='友链审核邮件队列，与审核结果同事务保存';
