import 'package:sqflite/sqflite.dart';
import 'package:flutter/foundation.dart';
import '../models/customer.dart';
import '../models/order.dart';
import '../database/db_helper.dart';
import '../api/api_service.dart';

class SyncService {
  final ApiService apiService = ApiService();
  final DatabaseHelper dbHelper = DatabaseHelper.instance;

  // 1. Sync Catalog (Down)
  Future<void> syncCatalog() async {
    try {
      final List<dynamic> productsJson = await apiService.fetchCatalog();
      final db = await dbHelper.database;

      await db.transaction((txn) async {
        // Clear existing catalog for simplicity, or handle updates
        await txn.delete('products');
        
        for (var p in productsJson) {
          // Adjust parsing logic based on backend response shape.
          final productMap = {
            'id': p['id'],
            'sku': p['sku'] ?? 'N/A',
            'name': p['name'],
            'description': p['description'],
            'price': p['default_price'] ?? 0.0,
            'stock': 0, // Simplified inventory tracking
          };
          
          await txn.insert('products', productMap, conflictAlgorithm: ConflictAlgorithm.replace);
        }
      });
      if (kDebugMode) {
        print('Catalog synced successfully');
      }
    } catch (e) {
      if (kDebugMode) {
        print('Error syncing catalog: $e');
      }
      rethrow;
    }
  }

  // 2. Sync Customers (Down and Up)
  Future<void> syncCustomers() async {
      try {
        final db = await dbHelper.database;
        
        // Push local customers
        final localCustomersMap = await db.query('customers', where: 'is_synced = ?', whereArgs: [0]);
        for (var map in localCustomersMap) {
            final c = Customer.fromMap(map);
            final resp = await apiService.createCustomer(c.toJson());
            // Update local ID to server ID
            await db.update('customers', {'id': resp['id'], 'is_synced': 1}, where: 'local_id = ?', whereArgs: [c.id]);
        }

        // Pull remote customers
        final List<dynamic> customersJson = await apiService.fetchCustomers();
        await db.transaction((txn) async {
            for(var json in customersJson) {
                final c = Customer.fromJson(json);
                await txn.insert('customers', c.toMap(), conflictAlgorithm: ConflictAlgorithm.replace);
            }
        });

      } catch (e) {
         if (kDebugMode) {
           print('Error syncing customers: $e');
         }
         rethrow;
      }
  }

  // 3. Sync pending orders (Up)
  Future<void> syncOrders() async {
     try {
        final db = await dbHelper.database;

        final pendingOrdersMap = await db.query('orders', where: 'is_synced = ?', whereArgs: [0]);
        for(var om in pendingOrdersMap) {
            final localId = om['local_id'] as int;
            
            // Get Items
            final itemsMap = await db.query('order_items', where: 'order_local_id = ?', whereArgs: [localId]);
            final List<OrderItem> itemsList = itemsMap.map((im) => OrderItem(
                productId: im['product_id'] as int,
                quantity: im['quantity'] as int,
                unitPrice: (im['unit_price'] as num).toDouble(),
                subtotal: (im['subtotal'] as num).toDouble(),
            )).toList();

            final order = Order(
                customerId: om['customer_id'] as int,
                status: om['status'] as String,
                totalAmount: (om['total_amount'] as num).toDouble(),
                notes: om['notes'] as String?,
                createdAt: om['created_at'] as String,
                items: itemsList
            );

            // Push to Backend
            final resp = await apiService.createOrder(order.toApiJson());

            // Update local entry as synced (mark server_id and is_synced)
            await db.update(
                'orders', 
                {'server_id': resp['id'], 'is_synced': 1}, 
                where: 'local_id = ?', 
                whereArgs: [localId]
            );
        }
     } catch (e) {
         if (kDebugMode) {
           print('Error syncing orders: $e');
         }
         rethrow;
      }
  }

  Future<void> syncAll() async {
    await syncCatalog();
    await syncCustomers();
    await syncOrders();
  }
}
