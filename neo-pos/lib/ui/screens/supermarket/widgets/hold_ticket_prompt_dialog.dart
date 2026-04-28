import 'package:flutter/material.dart';
import 'package:provider/provider.dart';
import '../../../../core/providers/cart_provider.dart';
import '../../../theme/app_theme.dart';

class HoldTicketPromptDialog extends StatefulWidget {
  const HoldTicketPromptDialog({super.key});

  @override
  State<HoldTicketPromptDialog> createState() => _HoldTicketPromptDialogState();
}

class _HoldTicketPromptDialogState extends State<HoldTicketPromptDialog> {
  late TextEditingController _controller;

  @override
  void initState() {
    super.initState();
    final cart = context.read<CartProvider>();
    // Sugerimos el nombre del cliente actual por defecto
    _controller = TextEditingController(text: cart.customerName);
    // Seleccionamos todo el texto para que si el cajero teclea algo, se borre de inmediato
    _controller.selection = TextSelection(baseOffset: 0, extentOffset: _controller.text.length);
  }

  @override
  void dispose() {
    _controller.dispose();
    super.dispose();
  }

  void _confirm() {
    final text = _controller.text.trim();
    if (text.isNotEmpty) {
      context.read<CartProvider>().holdCurrentTicket(text);
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
            const Icon(Icons.pause_circle_outline, color: AppTheme.neonCyan, size: 40),
            const SizedBox(height: 16),
            const Text(
              'Poner Ticket en Espera',
              style: TextStyle(fontSize: 20, color: Colors.white, fontWeight: FontWeight.bold),
            ),
            const SizedBox(height: 16),
            const Text(
              'Ingresa una referencia para identificar este ticket (Ej. "Chico camisa roja"):',
              style: TextStyle(color: AppTheme.textBody, fontSize: 14),
              textAlign: TextAlign.center,
            ),
            const SizedBox(height: 16),
            TextField(
              controller: _controller,
              autofocus: true,
              style: const TextStyle(color: Colors.white, fontSize: 18),
              decoration: InputDecoration(
                filled: true,
                fillColor: AppTheme.surfaceDark,
                border: OutlineInputBorder(
                  borderRadius: BorderRadius.circular(8),
                  borderSide: const BorderSide(color: AppTheme.glassBorder),
                ),
                contentPadding: const EdgeInsets.symmetric(horizontal: 16, vertical: 12),
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
                  child: const Text('Guardar', style: TextStyle(color: Colors.black, fontWeight: FontWeight.bold)),
                ),
              ],
            )
          ],
        ),
      ),
    );
  }
}
