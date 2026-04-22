import 'package:flutter/material.dart';
import 'package:provider/provider.dart';
import '../../core/providers/cart_provider.dart';
import '../../core/database/db_helper.dart';

class CartView extends StatefulWidget {
  const CartView({super.key});

  @override
  State<CartView> createState() => _CartViewState();
}

class _CartViewState extends State<CartView> {
  final dbHelper = DatabaseHelper.instance;

  Future<void> _processOrder(BuildContext context, CartProvider cart) async {
    final customerId = await _selectCustomerDialog(context);
    if (customerId == null) return;
    if (!context.mounted) return;

    final db = await dbHelper.database;
    final totalAmount = cart.totalAmount;

    try {
      await db.transaction((txn) async {
         final orderId = await txn.insert('orders', {
            'customer_id': customerId,
            'status': 'PENDING',
            'total_amount': totalAmount,
            'notes': 'Pedido manual desde App',
            'created_at': DateTime.now().toIso8601String(),
            'is_synced': 0
         });

         final items = cart.toOrderItems(orderId);
         for(var item in items) {
             await txn.insert('order_items', item.toDbMap(orderId));
         }
      });
      cart.clear();
      
      if (!context.mounted) return;
      ScaffoldMessenger.of(context).showSnackBar(const SnackBar(content: Text('Pedido guardado exitosamente (Offline)')));
      Navigator.pop(context);
    } catch (e) {
      if (!context.mounted) return;
      ScaffoldMessenger.of(context).showSnackBar(SnackBar(content: Text('Error guardando pedido: \$e')));
    }
  }

  Future<int?> _selectCustomerDialog(BuildContext context) async {
    final db = await dbHelper.database;
    final customers = await db.query('customers');
    
    if (customers.isEmpty) {
        if (!context.mounted) return null;
        ScaffoldMessenger.of(context).showSnackBar(const SnackBar(content: Text('No hay clientes locales. Sincronice primero o cree uno.')));
        return null;
    }

    if (!context.mounted) return null;
    return showDialog<int>(
      context: context,
      builder: (ctx) {
        return AlertDialog(
          title: const Text('Seleccionar Cliente'),
          content: SizedBox(
            width: double.maxFinite,
            child: ListView.builder(
              shrinkWrap: true,
              itemCount: customers.length,
              itemBuilder: (context, index) {
                 final c = customers[index];
                 return ListTile(
                    title: Text(c['name'] as String),
                    subtitle: Text(c['rif'] as String),
                    onTap: () => Navigator.pop(ctx, c['id'] as int),
                 );
              }
            )
          ),
          actions: [
             TextButton(onPressed: () => Navigator.pop(ctx), child: const Text('Cancelar'))
          ]
        );
      }
    );
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      appBar: AppBar(
        title: const Text('Carrito'),
      ),
      body: Consumer<CartProvider>(
        builder: (context, cart, child) {
          if (cart.items.isEmpty) {
            return const Center(child: Text('El carrito está vacío'));
          }
          return Column(
            children: [
              Expanded(
                child: ListView.builder(
                  itemCount: cart.items.length,
                  itemBuilder: (context, index) {
                    final item = cart.items.values.toList()[index];
                    return ListTile(
                      title: Text(item.product.name),
                      subtitle: Text('Cantidad: \${item.quantity} x \$\${item.product.price.toStringAsFixed(2)}'),
                      trailing: Row(
                        mainAxisSize: MainAxisSize.min,
                        children: [
                          IconButton(
                            icon: const Icon(Icons.remove),
                            onPressed: () => cart.updateQuantity(item.product.id, item.quantity - 1),
                          ),
                          Text('\$\${item.subtotal.toStringAsFixed(2)}'),
                          IconButton(
                             icon: const Icon(Icons.delete, color: Colors.red),
                             onPressed: () => cart.removeItem(item.product.id),
                          )
                        ],
                      ),
                    );
                  },
                ),
              ),
              Card(
                margin: const EdgeInsets.all(16),
                child: Padding(
                  padding: const EdgeInsets.all(16),
                  child: Row(
                    mainAxisAlignment: MainAxisAlignment.spaceBetween,
                    children: [
                      const Text('Total:', style: TextStyle(fontSize: 20, fontWeight: FontWeight.bold)),
                      Text('\$\${cart.totalAmount.toStringAsFixed(2)}', style: const TextStyle(fontSize: 20, fontWeight: FontWeight.bold, color: Colors.green)),
                    ],
                  ),
                ),
              ),
              Padding(
                padding: const EdgeInsets.symmetric(horizontal: 16.0, vertical: 8.0),
                child: SizedBox(
                  width: double.infinity,
                  child: ElevatedButton(
                    onPressed: () => _processOrder(context, cart),
                    style: ElevatedButton.styleFrom(
                       padding: const EdgeInsets.all(16),
                       textStyle: const TextStyle(fontSize: 18)
                    ),
                    child: const Text('Confirmar Pedido'),
                  ),
                ),
              ),
              const SizedBox(height: 16),
            ],
          );
        },
      ),
    );
  }
}
