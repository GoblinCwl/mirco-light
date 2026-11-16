ALTER TABLE friends
 ADD COLUMN processing_failures int NOT NULL DEFAULT 0 COMMENT '处理累计失败次数，不因重新入队清零',
 ADD COLUMN failure_notified boolean NOT NULL DEFAULT 0 COMMENT '是否已投递累计失败阈值通知',
 ADD COLUMN failure_mail_sent boolean NOT NULL DEFAULT 0 COMMENT '是否已生成失败邮件任务，避免重复发送';
UPDATE friends f JOIN friend_jobs j ON f.id=j.friend_id SET f.processing_failures=j.attempts;
UPDATE friends SET review_result='自动审核未通过，等待周期任务或人工处理' WHERE review_result LIKE '自动审核已达上限%';
DELETE FROM friend_mail_outbox WHERE state='pending' AND reason LIKE '自动审核已达上限%';
DELETE FROM settings WHERE `key` IN ('tasks.friend-retrySeconds','tasks.friend-retry-maxSeconds');
DELETE FROM friend_jobs WHERE attempts>0;
DELETE FROM friend_mail_outbox WHERE state='pending' AND accepted=0 AND reason LIKE '人工审核%';
DELETE FROM notification_outbox WHERE state='pending' AND kind='friends' AND JSON_UNQUOTE(JSON_EXTRACT(payload,'$.title')) IN ('收到友链申请','友链审核结果更新');
