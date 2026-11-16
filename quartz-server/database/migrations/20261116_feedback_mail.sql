ALTER TABLE friend_mail_outbox ADD COLUMN kind varchar(16) NOT NULL DEFAULT 'friends' COMMENT '邮件业务类别：friends 友链审核、feedback 反馈处理';
ALTER TABLE friend_mail_outbox MODIFY friend_id char(36) NOT NULL COMMENT '关联业务 UUID，记录删除后仍可发送通知';
ALTER TABLE friend_mail_outbox MODIFY reason text NOT NULL COMMENT '邮件通知正文：审核说明或原始反馈';
ALTER TABLE friend_mail_outbox COMMENT='站点业务邮件队列：友链审核与反馈处理，与业务状态同事务保存';
