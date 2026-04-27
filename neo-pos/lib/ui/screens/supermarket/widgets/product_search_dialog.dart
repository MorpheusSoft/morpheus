import 'package:flutter/material.dart';
import 'package:provider/provider.dart';
import '../../../../core/database/database_helper.dart';
import '../../../../core/providers/cart_provider.dart';
import '../../../theme/app_theme.dart';

class ProductSearchDialog extends StatefulWidget {
  const ProductSearchDialog({super.key});

  @override
  State<ProductSearchDialog> createState() => _ProductSearchDialogState();
}

class _ProductSearchDialogState extends State<ProductSearchDialog> {
  final TextEditingController _controller = TextEditingController();
  List<Map<String, dynamic>> _results = [];
  bool _onlyUnits = false; // Mantiene la herencia híbrida solicitada

  void _search() async {
    final query = _controller.text;
    final results = await DatabaseHelper.instance.searchProductsByName(query, onlyUnits: _onlyUnits);
    setState(() {
      _results = results;
    });
  }

  @override
  Widget build(BuildContext context) {
    return Dialog(
      backgroundColor: AppTheme.slateGrey,
      child: Container(
        width: 700,
        height: 550,
        padding: const EdgeInsets.all(24),
        child: Column(
          children: [
            Row(
              mainAxisAlignment: MainAxisAlignment.spaceBetween,
              children: [
                const Text('Búsqueda de Producto', style: TextStyle(fontSize: 20, color: Colors.white, fontWeight: FontWeight.bold)),
                Row(
                  children: [
                    const Text('Solo Unidades (Filtrar Empaques)', style: TextStyle(color: AppTheme.textBody, fontSize: 13)),
                    Switch(
                      value: _onlyUnits,
                      activeColor: AppTheme.neonCyan,
                      onChanged: (val) {
                        setState(() {
                          _onlyUnits = val;
                          _search();
                        });
                      },
                    ),
                  ],
                ),
              ],
            ),
            const SizedBox(height: 16),
            TextField(
              controller: _controller,
              autofocus: true,
              style: const TextStyle(color: Colors.white),
              onChanged: (_) => _search(),
              decoration: const InputDecoration(
                filled: true,
                fillColor: AppTheme.surfaceDark,
                hintText: 'Escriba el nombre del producto...',
                hintStyle: TextStyle(color: AppTheme.textBody),
                border: OutlineInputBorder(),
                suffixIcon: Icon(Icons.search, color: AppTheme.neonCyan),
              ),
            ),
            const SizedBox(height: 16),
            Expanded(
              child: _results.isEmpty 
                  ? const Center(child: Text('No hay resultados o inicie búsqueda', style: TextStyle(color: AppTheme.textBody)))
                  : ListView.builder(
                      itemCount: _results.length,
                      itemBuilder: (context, index) {
                        final item = _results[index];
                        final String presentation = item['presentation'];
                        final String displayName = presentation != 'Unidad' ? '${item['name']} ($presentation)' : item['name'];
                        final double multiplier = item['unit_multiplier'] ?? 1.0;
                        final double displayPrice = item['base_price'] * multiplier;

                        return ListTile(
                          title: Text(displayName, style: const TextStyle(color: Colors.white)),
                          subtitle: Text('SKU: ${item['sku']} | Código: ${item['barcode']}'),
                          trailing: Text('\$${displayPrice.toStringAsFixed(2)}', style: const TextStyle(color: AppTheme.neonCyan, fontWeight: FontWeight.bold, fontSize: 16)),
                          onTap: () {
                            context.read<CartProvider>().scanProduct(item['barcode']);
                            Navigator.of(context).pop();
                          },
                        );
                      },
                    ),
            ),
            const SizedBox(height: 16),
            Align(
              alignment: Alignment.centerRight,
              child: ElevatedButton(
                style: ElevatedButton.styleFrom(backgroundColor: AppTheme.surfaceDark),
                onPressed: () => Navigator.of(context).pop(),
                child: const Text('Cerrar', style: TextStyle(color: Colors.white)),
              ),
            )
          ],
        ),
      ),
    );
  }
}
