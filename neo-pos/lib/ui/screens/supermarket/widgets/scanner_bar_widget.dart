import 'package:flutter/material.dart';
import '../../../../core/database/database_helper.dart';
import 'package:provider/provider.dart';
import '../../../../core/providers/cart_provider.dart';
import '../../../theme/app_theme.dart';

class ScannerBarWidget extends StatefulWidget {
  const ScannerBarWidget({super.key});

  @override
  State<ScannerBarWidget> createState() => _ScannerBarWidgetState();
}

class _ScannerBarWidgetState extends State<ScannerBarWidget> {
  final TextEditingController _controller = TextEditingController();
  final FocusNode _focusNode = FocusNode();

  @override
  Widget build(BuildContext context) {
    return Consumer<CartProvider>(
      builder: (context, cart, child) {
        return Container(
          height: 60,
          width: double.infinity,
          color: AppTheme.neonCyan.withOpacity(0.1),
          padding: const EdgeInsets.symmetric(horizontal: 24, vertical: 8),
          alignment: Alignment.center,
          child: Row(
            children: [
              Expanded(
                child: Text(
                  cart.pendingMultiplier != null 
                    ? 'MULTIPLICADOR: ${cart.pendingMultiplier}x | Esperando escáner...' 
                    : cart.errorMessage ?? cart.lastScannedBarcode ?? 'ESPERANDO ESCÁNER...',
                  style: TextStyle(
                    color: cart.pendingMultiplier != null 
                        ? Colors.orangeAccent 
                        : (cart.errorMessage != null ? Colors.redAccent : AppTheme.neonCyan),
                    fontWeight: FontWeight.bold, fontSize: 18
                  ),
                ),
              ),
              SizedBox(
                width: 300,
                child: TextField(
                  controller: _controller,
                  focusNode: _focusNode,
                  autofocus: true,
                  style: const TextStyle(color: Colors.white, fontSize: 20),
                  decoration: InputDecoration(
                    hintText: 'Ingrese código...',
                    hintStyle: const TextStyle(color: AppTheme.textBody),
                    filled: true,
                    fillColor: AppTheme.surfaceDark,
                    border: OutlineInputBorder(
                      borderRadius: BorderRadius.circular(8),
                      borderSide: const BorderSide(color: AppTheme.glassBorder),
                    ),
                    contentPadding: const EdgeInsets.symmetric(horizontal: 16),
                  ),
                  onSubmitted: (value) async {
                    final text = value.trim();
                    if (text.isNotEmpty) {
                      if (text.endsWith('*')) {
                        final qtyStr = text.substring(0, text.length - 1);
                        final qty = double.tryParse(qtyStr);
                        if (qty != null && qty > 0) {
                          context.read<CartProvider>().setPendingMultiplier(qty);
                          _controller.clear();
                          _focusNode.requestFocus();
                          return;
                        }
                      }

                      if (text.toUpperCase().startsWith('/C ')) {
                        // Comando de Modo Experto para Cliente
                        final doc = text.substring(3).trim();
                        final customer = await DatabaseHelper.instance.getCustomerByDocument(doc);
                        
                        if (customer != null) {
                          if (context.mounted) {
                            context.read<CartProvider>().setCustomer(
                              doc, 
                              customer['name'],
                              address: customer['address'],
                              phone: customer['phone'],
                              email: customer['email']
                            );
                          }
                        } else {
                          // Cliente no encontrado
                          // Lo ideal sería abrir el modal o mostrar un error.
                          // Por ahora usaremos el errorMessage del Provider (necesita estar expuesto, o simplemente un print/snackbar).
                          // Si no existe, podemos forzar un error temporal escaneando un producto falso.
                          if (context.mounted) {
                            ScaffoldMessenger.of(context).showSnackBar(
                              SnackBar(
                                content: Text('Cliente no encontrado: $doc. Presione F7 para registrarlo.'),
                                backgroundColor: Colors.redAccent,
                                duration: const Duration(seconds: 3),
                              )
                            );
                          }
                        }
                      } else {
                        // Escaneo normal de producto
                        await context.read<CartProvider>().scanProduct(text);
                      }
                      _controller.clear();
                      _focusNode.requestFocus();
                    }
                  },
                ),
              )
            ],
          ),
        );
      }
    );
  }
}
