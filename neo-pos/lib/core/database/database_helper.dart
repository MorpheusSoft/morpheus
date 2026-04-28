import 'dart:io';
import 'package:path/path.dart';
import 'package:sqflite/sqflite.dart';
import 'package:path_provider/path_provider.dart';

class DatabaseHelper {
  static const _databaseName = "MorpheusPos.db";
  static const _databaseVersion = 1;

  // Singleton
  DatabaseHelper._privateConstructor();
  static final DatabaseHelper instance = DatabaseHelper._privateConstructor();

  static Database? _database;
  Future<Database> get database async {
    if (_database != null) return _database!;
    _database = await _initDatabase();
    return _database!;
  }

  _initDatabase() async {
    Directory documentsDirectory = await getApplicationDocumentsDirectory();
    String path = join(documentsDirectory.path, _databaseName);
    return await openDatabase(
      path,
      version: _databaseVersion,
      onCreate: _onCreate,
    );
  }

  Future _onCreate(Database db, int version) async {
    // -------------------------------------------------------------------
    // 1. CONFIGURACIÓN LOCAL Y MONEDAS
    // -------------------------------------------------------------------
    await db.execute('''
      CREATE TABLE currencies (
        code TEXT PRIMARY KEY,
        name TEXT,
        exchange_rate REAL,
        is_base INTEGER,
        last_updated_at TEXT
      )
    ''');

    await db.execute('''
      CREATE TABLE payment_instruments (
        id TEXT PRIMARY KEY,
        name TEXT,
        currency_code TEXT,
        requires_reference INTEGER,
        is_active INTEGER,
        FOREIGN KEY (currency_code) REFERENCES currencies (code)
      )
    ''');

    await db.execute('''
      CREATE TABLE pos_sequences (
        id TEXT PRIMARY KEY,
        prefix TEXT,
        current_number INTEGER,
        is_active INTEGER
      )
    ''');

    // -------------------------------------------------------------------
    // 2. CATÁLOGO DE PRODUCTOS (DUAL LEDGER CAPABLE)
    // -------------------------------------------------------------------
    await db.execute('''
      CREATE TABLE products (
        id TEXT PRIMARY KEY,
        sku TEXT,
        name TEXT,
        base_cost REAL,
        base_price REAL,
        tax_rate REAL,
        local_stock REAL,
        is_active INTEGER
      )
    ''');
    await db.execute('CREATE INDEX idx_products_sku ON products(sku)');

    await db.execute('''
      CREATE TABLE product_barcodes (
        barcode TEXT PRIMARY KEY,
        product_id TEXT,
        presentation TEXT,
        unit_multiplier REAL,
        FOREIGN KEY (product_id) REFERENCES products (id)
      )
    ''');
    await db.execute('CREATE INDEX idx_barcodes_product_id ON product_barcodes(product_id)');

    // -------------------------------------------------------------------
    // 3. DIRECCTORIO ESPORÁDICO
    // -------------------------------------------------------------------
    await db.execute('''
      CREATE TABLE local_address_book (
        document_id TEXT PRIMARY KEY,
        name TEXT,
        address TEXT,
        phone TEXT,
        email TEXT,
        is_loyalty_member INTEGER
      )
    ''');

    // -------------------------------------------------------------------
    // 4. TICKETS Y LÍNEAS (DUAL BOOKING)
    // -------------------------------------------------------------------
    await db.execute('''
      CREATE TABLE tickets (
        id TEXT PRIMARY KEY,
        sequence_id TEXT,
        receipt_number TEXT,
        exchange_rate_applied REAL,
        local_currency_code TEXT,
        invoice_document TEXT,
        invoice_name TEXT,
        local_subtotal REAL,
        local_tax_total REAL,
        local_total REAL,
        base_subtotal REAL,
        base_tax_total REAL,
        base_total REAL,
        status TEXT,
        created_at TEXT
      )
    ''');

    await db.execute('''
      CREATE TABLE ticket_lines (
        id TEXT PRIMARY KEY,
        ticket_id TEXT,
        product_id TEXT,
        barcode_scanned TEXT,
        quantity REAL,
        local_unit_cost REAL,
        local_sale_unit_price REAL,
        local_line_total REAL,
        base_unit_cost REAL,
        base_sale_unit_price REAL,
        base_line_total REAL,
        FOREIGN KEY (ticket_id) REFERENCES tickets (id)
      )
    ''');
    await db.execute('CREATE INDEX idx_ticket_lines_ticket_id ON ticket_lines(ticket_id)');

    await db.execute('''
      CREATE TABLE ticket_payments (
        id TEXT PRIMARY KEY,
        ticket_id TEXT,
        instrument_id TEXT,
        amount_tendered REAL,
        exchange_rate_applied REAL,
        reference_number TEXT,
        FOREIGN KEY (ticket_id) REFERENCES tickets (id),
        FOREIGN KEY (instrument_id) REFERENCES payment_instruments (id)
      )
    ''');

    // -------------------------------------------------------------------
    // 5. MOTOR DE SINCRONIZACIÓN OFFLINE-FIRST
    // -------------------------------------------------------------------
    await db.execute('''
      CREATE TABLE outbox_events (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        event_type TEXT,
        payload TEXT,
        status TEXT,
        retry_count INTEGER DEFAULT 0,
        error_message TEXT,
        created_at TEXT
      )
    ''');
  }

  // -------------------------------------------------------------------
  // 6. CUNSULTAS OPERATIVAS POS
  // -------------------------------------------------------------------
  Future<Map<String, dynamic>?> getProductByBarcode(String barcode) async {
    final db = await database;
    final List<Map<String, dynamic>> result = await db.rawQuery('''
      SELECT p.id, p.sku, p.name, p.base_cost, p.base_price, p.tax_rate, b.presentation, b.unit_multiplier
      FROM product_barcodes b
      JOIN products p ON b.product_id = p.id
      WHERE b.barcode = ? AND p.is_active = 1
      LIMIT 1
    ''', [barcode]);
    return result.isNotEmpty ? result.first : null;
  }

  Future<List<Map<String, dynamic>>> searchProductsByName(String query, {bool onlyUnits = false}) async {
    if (query.isEmpty) return [];
    final db = await database;
    
    String additionalFilter = onlyUnits ? 'AND b.unit_multiplier = 1' : '';
    
    return await db.rawQuery('''
      SELECT p.id, p.sku, p.name, p.base_cost, p.base_price, p.tax_rate, b.barcode, b.presentation, b.unit_multiplier
      FROM products p
      JOIN product_barcodes b ON b.product_id = p.id
      WHERE p.name LIKE ? AND p.is_active = 1
      $additionalFilter
      LIMIT 20
    ''', ['%$query%']);
  }

  Future<Map<String, dynamic>?> getCustomerByDocument(String documentId) async {
    final db = await database;
    final List<Map<String, dynamic>> result = await db.query(
      'local_address_book',
      where: 'document_id = ?',
      whereArgs: [documentId],
      limit: 1,
    );
    return result.isNotEmpty ? result.first : null;
  }

  Future<void> saveCustomerLocally(Map<String, dynamic> customerData) async {
    final db = await database;
    await db.insert(
      'local_address_book',
      customerData,
      conflictAlgorithm: ConflictAlgorithm.replace,
    );
  }
}
