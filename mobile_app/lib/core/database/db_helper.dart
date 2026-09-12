import 'dart:io';
import 'dart:convert';
import 'package:sqflite/sqflite.dart';
import 'package:sqflite_common_ffi/sqflite_ffi.dart';
import 'package:path/path.dart';

class DatabaseHelper {
  static final DatabaseHelper instance = DatabaseHelper._init();
  static Database? _database;

  DatabaseHelper._init();

  Future<Database> get database async {
    if (_database != null) return _database!;
    _database = await _initDB('neo_wms_offline.db');
    return _database!;
  }

  Future<Database> _initDB(String filePath) async {
    // Inicializar FFI en Windows y Linux para soportar SQLite en Desktop
    if (Platform.isWindows || Platform.isLinux) {
      sqfliteFfiInit();
      databaseFactory = databaseFactoryFfi;
    }

    final dbPath = await getDatabasesPath();
    final path = join(dbPath, filePath);

    final db = await openDatabase(
      path,
      version: 3,
      onCreate: _createDB,
      onUpgrade: _upgradeDB,
    );

    // Asegurar siempre que todas las tablas WMS existan
    await _createWmsTables(db);
    return db;
  }

  Future _createDB(Database db, int version) async {
    // Tablas legacy del módulo de pedidos
    await db.execute('''
      CREATE TABLE customers (
        id INTEGER PRIMARY KEY,
        rif TEXT UNIQUE,
        name TEXT NOT NULL,
        address TEXT,
        shipping_address TEXT,
        phone TEXT,
        email TEXT,
        is_active INTEGER DEFAULT 1,
        is_synced INTEGER DEFAULT 1
      )
    ''');

    await db.execute('''
      CREATE TABLE products (
        id INTEGER PRIMARY KEY,
        sku TEXT UNIQUE,
        name TEXT NOT NULL,
        description TEXT,
        price REAL NOT NULL,
        stock INTEGER DEFAULT 0
      )
    ''');

    await db.execute('''
      CREATE TABLE orders (
        local_id INTEGER PRIMARY KEY AUTOINCREMENT,
        server_id INTEGER,
        customer_id INTEGER NOT NULL,
        status TEXT DEFAULT 'PENDING',
        total_amount REAL NOT NULL,
        notes TEXT,
        created_at TEXT NOT NULL,
        is_synced INTEGER DEFAULT 0
      )
    ''');

    await db.execute('''
      CREATE TABLE order_items (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        order_local_id INTEGER NOT NULL,
        product_id INTEGER NOT NULL,
        quantity INTEGER NOT NULL,
        unit_price REAL NOT NULL,
        subtotal REAL NOT NULL,
        FOREIGN KEY (order_local_id) REFERENCES orders (local_id) ON DELETE CASCADE
      )
    ''');

    // Tablas Neo WMS para Operación Offline
    await _createWmsTables(db);
  }

  Future _upgradeDB(Database db, int oldVersion, int newVersion) async {
    await _createWmsTables(db);
  }

  Future _createWmsTables(Database db) async {
    // 0. Localidades / Sucursales en caché local
    await db.execute('''
      CREATE TABLE IF NOT EXISTS cached_facilities (
        id INTEGER PRIMARY KEY,
        name TEXT NOT NULL,
        code TEXT NOT NULL,
        address TEXT
      )
    ''');

    // 1. Almacenes en caché local
    await db.execute('''
      CREATE TABLE IF NOT EXISTS cached_warehouses (
        id INTEGER PRIMARY KEY,
        name TEXT NOT NULL,
        code TEXT NOT NULL,
        facility_id INTEGER,
        is_transit INTEGER DEFAULT 0
      )
    ''');

    // 2. Ubicaciones en caché local
    await db.execute('''
      CREATE TABLE IF NOT EXISTS cached_locations (
        id INTEGER PRIMARY KEY,
        warehouse_id INTEGER NOT NULL,
        name TEXT NOT NULL,
        code TEXT NOT NULL,
        barcode TEXT,
        location_type TEXT
      )
    ''');

    // 3. Catálogo maestro de productos y códigos escaneables
    await db.execute('''
      CREATE TABLE IF NOT EXISTS cached_products (
        variant_id INTEGER PRIMARY KEY,
        product_id INTEGER,
        sku TEXT NOT NULL,
        name TEXT NOT NULL,
        uom_base TEXT DEFAULT 'UND',
        sales_price REAL DEFAULT 0.0,
        barcodes_json TEXT,
        packagings_json TEXT,
        updated_at TEXT
      )
    ''');

    // Índice para búsqueda ultra-rápida por SKU
    await db.execute('''
      CREATE INDEX IF NOT EXISTS idx_cached_products_sku ON cached_products(sku);
    ''');

    // 4. Bandeja de Salida (Outbox) de Reubicaciones
    await db.execute('''
      CREATE TABLE IF NOT EXISTS relocation_outbox (
        local_id INTEGER PRIMARY KEY AUTOINCREMENT,
        client_uuid TEXT UNIQUE NOT NULL,
        barcode TEXT,
        variant_id INTEGER,
        product_name TEXT,
        sku TEXT,
        source_warehouse_id INTEGER NOT NULL,
        source_warehouse_name TEXT,
        dest_warehouse_id INTEGER NOT NULL,
        dest_warehouse_name TEXT,
        source_location_id INTEGER,
        dest_location_id INTEGER,
        quantity REAL NOT NULL,
        uom TEXT DEFAULT 'UND',
        operator_code TEXT,
        device_id TEXT,
        offline_scanned_at TEXT NOT NULL,
        sync_status TEXT DEFAULT 'PENDING',
        sync_error TEXT,
        has_discrepancy INTEGER DEFAULT 0,
        created_at TEXT NOT NULL
      )
    ''');

    await db.execute('''
      CREATE INDEX IF NOT EXISTS idx_relocation_sync_status ON relocation_outbox(sync_status);
    ''');
  }

  // ===========================================================================
  // MÉTODOS WMS: Búsqueda Local de Producto por Código de Barras o SKU
  // ===========================================================================
  Future<Map<String, dynamic>?> findProductByBarcode(String barcode) async {
    final db = await database;
    final cleanCode = barcode.trim().toUpperCase();

    // 1. Buscar coincidencia exacta por SKU
    final skuMatch = await db.query(
      'cached_products',
      where: 'UPPER(sku) = ?',
      whereArgs: [cleanCode],
      limit: 1,
    );
    if (skuMatch.isNotEmpty) {
      return skuMatch.first;
    }

    // 2. Buscar dentro de barcodes_json
    final allProducts = await db.query('cached_products');
    for (final row in allProducts) {
      final barcodesJson = row['barcodes_json'] as String?;
      if (barcodesJson != null && barcodesJson.isNotEmpty) {
        try {
          final List barcodes = jsonDecode(barcodesJson);
          for (final b in barcodes) {
            final code = (b['barcode'] ?? '').toString().trim().toUpperCase();
            if (code == cleanCode) {
              return row;
            }
          }
        } catch (_) {}
      }
    }

    return null;
  }

  Future<Map<String, dynamic>?> findLocationByBarcode(String barcode) async {
    final db = await database;
    final cleanCode = barcode.trim().toUpperCase();
    final res = await db.query(
      'cached_locations',
      where: 'UPPER(barcode) = ? OR UPPER(code) = ?',
      whereArgs: [cleanCode, cleanCode],
      limit: 1,
    );
    if (res.isNotEmpty) return res.first;
    return null;
  }

  // ===========================================================================
  // MÉTODOS WMS: Guardado en Outbox (Registro Offline Inmediato)
  // ===========================================================================
  Future<int> insertRelocationOutbox(Map<String, dynamic> row) async {
    final db = await database;
    return await db.insert(
      'relocation_outbox',
      row,
      conflictAlgorithm: ConflictAlgorithm.replace,
    );
  }

  Future<List<Map<String, dynamic>>> getPendingRelocations() async {
    final db = await database;
    return await db.query(
      'relocation_outbox',
      where: 'sync_status = ?',
      whereArgs: ['PENDING'],
      orderBy: 'local_id ASC',
    );
  }

  Future<int> getPendingRelocationsCount() async {
    final db = await database;
    final result = await db.rawQuery(
      "SELECT COUNT(*) as cnt FROM relocation_outbox WHERE sync_status = 'PENDING'"
    );
    return Sqflite.firstIntValue(result) ?? 0;
  }

  Future<void> markRelocationsAsSynced(List<String> clientUuids) async {
    final db = await database;
    final batch = db.batch();
    for (final uuid in clientUuids) {
      batch.update(
        'relocation_outbox',
        {'sync_status': 'SYNCED', 'sync_error': null},
        where: 'client_uuid = ?',
        whereArgs: [uuid],
      );
    }
    await batch.commit(noResult: true);
  }

  Future<void> markRelocationError(String clientUuid, String errorMsg) async {
    final db = await database;
    await db.update(
      'relocation_outbox',
      {'sync_status': 'ERROR', 'sync_error': errorMsg},
      where: 'client_uuid = ?',
      whereArgs: [clientUuid],
    );
  }

  // ===========================================================================
  // MÉTODOS WMS: Guardar Catálogo Descargado en Local
  // ===========================================================================
  Future<void> saveCatalogToCache({
    List<dynamic>? facilities,
    required List<dynamic> warehouses,
    required List<dynamic> locations,
    required List<dynamic> products,
  }) async {
    final db = await database;
    await db.transaction((txn) async {
      // Guardar Localidades / Sucursales
      if (facilities != null && facilities.isNotEmpty) {
        final facBatch = txn.batch();
        facBatch.delete('cached_facilities');
        for (final f in facilities) {
          facBatch.insert('cached_facilities', {
            'id': f['id'],
            'name': f['name'],
            'code': f['code'],
            'address': f['address'] ?? '',
          });
        }
        await facBatch.commit(noResult: true);
      }

      // Guardar Almacenes
      final whBatch = txn.batch();
      whBatch.delete('cached_warehouses');
      for (final wh in warehouses) {
        whBatch.insert('cached_warehouses', {
          'id': wh['id'],
          'name': wh['name'],
          'code': wh['code'],
          'facility_id': wh['facility_id'],
          'is_transit': wh['is_transit'] == true ? 1 : 0,
        });
      }
      await whBatch.commit(noResult: true);

      // Guardar Ubicaciones
      final locBatch = txn.batch();
      locBatch.delete('cached_locations');
      for (final loc in locations) {
        locBatch.insert('cached_locations', {
          'id': loc['id'],
          'warehouse_id': loc['warehouse_id'],
          'name': loc['name'],
          'code': loc['code'],
          'barcode': loc['barcode'],
          'location_type': loc['location_type'],
        });
      }
      await locBatch.commit(noResult: true);

      // Guardar Productos y Códigos de Barra
      final prodBatch = txn.batch();
      prodBatch.delete('cached_products');
      final now = DateTime.now().toIso8601String();
      for (final p in products) {
        prodBatch.insert('cached_products', {
          'variant_id': p['variant_id'],
          'product_id': p['product_id'],
          'sku': p['sku'],
          'name': p['name'],
          'uom_base': p['uom_base'] ?? 'UND',
          'sales_price': (p['sales_price'] ?? 0.0).toDouble(),
          'barcodes_json': jsonEncode(p['barcodes'] ?? []),
          'packagings_json': jsonEncode(p['packagings'] ?? []),
          'updated_at': now,
        });
      }
      await prodBatch.commit(noResult: true);
    });
  }

  Future<List<Map<String, dynamic>>> getCachedFacilities() async {
    try {
      final db = await database;
      return await db.query('cached_facilities', orderBy: 'name ASC');
    } catch (_) {
      return [];
    }
  }

  Future<List<Map<String, dynamic>>> getCachedWarehouses({int? facilityId}) async {
    try {
      final db = await database;
      if (facilityId != null) {
        return await db.query(
          'cached_warehouses',
          where: 'facility_id = ?',
          whereArgs: [facilityId],
          orderBy: 'name ASC',
        );
      }
      return await db.query('cached_warehouses', orderBy: 'name ASC');
    } catch (_) {
      return [];
    }
  }

  Future<List<Map<String, dynamic>>> getCachedLocations(int warehouseId) async {
    try {
      final db = await database;
      return await db.query(
        'cached_locations',
        where: 'warehouse_id = ?',
        whereArgs: [warehouseId],
        orderBy: 'name ASC',
      );
    } catch (_) {
      return [];
    }
  }

  Future close() async {
    final db = await instance.database;
    db.close();
  }
}
