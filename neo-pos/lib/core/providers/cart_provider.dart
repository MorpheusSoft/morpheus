import 'package:flutter/material.dart';
import '../models/cart_item.dart';
import '../database/database_helper.dart';

class CartProvider extends ChangeNotifier {
  final List<CartItem> _items = [];
  String? _lastScannedBarcode;
  String? _errorMessage;
  
  // Datos del Cliente (Opción B)
  String _customerDocument = 'V-00000000';
  String _customerName = 'CLIENTE GENÉRICO';

  List<CartItem> get items => List.unmodifiable(_items);
  String? get lastScannedBarcode => _lastScannedBarcode;
  String? get errorMessage => _errorMessage;
  String get customerDocument => _customerDocument;
  String get customerName => _customerName;

  void setCustomer(String document, String name) {
    _customerDocument = document;
    _customerName = name;
    notifyListeners();
  }

  
  double get totalDue => _items.fold(0, (sum, item) => sum + item.subtotal);
  int get totalItems => _items.fold(0, (sum, item) => sum + item.quantity.toInt());

  Future<void> scanProduct(String barcode) async {
    _errorMessage = null;
    final data = await DatabaseHelper.instance.getProductByBarcode(barcode);
    
    if (data == null) {
      _errorMessage = 'Producto no encontrado: $barcode';
      notifyListeners();
      return;
    }

    final currentItemIndex = _items.indexWhere((item) => item.barcode == barcode);
    final String productName = data['presentation'] != 'Unidad' ? '${data['name']} (${data['presentation']})' : data['name'];
    final double unitMultiplier = data['unit_multiplier'] ?? 1.0;
    final double productPrice = data['base_price'] * unitMultiplier; // Multiplicamos por presentación
    
    if (currentItemIndex >= 0) {
      _items[currentItemIndex] = _items[currentItemIndex].copyWith(
        quantity: _items[currentItemIndex].quantity + 1,
      );
    } else {
      _items.add(
        CartItem(barcode: barcode, name: productName, quantity: 1, price: productPrice),
      );
    }
    
    _lastScannedBarcode = '$barcode - $productName (\$${productPrice.toStringAsFixed(2)})';
    notifyListeners();
  }

  void scanProductDummy() {} // Obsoleto

  void clearCart() {
    _items.clear();
    _lastScannedBarcode = null;
    _errorMessage = null;
    _customerDocument = 'V-00000000';
    _customerName = 'CLIENTE GENÉRICO';
    notifyListeners();
  }
}
