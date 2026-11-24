SET NAMES utf8mb4 COLLATE utf8mb4_bin;

ALTER TABLE starbud_chat_records ADD COLUMN status_utf8
  ENUM('未完成','已回复','回复中断','未能回复')
  CHARACTER SET utf8mb4 COLLATE utf8mb4_bin NOT NULL DEFAULT '未完成';
UPDATE starbud_chat_records SET status_utf8 = CASE status+0
  WHEN 2 THEN '已回复'
  WHEN 3 THEN '回复中断'
  WHEN 4 THEN '未能回复'
  ELSE '未完成'
END;
ALTER TABLE starbud_chat_records DROP COLUMN status, RENAME COLUMN status_utf8 TO status;

ALTER TABLE starbud_daily_usage ADD COLUMN ip_address varchar(45)
  CHARACTER SET ascii COLLATE ascii_bin DEFAULT NULL;
