ALTER TABLE image_registry MODIFY COLUMN target_type ENUM('DESIGN','PRODUCTION','AVATAR') NOT NULL;
ALTER TABLE users ADD COLUMN avatar_registry_id CHAR(36) CHARACTER SET ascii COLLATE ascii_bin NULL, ADD CONSTRAINT fk_user_avatar FOREIGN KEY(avatar_registry_id) REFERENCES image_registry(id);
CREATE TABLE access_policy (
 id TINYINT PRIMARY KEY CHECK(id=1),
 version INT UNSIGNED NOT NULL DEFAULT 1,
 features JSON NOT NULL, role_overrides JSON NOT NULL, user_overrides JSON NOT NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
INSERT INTO access_policy(id,features,role_overrides,user_overrides) VALUES(1,'{}','{}','{}');
ALTER TABLE production_orders ADD INDEX ix_production_report(created_at,status,id);
