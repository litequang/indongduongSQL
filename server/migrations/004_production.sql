INSERT INTO business_counters(entity,value) VALUES ('production_orders',0);
ALTER TABLE sales_order_items ADD COLUMN design_queue_status ENUM('WAITING_DESIGN','NEEDS_INFO','DESIGNING','READY_FOR_PRODUCTION') NOT NULL DEFAULT 'WAITING_DESIGN', ADD COLUMN design_queue_version INT UNSIGNED NOT NULL DEFAULT 1, ADD COLUMN design_instruction VARCHAR(5000) NOT NULL DEFAULT '', ADD COLUMN design_note VARCHAR(1000) NOT NULL DEFAULT '';
CREATE TABLE production_orders (
 id CHAR(36) CHARACTER SET ascii COLLATE ascii_bin PRIMARY KEY,
 code VARCHAR(30) NULL UNIQUE, created_by CHAR(36) CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
 printer_id CHAR(36) CHARACTER SET ascii COLLATE ascii_bin NULL,
 title VARCHAR(150) NOT NULL, instruction_raw VARCHAR(5000) NOT NULL,
 paper_type VARCHAR(100) NOT NULL, paper_gsm VARCHAR(60) NOT NULL, paper_width VARCHAR(60) NOT NULL, paper_height VARCHAR(60) NOT NULL,
 color VARCHAR(100) NOT NULL, total_sheets INT UNSIGNED NOT NULL CHECK(total_sheets<=1000000000), machine VARCHAR(100) NOT NULL,
 note VARCHAR(1000) NOT NULL, finishing_note VARCHAR(1000) NOT NULL, reference VARCHAR(120) NOT NULL,
 is_urgent BOOLEAN NOT NULL, urgent_reason VARCHAR(500) NOT NULL,
 run_kind ENUM('NORMAL','SUPPLEMENTAL','REPRINT') NOT NULL,
 source_order_id CHAR(36) CHARACTER SET ascii COLLATE ascii_bin NULL, run_reason VARCHAR(500) NOT NULL,
 plate_type ENUM('NEW','OLD','UNKNOWN','NONE') NOT NULL,
 plate_status ENUM('NOT_REQUIRED','NOT_SENT','SENT','RECEIVED','OLD_PLATE','PLATE_DAMAGED') NOT NULL,
 plate_note VARCHAR(500) NOT NULL,
 status ENUM('DRAFT','WAITING_ACCEPTANCE','ACCEPTED','WAITING_PRINT','PRINTING','PRINTED','CANCELLED') NOT NULL DEFAULT 'DRAFT',
 version INT UNSIGNED NOT NULL DEFAULT 1, revision INT UNSIGNED NOT NULL DEFAULT 1,
 acknowledged_revision INT UNSIGNED NOT NULL DEFAULT 0,
 request_hash CHAR(64) CHARACTER SET ascii NOT NULL,
 accepted_at DATETIME(3) NULL, started_at DATETIME(3) NULL, printed_at DATETIME(3) NULL,
 actual_printed_sheets INT UNSIGNED NULL CHECK(actual_printed_sheets<=1000000000),
 spoilage_sheets INT UNSIGNED NULL CHECK(spoilage_sheets<=1000000000), printed_note VARCHAR(500) NULL,
 created_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3), updated_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
 FOREIGN KEY(created_by) REFERENCES users(id), FOREIGN KEY(printer_id) REFERENCES users(id), FOREIGN KEY(source_order_id) REFERENCES production_orders(id),
 CHECK((status='DRAFT' AND code IS NULL) OR (status<>'DRAFT' AND code IS NOT NULL)),
 CHECK((run_kind='NORMAL' AND source_order_id IS NULL) OR (run_kind<>'NORMAL' AND source_order_id IS NOT NULL)),
 INDEX ix_production_assigned(printer_id,status,created_at,id), INDEX ix_production_status(status,created_at,id),
 INDEX ix_production_owner(created_by,status,created_at,id), INDEX ix_production_machine(machine,status,id), INDEX ix_production_plate(plate_status,created_at,id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
CREATE TABLE production_tags (
 order_id CHAR(36) CHARACTER SET ascii COLLATE ascii_bin NOT NULL, tag VARCHAR(50) NOT NULL,
 PRIMARY KEY(order_id,tag), FOREIGN KEY(order_id) REFERENCES production_orders(id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
CREATE TABLE production_items (
 id CHAR(36) CHARACTER SET ascii COLLATE ascii_bin PRIMARY KEY,
 order_id CHAR(36) CHARACTER SET ascii COLLATE ascii_bin NOT NULL, position SMALLINT UNSIGNED NOT NULL,
 product_name VARCHAR(150) NOT NULL, quantity INT UNSIGNED NOT NULL CHECK(quantity<=1000000000),
 requires_finishing BOOLEAN NOT NULL, note VARCHAR(1000) NOT NULL,
 design_version_id CHAR(36) CHARACTER SET ascii COLLATE ascii_bin NULL,
 FOREIGN KEY(order_id) REFERENCES production_orders(id), FOREIGN KEY(design_version_id) REFERENCES design_versions(id),
 UNIQUE KEY uq_production_item_parent(order_id,id), INDEX ix_production_item_position(order_id,position)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
CREATE TABLE production_allocations (
 id CHAR(36) CHARACTER SET ascii COLLATE ascii_bin PRIMARY KEY,
 production_item_id CHAR(36) CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
 sales_item_id CHAR(36) CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
 quantity INT UNSIGNED NOT NULL CHECK(quantity<=1000000000),
 kind ENUM('OUTPUT','TRACE','REPRINT') NOT NULL,
 state ENUM('PROPOSED','ACTIVE','RELEASED') NOT NULL DEFAULT 'PROPOSED',
 source_allocation_id CHAR(36) CHARACTER SET ascii COLLATE ascii_bin NULL,
 created_by CHAR(36) CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
 created_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3), released_at DATETIME(3) NULL,
 FOREIGN KEY(production_item_id) REFERENCES production_items(id), FOREIGN KEY(sales_item_id) REFERENCES sales_order_items(id),
 FOREIGN KEY(source_allocation_id) REFERENCES production_allocations(id), FOREIGN KEY(created_by) REFERENCES users(id),
 UNIQUE KEY uq_production_allocation(production_item_id,sales_item_id,kind),
 CHECK((kind='TRACE' AND quantity=0) OR (kind<>'TRACE' AND quantity>0)),
 CHECK((kind='REPRINT' AND source_allocation_id IS NOT NULL) OR (kind<>'REPRINT' AND source_allocation_id IS NULL)),
 INDEX ix_allocation_remaining(sales_item_id,state,kind,quantity), INDEX ix_allocation_source(source_allocation_id,state)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
CREATE TABLE production_print_images (
 id CHAR(36) CHARACTER SET ascii COLLATE ascii_bin PRIMARY KEY,
 order_id CHAR(36) CHARACTER SET ascii COLLATE ascii_bin NOT NULL, position SMALLINT UNSIGNED NOT NULL,
 label VARCHAR(150) NOT NULL, note VARCHAR(500) NOT NULL, sheet_count INT UNSIGNED NOT NULL CHECK(sheet_count<=1000000000),
 image_registry_id CHAR(36) CHARACTER SET ascii COLLATE ascii_bin NULL CHECK(image_registry_id IS NULL),
 FOREIGN KEY(order_id) REFERENCES production_orders(id), INDEX ix_print_images(order_id,position)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
CREATE TABLE production_revisions (
 order_id CHAR(36) CHARACTER SET ascii COLLATE ascii_bin NOT NULL, revision INT UNSIGNED NOT NULL,
 instruction_raw VARCHAR(5000) NOT NULL, technical_snapshot JSON NOT NULL,
 actor_id CHAR(36) CHARACTER SET ascii COLLATE ascii_bin NOT NULL, actor_name VARCHAR(100) NOT NULL,
 reason VARCHAR(500) NOT NULL, created_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
 PRIMARY KEY(order_id,revision), FOREIGN KEY(order_id) REFERENCES production_orders(id), FOREIGN KEY(actor_id) REFERENCES users(id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
CREATE TABLE production_status_history (
 id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
 order_id CHAR(36) CHARACTER SET ascii COLLATE ascii_bin NOT NULL, version INT UNSIGNED NOT NULL,
 action VARCHAR(60) NOT NULL, from_status VARCHAR(24) NULL, to_status VARCHAR(24) NOT NULL,
 actor_id CHAR(36) CHARACTER SET ascii COLLATE ascii_bin NOT NULL, actor_name VARCHAR(100) NOT NULL,
 note VARCHAR(1000) NOT NULL, created_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
 FOREIGN KEY(order_id) REFERENCES production_orders(id), FOREIGN KEY(actor_id) REFERENCES users(id),
 UNIQUE KEY uq_production_history(order_id,version)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
CREATE TABLE production_plates (
 id CHAR(36) CHARACTER SET ascii COLLATE ascii_bin PRIMARY KEY,
 order_id CHAR(36) CHARACTER SET ascii COLLATE ascii_bin NOT NULL, version INT UNSIGNED NOT NULL,
 plate_type VARCHAR(12) NOT NULL, plate_status VARCHAR(24) NOT NULL, note VARCHAR(500) NOT NULL,
 actor_id CHAR(36) CHARACTER SET ascii COLLATE ascii_bin NOT NULL, actor_name VARCHAR(100) NOT NULL,
 created_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
 FOREIGN KEY(order_id) REFERENCES production_orders(id), FOREIGN KEY(actor_id) REFERENCES users(id), UNIQUE KEY uq_plate_event(order_id,version)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
CREATE TABLE production_issues (
 id CHAR(36) CHARACTER SET ascii COLLATE ascii_bin PRIMARY KEY,
 order_id CHAR(36) CHARACTER SET ascii COLLATE ascii_bin NOT NULL, issue_type VARCHAR(24) NOT NULL,
 message VARCHAR(1000) NOT NULL, urgent BOOLEAN NOT NULL,
 status ENUM('OPEN','RESOLVED','CANCELLED') NOT NULL DEFAULT 'OPEN',
 reported_by CHAR(36) CHARACTER SET ascii COLLATE ascii_bin NOT NULL, reporter_name VARCHAR(100) NOT NULL,
 resolved_by CHAR(36) CHARACTER SET ascii COLLATE ascii_bin NULL, resolved_at DATETIME(3) NULL,
 cancelled_by CHAR(36) CHARACTER SET ascii COLLATE ascii_bin NULL, cancelled_at DATETIME(3) NULL,
 created_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
 FOREIGN KEY(order_id) REFERENCES production_orders(id), FOREIGN KEY(reported_by) REFERENCES users(id),
 FOREIGN KEY(resolved_by) REFERENCES users(id), FOREIGN KEY(cancelled_by) REFERENCES users(id), INDEX ix_production_issue(order_id,status,created_at)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
CREATE TABLE production_issue_users (
 issue_id CHAR(36) CHARACTER SET ascii COLLATE ascii_bin NOT NULL, user_id CHAR(36) CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
 PRIMARY KEY(issue_id,user_id), FOREIGN KEY(issue_id) REFERENCES production_issues(id), FOREIGN KEY(user_id) REFERENCES users(id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
CREATE TABLE production_issue_roles (
 issue_id CHAR(36) CHARACTER SET ascii COLLATE ascii_bin NOT NULL, role_code VARCHAR(16) NOT NULL,
 PRIMARY KEY(issue_id,role_code), FOREIGN KEY(issue_id) REFERENCES production_issues(id), FOREIGN KEY(role_code) REFERENCES roles(code)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
CREATE TABLE production_cancellation_requests (
 id CHAR(36) CHARACTER SET ascii COLLATE ascii_bin PRIMARY KEY,
 order_id CHAR(36) CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
 status ENUM('PENDING','ACCEPTED','REJECTED') NOT NULL DEFAULT 'PENDING', reason VARCHAR(500) NOT NULL,
 requested_by CHAR(36) CHARACTER SET ascii COLLATE ascii_bin NOT NULL, requester_name VARCHAR(100) NOT NULL,
 responded_by CHAR(36) CHARACTER SET ascii COLLATE ascii_bin NULL, responder_name VARCHAR(100) NULL,
 response_reason VARCHAR(500) NULL, responded_at DATETIME(3) NULL, created_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
 pending_slot TINYINT AS (IF(status='PENDING',1,NULL)) PERSISTENT,
 UNIQUE KEY uq_cancellation_pending(order_id,pending_slot), FOREIGN KEY(order_id) REFERENCES production_orders(id),
 FOREIGN KEY(requested_by) REFERENCES users(id), FOREIGN KEY(responded_by) REFERENCES users(id), INDEX ix_cancel_order(order_id,created_at)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
CREATE TABLE production_comments (
 id CHAR(36) CHARACTER SET ascii COLLATE ascii_bin PRIMARY KEY,
 order_id CHAR(36) CHARACTER SET ascii COLLATE ascii_bin NOT NULL, content VARCHAR(1000) NOT NULL,
 actor_id CHAR(36) CHARACTER SET ascii COLLATE ascii_bin NOT NULL, actor_name VARCHAR(100) NOT NULL,
 created_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
 FOREIGN KEY(order_id) REFERENCES production_orders(id), FOREIGN KEY(actor_id) REFERENCES users(id), INDEX ix_comments(order_id,created_at,id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
CREATE TABLE production_action_receipts (
 request_id CHAR(36) CHARACTER SET ascii COLLATE ascii_bin PRIMARY KEY,
 order_id CHAR(36) CHARACTER SET ascii COLLATE ascii_bin NOT NULL, actor_id CHAR(36) CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
 action VARCHAR(40) NOT NULL, request_hash CHAR(64) CHARACTER SET ascii NOT NULL, result_version INT UNSIGNED NOT NULL,
 created_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3), FOREIGN KEY(order_id) REFERENCES production_orders(id), FOREIGN KEY(actor_id) REFERENCES users(id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
CREATE TABLE production_finishing_handoffs (
 id CHAR(36) CHARACTER SET ascii COLLATE ascii_bin PRIMARY KEY,
 order_id CHAR(36) CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
 production_item_id CHAR(36) CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
 allocation_id CHAR(36) CHARACTER SET ascii COLLATE ascii_bin NULL UNIQUE,
 quantity INT UNSIGNED NOT NULL CHECK(quantity<=1000000000), requires_finishing BOOLEAN NOT NULL, replacement BOOLEAN NOT NULL,
 status ENUM('PENDING_02C') NOT NULL DEFAULT 'PENDING_02C', created_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
 FOREIGN KEY(order_id,production_item_id) REFERENCES production_items(order_id,id), FOREIGN KEY(allocation_id) REFERENCES production_allocations(id),
 INDEX ix_finishing_handoff(order_id,status,id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
