import 'package:flutter/material.dart';
import 'package:provider/provider.dart';
import '../../../../core/providers/cart_provider.dart';
import '../../../theme/app_theme.dart';
import 'product_search_dialog.dart';
import 'checkout_dialog.dart';

class FKeyBottomBarWidget extends StatelessWidget {
  const FKeyBottomBarWidget({super.key});

  Future<void> _handleFKey(BuildContext context, String fKey) async {
    if (fKey == 'F1') {
      showDialog(
        context: context,
        builder: (context) => const ProductSearchDialog(),
      );
    } else if (fKey == 'F5') {
      context.read<CartProvider>().clearCart();
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
          _buildFKey(context, 'F1', 'BUSCAR'),
          _buildFKey(context, 'F2', 'CANTIDAD'),
          _buildFKey(context, 'F3', 'EN ESPERA'),
          _buildFKey(context, 'F4', 'DESCUENTOS'),
          _buildFKey(context, 'F5', 'ANULAR'),
          const Spacer(),
          _buildFKey(context, 'F12', 'COBRAR', isPrimary: true),
        ],
      ),
    );
  }

  Widget _buildFKey(BuildContext context, String fKey, String label, {bool isPrimary = false}) {
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
            Text(
              fKey,
              style: TextStyle(
                color: isPrimary ? Colors.black : Colors.white,
                fontWeight: FontWeight.bold,
                fontSize: 18,
              ),
            ),
            const SizedBox(height: 4),
            Text(
              label,
              style: TextStyle(
                color: isPrimary ? Colors.black87 : AppTheme.textBody,
                fontSize: 12,
              ),
              textAlign: TextAlign.center,
            ),
          ],
        ),
      ),
    );
  }
}
