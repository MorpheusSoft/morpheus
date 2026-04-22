import 'package:flutter/material.dart';
import '../../core/database/db_helper.dart';
import '../../core/models/product.dart';
import '../../core/sync/sync_service.dart';
import 'package:provider/provider.dart';
import '../../core/providers/cart_provider.dart';

class CatalogView extends StatefulWidget {
  const CatalogView({super.key});

  @override
  State<CatalogView> createState() => _CatalogViewState();
}

class _CatalogViewState extends State<CatalogView> {
  final dbHelper = DatabaseHelper.instance;
  final syncService = SyncService();
  String _searchQuery = '';
  bool _isSyncing = false;

  Future<List<Product>> _fetchProducts() async {
    final db = await dbHelper.database;
    final maps = await db.query(
      'products',
      where: _searchQuery.isNotEmpty ? 'name LIKE ? OR sku LIKE ?' : null,
      whereArgs: _searchQuery.isNotEmpty ? ['%\$_searchQuery%', '%\$_searchQuery%'] : null,
    );
    return maps.map((m) => Product.fromMap(m)).toList();
  }

  Future<void> _handleSync() async {
    setState(() {
      _isSyncing = true;
    });
    try {
      await syncService.syncAll();
      if (mounted) {
        ScaffoldMessenger.of(context).showSnackBar(
          const SnackBar(content: Text('Sync completed successfully')),
        );
      }
    } catch (e) {
      if (mounted) {
        ScaffoldMessenger.of(context).showSnackBar(
          SnackBar(content: Text('Sync failed: \$e')),
        );
      }
    } finally {
      setState(() {
        _isSyncing = false;
      });
    }
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      appBar: AppBar(
        title: const Text('Catálogo de Productos'),
        actions: [
          IconButton(
            icon: _isSyncing 
                ? const SizedBox(
                    width: 24, 
                    height: 24, 
                    child: CircularProgressIndicator(color: Colors.white, strokeWidth: 2)
                  )
                : const Icon(Icons.sync),
            onPressed: _isSyncing ? null : _handleSync,
            tooltip: 'Sincronizar Datos',
          ),
          IconButton(
             icon: const Icon(Icons.shopping_cart),
             onPressed: () {
                 if (mounted) {
                     Navigator.pushNamed(context, '/cart');
                 }
             },
          )
        ],
      ),
      body: Column(
        children: [
          Padding(
            padding: const EdgeInsets.all(8.0),
            child: TextField(
              decoration: const InputDecoration(
                labelText: 'Buscar producto (Nombre, SKU)',
                prefixIcon: Icon(Icons.search),
                border: OutlineInputBorder(),
              ),
              onChanged: (value) {
                setState(() {
                  _searchQuery = value;
                });
              },
            ),
          ),
          Expanded(
            child: FutureBuilder<List<Product>>(
              future: _fetchProducts(),
              builder: (context, snapshot) {
                if (snapshot.connectionState == ConnectionState.waiting) {
                  return const Center(child: CircularProgressIndicator());
                } else if (snapshot.hasError) {
                  return Center(child: Text('Error: \${snapshot.error}'));
                } else if (!snapshot.hasData || snapshot.data!.isEmpty) {
                  return const Center(child: Text('No hay productos disponibles. Por favor sincroniza.'));
                }

                final products = snapshot.data!;
                return GridView.builder(
                  padding: const EdgeInsets.all(8.0),
                  gridDelegate: const SliverGridDelegateWithFixedCrossAxisCount(
                    crossAxisCount: 2,
                    crossAxisSpacing: 8,
                    mainAxisSpacing: 8,
                    childAspectRatio: 0.8, // Adjust as needed
                  ),
                  itemCount: products.length,
                  itemBuilder: (context, index) {
                    final p = products[index];
                    return Card(
                      elevation: 4,
                      child: Padding(
                        padding: const EdgeInsets.all(8.0),
                        child: Column(
                          crossAxisAlignment: CrossAxisAlignment.start,
                          children: [
                            const Expanded(
                              child: Center(
                                child: Icon(Icons.image, size: 60, color: Colors.grey),
                              ),
                            ),
                            const SizedBox(height: 8),
                            Text(p.name, style: const TextStyle(fontWeight: FontWeight.bold), maxLines: 2, overflow: TextOverflow.ellipsis),
                            Text(p.sku, style: const TextStyle(color: Colors.grey, fontSize: 12)),
                            const SizedBox(height: 4),
                            Row(
                              mainAxisAlignment: MainAxisAlignment.spaceBetween,
                              children: [
                                Text('\$\${p.price.toStringAsFixed(2)}', style: const TextStyle(color: Colors.green, fontWeight: FontWeight.bold)),
                                IconButton(
                                  icon: const Icon(Icons.add_shopping_cart, size: 20),
                                  onPressed: () {
                                    Provider.of<CartProvider>(context, listen: false).addItem(p);
                                    ScaffoldMessenger.of(context).showSnackBar(
                                        SnackBar(content: Text('\${p.name} agregado al carrito'), duration: const Duration(seconds: 1)),
                                    );
                                  },
                                )
                              ],
                            )
                          ],
                        ),
                      ),
                    );
                  },
                );
              },
            ),
          ),
        ],
      ),
    );
  }
}
