import 'package:flutter/material.dart';
import 'package:provider/provider.dart';
import '../../../../core/providers/cart_provider.dart';
import '../../../theme/app_theme.dart';

class CustomerSearchDialog extends StatefulWidget {
  const CustomerSearchDialog({super.key});

  @override
  State<CustomerSearchDialog> createState() => _CustomerSearchDialogState();
}

class _CustomerSearchDialogState extends State<CustomerSearchDialog> {
  final TextEditingController _docController = TextEditingController();
  final TextEditingController _nameController = TextEditingController();

  void _confirm() {
    final doc = _docController.text.trim();
    final name = _nameController.text.trim();
    if (doc.isNotEmpty && name.isNotEmpty) {
      context.read<CartProvider>().setCustomer(doc, name);
      Navigator.of(context).pop();
    }
  }

  @override
  Widget build(BuildContext context) {
    return Dialog(
      backgroundColor: AppTheme.slateGrey,
      shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(12)),
      child: Container(
        width: 400,
        padding: const EdgeInsets.all(24),
        child: Column(
          mainAxisSize: MainAxisSize.min,
          children: [
            const Text('Vincular Cliente', style: TextStyle(fontSize: 20, color: Colors.white, fontWeight: FontWeight.bold)),
            const SizedBox(height: 24),
            TextField(
              controller: _docController,
              autofocus: true,
              style: const TextStyle(color: Colors.white),
              decoration: const InputDecoration(
                labelText: 'Cédula / RIF',
                labelStyle: TextStyle(color: AppTheme.neonCyan),
                filled: true,
                fillColor: AppTheme.surfaceDark,
                border: const OutlineInputBorder(),
              ),
            ),
            const SizedBox(height: 16),
            TextField(
              controller: _nameController,
              style: const TextStyle(color: Colors.white),
              decoration: const InputDecoration(
                labelText: 'Nombres / Razón Social',
                labelStyle: TextStyle(color: AppTheme.neonCyan),
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
                  child: const Text('Asignar', style: TextStyle(color: Colors.black, fontWeight: FontWeight.bold)),
                ),
              ],
            )
          ],
        ),
      ),
    );
  }
}
