import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:provider/provider.dart';
import '../../../../core/providers/cart_provider.dart';
import '../../theme/app_theme.dart';
import 'widgets/receipt_table_widget.dart';
import 'widgets/customer_data_widget.dart';
import 'widgets/fkey_bottom_bar_widget.dart';
import 'widgets/scanner_bar_widget.dart';
import 'widgets/customer_search_dialog.dart';
import 'widgets/quantity_edit_dialog.dart';
import 'widgets/hold_ticket_prompt_dialog.dart';
import 'widgets/hold_tickets_dialog.dart';

class SupermarketScreen extends StatefulWidget {
  const SupermarketScreen({super.key});

  @override
  State<SupermarketScreen> createState() => _SupermarketScreenState();
}

class _SupermarketScreenState extends State<SupermarketScreen> {
  bool _handleKeyEvent(KeyEvent event) {
    if (event is KeyDownEvent) {
      if (event.logicalKey == LogicalKeyboardKey.f7) {
        showDialog(context: context, builder: (_) => const CustomerSearchDialog());
        return true;
      } else if (event.logicalKey == LogicalKeyboardKey.f2) {
        showDialog(context: context, builder: (_) => const QuantityEditDialog());
        return true;
      } else if (event.logicalKey == LogicalKeyboardKey.f3) {
        final cart = context.read<CartProvider>();
        if (cart.items.isNotEmpty) {
          showDialog(context: context, builder: (_) => const HoldTicketPromptDialog());
        } else {
          showDialog(context: context, builder: (_) => const HoldTicketsDialog());
        }
        return true;
      }
    }
    return false;
  }

  @override
  void initState() {
    super.initState();
    HardwareKeyboard.instance.addHandler(_handleKeyEvent);
  }

  @override
  void dispose() {
    HardwareKeyboard.instance.removeHandler(_handleKeyEvent);
    super.dispose();
  }

  @override
  void setState(fn) {
    if(mounted) super.setState(fn);
  }
  @override
  Widget build(BuildContext context) {
    return Scaffold(
      body: SafeArea(
        child: Column(
            children: [
            Expanded(
              child: Row(
                children: [
                  const Expanded(
                    flex: 3,
                    child: ReceiptTableWidget(),
                  ),
                  Expanded(
                    flex: 1,
                    child: Container(
                      margin: const EdgeInsets.only(top: 16, bottom: 16, right: 16),
                      child: Column(
                        children: [
                          const Expanded(
                            flex: 1,
                            child: CustomerDataWidget(),
                          ),
                          const SizedBox(height: 16),
                          Expanded(
                            flex: 1,
                            child: Container(
                              width: double.infinity,
                              decoration: BoxDecoration(
                                color: AppTheme.surfaceDark,
                                borderRadius: BorderRadius.circular(12),
                                border: Border.all(color: AppTheme.glassBorder),
                              ),
                              child: Consumer<CartProvider>(
                                builder: (context, cart, child) {
                                  return Center(
                                    child: Text(
                                      'TOTAL A PAGAR\n\$${cart.totalDue.toStringAsFixed(2)}',
                                      style: const TextStyle(fontSize: 24, fontWeight: FontWeight.bold),
                                      textAlign: TextAlign.center,
                                    ),
                                  );
                                }
                              ),
                            ),
                          ),
                        ],
                      ),
                    ),
                  ),
                ],
              ),
            ),
            const ScannerBarWidget(),
            Container(
              padding: const EdgeInsets.symmetric(horizontal: 24, vertical: 8),
              color: AppTheme.surfaceDark,
              child: Consumer<CartProvider>(
                builder: (context, cart, child) {
                  return Row(
                    mainAxisAlignment: MainAxisAlignment.spaceBetween,
                    children: [
                      const Text('CAJERO: L. ZAMBRANO', style: TextStyle(color: AppTheme.textBody, fontSize: 14)),
                      const Text('PRÓX FACTURA: FACT-000456', style: TextStyle(color: AppTheme.textBody, fontSize: 14, fontWeight: FontWeight.bold)),
                      Text('CANT ELEMENTOS: ${cart.totalItems}', style: const TextStyle(color: AppTheme.textBody, fontSize: 14)),
                    ],
                  );
                }
              ),
            ),
            const FKeyBottomBarWidget(),
          ],
        ),
      ),
    );
  }
}
