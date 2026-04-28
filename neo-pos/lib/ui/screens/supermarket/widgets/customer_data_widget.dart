import 'package:flutter/material.dart';
import 'package:provider/provider.dart';
import '../../../../core/providers/cart_provider.dart';
import '../../../theme/app_theme.dart';
import 'customer_search_dialog.dart';

class CustomerDataWidget extends StatelessWidget {
  const CustomerDataWidget({super.key});

  @override
  Widget build(BuildContext context) {
    return InkWell(
      onTap: () {
        showDialog(
          context: context,
          builder: (context) => const CustomerSearchDialog(),
        );
      },
      borderRadius: BorderRadius.circular(12),
      child: Container(
        decoration: BoxDecoration(
          color: AppTheme.surfaceDark,
          borderRadius: BorderRadius.circular(12),
          border: Border.all(color: AppTheme.glassBorder, width: 2),
        ),
        padding: const EdgeInsets.all(16),
        child: Consumer<CartProvider>(
          builder: (context, cart, child) {
            final esGenerico = cart.customerDocument == 'V-000000000';
            return Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              mainAxisAlignment: MainAxisAlignment.center,
              children: [
                const Row(
                  children: [
                    Icon(Icons.person, color: AppTheme.neonCyan),
                    SizedBox(width: 8),
                    Text('DATOS DEL CLIENTE (F7)', style: TextStyle(color: AppTheme.textBody, fontWeight: FontWeight.bold, fontSize: 12)),
                  ],
                ),
                const SizedBox(height: 12),
                Text(
                  cart.customerName, 
                  style: TextStyle(
                    fontSize: 18, 
                    fontWeight: FontWeight.bold, 
                    color: esGenerico ? AppTheme.textBody : Colors.white,
                    overflow: TextOverflow.ellipsis
                  ), 
                  maxLines: 1
                ),
                const SizedBox(height: 4),
                Text(
                  'ID/RIF: ${cart.customerDocument}', 
                  style: const TextStyle(color: AppTheme.textBody, fontSize: 14)
                ),
                if (cart.customerAddress != null && cart.customerAddress!.isNotEmpty) ...[
                  const SizedBox(height: 4),
                  Text(
                    'Dir: ${cart.customerAddress}',
                    style: const TextStyle(color: AppTheme.textBody, fontSize: 12, overflow: TextOverflow.ellipsis),
                    maxLines: 1,
                  ),
                ],
                if (cart.customerPhone != null && cart.customerPhone!.isNotEmpty) ...[
                  const SizedBox(height: 2),
                  Text(
                    'Tel: ${cart.customerPhone}',
                    style: const TextStyle(color: AppTheme.textBody, fontSize: 12),
                  ),
                ]
              ],
            );
          }
        ),
      ),
    );
  }
}
