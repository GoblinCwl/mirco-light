-- Apply explicitly with the application stopped. Never run at service startup.
-- Preserve the existing public card numbers before replacing position.
ALTER TABLE friends ADD COLUMN number int unsigned NULL COMMENT '友链固定编号，用于卡片编号，不随 RSS 排序变化' AFTER id;
CREATE TEMPORARY TABLE friend_number_backfill AS
 SELECT id, ROW_NUMBER() OVER (ORDER BY (status='展示中') DESC,latest_update DESC,position,id) AS number FROM friends;
UPDATE friends f JOIN friend_number_backfill b ON b.id=f.id SET f.number=b.number;
DROP TEMPORARY TABLE friend_number_backfill;
ALTER TABLE friends
 MODIFY number int unsigned NOT NULL AUTO_INCREMENT COMMENT '友链固定编号，用于卡片编号，不随 RSS 排序变化',
 ADD UNIQUE KEY friends_number(number),
 DROP INDEX friends_order,
 DROP COLUMN position,
 ADD KEY friends_updated(latest_update,number),
 COMMENT='友链资料、固定编号及审核状态';
