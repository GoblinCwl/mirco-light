ALTER TABLE friends ADD COLUMN inspection_failed_on varchar(10) NOT NULL DEFAULT '' COMMENT '最近计入巡检失败天数的北京时间日期，同日不重复累计';
ALTER TABLE friends MODIFY COLUMN inspection_failures int NOT NULL DEFAULT 0 COMMENT '巡检累计失败天数，同一北京时间日期最多累计一天';
