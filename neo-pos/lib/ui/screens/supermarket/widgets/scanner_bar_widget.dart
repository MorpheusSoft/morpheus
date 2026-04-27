import 'package:flutter/material.dart';
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
                  cart.errorMessage ?? cart.lastScannedBarcode ?? 'ESPERANDO ESCÁNER...',
                  style: TextStyle(
                    color: cart.errorMessage != null ? Colors.redAccent : AppTheme.neonCyan,
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
                    if (value.trim().isNotEmpty) {
                      await context.read<CartProvider>().scanProduct(value.trim());
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
