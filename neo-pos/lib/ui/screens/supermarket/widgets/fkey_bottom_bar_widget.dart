import 'package:flutter/material.dart';
import 'package:provider/provider.dart';
import '../../../../core/providers/cart_provider.dart';
import '../../../theme/app_theme.dart';
import 'customer_search_dialog.dart';
import 'product_search_dialog.dart';
import 'checkout_dialog.dart';
import 'quantity_edit_dialog.dart';

class FKeyBottomBarWidget extends StatelessWidget {
  const FKeyBottomBarWidget({super.key});

  Future<void> _handleFKey(BuildContext context, String fKey) async {
    if (fKey == 'F1') {
      showDialog(
        context: context,
        builder: (context) => const ProductSearchDialog(),
      );
    } else if (fKey == 'F2') {
      showDialog(
        context: context,
        builder: (context) => const QuantityEditDialog(),
      );
    } else if (fKey == 'F5') {
      context.read<CartProvider>().clearCart();
    } else if (fKey == 'F7') {
      showDialog(
        context: context,
        builder: (context) => const CustomerSearchDialog(),
      );
    } else if (fKey == 'F12') {
      final cart = context.read<CartProvider>();
      if (cart.items.isEmpty) return; // Validación de carro vacío
      
      showDialog(
        context: context,
        builder: (context) => const CheckoutDialog(),
      );
    }
  }

  @override
  Widget build(BuildContext context) {
    return Container(
      height: 100,
      padding: const EdgeInsets.symmetric(horizontal: 16, vertical: 8),
      child: Row(
        children: [
          _buildFKey(context, 'F1', 'BUSCAR', Icons.search),
          _buildFKey(context, 'F2', 'CANTIDAD', Icons.edit_square),
          _buildFKey(context, 'F3', 'EN ESPERA', Icons.pause_circle_outline),
          _buildFKey(context, 'F4', 'DESCUENTOS', Icons.percent),
          _buildFKey(context, 'F5', 'ANULAR', Icons.delete_outline),
          _buildFKey(context, 'F7', 'CLIENTE', Icons.person_add_alt),
          const Spacer(),
          _buildFKey(context, 'F12', 'COBRAR', Icons.point_of_sale, isPrimary: true),
        ],
      ),
    );
  }

  Widget _buildFKey(BuildContext context, String fKey, String label, IconData icon, {bool isPrimary = false}) {
    return GestureDetector(
      onTap: () => _handleFKey(context, fKey),
      child: Container(
        width: isPrimary ? 160 : 90,
        margin: const EdgeInsets.only(right: 8),
        decoration: BoxDecoration(
          color: isPrimary ? AppTheme.neonCyan : AppTheme.surfaceDark,
          borderRadius: BorderRadius.circular(8),
          border: Border.all(color: isPrimary ? Colors.transparent : AppTheme.glassBorder),
        ),
        child: Column(
          mainAxisAlignment: MainAxisAlignment.center,
          children: [
            Icon(
              icon,
              color: isPrimary ? Colors.black87 : AppTheme.neonCyan,
              size: 24,
            ),
            const SizedBox(height: 4),
            Text(
              fKey,
              style: TextStyle(
                color: isPrimary ? Colors.black : Colors.white,
                fontWeight: FontWeight.bold,
                fontSize: 16,
              ),
            ),
            const SizedBox(height: 2),
            Text(
              label,
              style: TextStyle(
                color: isPrimary ? Colors.black87 : AppTheme.textBody,
                fontSize: 11,
              ),
              textAlign: TextAlign.center,
            ),
          ],
        ),
      ),
    );
  }
}
