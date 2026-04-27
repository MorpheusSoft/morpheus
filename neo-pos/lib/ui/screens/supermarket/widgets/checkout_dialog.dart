import 'package:flutter/material.dart';
import 'package:provider/provider.dart';
import '../../../../core/providers/cart_provider.dart';
import '../../../theme/app_theme.dart';

class CheckoutDialog extends StatefulWidget {
  const CheckoutDialog({super.key});

  @override
  State<CheckoutDialog> createState() => _CheckoutDialogState();
}

class _CheckoutDialogState extends State<CheckoutDialog> {
  final double exchangeRate = 36.50; // Harcoded temporal extraído de la DB

  void _processPayment() {
    // Próximamente se integrará el comando real a SQLite
    context.read<CartProvider>().clearCart();
    Navigator.of(context).pop();
    ScaffoldMessenger.of(context).showSnackBar(
      const SnackBar(
        content: Text('Factura procesada y guardada.', style: TextStyle(color: Colors.black, fontWeight: FontWeight.bold)), 
        backgroundColor: AppTheme.neonCyan,
        duration: Duration(seconds: 2),
      )
    );
  }

  @override
  Widget build(BuildContext context) {
    final cart = context.watch<CartProvider>();
    final totalDueUSD = cart.totalDue;
    final totalDueVES = totalDueUSD * exchangeRate;

    return Dialog(
      backgroundColor: AppTheme.slateGrey,
      child: Container(
        width: 1000, 
        height: 700,
        child: Row(
          children: [
            // MITAD IZQUIERDA: Papel de Factura Visual
            Expanded(
              flex: 4,
              child: Container(
                color: Colors.white,
                padding: const EdgeInsets.symmetric(horizontal: 24, vertical: 32),
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.stretch,
                  children: [
                    const Text('MORPHEUS SUPERMARKET', textAlign: TextAlign.center, style: TextStyle(fontFamily: 'monospace', fontWeight: FontWeight.bold, fontSize: 18, color: Colors.black)),
                    const Text('Rif: J-12345678-9', textAlign: TextAlign.center, style: TextStyle(fontFamily: 'monospace', color: Colors.black)),
                    const Text('--------------------------------', textAlign: TextAlign.center, style: TextStyle(fontFamily: 'monospace', color: Colors.black)),
                    Text('CLIENTE: ${cart.customerName}', style: const TextStyle(fontFamily: 'monospace', color: Colors.black)),
                    Text('C.I/RIF: ${cart.customerDocument}', style: const TextStyle(fontFamily: 'monospace', color: Colors.black)),
                    const Text('--------------------------------', textAlign: TextAlign.center, style: TextStyle(fontFamily: 'monospace', color: Colors.black)),
                    const SizedBox(height: 8),
                    Expanded(
                      child: ListView.builder(
                        itemCount: cart.items.length,
                        itemBuilder: (context, index) {
                          final item = cart.items[index];
                          return Padding(
                            padding: const EdgeInsets.only(bottom: 4.0),
                            child: Row(
                              mainAxisAlignment: MainAxisAlignment.spaceBetween,
                              children: [
                                Expanded(child: Text('${item.quantity.toInt()}x ${item.name}', style: const TextStyle(fontFamily: 'monospace', color: Colors.black, fontSize: 12))),
                                Text('\$${item.subtotal.toStringAsFixed(2)}', style: const TextStyle(fontFamily: 'monospace', color: Colors.black, fontSize: 12)),
                              ],
                            ),
                          );
                        },
                      ),
                    ),
                    const Divider(color: Colors.black, thickness: 2),
                    Row(
                      mainAxisAlignment: MainAxisAlignment.spaceBetween,
                      children: [
                        const Text('TOTAL USD:', style: TextStyle(fontFamily: 'monospace', fontWeight: FontWeight.bold, fontSize: 16, color: Colors.black)),
                        Text('\$${totalDueUSD.toStringAsFixed(2)}', style: const TextStyle(fontFamily: 'monospace', fontWeight: FontWeight.bold, fontSize: 16, color: Colors.black)),
                      ],
                    ),
                    Row(
                      mainAxisAlignment: MainAxisAlignment.spaceBetween,
                      children: [
                        const Text('TOTAL VES:', style: TextStyle(fontFamily: 'monospace', fontSize: 14, color: Colors.black54)),
                        Text('Bs ${totalDueVES.toStringAsFixed(2)}', style: const TextStyle(fontFamily: 'monospace', fontSize: 14, color: Colors.black54)),
                      ],
                    ),
                    const SizedBox(height: 24),
                    Text('TASA BCV: \$1.00 = Bs $exchangeRate', textAlign: TextAlign.center, style: const TextStyle(fontFamily: 'monospace', fontSize: 10, color: Colors.black)),
                    const SizedBox(height: 4),
                    const Text('¡Gracias por su compra!', textAlign: TextAlign.center, style: TextStyle(fontFamily: 'monospace', fontSize: 12, color: Colors.black)),
                  ],
                ),
              ),
            ),

            // MITAD DERECHA: Calculadora de Pagos
            Expanded(
              flex: 6,
              child: Container(
                padding: const EdgeInsets.all(32),
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    const Text('RESUMEN DE PAGO', style: TextStyle(fontSize: 24, fontWeight: FontWeight.bold, color: Colors.white)),
                    const SizedBox(height: 24),
                    
                    Container(
                      padding: const EdgeInsets.all(16),
                      decoration: BoxDecoration(color: AppTheme.surfaceDark, borderRadius: BorderRadius.circular(12)),
                      child: Column(
                        children: [
                          Row(
                            mainAxisAlignment: MainAxisAlignment.spaceBetween,
                            children: [
                              const Text('TOTAL A PAGAR', style: TextStyle(color: AppTheme.textBody, fontSize: 16)),
                              Text('\$${totalDueUSD.toStringAsFixed(2)}', style: const TextStyle(color: AppTheme.neonCyan, fontSize: 28, fontWeight: FontWeight.bold)),
                            ],
                          ),
                          const SizedBox(height: 8),
                          Row(
                            mainAxisAlignment: MainAxisAlignment.end,
                            children: [
                              Text('Equivalente: Bs ${totalDueVES.toStringAsFixed(2)}', style: const TextStyle(color: AppTheme.textBody, fontSize: 16)),
                            ],
                          ),
                        ],
                      ),
                    ),

                    const SizedBox(height: 32),
                    const Text('MÉTODO DE PAGO PRINCIPAL', style: TextStyle(color: Colors.white, fontWeight: FontWeight.bold)),
                    const SizedBox(height: 12),
                    Row(
                      children: [
                        Expanded(child: _buildPayMethod('Efectivo USD', true)),
                        const SizedBox(width: 8),
                        Expanded(child: _buildPayMethod('Punto de Venta', false)),
                        const SizedBox(width: 8),
                        Expanded(child: _buildPayMethod('Pago Móvil', false)),
                      ],
                    ),

                    const SizedBox(height: 32),
                    // Espacio preparatorio para la calculadora dinámica de Vueltos
                    Container(
                      width: double.infinity,
                      padding: const EdgeInsets.all(16),
                      decoration: BoxDecoration(border: Border.all(color: AppTheme.glassBorder, width: 1, style: BorderStyle.solid), borderRadius: BorderRadius.circular(8)),
                      child: const Center(
                        child: Text("calculadora de vuelto / divisa en construcción", style: TextStyle(color: AppTheme.textBody, fontStyle: FontStyle.italic)),
                      ),
                    ),

                    const Spacer(),
                    
                    // Acción Final
                    Align(
                      alignment: Alignment.centerRight,
                      child: Row(
                        mainAxisSize: MainAxisSize.min,
                        children: [
                          TextButton(
                            onPressed: () => Navigator.of(context).pop(),
                            child: const Text('CANCELAR', style: TextStyle(color: AppTheme.textBody, fontSize: 16)),
                          ),
                          const SizedBox(width: 16),
                          ElevatedButton(
                            style: ElevatedButton.styleFrom(
                              backgroundColor: AppTheme.neonCyan,
                              padding: const EdgeInsets.symmetric(horizontal: 48, vertical: 20),
                            ),
                            onPressed: _processPayment,
                            child: const Text('FACTURAR', style: TextStyle(color: Colors.black, fontWeight: FontWeight.bold, fontSize: 18)),
                          ),
                        ],
                      ),
                    )
                  ],
                ),
              ),
            ),
          ],
        ),
      ),
    );
  }

  Widget _buildPayMethod(String label, bool isSelected) {
    return Container(
      padding: const EdgeInsets.symmetric(vertical: 16),
      decoration: BoxDecoration(
        color: isSelected ? AppTheme.neonCyan.withOpacity(0.2) : AppTheme.surfaceDark,
        borderRadius: BorderRadius.circular(8),
        border: Border.all(color: isSelected ? AppTheme.neonCyan : Colors.transparent),
      ),
      alignment: Alignment.center,
      child: Text(label, style: TextStyle(color: isSelected ? AppTheme.neonCyan : Colors.white, fontWeight: FontWeight.bold)),
    );
  }
}
