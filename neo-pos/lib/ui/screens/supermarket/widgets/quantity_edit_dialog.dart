import 'package:flutter/material.dart';
import 'package:provider/provider.dart';
import '../../../../core/providers/cart_provider.dart';
import '../../../theme/app_theme.dart';

class QuantityEditDialog extends StatefulWidget {
  const QuantityEditDialog({super.key});

  @override
  State<QuantityEditDialog> createState() => _QuantityEditDialogState();
}

class _QuantityEditDialogState extends State<QuantityEditDialog> {
  final TextEditingController _controller = TextEditingController();

  void _confirm() {
    final text = _controller.text.trim();
    if (text.isNotEmpty) {
      final qty = double.tryParse(text);
      if (qty != null && qty > 0) {
        context.read<CartProvider>().updateLastItemQuantity(qty);
      }
    }
    Navigator.of(context).pop();
  }

  @override
  Widget build(BuildContext context) {
    final cart = context.watch<CartProvider>();
    if (cart.items.isEmpty) {
      return Dialog(
        backgroundColor: AppTheme.slateGrey,
        child: Padding(
          padding: const EdgeInsets.all(24.0),
          child: Column(
            mainAxisSize: MainAxisSize.min,
            children: [
              const Icon(Icons.warning, color: Colors.orange, size: 48),
              const SizedBox(height: 16),
              const Text('El carrito está vacío', style: TextStyle(color: Colors.white, fontSize: 18)),
              const SizedBox(height: 16),
              ElevatedButton(
                onPressed: () => Navigator.of(context).pop(),
                style: ElevatedButton.styleFrom(backgroundColor: AppTheme.surfaceDark),
                child: const Text('Cerrar', style: TextStyle(color: Colors.white)),
              )
            ],
          ),
        ),
      );
    }

    final lastItem = cart.items.first;

    return Dialog(
      backgroundColor: AppTheme.slateGrey,
      shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(12)),
      child: Container(
        width: 350,
        padding: const EdgeInsets.all(24),
        child: Column(
          mainAxisSize: MainAxisSize.min,
          children: [
            const Icon(Icons.edit_square, color: AppTheme.neonCyan, size: 40),
            const SizedBox(height: 16),
            const Text('Modificar Cantidad', style: TextStyle(fontSize: 20, color: Colors.white, fontWeight: FontWeight.bold)),
            const SizedBox(height: 8),
            Text(lastItem.name, style: const TextStyle(color: AppTheme.textBody, fontSize: 16), textAlign: TextAlign.center),
            const SizedBox(height: 24),
            TextField(
              controller: _controller,
              autofocus: true,
              keyboardType: TextInputType.number,
              style: const TextStyle(color: Colors.white, fontSize: 24, fontWeight: FontWeight.bold),
              textAlign: TextAlign.center,
              decoration: InputDecoration(
                hintText: lastItem.quantity.toStringAsFixed(lastItem.quantity.truncateToDouble() == lastItem.quantity ? 0 : 2),
                hintStyle: const TextStyle(color: AppTheme.glassBorder),
                filled: true,
                fillColor: AppTheme.surfaceDark,
                border: const OutlineInputBorder(),
              ),
              onSubmitted: (_) => _confirm(),
            ),
            const SizedBox(height: 24),
            Row(
              mainAxisAlignment: MainAxisAlignment.end,
              children: [
                TextButton(
                  onPressed: () => Navigator.of(context).pop(),
                  child: const Text('Cancelar', style: TextStyle(color: AppTheme.textBody)),
                ),
                const SizedBox(width: 8),
                ElevatedButton(
                  style: ElevatedButton.styleFrom(backgroundColor: AppTheme.neonCyan),
                  onPressed: _confirm,
                  child: const Text('Actualizar', style: TextStyle(color: Colors.black, fontWeight: FontWeight.bold)),
                ),
              ],
            )
          ],
        ),
      ),
    );
  }
}
