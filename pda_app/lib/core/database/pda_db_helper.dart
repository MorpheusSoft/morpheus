import 'dart:convert';
import 'package:path/path.dart';
import 'package:sqflite/sqflite.dart';

class PdaDatabaseHelper {
  static final PdaDatabaseHelper instance = PdaDatabaseHelper._init();
  static Database? _database;

  PdaDatabaseHelper._init();

  Future<Database> get database async {
    if (_database != null) return _database!;
    _database = await _initDB('neo_pda_storage.db');
    return _database!;
  }

  Future<Database> _initDB(String filePath) async {
    final dbPath = await getDatabasesPath();
    final path = join(dbPath, filePath);

    final db = await openDatabase(
      path,
      version: 1,
      onCreate: _createDB,
    );

    await _createTables(db);
    return db;
  }

  Future _createDB(Database db, int version) async {
    await _createTables(db);
  }

  Future _createTables(Database db) async {
    // 1. Sucursales
    await db.execute('''
      CREATE TABLE IF NOT EXISTS cached_facilities (
        id INTEGER PRIMARY KEY,
        name TEXT NOT NULL,
        code TEXT NOT NULL,
        address TEXT
      )
    ''');

    // 2. Almacenes
    await db.execute('''
      CREATE TABLE IF NOT EXISTS cached_warehouses (
        id INTEGER PRIMARY KEY,
        name TEXT NOT NULL,
        code TEXT NOT NULL,
        facility_id INTEGER,
        is_transit INTEGER DEFAULT 0
      )
    ''');

    // 3. Ubicaciones
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

    // 4. Catálogo maestro de productos
    await db.execute('''
      CREATE TABLE IF NOT EXISTS cached_products (
        variant_id INTEGER PRIMARY KEY,
        product_id INTEGER,
        sku TEXT NOT NULL,
        name TEXT NOT NULL,
        uom_base TEXT NOT NULL DEFAULT 'UND',
        sales_price REAL DEFAULT 0.0,
        barcodes_json TEXT,
        packagings_json TEXT,
        updated_at TEXT
      )
    ''');

    await db.execute('''
      CREATE INDEX IF NOT EXISTS idx_cached_products_sku ON cached_products(sku);
    ''');

    // 5. Sesiones de Inventario
    await db.execute('''
      CREATE TABLE IF NOT EXISTS cached_inventory_sessions (
        id INTEGER PRIMARY KEY,
        name TEXT NOT NULL,
        facility_id INTEGER,
        warehouse_id INTEGER,
        scope_type TEXT,
        state TEXT,
        date_start TEXT
      )
    ''');

    // 6. Bandeja de salida (Outbox) de Conteos Físicos
    await db.execute('''
      CREATE TABLE IF NOT EXISTS inventory_counts_outbox (
        local_id INTEGER PRIMARY KEY AUTOINCREMENT,
        client_uuid TEXT UNIQUE NOT NULL,
        session_id INTEGER,
        session_name TEXT,
        barcode TEXT,
        variant_id INTEGER,
        product_name TEXT,
        sku TEXT,
        facility_id INTEGER,
        warehouse_id INTEGER,
        location_id INTEGER,
        counted_qty REAL NOT NULL,
        uom TEXT DEFAULT 'UND',
        packaging_id INTEGER,
        factor REAL DEFAULT 1.0,
        operator_code TEXT,
        device_id TEXT,
        offline_scanned_at TEXT NOT NULL,
        sync_status TEXT DEFAULT 'PENDING',
        sync_error TEXT,
        created_at TEXT NOT NULL
      )
    ''');

    await db.execute('''
      CREATE INDEX IF NOT EXISTS idx_inventory_sync_status ON inventory_counts_outbox(sync_status);
    ''');
    await db.execute('''
      CREATE INDEX IF NOT EXISTS idx_inventory_session_id ON inventory_counts_outbox(session_id);
    ''');
  }

  // ===========================================================================
  // Búsqueda de Productos en Local
  // ===========================================================================
  Future<Map<String, dynamic>?> findProductByBarcode(String barcode) async {
    final db = await database;
    final cleanCode = barcode.trim().toUpperCase();

    // 1. Coincidencia exacta por SKU
    final skuMatch = await db.query(
      'cached_products',
      where: 'UPPER(sku) = ?',
      whereArgs: [cleanCode],
      limit: 1,
    );
    if (skuMatch.isNotEmpty) {
      return skuMatch.first;
    }

    // 2. Coincidencia dentro de barcodes_json
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

  // ===========================================================================
  // Guardado de Catálogo
  // ===========================================================================
  Future<void> saveCatalogToCache({
    List<dynamic>? facilities,
    required List<dynamic> warehouses,
    required List<dynamic> locations,
    required List<dynamic> products,
  }) async {
    final db = await database;
    await db.transaction((txn) async {
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

  // ===========================================================================
  // Guardado de Sesiones de Inventario
  // ===========================================================================
  Future<void> saveSessionsToCache(List<dynamic> sessions) async {
    final db = await database;
    await db.transaction((txn) async {
      final batch = txn.batch();
      batch.delete('cached_inventory_sessions');
      for (final s in sessions) {
        batch.insert('cached_inventory_sessions', {
          'id': s['id'],
          'name': s['name'],
          'facility_id': s['facility_id'],
          'warehouse_id': s['warehouse_id'],
          'scope_type': s['scope_type'],
          'state': s['state'],
          'date_start': s['date_start'],
        });
      }
      await batch.commit(noResult: true);
    });
  }

  Future<List<Map<String, dynamic>>> getCachedSessions({int? facilityId}) async {
    try {
      final db = await database;
      if (facilityId != null) {
        return await db.query(
          'cached_inventory_sessions',
          where: 'facility_id = ?',
          whereArgs: [facilityId],
          orderBy: 'id DESC',
        );
      }
      return await db.query('cached_inventory_sessions', orderBy: 'id DESC');
    } catch (_) {
      return [];
    }
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

  // ===========================================================================
  // Métodos de Outbox de Conteo de Inventario
  // ===========================================================================
  Future<int> insertInventoryCountOutbox(Map<String, dynamic> row) async {
    final db = await database;
    return await db.insert(
      'inventory_counts_outbox',
      row,
      conflictAlgorithm: ConflictAlgorithm.replace,
    );
  }

  Future<List<Map<String, dynamic>>> getPendingCounts() async {
    final db = await database;
    return await db.query(
      'inventory_counts_outbox',
      where: 'sync_status = ?',
      whereArgs: ['PENDING'],
      orderBy: 'local_id ASC',
    );
  }

  Future<int> getPendingCountsCount() async {
    try {
      final db = await database;
      final result = await db.rawQuery(
        "SELECT COUNT(*) as cnt FROM inventory_counts_outbox WHERE sync_status = 'PENDING'"
      );
      return Sqflite.firstIntValue(result) ?? 0;
    } catch (_) {
      return 0;
    }
  }

  Future<List<Map<String, dynamic>>> getLocalCountsForSession(int? sessionId) async {
    try {
      final db = await database;
      if (sessionId != null) {
        return await db.query(
          'inventory_counts_outbox',
          where: 'session_id = ?',
          whereArgs: [sessionId],
          orderBy: 'local_id DESC',
        );
      }
      return await db.query(
        'inventory_counts_outbox',
        orderBy: 'local_id DESC',
        limit: 100,
      );
    } catch (_) {
      return [];
    }
  }

  Future<void> markCountsAsSynced(List<String> clientUuids) async {
    final db = await database;
    final batch = db.batch();
    for (final uuid in clientUuids) {
      batch.update(
        'inventory_counts_outbox',
        {'sync_status': 'SYNCED', 'sync_error': null},
        where: 'client_uuid = ?',
        whereArgs: [uuid],
      );
    }
    await batch.commit(noResult: true);
  }

  Future<void> markCountError(String clientUuid, String errorMsg) async {
    final db = await database;
    await db.update(
      'inventory_counts_outbox',
      {'sync_status': 'ERROR', 'sync_error': errorMsg},
      where: 'client_uuid = ?',
      whereArgs: [clientUuid],
    );
  }

  Future<void> deleteLocalCount(String clientUuid) async {
    final db = await database;
    await db.delete(
      'inventory_counts_outbox',
      where: 'client_uuid = ?',
      whereArgs: [clientUuid],
    );
  }

  Future<void> updateLocalCountQuantity(String clientUuid, double newQty) async {
    final db = await database;
    await db.update(
      'inventory_counts_outbox',
      {'counted_qty': newQty, 'sync_status': 'PENDING'},
      where: 'client_uuid = ?',
      whereArgs: [clientUuid],
    );
  }
}
