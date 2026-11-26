CREATE TABLE business_counters (
 entity VARCHAR(20) PRIMARY KEY, value BIGINT UNSIGNED NOT NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
INSERT INTO business_counters(entity,value) VALUES ('customers',0),('sales_orders',0);
CREATE TABLE customer_import_jobs (
 id CHAR(36) CHARACTER SET ascii COLLATE ascii_bin PRIMARY KEY,
 actor_id CHAR(36) CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
 file_name VARCHAR(180) NOT NULL, source ENUM('CSV_IMPORT','EXCEL_IMPORT') NOT NULL,
 total_rows SMALLINT UNSIGNED NOT NULL CHECK(total_rows BETWEEN 1 AND 500),
 status ENUM('STAGING','REVIEW','PROCESSING','COMPLETED','CANCELLED') NOT NULL DEFAULT 'STAGING',
 policy ENUM('SKIP','UPDATE') NULL, version INT UNSIGNED NOT NULL DEFAULT 1,
 created_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3), completed_at DATETIME(3) NULL,
 FOREIGN KEY(actor_id) REFERENCES users(id), INDEX ix_import_actor(actor_id,created_at,id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
CREATE TABLE customers (
 id CHAR(36) CHARACTER SET ascii COLLATE ascii_bin PRIMARY KEY,
 code VARCHAR(30) NOT NULL UNIQUE, name VARCHAR(150) NOT NULL,
 phone VARCHAR(40) NOT NULL, phone_normalized VARCHAR(20) CHARACTER SET ascii COLLATE ascii_bin NULL,
 contact_name VARCHAR(150) NOT NULL, email VARCHAR(254) NOT NULL,
 address VARCHAR(300) NOT NULL, province VARCHAR(100) NOT NULL, district VARCHAR(100) NOT NULL, ward VARCHAR(100) NOT NULL,
 zalo VARCHAR(200) NOT NULL, facebook VARCHAR(250) NOT NULL, note VARCHAR(1000) NOT NULL,
 source VARCHAR(30) NOT NULL, external_source VARCHAR(40) NOT NULL, external_id VARCHAR(120) NOT NULL,
 import_job_id CHAR(36) CHARACTER SET ascii COLLATE ascii_bin NULL,
 version INT UNSIGNED NOT NULL DEFAULT 1, request_hash CHAR(64) CHARACTER SET ascii NULL,
 created_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3), updated_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
 deleted_at DATETIME(3) NULL,
 active_phone VARCHAR(20) CHARACTER SET ascii COLLATE ascii_bin AS (IF(deleted_at IS NULL,phone_normalized,NULL)) PERSISTENT,
 active_external_id VARCHAR(120) AS (IF(deleted_at IS NULL,NULLIF(external_id,''),NULL)) PERSISTENT,
 UNIQUE KEY uq_customer_phone(active_phone), UNIQUE KEY uq_customer_external(external_source,active_external_id),
 FOREIGN KEY(import_job_id) REFERENCES customer_import_jobs(id),
 INDEX ix_customer_name(deleted_at,name,id), INDEX ix_customer_province(deleted_at,province,id),
 INDEX ix_customer_created(deleted_at,created_at,id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
CREATE TABLE customer_import_items (
 job_id CHAR(36) CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
 position SMALLINT UNSIGNED NOT NULL, source_row INT UNSIGNED NOT NULL,
 input_hash CHAR(64) CHARACTER SET ascii NOT NULL, candidate JSON NULL,
 phone_key VARCHAR(20) CHARACTER SET ascii COLLATE ascii_bin NULL,
 external_source VARCHAR(40) NULL, external_id VARCHAR(120) NULL,
 classification ENUM('VALID','INVALID','DUPLICATE') NOT NULL,
 status ENUM('PENDING','CREATED','UPDATED','SKIPPED','FAILED') NOT NULL DEFAULT 'PENDING',
 message VARCHAR(500) NOT NULL DEFAULT '',
 matched_id CHAR(36) CHARACTER SET ascii COLLATE ascii_bin NULL, matched_version INT UNSIGNED NULL,
 customer_id CHAR(36) CHARACTER SET ascii COLLATE ascii_bin NULL,
 PRIMARY KEY(job_id,position), UNIQUE KEY uq_import_row(job_id,source_row), INDEX ix_import_pending(job_id,status,position),
 INDEX ix_import_phone(job_id,phone_key), INDEX ix_import_external(job_id,external_source,external_id),
 FOREIGN KEY(job_id) REFERENCES customer_import_jobs(id), FOREIGN KEY(matched_id) REFERENCES customers(id),
 FOREIGN KEY(customer_id) REFERENCES customers(id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
CREATE TABLE saved_designs (
 id CHAR(36) CHARACTER SET ascii COLLATE ascii_bin PRIMARY KEY,
 created_by CHAR(36) CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
 customer_id CHAR(36) CHARACTER SET ascii COLLATE ascii_bin NULL,
 version INT UNSIGNED NOT NULL DEFAULT 1, request_hash CHAR(64) CHARACTER SET ascii NOT NULL,
 print_count INT UNSIGNED NOT NULL DEFAULT 0, last_printed_at DATETIME(3) NULL,
 last_printer_id CHAR(36) CHARACTER SET ascii COLLATE ascii_bin NULL,
 created_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3), updated_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
 FOREIGN KEY(created_by) REFERENCES users(id), FOREIGN KEY(last_printer_id) REFERENCES users(id),
 FOREIGN KEY(customer_id) REFERENCES customers(id), INDEX ix_design_customer(customer_id,updated_at,id),
 INDEX ix_design_recent(updated_at,id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
CREATE TABLE design_versions (
 id CHAR(36) CHARACTER SET ascii COLLATE ascii_bin PRIMARY KEY,
 design_id CHAR(36) CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
 version INT UNSIGNED NOT NULL, created_by CHAR(36) CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
 customer_id CHAR(36) CHARACTER SET ascii COLLATE ascii_bin NULL,
 customer_name VARCHAR(150) NOT NULL, product_name VARCHAR(150) NOT NULL, bag_size VARCHAR(100) NOT NULL,
 paper_type VARCHAR(100) NOT NULL, paper_gsm VARCHAR(60) NOT NULL, color VARCHAR(100) NOT NULL,
 plate_reference VARCHAR(150) NOT NULL, note VARCHAR(1000) NOT NULL,
 image_registry_id CHAR(36) CHARACTER SET ascii COLLATE ascii_bin NULL CHECK(image_registry_id IS NULL),
 created_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
 FOREIGN KEY(design_id) REFERENCES saved_designs(id), FOREIGN KEY(created_by) REFERENCES users(id),
 FOREIGN KEY(customer_id) REFERENCES customers(id), UNIQUE KEY uq_design_version(design_id,version),
 INDEX ix_design_version_name(product_name)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
CREATE TABLE design_version_tags (
 version_id CHAR(36) CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
 tag VARCHAR(50) NOT NULL, PRIMARY KEY(version_id,tag),
 INDEX ix_design_tag(tag,version_id), FOREIGN KEY(version_id) REFERENCES design_versions(id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
CREATE TABLE sales_orders (
 id CHAR(36) CHARACTER SET ascii COLLATE ascii_bin PRIMARY KEY,
 code VARCHAR(30) NOT NULL UNIQUE, customer_id CHAR(36) CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
 sale_id CHAR(36) CHARACTER SET ascii COLLATE ascii_bin NOT NULL, sale_name VARCHAR(100) NOT NULL,
 customer_name VARCHAR(150) NOT NULL, customer_phone VARCHAR(40) NOT NULL, customer_address VARCHAR(300) NOT NULL,
 status ENUM('DRAFT','CONFIRMED','DESIGNING','FULFILLING','IN_PRODUCTION','PRODUCTION_COMPLETED','READY_TO_SHIP','SHIPPING','DELIVERED','COMPLETED','CANCELLED') NOT NULL DEFAULT 'DRAFT',
 priority ENUM('NORMAL','URGENT') NOT NULL DEFAULT 'NORMAL',
 expected_delivery_date DATE NULL, customer_note VARCHAR(1000) NOT NULL, internal_note VARCHAR(1000) NOT NULL,
 version INT UNSIGNED NOT NULL DEFAULT 1, request_hash CHAR(64) CHARACTER SET ascii NOT NULL,
 created_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3), updated_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
 confirmed_at DATETIME(3) NULL, confirmed_by CHAR(36) CHARACTER SET ascii COLLATE ascii_bin NULL, cancelled_at DATETIME(3) NULL,
 FOREIGN KEY(customer_id) REFERENCES customers(id), FOREIGN KEY(sale_id) REFERENCES users(id),
 FOREIGN KEY(confirmed_by) REFERENCES users(id), INDEX ix_sales_customer(customer_id,created_at,id),
 INDEX ix_sales_status(status,created_at,id), INDEX ix_sales_priority(priority,created_at,id), INDEX ix_sales_created(created_at,id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
CREATE TABLE sales_order_items (
 id CHAR(36) CHARACTER SET ascii COLLATE ascii_bin PRIMARY KEY,
 order_id CHAR(36) CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
 position SMALLINT UNSIGNED NOT NULL, product_name VARCHAR(150) NOT NULL,
 quantity INT UNSIGNED NOT NULL CHECK(quantity BETWEEN 1 AND 1000000000),
 quantity_unit VARCHAR(16) NOT NULL DEFAULT 'BAG',
 bag_width DECIMAL(10,3) UNSIGNED NULL, bag_length DECIMAL(10,3) UNSIGNED NULL, bag_gusset DECIMAL(10,3) UNSIGNED NULL,
 paper_preference VARCHAR(100) NOT NULL, gsm_preference VARCHAR(60) NOT NULL, color_preference VARCHAR(100) NOT NULL,
 technical_requirements VARCHAR(500) NOT NULL, design_requirements VARCHAR(500) NOT NULL,
 production_requirements VARCHAR(500) NOT NULL, finishing_requirements VARCHAR(500) NOT NULL, note VARCHAR(1000) NOT NULL,
 requires_production BOOLEAN NOT NULL, requires_finishing BOOLEAN NOT NULL, is_urgent BOOLEAN NOT NULL,
 design_version_id CHAR(36) CHARACTER SET ascii COLLATE ascii_bin NULL,
 status ENUM('NEW','CONFIRMED','WAITING_DESIGN','DESIGNING','READY_FOR_PRODUCTION','IN_PRODUCTION','PRODUCTION_COMPLETED','READY_FOR_FINISHING','FINISHING','WAREHOUSE_READY','CANCELLED') NOT NULL DEFAULT 'NEW',
 created_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3), updated_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
 deleted_at DATETIME(3) NULL,
 FOREIGN KEY(order_id) REFERENCES sales_orders(id), FOREIGN KEY(design_version_id) REFERENCES design_versions(id),
 INDEX ix_sales_items_order(order_id,deleted_at,position,id), INDEX ix_sales_items_status(status,deleted_at)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
CREATE TABLE sales_order_status_history (
 order_id CHAR(36) CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
 version INT UNSIGNED NOT NULL, from_status VARCHAR(24) NULL, to_status VARCHAR(24) NOT NULL,
 actor_id CHAR(36) CHARACTER SET ascii COLLATE ascii_bin NOT NULL, actor_name VARCHAR(100) NOT NULL,
 reason VARCHAR(500) NOT NULL DEFAULT '', created_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
 PRIMARY KEY(order_id,version), FOREIGN KEY(order_id) REFERENCES sales_orders(id), FOREIGN KEY(actor_id) REFERENCES users(id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
ALTER TABLE audit_logs ADD INDEX ix_audit_entity(entity_id,id);
