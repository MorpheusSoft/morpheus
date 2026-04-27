import 'package:sqflite/sqflite.dart';
import 'database_helper.dart';

class DatabaseSeeder {
  static Future<void> seedInitialData() async {
    final db = await DatabaseHelper.instance.database;
    
    // Verificamos si ya hay datos semilla
    final count = Sqflite.firstIntValue(await db.rawQuery('SELECT COUNT(*) FROM currencies'));
    if (count != null && count > 0) {
      print('La base de datos POS ya contiene datos.');
      return;
    }

    print('Inyectando Mock Data Inicial (Arquitectura Bimonetaria)...');
    
    await db.transaction((txn) async {
      // 1. Monedas (Currencies)
      // Asumimos USD como moneda Base (Dura)
      await txn.insert('currencies', {
        'code': 'USD',
        'name': 'Dólar Estadounidense',
        'exchange_rate': 1.0,
        'is_base': 1,
        'last_updated_at': DateTime.now().toIso8601String()
      });
      // Asumimos VES como moneda transaccional / local
      await txn.insert('currencies', {
        'code': 'VES',
        'name': 'Bolívar Soberano',
        'exchange_rate': 36.50, // Tasa de prueba
        'is_base': 0,
        'last_updated_at': DateTime.now().toIso8601String()
      });

      // 2. Instrumentos de Pago configurados
      await txn.insert('payment_instruments', {
        'id': 'INST-001',
        'name': 'Efectivo USD',
        'currency_code': 'USD',
        'requires_reference': 0, // No pide referencia de banco
        'is_active': 1
      });
      await txn.insert('payment_instruments', {
        'id': 'INST-002',
        'name': 'Pago Móvil Banesco',
        'currency_code': 'VES',
        'requires_reference': 1, // Exigirá referencia física
        'is_active': 1
      });
      await txn.insert('payment_instruments', {
        'id': 'INST-003',
        'name': 'Zelle',
        'currency_code': 'USD',
        'requires_reference': 1,
        'is_active': 1
      });

      // 3. Series / Talonarios Asignados a esta Caja
      await txn.insert('pos_sequences', {
        'id': 'SEQ-FISCAL-VES',
        'prefix': 'FACT-',
        'current_number': 1,
        'is_active': 1
      });

      // 4. Catálogo de Productos (Precios grabados en Moneda BASE USD)
      await txn.insert('products', {
        'id': 'PROD-001',
        'sku': 'COCA-01',
        'name': 'Refresco Coca-Cola 355ml',
        'base_cost': 0.50,
        'base_price': 1.00,
        'tax_rate': 16.0,
        'local_stock': 450.0,
        'is_active': 1
      });
      await txn.insert('products', {
        'id': 'PROD-002',
        'sku': 'HAR-01',
        'name': 'Harina P.A.N. Blanca 1Kg',
        'base_cost': 0.85,
        'base_price': 1.20,
        'tax_rate': 0.0, // Exento
        'local_stock': 1200.0,
        'is_active': 1
      });

      // 5. Códigos de Barra (El Eslabón Desacoplado)
      // Para producto 1 (Lata individual vs Six-Pack)
      await txn.insert('product_barcodes', {
        'barcode': '7591041001118',
        'product_id': 'PROD-001',
        'presentation': 'Unidad',
        'unit_multiplier': 1.0
      });
      await txn.insert('product_barcodes', {
        'barcode': 'SIX-7591041',
        'product_id': 'PROD-001',
        'presentation': 'Six-Pack',
        'unit_multiplier': 6.0 // Descuenta 6 de inventario y cobra $6 (o un precio en pack modificado a futuro)
      });
      
      // Para producto 2 (Harina suelta vs Bulto)
      await txn.insert('product_barcodes', {
        'barcode': '7591053000109',
        'product_id': 'PROD-002',
        'presentation': 'Paquete 1Kg',
        'unit_multiplier': 1.0
      });
      await txn.insert('product_barcodes', {
        'barcode': 'BULTO-759105',
        'product_id': 'PROD-002',
        'presentation': 'Bulto x20',
        'unit_multiplier': 20.0
      });

    });

    print('¡Seed completado! SQLite POS está cargado con catálogo de pruebas.');
  }
}
