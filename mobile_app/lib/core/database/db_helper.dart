import 'package:sqflite/sqflite.dart';
import 'package:path/path.dart';

class DatabaseHelper {
  static final DatabaseHelper instance = DatabaseHelper._init();
  static Database? _database;

  DatabaseHelper._init();

  Future<Database> get database async {
    if (_database != null) return _database!;
    _database = await _initDB('morpheus_offline.db');
    return _database!;
  }

  Future<Database> _initDB(String filePath) async {
    final dbPath = await getDatabasesPath();
    final path = join(dbPath, filePath);

    return await openDatabase(
      path,
      version: 1,
      onCreate: _createDB,
    );
  }

  Future _createDB(Database db, int version) async {
    // Customers Table
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

    // Products Table (Catalog)
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

    // Orders Table
    // is_synced: 0 = local only (pending sync), 1 = synced
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

    // Order Items Table
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
  }

  Future close() async {
    final db = await instance.database;
    db.close();
  }
}
