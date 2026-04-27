import 'package:flutter/material.dart';
import 'package:provider/provider.dart';
import '../../../../core/providers/cart_provider.dart';
import '../../../theme/app_theme.dart';

class ReceiptTableWidget extends StatelessWidget {
  const ReceiptTableWidget({super.key});

  @override
  Widget build(BuildContext context) {
    final cart = context.watch<CartProvider>();
    
    return Container(
      margin: const EdgeInsets.all(16),
      decoration: BoxDecoration(
        color: AppTheme.surfaceDark,
        borderRadius: BorderRadius.circular(12),
        border: Border.all(color: AppTheme.glassBorder),
      ),
      child: cart.items.isEmpty 
          ? const Center(
              child: Text('CARRITO VACÍO\nEscanea un producto para comenzar', 
              textAlign: TextAlign.center, 
              style: TextStyle(color: AppTheme.textBody)),
            )
          : Column(
              children: [
                // Header Table
                Container(
                  padding: const EdgeInsets.all(12),
                  decoration: const BoxDecoration(
                    border: Border(bottom: BorderSide(color: AppTheme.glassBorder)),
                  ),
                  child: const Row(
                    children: [
                      Expanded(flex: 2, child: Text('CÓDIGO', style: TextStyle(fontWeight: FontWeight.bold))),
                      Expanded(flex: 4, child: Text('PRODUCTO', style: TextStyle(fontWeight: FontWeight.bold))),
                      Expanded(flex: 1, child: Text('CANT', style: TextStyle(fontWeight: FontWeight.bold))),
                      Expanded(flex: 2, child: Text('PRECIO', style: TextStyle(fontWeight: FontWeight.bold))),
                      Expanded(flex: 2, child: Text('SUBTOTAL', style: TextStyle(fontWeight: FontWeight.bold))),
                    ],
                  ),
                ),
                // Data List
                Expanded(
                  child: ListView.builder(
                    itemCount: cart.items.length,
                    itemBuilder: (context, index) {
                      final item = cart.items[index];
                      return Container(
                        padding: const EdgeInsets.all(12),
                        decoration: const BoxDecoration(
                          border: Border(bottom: BorderSide(color: AppTheme.glassBorder, width: 0.5)),
                        ),
                        child: Row(
                          children: [
                            Expanded(flex: 2, child: Text(item.barcode, style: const TextStyle(color: AppTheme.textBody))),
                            Expanded(flex: 4, child: Text(item.name)),
                            Expanded(flex: 1, child: Text(item.quantity.toInt().toString(), style: const TextStyle(fontWeight: FontWeight.bold))),
                            Expanded(flex: 2, child: Text('\$${item.price.toStringAsFixed(2)}', style: const TextStyle(color: AppTheme.textBody))),
                            Expanded(flex: 2, child: Text('\$${item.subtotal.toStringAsFixed(2)}', style: const TextStyle(fontWeight: FontWeight.bold, color: AppTheme.neonCyan))),
                          ],
                        ),
                      );
                    },
                  ),
                ),
              ],
            ),
    );
  }
}
