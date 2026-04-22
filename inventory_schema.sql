-- =============================================================================
-- INVENTORY MODULE DATABASE SCHEMA
-- Engine: PostgreSQL
-- Schemas: core (Shared), inv (Inventory)
-- Date: 2026-01-11
-- =============================================================================

-- Enable UUID extension
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- =============================================================================
-- SCHEMAS SETUP
-- =============================================================================
CREATE SCHEMA IF NOT EXISTS core;
CREATE SCHEMA IF NOT EXISTS inv;

-- =============================================================================
-- SECTION 1: CORE SCHEMA (SHARED KERNEL)
-- =============================================================================
-- Used by Inventory, Sales, Purchase, HR, etc.

-- COMPANIES (Multi-Tenant Support - Mock for now)
CREATE TABLE IF NOT EXISTS core.companies (
    id SERIAL PRIMARY KEY,
    name VARCHAR(100) NOT NULL,
    tax_id VARCHAR(50), -- RIF/NIT/RFC
    currency_code VARCHAR(3) DEFAULT 'USD',
    created_at TIMESTAMP DEFAULT NOW()
);

-- FACILITIES (Sedes / Branch Offices)
CREATE TABLE IF NOT EXISTS core.facilities (
    id SERIAL PRIMARY KEY,
    company_id INT REFERENCES core.companies(id),
    name VARCHAR(100) NOT NULL,
    code VARCHAR(20) UNIQUE NOT NULL,
    address TEXT NOT NULL,
    is_active BOOLEAN DEFAULT TRUE,
    created_at TIMESTAMP DEFAULT NOW()
);

-- USERS (Authentication)
CREATE TABLE IF NOT EXISTS core.users (
    id SERIAL PRIMARY KEY,
    email VARCHAR(100) UNIQUE NOT NULL,
    hashed_password VARCHAR(255) NOT NULL,
    full_name VARCHAR(100),
    is_active BOOLEAN DEFAULT TRUE,
    is_superuser BOOLEAN DEFAULT FALSE,
    created_at TIMESTAMP DEFAULT NOW()
);

-- =============================================================================
-- SECTION 2: INVENTORY SCHEMA (inv)
-- =============================================================================

-- 2.1 PHYSICAL STRUCTURE
-- WAREHOUSES
CREATE TABLE IF NOT EXISTS inv.warehouses (
    id SERIAL PRIMARY KEY,
    facility_id INT REFERENCES core.facilities(id), -- Cross-Schema FK
    name VARCHAR(100) NOT NULL,
    code VARCHAR(20) UNIQUE NOT NULL,
    is_scrap BOOLEAN DEFAULT FALSE,
    is_transit BOOLEAN DEFAULT FALSE,
    created_at TIMESTAMP DEFAULT NOW()
);

-- LOCATIONS (BINS/SHELVES)
CREATE TABLE IF NOT EXISTS inv.locations (
    id SERIAL PRIMARY KEY,
    warehouse_id INT REFERENCES inv.warehouses(id),
    parent_id INT REFERENCES inv.locations(id), -- Hierarchical
    name VARCHAR(100) NOT NULL,
    code VARCHAR(50) NOT NULL, -- "A-01-02"
    barcode VARCHAR(100) UNIQUE,
    location_type VARCHAR(20) DEFAULT 'SHELF' CHECK (location_type IN ('SHELF', 'DOCK', 'PICKING', 'TRANSIT', 'SUPPLIER', 'CUSTOMER', 'LOSS', 'PRODUCTION')),
    usage VARCHAR(20) DEFAULT 'INTERNAL' CHECK (usage IN ('INTERNAL', 'EXTERNAL')), -- Internal = My Stock, External = Virtual
    is_blocked BOOLEAN DEFAULT FALSE,
    capacity_volume DECIMAL(12,4) DEFAULT 0,
    created_at TIMESTAMP DEFAULT NOW()
);
CREATE INDEX idx_locations_parent ON inv.locations(parent_id);

-- 2.2 MASTER DATA (PRODUCTS)

-- CATEGORIES
CREATE TABLE IF NOT EXISTS inv.categories (
    id SERIAL PRIMARY KEY,
    parent_id INT REFERENCES inv.categories(id),
    name VARCHAR(100) NOT NULL,
    slug VARCHAR(120) UNIQUE,
    is_active BOOLEAN DEFAULT TRUE,
    path VARCHAR(255)
);
CREATE INDEX idx_category_parent ON inv.categories(parent_id);

-- PRODUCTS (TEMPLATE)
CREATE TABLE IF NOT EXISTS inv.products (
    id SERIAL PRIMARY KEY,
    category_id INT REFERENCES inv.categories(id),
    name VARCHAR(255) NOT NULL,
    brand VARCHAR(100),
    model VARCHAR(100),
    description TEXT,
    
    -- New Fields 2026-01-27
    image_main VARCHAR(255),
    datasheet VARCHAR(255),
    
    product_type VARCHAR(20) NOT NULL DEFAULT 'STOCKED' CHECK (product_type IN ('STOCKED', 'SERVICE', 'CONSUMABLE')),
    uom_base VARCHAR(10) NOT NULL DEFAULT 'PZA',
    has_variants BOOLEAN DEFAULT FALSE,
    is_active BOOLEAN DEFAULT TRUE,
    created_at TIMESTAMP DEFAULT NOW()
);

-- PRODUCT VARIANTS (SKUs)
CREATE TABLE IF NOT EXISTS inv.product_variants (
    id SERIAL PRIMARY KEY,
    product_id INT REFERENCES inv.products(id) ON DELETE CASCADE,
    sku VARCHAR(50) UNIQUE NOT NULL,
    
    -- New Fields 2026-01-27
    part_number VARCHAR(100),
    image VARCHAR(255),
    
    barcode VARCHAR(50), -- Main barcode
    attributes JSONB, -- {"size": "M", "color": "Red"}
    
    -- COSTS
    costing_method VARCHAR(20) DEFAULT 'AVERAGE',
    standard_cost DECIMAL(19,4) DEFAULT 0,
    average_cost DECIMAL(19,4) DEFAULT 0, -- Weighted Average
    last_cost DECIMAL(19,4) DEFAULT 0,
    replacement_cost DECIMAL(19,4) DEFAULT 0,
    
    -- Sales
    sales_price DECIMAL(19,4) DEFAULT 0,
    is_published BOOLEAN DEFAULT FALSE,
    
    weight DECIMAL(12,4) DEFAULT 0,
    is_active BOOLEAN DEFAULT TRUE
);
CREATE INDEX idx_variant_product ON inv.product_variants(product_id);
CREATE INDEX idx_variant_sku ON inv.product_variants(sku);

-- PRODUCT BARCODES (PACKAGING)
CREATE TABLE IF NOT EXISTS inv.product_barcodes (
    id SERIAL PRIMARY KEY,
    product_variant_id INT REFERENCES inv.product_variants(id), -- Linked to specific SKU
    barcode VARCHAR(100) UNIQUE NOT NULL,
    code_type VARCHAR(20) DEFAULT 'BARCODE',
    uom VARCHAR(10) NOT NULL, -- 'BOX_12'
    conversion_factor DECIMAL(12,4) DEFAULT 1,
    weight DECIMAL(12,4),
    dimensions VARCHAR(50) -- LxWxH
);

-- BATCHES
CREATE TABLE IF NOT EXISTS inv.batches (
    id SERIAL PRIMARY KEY,
    product_variant_id INT REFERENCES inv.product_variants(id),
    batch_number VARCHAR(100) NOT NULL,
    expiry_date DATE,
    manufacturing_date DATE,
    is_quarantined BOOLEAN DEFAULT FALSE,
    UNIQUE(product_variant_id, batch_number)
);

-- 2.3 STOCK ENGINE (DOUBLE ENTRY)

-- STOCK PICKING TYPES (Operation Types)
CREATE TABLE IF NOT EXISTS inv.stock_picking_types (
    id SERIAL PRIMARY KEY,
    name VARCHAR(50) NOT NULL, 
    code VARCHAR(20) UNIQUE NOT NULL, 
    sequence_prefix VARCHAR(10) NOT NULL,
    default_location_src_id INT REFERENCES inv.locations(id),
    default_location_dest_id INT REFERENCES inv.locations(id)
);

-- STOCK PICKINGS (Document Headers)
CREATE TABLE IF NOT EXISTS inv.stock_pickings (
    id SERIAL PRIMARY KEY,
    picking_type_id INT REFERENCES inv.stock_picking_types(id),
    name VARCHAR(50) UNIQUE NOT NULL, 
    origin_document VARCHAR(100), 
    facility_id INT REFERENCES core.facilities(id), -- Cross-Schema FK
    
    status VARCHAR(20) DEFAULT 'DRAFT' CHECK (status IN ('DRAFT', 'CONFIRMED', 'DONE', 'CANCELLED')),
    scheduled_date TIMESTAMP,
    date_done TIMESTAMP,
    
    created_at TIMESTAMP DEFAULT NOW()
);

-- STOCK MOVES (The Core)
CREATE TABLE IF NOT EXISTS inv.stock_moves (
    id BIGSERIAL PRIMARY KEY,
    picking_id INT REFERENCES inv.stock_pickings(id) ON DELETE CASCADE,
    product_id INT REFERENCES inv.product_variants(id),
    
    -- DOUBLE ENTRY CORE
    location_src_id INT REFERENCES inv.locations(id) NOT NULL,
    location_dest_id INT REFERENCES inv.locations(id) NOT NULL,
    
    -- QUANTITIES
    quantity_demand DECIMAL(19,4) DEFAULT 0, 
    quantity_done DECIMAL(19,4) DEFAULT 0, 
    uom_id VARCHAR(10) DEFAULT 'PZA', 
    
    -- LIFECYCLE
    state VARCHAR(20) DEFAULT 'DRAFT' CHECK (state IN ('DRAFT', 'CONFIRMED', 'DONE', 'CANCELLED')),
    batch_id INT REFERENCES inv.batches(id),
    
    reference VARCHAR(100), -- Denormalized picking name
    date TIMESTAMP DEFAULT NOW()
);
CREATE INDEX idx_moves_product ON inv.stock_moves(product_id);
CREATE INDEX idx_moves_locations ON inv.stock_moves(location_src_id, location_dest_id);
CREATE INDEX idx_moves_date ON inv.stock_moves(date);



-- =============================================================================
-- SECTION 3: PHYSICAL INVENTORY (AUDIT/COUNTS)
-- =============================================================================

-- INVENTORY SESSIONS (The Event)
CREATE TABLE IF NOT EXISTS inv.inventory_sessions (
    id SERIAL PRIMARY KEY,
    name VARCHAR(100) NOT NULL, -- "Anual 2026"
    facility_id INT REFERENCES core.facilities(id),
    warehouse_id INT REFERENCES inv.warehouses(id), -- Optional scope
    
    state VARCHAR(20) DEFAULT 'DRAFT' CHECK (state IN ('DRAFT', 'IN_PROGRESS', 'CONFIRMING', 'DONE', 'CANCELLED')),
    date_start TIMESTAMP DEFAULT NOW(),
    date_end TIMESTAMP,
    
    created_by INT REFERENCES core.users(id),
    created_at TIMESTAMP DEFAULT NOW()
);

-- INVENTORY LINES (The Counts)
CREATE TABLE IF NOT EXISTS inv.inventory_lines (
    id BIGSERIAL PRIMARY KEY,
    session_id INT REFERENCES inv.inventory_sessions(id) ON DELETE CASCADE,
    product_variant_id INT REFERENCES inv.product_variants(id),
    location_id INT REFERENCES inv.locations(id),
    
    theoretical_qty DECIMAL(19,4) DEFAULT 0, -- Snapshot at start
    counted_qty DECIMAL(19,4) DEFAULT 0, -- Actual input
    difference_qty DECIMAL(19,4) GENERATED ALWAYS AS (counted_qty - theoretical_qty) STORED,
    
    notes TEXT,
    counted_by INT REFERENCES core.users(id),
    updated_at TIMESTAMP DEFAULT NOW()
);
CREATE INDEX idx_inv_lines_session ON inv.inventory_lines(session_id);

-- =============================================================================
-- INITIAL DATA SEEDING
-- =============================================================================

INSERT INTO core.companies (name, currency_code) VALUES ('Mi Empresa S.A.', 'USD');

INSERT INTO core.facilities (company_id, name, code, address) 
SELECT id, 'Sede Principal', 'MAIN', 'Calle Principal #1' FROM core.companies WHERE name='Mi Empresa S.A.';

-- Warehouse and Location seeding depends on the facilities created above
INSERT INTO inv.warehouses (facility_id, name, code) 
SELECT id, 'Almacén General', 'WH01' FROM core.facilities WHERE code='MAIN';

INSERT INTO inv.locations (warehouse_id, name, code, usage, location_type) VALUES 
(NULL, 'Proveedores', 'VIRT_SUPPLIER', 'EXTERNAL', 'SUPPLIER'),
(NULL, 'Clientes', 'VIRT_CUSTOMER', 'EXTERNAL', 'CUSTOMER'),
(NULL, 'Pérdida de Inventario', 'VIRT_LOSS', 'EXTERNAL', 'LOSS'),
(NULL, 'Producción', 'VIRT_PRODUCTION', 'EXTERNAL', 'PRODUCTION');

INSERT INTO inv.locations (warehouse_id, name, code, usage, location_type) 
SELECT id, 'Existencias', 'WH01/STOCK', 'INTERNAL', 'SHELF' FROM inv.warehouses WHERE code='WH01';

INSERT INTO inv.stock_picking_types (name, code, sequence_prefix) VALUES 
('Recepciones', 'IN', 'WH/IN/'),
('Despachos', 'OUT', 'WH/OUT/'),
('Transferencias Internas', 'INT', 'WH/INT/');
