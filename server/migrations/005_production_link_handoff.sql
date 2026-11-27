ALTER TABLE production_finishing_handoffs ADD COLUMN superseded_at DATETIME(3) NULL;
CREATE TABLE production_design_prints (
 order_id CHAR(36) CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
 design_id CHAR(36) CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
 created_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
 PRIMARY KEY(order_id,design_id), FOREIGN KEY(order_id) REFERENCES production_orders(id), FOREIGN KEY(design_id) REFERENCES saved_designs(id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
INSERT INTO production_design_prints(order_id,design_id)
 SELECT DISTINCT o.id,v.design_id FROM production_orders o JOIN production_items i ON i.order_id=o.id JOIN design_versions v ON v.id=i.design_version_id WHERE o.status='PRINTED'
 UNION
 SELECT DISTINCT o.id,v.design_id FROM production_orders o JOIN production_items i ON i.order_id=o.id JOIN production_allocations a ON a.production_item_id=i.id JOIN sales_order_items s ON s.id=a.sales_item_id JOIN design_versions v ON v.id=s.design_version_id WHERE o.status='PRINTED' AND a.state='ACTIVE' AND a.kind<>'TRACE';
