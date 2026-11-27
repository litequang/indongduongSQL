CREATE TABLE image_registry (
 id CHAR(36) CHARACTER SET ascii COLLATE ascii_bin PRIMARY KEY,
 owner_id CHAR(36) CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
 target_type ENUM('DESIGN','PRODUCTION') NOT NULL,
 target_id CHAR(36) CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
 status ENUM('STAGED','ACTIVE','DELETED') NOT NULL DEFAULT 'STAGED',
 object_key VARCHAR(180) CHARACTER SET ascii COLLATE ascii_bin NOT NULL UNIQUE,
 mime_type VARCHAR(40) NULL, byte_size INT UNSIGNED NULL,
 sha256 CHAR(64) CHARACTER SET ascii COLLATE ascii_bin NULL,
 width INT UNSIGNED NULL, height INT UNSIGNED NULL,
 expires_at DATETIME(3) NOT NULL,
 created_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
 FOREIGN KEY(owner_id) REFERENCES users(id),
 INDEX ix_image_target(target_type,target_id,status), INDEX ix_image_expiry(status,expires_at)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
ALTER TABLE design_versions MODIFY COLUMN image_registry_id CHAR(36) CHARACTER SET ascii COLLATE ascii_bin NULL;
ALTER TABLE production_print_images MODIFY COLUMN image_registry_id CHAR(36) CHARACTER SET ascii COLLATE ascii_bin NULL;
ALTER TABLE design_versions ADD CONSTRAINT fk_design_image FOREIGN KEY(image_registry_id) REFERENCES image_registry(id);
ALTER TABLE production_print_images ADD CONSTRAINT fk_print_image FOREIGN KEY(image_registry_id) REFERENCES image_registry(id);
CREATE TABLE image_backup_jobs (
 id CHAR(36) CHARACTER SET ascii COLLATE ascii_bin PRIMARY KEY,
 actor_id CHAR(36) CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
 mode ENUM('BACKUP','VERIFY','RESTORE') NOT NULL,
 created_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
 FOREIGN KEY(actor_id) REFERENCES users(id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
CREATE TABLE image_backup_items (
 job_id CHAR(36) CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
 image_id CHAR(36) CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
 status ENUM('PENDING','OK','FAILED') NOT NULL DEFAULT 'PENDING',
 message VARCHAR(120) NOT NULL DEFAULT '', attempts SMALLINT UNSIGNED NOT NULL DEFAULT 0,
 PRIMARY KEY(job_id,image_id), FOREIGN KEY(job_id) REFERENCES image_backup_jobs(id),
 FOREIGN KEY(image_id) REFERENCES image_registry(id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
CREATE TABLE notifications (
 id CHAR(36) CHARACTER SET ascii COLLATE ascii_bin PRIMARY KEY,
 user_id CHAR(36) CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
 event_sequence BIGINT UNSIGNED NOT NULL, entity VARCHAR(20) NOT NULL,
 entity_id VARCHAR(80) NOT NULL, read_at DATETIME(3) NULL,
 created_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
 FOREIGN KEY(user_id) REFERENCES users(id),
 UNIQUE KEY uq_notification_event(user_id,event_sequence),
 INDEX ix_notification_user(user_id,created_at,id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
