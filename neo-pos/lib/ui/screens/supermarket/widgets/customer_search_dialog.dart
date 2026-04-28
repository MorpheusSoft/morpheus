import 'package:flutter/material.dart';
import 'package:provider/provider.dart';
import '../../../../core/providers/cart_provider.dart';
import '../../../../core/database/database_helper.dart';
import '../../../theme/app_theme.dart';

class CustomerSearchDialog extends StatefulWidget {
  const CustomerSearchDialog({super.key});

  @override
  State<CustomerSearchDialog> createState() => _CustomerSearchDialogState();
}

class _CustomerSearchDialogState extends State<CustomerSearchDialog> {
  final TextEditingController _docController = TextEditingController();
  final TextEditingController _nameController = TextEditingController();
  final TextEditingController _addressController = TextEditingController();
  final TextEditingController _phoneController = TextEditingController();
  final TextEditingController _emailController = TextEditingController();
  final FocusNode _nameFocus = FocusNode();

  Future<void> _searchLocalCustomer(String doc) async {
    if (doc.isEmpty) return;
    final customer = await DatabaseHelper.instance.getCustomerByDocument(doc);
    if (customer != null) {
      setState(() {
        _nameController.text = customer['name'] ?? '';
        _addressController.text = customer['address'] ?? '';
        _phoneController.text = customer['phone'] ?? '';
        _emailController.text = customer['email'] ?? '';
      });
      // Auto confirm if found
      _confirm();
    } else {
      _nameFocus.requestFocus();
    }
  }

  void _confirm() {
    final doc = _docController.text.trim();
    final name = _nameController.text.trim();
    if (doc.isNotEmpty && name.isNotEmpty) {
      final address = _addressController.text.trim();
      final phone = _phoneController.text.trim();
      final email = _emailController.text.trim();
      
      // Save locally for future autocompletion
      DatabaseHelper.instance.saveCustomerLocally({
        'document_id': doc,
        'name': name,
        'address': address.isEmpty ? null : address,
        'phone': phone.isEmpty ? null : phone,
        'email': email.isEmpty ? null : email,
        'is_loyalty_member': 0,
      });

      context.read<CartProvider>().setCustomer(
        doc, 
        name, 
        address: address.isEmpty ? null : address,
        phone: phone.isEmpty ? null : phone,
        email: email.isEmpty ? null : email
      );
      Navigator.of(context).pop();
    }
  }

  @override
  void dispose() {
    _docController.dispose();
    _nameController.dispose();
    _addressController.dispose();
    _phoneController.dispose();
    _emailController.dispose();
    _nameFocus.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    return Dialog(
      backgroundColor: AppTheme.slateGrey,
      shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(12)),
      child: Container(
        width: 450,
        padding: const EdgeInsets.all(24),
        child: SingleChildScrollView(
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
                  labelText: 'Cédula / RIF (Presione Enter para buscar)',
                  labelStyle: TextStyle(color: AppTheme.neonCyan),
                  filled: true,
                  fillColor: AppTheme.surfaceDark,
                  border: OutlineInputBorder(),
                  suffixIcon: Icon(Icons.search, color: AppTheme.textBody),
                ),
                onSubmitted: _searchLocalCustomer,
              ),
              const SizedBox(height: 16),
              TextField(
                controller: _nameController,
                focusNode: _nameFocus,
                style: const TextStyle(color: Colors.white),
                decoration: const InputDecoration(
                  labelText: 'Nombres / Razón Social',
                  labelStyle: TextStyle(color: AppTheme.neonCyan),
                  filled: true,
                  fillColor: AppTheme.surfaceDark,
                  border: OutlineInputBorder(),
                ),
              ),
              const SizedBox(height: 16),
              TextField(
                controller: _addressController,
                style: const TextStyle(color: Colors.white),
                decoration: const InputDecoration(
                  labelText: 'Dirección (Opcional)',
                  labelStyle: TextStyle(color: AppTheme.textBody),
                  filled: true,
                  fillColor: AppTheme.surfaceDark,
                  border: OutlineInputBorder(),
                ),
              ),
              const SizedBox(height: 16),
              Row(
                children: [
                  Expanded(
                    child: TextField(
                      controller: _phoneController,
                      style: const TextStyle(color: Colors.white),
                      decoration: const InputDecoration(
                        labelText: 'Teléfono (Opc)',
                        labelStyle: TextStyle(color: AppTheme.textBody),
                        filled: true,
                        fillColor: AppTheme.surfaceDark,
                        border: OutlineInputBorder(),
                      ),
                    ),
                  ),
                  const SizedBox(width: 16),
                  Expanded(
                    child: TextField(
                      controller: _emailController,
                      style: const TextStyle(color: Colors.white),
                      decoration: const InputDecoration(
                        labelText: 'Correo (Opc)',
                        labelStyle: TextStyle(color: AppTheme.textBody),
                        filled: true,
                        fillColor: AppTheme.surfaceDark,
                        border: OutlineInputBorder(),
                      ),
                      onSubmitted: (_) => _confirm(),
                    ),
                  ),
                ],
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
      ),
    );
  }
}
