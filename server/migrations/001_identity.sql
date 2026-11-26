CREATE TABLE IF NOT EXISTS roles (
 code VARCHAR(16) PRIMARY KEY
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
INSERT IGNORE INTO roles(code) VALUES ('DEVELOPER'),('ADMIN'),('MANAGER'),('DESIGNER'),('SALE'),('PRINTER'),('FINISHER'),('WAREHOUSE');
CREATE TABLE IF NOT EXISTS system_state (
 id TINYINT PRIMARY KEY CHECK(id=1), initialized_at DATETIME(3) NULL, change_sequence BIGINT UNSIGNED NOT NULL DEFAULT 0
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
INSERT IGNORE INTO system_state(id) VALUES(1);
CREATE TABLE IF NOT EXISTS users (
 id CHAR(36) CHARACTER SET ascii COLLATE ascii_bin PRIMARY KEY,
 username VARCHAR(64) CHARACTER SET ascii COLLATE ascii_general_ci NOT NULL UNIQUE,
 name VARCHAR(100) NOT NULL, phone VARCHAR(30) NOT NULL DEFAULT '',
 role_code VARCHAR(16) NOT NULL, machine_assigned VARCHAR(100) NOT NULL DEFAULT '',
 password_hash VARCHAR(255) CHARACTER SET ascii NOT NULL,
 active BOOLEAN NOT NULL DEFAULT TRUE, version INT UNSIGNED NOT NULL DEFAULT 1,
 created_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3), updated_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3), deleted_at DATETIME(3) NULL,
 CONSTRAINT fk_user_role FOREIGN KEY(role_code) REFERENCES roles(code),
 INDEX ix_users_active_name(active,name), INDEX ix_users_role(role_code,active)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
CREATE TABLE IF NOT EXISTS sessions (
 token_hash CHAR(64) CHARACTER SET ascii COLLATE ascii_bin PRIMARY KEY,
 user_id CHAR(36) CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
 csrf_token CHAR(64) CHARACTER SET ascii NOT NULL,
 expires_at DATETIME(3) NOT NULL, created_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
 CONSTRAINT fk_session_user FOREIGN KEY(user_id) REFERENCES users(id), INDEX ix_session_user(user_id), INDEX ix_session_expiry(expires_at)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
CREATE TABLE IF NOT EXISTS auth_rate_limits (
 bucket_hash CHAR(64) CHARACTER SET ascii COLLATE ascii_bin PRIMARY KEY,
 hits INT UNSIGNED NOT NULL, expires_at DATETIME(3) NOT NULL,
 INDEX ix_rate_expiry(expires_at)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
