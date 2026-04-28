import 'package:flutter/material.dart';
import 'package:provider/provider.dart';
import '../../../../core/providers/cart_provider.dart';
import '../../../theme/app_theme.dart';

class HoldTicketsDialog extends StatelessWidget {
  const HoldTicketsDialog({super.key});

  @override
  Widget build(BuildContext context) {
    final cart = context.watch<CartProvider>();
    final heldTickets = cart.heldTickets;

    return Dialog(
      backgroundColor: AppTheme.slateGrey,
      shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(12)),
      child: Container(
        width: 600,
        height: 500,
        padding: const EdgeInsets.all(24),
        child: Column(
          children: [
            const Row(
              children: [
                Icon(Icons.pause_circle_outline, color: AppTheme.neonCyan, size: 32),
                SizedBox(width: 12),
                Text(
                  'TICKETS EN ESPERA',
                  style: TextStyle(fontSize: 24, fontWeight: FontWeight.bold, color: Colors.white),
                ),
              ],
            ),
            const SizedBox(height: 24),
            Expanded(
              child: heldTickets.isEmpty
                  ? const Center(
                      child: Text(
                        'No hay tickets en espera.',
                        style: TextStyle(color: AppTheme.textBody, fontSize: 18),
                      ),
                    )
                  : ListView.builder(
                      itemCount: heldTickets.length,
                      itemBuilder: (context, index) {
                        final ticket = heldTickets[index];
                        final hour = ticket.heldAt.hour.toString().padLeft(2, '0');
                        final minute = ticket.heldAt.minute.toString().padLeft(2, '0');
                        final timeStr = '$hour:$minute';
                        
                        final totalArticulos = ticket.items.fold<int>(0, (sum, item) => sum + item.quantity.toInt());
                        
                        return Card(
                          color: AppTheme.surfaceDark,
                          margin: const EdgeInsets.only(bottom: 12),
                          shape: RoundedRectangleBorder(
                            side: const BorderSide(color: AppTheme.glassBorder),
                            borderRadius: BorderRadius.circular(8),
                          ),
                          child: Padding(
                            padding: const EdgeInsets.symmetric(horizontal: 16, vertical: 12),
                            child: Row(
                              children: [
                                Expanded(
                                  child: Column(
                                    crossAxisAlignment: CrossAxisAlignment.start,
                                    children: [
                                      Text(
                                        ticket.referenceNote.isNotEmpty ? ticket.referenceNote : ticket.customerName,
                                        style: const TextStyle(color: Colors.white, fontWeight: FontWeight.bold, fontSize: 18),
                                      ),
                                      const SizedBox(height: 4),
                                      Text(
                                        '${ticket.customerName} • a las $timeStr • $totalArticulos artículos',
                                        style: const TextStyle(color: AppTheme.textBody),
                                      ),
                                    ],
                                  ),
                                ),
                                Column(
                                  crossAxisAlignment: CrossAxisAlignment.end,
                                  children: [
                                    Text(
                                      '\$${ticket.totalDue.toStringAsFixed(2)}',
                                      style: const TextStyle(color: AppTheme.neonCyan, fontWeight: FontWeight.bold, fontSize: 18),
                                    ),
                                    const SizedBox(height: 8),
                                    ElevatedButton(
                                      style: ElevatedButton.styleFrom(
                                        backgroundColor: AppTheme.neonCyan,
                                        foregroundColor: Colors.black,
                                        padding: const EdgeInsets.symmetric(horizontal: 16, vertical: 0),
                                        minimumSize: const Size(0, 32),
                                      ),
                                      onPressed: () {
                                        if (cart.items.isNotEmpty) {
                                          cart.holdCurrentTicket(cart.customerName);
                                        }
                                        cart.restoreTicket(ticket.id);
                                        Navigator.of(context).pop();
                                      },
                                      child: const Text('Recuperar', style: TextStyle(fontWeight: FontWeight.bold)),
                                    ),
                                  ],
                                ),
                              ],
                            ),
                          ),
                        );
                      },
                    ),
            ),
            const SizedBox(height: 16),
            Align(
              alignment: Alignment.centerRight,
              child: ElevatedButton(
                style: ElevatedButton.styleFrom(
                  backgroundColor: AppTheme.surfaceDark,
                  side: const BorderSide(color: AppTheme.glassBorder),
                ),
                onPressed: () => Navigator.of(context).pop(),
                child: const Text('Cerrar', style: TextStyle(color: Colors.white)),
              ),
            ),
          ],
        ),
      ),
    );
  }
}
