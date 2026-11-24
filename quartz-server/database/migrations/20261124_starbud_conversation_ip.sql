ALTER TABLE starbud_chat_records ADD COLUMN client_ip varchar(45) CHARACTER SET ascii COLLATE ascii_bin DEFAULT NULL AFTER conversation_id;
