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
      version: 2,
      onCreate: _createDB,
      onUpgrade: (db, oldVersion, newVersion) async {
        await _createTables(db);
      },
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

    // 3.5 Categorías jerárquicas
    await db.execute('''
      CREATE TABLE IF NOT EXISTS cached_categories (
        id INTEGER PRIMARY KEY,
        name TEXT NOT NULL,
        parent_id INTEGER,
        path TEXT
      )
    ''');

    // 4. Catálogo maestro de productos
    await db.execute('''
      CREATE TABLE IF NOT EXISTS cached_products (
        variant_id INTEGER PRIMARY KEY,
        product_id INTEGER,
        category_id INTEGER,
        category_name TEXT,
        sku TEXT NOT NULL,
        name TEXT NOT NULL,
        uom_base TEXT NOT NULL DEFAULT 'UND',
        sales_price REAL DEFAULT 0.0,
        barcodes_json TEXT,
        packagings_json TEXT,
        updated_at TEXT
      )
    ''');

    // Migraciones seguras en caliente para instalaciones existentes
    try {
      await db.execute('ALTER TABLE cached_products ADD COLUMN category_id INTEGER');
    } catch (_) {}
    try {
      await db.execute('ALTER TABLE cached_products ADD COLUMN category_name TEXT');
    } catch (_) {}

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
        scope_value TEXT,
        category_id INTEGER,
        category_name TEXT,
        category_full_path TEXT,
        valid_category_ids_json TEXT,
        valid_variant_ids_json TEXT,
        state TEXT,
        date_start TEXT
      )
    ''');

    try {
      await db.execute('ALTER TABLE cached_inventory_sessions ADD COLUMN scope_value TEXT');
    } catch (_) {}
    try {
      await db.execute('ALTER TABLE cached_inventory_sessions ADD COLUMN category_id INTEGER');
    } catch (_) {}
    try {
      await db.execute('ALTER TABLE cached_inventory_sessions ADD COLUMN category_name TEXT');
    } catch (_) {}
    try {
      await db.execute('ALTER TABLE cached_inventory_sessions ADD COLUMN category_full_path TEXT');
    } catch (_) {}
    try {
      await db.execute('ALTER TABLE cached_inventory_sessions ADD COLUMN valid_category_ids_json TEXT');
    } catch (_) {}
    try {
      await db.execute('ALTER TABLE cached_inventory_sessions ADD COLUMN valid_variant_ids_json TEXT');
    } catch (_) {}

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
    List<dynamic>? categories,
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

      if (categories != null && categories.isNotEmpty) {
        final catBatch = txn.batch();
        catBatch.delete('cached_categories');
        for (final c in categories) {
          catBatch.insert('cached_categories', {
            'id': c['id'],
            'name': c['name'] ?? '',
            'parent_id': c['parent_id'],
            'path': c['path'] ?? '',
          });
        }
        await catBatch.commit(noResult: true);
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
          'category_id': p['category_id'],
          'category_name': p['category_name'],
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

  Future<bool> needsCategoryCatalogRefresh() async {
    try {
      final db = await database;
      final catCnt = Sqflite.firstIntValue(
            await db.rawQuery('SELECT COUNT(*) FROM cached_categories'),
          ) ??
          0;
      if (catCnt == 0) return true;

      final prodTotal = Sqflite.firstIntValue(
            await db.rawQuery('SELECT COUNT(*) FROM cached_products'),
          ) ??
          0;
      if (prodTotal == 0) return true;

      final prodWithCat = Sqflite.firstIntValue(
            await db.rawQuery('SELECT COUNT(*) FROM cached_products WHERE category_id IS NOT NULL'),
          ) ??
          0;
      return prodWithCat == 0;
    } catch (_) {
      return true;
    }
  }

  Future<void> updateCachedProductCategory(int variantId, int? categoryId, String? categoryName) async {
    if (categoryId == null) return;
    try {
      final db = await database;
      await db.update(
        'cached_products',
        {
          'category_id': categoryId,
          if (categoryName != null) 'category_name': categoryName,
        },
        where: 'variant_id = ?',
        whereArgs: [variantId],
      );
    } catch (_) {}
  }

  /// Resuelve jerárquicamente todas las categorías descendientes (Departamento -> Grupo -> Subgrupo)
  Future<Set<int>> getRelatedCategoryIds(int rootCatId) async {
    final result = <int>{rootCatId};
    try {
      final db = await database;
      final allCats = await db.query('cached_categories');
      if (allCats.isEmpty) return result;

      String? rootPath;
      for (final c in allCats) {
        if (c['id'] == rootCatId) {
          final p = (c['path'] ?? '').toString().trim();
          if (p.isNotEmpty) rootPath = p;
          break;
        }
      }

      if (rootPath != null && rootPath.isNotEmpty) {
        final prefix = '$rootPath/';
        for (final c in allCats) {
          final id = c['id'] as int?;
          final p = (c['path'] ?? '').toString().trim();
          if (id != null && (p == rootPath || p.startsWith(prefix))) {
            result.add(id);
          }
        }
      }

      // Recorrido recursivo hacia abajo por parent_id
      final toVisit = <int>[rootCatId];
      final visited = <int>{};
      while (toVisit.isNotEmpty) {
        final curr = toVisit.removeAt(0);
        visited.add(curr);
        for (final c in allCats) {
          final id = c['id'] as int?;
          final parentId = c['parent_id'] as int?;
          if (id != null && parentId == curr) {
            result.add(id);
            if (!visited.contains(id) && !toVisit.contains(id)) {
              toVisit.add(id);
            }
          }
        }
      }
    } catch (_) {}
    return result;
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
          'scope_value': s['scope_value']?.toString(),
          'category_id': s['category_id'],
          'category_name': s['category_name'],
          'category_full_path': s['category_full_path'],
          'valid_category_ids_json': jsonEncode(s['valid_category_ids'] ?? []),
          'valid_variant_ids_json': jsonEncode(s['valid_variant_ids'] ?? []),
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
      final rows = facilityId != null
          ? await db.query(
              'cached_inventory_sessions',
              where: 'facility_id = ?',
              whereArgs: [facilityId],
              orderBy: 'id DESC',
            )
          : await db.query('cached_inventory_sessions', orderBy: 'id DESC');

      return rows.map((r) {
        final map = Map<String, dynamic>.from(r);
        List<int> validCats = [];
        List<int> validVars = [];
        try {
          if (r['valid_category_ids_json'] != null) {
            validCats = (jsonDecode(r['valid_category_ids_json'] as String) as List)
                .map((e) => (e as num).toInt())
                .toList();
          }
        } catch (_) {}
        try {
          if (r['valid_variant_ids_json'] != null) {
            validVars = (jsonDecode(r['valid_variant_ids_json'] as String) as List)
                .map((e) => (e as num).toInt())
                .toList();
          }
        } catch (_) {}
        map['valid_category_ids'] = validCats;
        map['valid_variant_ids'] = validVars;
        return map;
      }).toList();
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

  Future<double> upsertIncrementInventoryCount(Map<String, dynamic> row, double addQty) async {
    final db = await database;
    final sessionId = row['session_id'];
    final variantId = row['variant_id'];

    // Buscar si ya existe una fila pendiente para esta misma variante en esta sesión
    final existing = await db.query(
      'inventory_counts_outbox',
      where: 'session_id = ? AND variant_id = ? AND sync_status = ?',
      whereArgs: [sessionId, variantId, 'PENDING'],
      limit: 1,
    );

    if (existing.isNotEmpty) {
      final oldQty = (existing.first['counted_qty'] as num).toDouble();
      final newQty = oldQty + addQty;
      final clientUuid = existing.first['client_uuid'] as String;
      await db.update(
        'inventory_counts_outbox',
        {
          'counted_qty': newQty,
          'offline_scanned_at': DateTime.now().toIso8601String(),
        },
        where: 'client_uuid = ?',
        whereArgs: [clientUuid],
      );
      return newQty;
    } else {
      row['counted_qty'] = addQty;
      await db.insert('inventory_counts_outbox', row);
      return addQty;
    }
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

  /// Elimina de la lista local de la sesión cualquier producto que no pertenezca a las categorías válidas
  Future<void> purgeInvalidOutboxCountsForSession(int sessionId, Set<int> validCategoryIds) async {
    if (validCategoryIds.isEmpty) return;
    try {
      final db = await database;
      final counts = await db.query(
        'inventory_counts_outbox',
        where: 'session_id = ?',
        whereArgs: [sessionId],
      );
      for (final c in counts) {
        final vid = c['variant_id'] as int?;
        final uuid = c['client_uuid'] as String?;
        if (vid != null && uuid != null) {
          final prodRows = await db.query(
            'cached_products',
            columns: ['category_id'],
            where: 'variant_id = ?',
            whereArgs: [vid],
            limit: 1,
          );
          if (prodRows.isNotEmpty) {
            final prodCatId = prodRows.first['category_id'] as int?;
            if (prodCatId != null && !validCategoryIds.contains(prodCatId)) {
              await db.delete(
                'inventory_counts_outbox',
                where: 'client_uuid = ?',
                whereArgs: [uuid],
              );
            }
          }
        }
      }
    } catch (_) {}
  }
}
