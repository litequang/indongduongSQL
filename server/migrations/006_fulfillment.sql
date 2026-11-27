CREATE TABLE finishing_tasks (
 id CHAR(36) CHARACTER SET ascii COLLATE ascii_bin PRIMARY KEY,
 status ENUM('READY','CLAIMED','IN_PROGRESS','COMPLETED','CANCELLED') NOT NULL DEFAULT 'READY',
 assigned_to CHAR(36) CHARACTER SET ascii COLLATE ascii_bin NULL,
 claimed_by CHAR(36) CHARACTER SET ascii COLLATE ascii_bin NULL,
 cancellation_pending BOOLEAN NOT NULL DEFAULT FALSE,
 urgent BOOLEAN NOT NULL DEFAULT FALSE,
 version INT UNSIGNED NOT NULL DEFAULT 1,
 created_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
 FOREIGN KEY(id) REFERENCES production_finishing_handoffs(id),
 FOREIGN KEY(assigned_to) REFERENCES users(id), FOREIGN KEY(claimed_by) REFERENCES users(id),
 INDEX ix_finishing_queue(status,urgent,created_at,id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
CREATE TABLE finishing_task_history (
 task_id CHAR(36) CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
 version INT UNSIGNED NOT NULL, action VARCHAR(40) NOT NULL, status VARCHAR(24) NOT NULL,
 actor_id CHAR(36) CHARACTER SET ascii COLLATE ascii_bin NOT NULL, actor_name VARCHAR(100) NOT NULL,
 note VARCHAR(1000) NOT NULL, created_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
 PRIMARY KEY(task_id,version), FOREIGN KEY(task_id) REFERENCES finishing_tasks(id), FOREIGN KEY(actor_id) REFERENCES users(id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
CREATE TABLE finished_goods_acceptances (
 id CHAR(36) CHARACTER SET ascii COLLATE ascii_bin PRIMARY KEY,
 accepted_quantity INT UNSIGNED NOT NULL, rejected_quantity INT UNSIGNED NOT NULL, short_quantity INT UNSIGNED NOT NULL,
 actor_id CHAR(36) CHARACTER SET ascii COLLATE ascii_bin NOT NULL, actor_name VARCHAR(100) NOT NULL,
 note VARCHAR(1000) NOT NULL, created_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
 FOREIGN KEY(id) REFERENCES finishing_tasks(id), FOREIGN KEY(actor_id) REFERENCES users(id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
CREATE TABLE finished_goods (
 id CHAR(36) CHARACTER SET ascii COLLATE ascii_bin PRIMARY KEY,
 sales_item_id CHAR(36) CHARACTER SET ascii COLLATE ascii_bin NULL,
 remaining_quantity INT UNSIGNED NOT NULL, dispatched_quantity BIGINT UNSIGNED NOT NULL DEFAULT 0,
 returned_quantity BIGINT UNSIGNED NOT NULL DEFAULT 0, restocked_quantity BIGINT UNSIGNED NOT NULL DEFAULT 0,
 version INT UNSIGNED NOT NULL DEFAULT 1, created_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
 FOREIGN KEY(id) REFERENCES finished_goods_acceptances(id), FOREIGN KEY(sales_item_id) REFERENCES sales_order_items(id),
 INDEX ix_finished_goods_item(sales_item_id,remaining_quantity,id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

INSERT INTO business_counters(entity,value) VALUES ('warehouse_dispatches',0),('shipments',0);
CREATE TABLE warehouse_dispatches (
 id CHAR(36) CHARACTER SET ascii COLLATE ascii_bin PRIMARY KEY, code VARCHAR(30) NOT NULL UNIQUE,
 order_id CHAR(36) CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
 status ENUM('DISPATCHED','REVERSED','RESTOCKED') NOT NULL DEFAULT 'DISPATCHED',
 active_slot TINYINT GENERATED ALWAYS AS (IF(status='DISPATCHED',1,NULL)) PERSISTENT,
 method ENUM('INTERNAL_DELIVERY','CUSTOMER_PICKUP','BUS','OTHER') NOT NULL,
 customer_name VARCHAR(150) NOT NULL, customer_phone VARCHAR(50) NOT NULL, address VARCHAR(500) NOT NULL,
 note VARCHAR(1000) NOT NULL, actor_id CHAR(36) CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
 actor_name VARCHAR(100) NOT NULL, version INT UNSIGNED NOT NULL DEFAULT 1,
 created_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
 UNIQUE KEY uq_active_dispatch(order_id,active_slot),
 FOREIGN KEY(order_id) REFERENCES sales_orders(id), FOREIGN KEY(actor_id) REFERENCES users(id),
 INDEX ix_dispatch_date(created_at,id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
CREATE TABLE warehouse_dispatch_items (
 id CHAR(36) CHARACTER SET ascii COLLATE ascii_bin PRIMARY KEY,
 dispatch_id CHAR(36) CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
 good_id CHAR(36) CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
 sales_item_id CHAR(36) CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
 product_name VARCHAR(150) NOT NULL, quantity INT UNSIGNED NOT NULL CHECK(quantity>0),
 UNIQUE KEY uq_dispatch_good(dispatch_id,good_id),
 FOREIGN KEY(dispatch_id) REFERENCES warehouse_dispatches(id), FOREIGN KEY(good_id) REFERENCES finished_goods(id),
 FOREIGN KEY(sales_item_id) REFERENCES sales_order_items(id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
CREATE TABLE shipments (
 id CHAR(36) CHARACTER SET ascii COLLATE ascii_bin PRIMARY KEY, code VARCHAR(30) NOT NULL UNIQUE,
 dispatch_id CHAR(36) CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
 status ENUM('READY','CREATED','PICKUP_PENDING','PICKED_UP','IN_TRANSIT','DELIVERED','DELIVERY_FAILED','RETURNING','RETURNED','CANCELLED') NOT NULL DEFAULT 'READY',
 active_slot TINYINT GENERATED ALWAYS AS (IF(status='CANCELLED',NULL,1)) PERSISTENT,
 receiver_name VARCHAR(150) NOT NULL, receiver_phone VARCHAR(50) NOT NULL, address VARCHAR(500) NOT NULL,
 carrier VARCHAR(150) NOT NULL, tracking_code VARCHAR(150) NOT NULL, note VARCHAR(1000) NOT NULL,
 packages INT UNSIGNED NOT NULL CHECK(packages>0), weight_grams INT UNSIGNED NOT NULL, cod_amount INT UNSIGNED NOT NULL,
 actor_id CHAR(36) CHARACTER SET ascii COLLATE ascii_bin NOT NULL, version INT UNSIGNED NOT NULL DEFAULT 1,
 created_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
 UNIQUE KEY uq_active_shipment(dispatch_id,active_slot),
 FOREIGN KEY(dispatch_id) REFERENCES warehouse_dispatches(id), FOREIGN KEY(actor_id) REFERENCES users(id),
 INDEX ix_shipment_status(status,created_at,id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
CREATE TABLE shipment_history (
 shipment_id CHAR(36) CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
 version INT UNSIGNED NOT NULL, action VARCHAR(40) NOT NULL, status VARCHAR(24) NOT NULL,
 actor_id CHAR(36) CHARACTER SET ascii COLLATE ascii_bin NOT NULL, actor_name VARCHAR(100) NOT NULL,
 note VARCHAR(1000) NOT NULL, created_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
 PRIMARY KEY(shipment_id,version), FOREIGN KEY(shipment_id) REFERENCES shipments(id), FOREIGN KEY(actor_id) REFERENCES users(id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
CREATE TABLE shipment_returns (
 shipment_id CHAR(36) CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
 dispatch_item_id CHAR(36) CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
 quantity INT UNSIGNED NOT NULL CHECK(quantity>0),
 disposition ENUM('RESTOCKED','SCRAPPED','CUSTOMER_HOLD') NOT NULL, note VARCHAR(1000) NOT NULL,
 actor_id CHAR(36) CHARACTER SET ascii COLLATE ascii_bin NOT NULL, actor_name VARCHAR(100) NOT NULL,
 created_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
 PRIMARY KEY(shipment_id,dispatch_item_id),
 FOREIGN KEY(shipment_id) REFERENCES shipments(id), FOREIGN KEY(dispatch_item_id) REFERENCES warehouse_dispatch_items(id),
 FOREIGN KEY(actor_id) REFERENCES users(id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
CREATE TABLE inventory_movements (
 id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
 good_id CHAR(36) CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
 dispatch_item_id CHAR(36) CHARACTER SET ascii COLLATE ascii_bin NULL,
 shipment_id CHAR(36) CHARACTER SET ascii COLLATE ascii_bin NULL,
 kind ENUM('ACCEPTED','DISPATCHED','REVERSED','RESTOCKED','SCRAPPED','CUSTOMER_HOLD') NOT NULL,
 quantity INT UNSIGNED NOT NULL CHECK(quantity>0), available_delta INT NOT NULL,
 actor_id CHAR(36) CHARACTER SET ascii COLLATE ascii_bin NOT NULL, actor_name VARCHAR(100) NOT NULL,
 created_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
 UNIQUE KEY uq_movement_dispatch_line(dispatch_item_id,kind),
 FOREIGN KEY(good_id) REFERENCES finished_goods(id), FOREIGN KEY(dispatch_item_id) REFERENCES warehouse_dispatch_items(id),
 FOREIGN KEY(shipment_id) REFERENCES shipments(id), FOREIGN KEY(actor_id) REFERENCES users(id),
 INDEX ix_inventory_good(good_id,id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
CREATE TABLE workflow_issues (
 id CHAR(36) CHARACTER SET ascii COLLATE ascii_bin PRIMARY KEY,
 handoff_id CHAR(36) CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
 stage ENUM('FINISHING','WAREHOUSE') NOT NULL, issue_type VARCHAR(100) NOT NULL,
 message VARCHAR(1000) NOT NULL, urgent BOOLEAN NOT NULL DEFAULT FALSE,
 status ENUM('OPEN','RESOLVED','CANCELLED') NOT NULL DEFAULT 'OPEN',
 reported_by CHAR(36) CHARACTER SET ascii COLLATE ascii_bin NOT NULL, reporter_name VARCHAR(100) NOT NULL,
 recipient_roles JSON NOT NULL, recipient_users JSON NOT NULL,
 closed_by CHAR(36) CHARACTER SET ascii COLLATE ascii_bin NULL, closed_at DATETIME(3) NULL,
 version INT UNSIGNED NOT NULL DEFAULT 1, created_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
 FOREIGN KEY(handoff_id) REFERENCES production_finishing_handoffs(id), FOREIGN KEY(reported_by) REFERENCES users(id),
 FOREIGN KEY(closed_by) REFERENCES users(id), INDEX ix_fulfillment_issue(handoff_id,status,created_at)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
CREATE TABLE fulfillment_receipts (
 request_id CHAR(36) CHARACTER SET ascii COLLATE ascii_bin PRIMARY KEY,
 actor_id CHAR(36) CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
 request_hash CHAR(64) CHARACTER SET ascii NOT NULL, result_id CHAR(36) CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
 result_version INT UNSIGNED NOT NULL, created_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
 FOREIGN KEY(actor_id) REFERENCES users(id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
