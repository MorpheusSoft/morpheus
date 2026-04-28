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
      child: Column(
        children: [
          // Encabezado de Empresa (Logo e Información)
          Container(
            padding: const EdgeInsets.all(16),
            decoration: const BoxDecoration(
              border: Border(bottom: BorderSide(color: AppTheme.glassBorder)),
            ),
            child: Row(
              children: [
                // Logo placeholder
                Container(
                  width: 48,
                  height: 48,
                  decoration: BoxDecoration(
                    color: AppTheme.glassBorder.withOpacity(0.2),
                    borderRadius: BorderRadius.circular(8),
                  ),
                  child: const Icon(Icons.storefront, color: AppTheme.neonCyan, size: 28),
                ),
                const SizedBox(width: 16),
                // Nombre de la Empresa e Info
                const Expanded(
                  child: Column(
                    crossAxisAlignment: CrossAxisAlignment.start,
                    children: [
                      Text(
                        'MORPHEUS RETAIL', 
                        style: TextStyle(fontSize: 20, fontWeight: FontWeight.bold, color: Colors.white, letterSpacing: 1.2)
                      ),
                      Text(
                        'RIF: J-12345678-9 • SUCURSAL ESTE', 
                        style: TextStyle(fontSize: 12, color: AppTheme.textBody)
                      ),
                    ],
                  ),
                ),
                // Info de la Caja
                const Column(
                  crossAxisAlignment: CrossAxisAlignment.end,
                  children: [
                    Text(
                      'CAJA 04', 
                      style: TextStyle(fontSize: 18, fontWeight: FontWeight.bold, color: AppTheme.neonCyan)
                    ),
                    Text(
                      'TICKET: 000456', 
                      style: TextStyle(fontSize: 12, color: AppTheme.textBody)
                    ),
                  ],
                ),
              ],
            ),
          ),
          // Contenido Principal (Estado Vacío o Lista de Items)
          Expanded(
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
          ),
        ],
      ),
    );
  }
}
