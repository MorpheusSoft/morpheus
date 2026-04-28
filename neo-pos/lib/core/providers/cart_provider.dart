import 'package:flutter/material.dart';
import '../models/cart_item.dart';
import '../database/database_helper.dart';

class CartProvider extends ChangeNotifier {
  final List<CartItem> _items = [];
  String? _lastScannedBarcode;
  String? _errorMessage;
  
  // Datos del Cliente
  String _customerDocument = 'V-000000000';
  String _customerName = 'CONSUMIDOR FINAL';
  String? _customerAddress;
  String? _customerPhone;
  String? _customerEmail;

  // Multiplicador temporal
  double? _pendingMultiplier;

  // Tickets en Espera
  final List<HeldTicket> _heldTickets = [];

  List<CartItem> get items => List.unmodifiable(_items);
  String? get lastScannedBarcode => _lastScannedBarcode;
  String? get errorMessage => _errorMessage;
  String get customerDocument => _customerDocument;
  String get customerName => _customerName;
  String? get customerAddress => _customerAddress;
  String? get customerPhone => _customerPhone;
  String? get customerEmail => _customerEmail;
  double? get pendingMultiplier => _pendingMultiplier;
  List<HeldTicket> get heldTickets => List.unmodifiable(_heldTickets);

  void setCustomer(String document, String name, {String? address, String? phone, String? email}) {
    _customerDocument = document;
    _customerName = name;
    _customerAddress = address;
    _customerPhone = phone;
    _customerEmail = email;
    notifyListeners();
  }

  
  double get totalDue => _items.fold(0, (sum, item) => sum + item.subtotal);
  int get totalItems => _items.fold(0, (sum, item) => sum + item.quantity.toInt());

  void setPendingMultiplier(double multiplier) {
    _pendingMultiplier = multiplier;
    notifyListeners();
  }

  void updateLastItemQuantity(double newQuantity) {
    if (_items.isEmpty) return;
    // Como ahora insertamos de primeros (index 0), el último escaneado está arriba.
    _items[0] = _items[0].copyWith(quantity: newQuantity);
    notifyListeners();
  }

  Future<void> scanProduct(String barcode) async {
    _errorMessage = null;
    final data = await DatabaseHelper.instance.getProductByBarcode(barcode);
    
    if (data == null) {
      _errorMessage = 'Producto no encontrado: $barcode';
      notifyListeners();
      return;
    }

    final String productName = data['presentation'] != 'Unidad' ? '${data['name']} (${data['presentation']})' : data['name'];
    final double unitMultiplier = data['unit_multiplier'] ?? 1.0;
    final double productPrice = data['base_price'] * unitMultiplier;
    
    final double qtyToAdd = _pendingMultiplier ?? 1.0;
    
    // Siempre agregamos como nueva línea AL PRINCIPIO de la lista
    // para que el cajero no tenga que hacer scroll y siempre vea lo último que pasó.
    _items.insert(0, 
      CartItem(barcode: barcode, name: productName, quantity: qtyToAdd, price: productPrice),
    );
    
    _lastScannedBarcode = '$barcode - $productName (\$${productPrice.toStringAsFixed(2)})';
    _pendingMultiplier = null; // Reseteamos el multiplicador después de usarlo
    notifyListeners();
  }

  void scanProductDummy() {} // Obsoleto

  void clearCart() {
    _items.clear();
    _lastScannedBarcode = null;
    _errorMessage = null;
    _customerDocument = 'V-000000000';
    _customerName = 'CONSUMIDOR FINAL';
    _customerAddress = null;
    _customerPhone = null;
    _customerEmail = null;
    _pendingMultiplier = null;
    notifyListeners();
  }

  void holdCurrentTicket(String reference) {
    if (_items.isEmpty) return;
    
    final heldTicket = HeldTicket(
      id: 'HOLD-${DateTime.now().millisecondsSinceEpoch}',
      heldAt: DateTime.now(),
      referenceNote: reference,
      items: List.from(_items),
      customerDocument: _customerDocument,
      customerName: _customerName,
      customerAddress: _customerAddress,
      customerPhone: _customerPhone,
      customerEmail: _customerEmail,
      totalDue: totalDue,
    );
    
    _heldTickets.add(heldTicket);
    clearCart();
    // clearCart() ya hace notifyListeners()
  }

  void restoreTicket(String id) {
    final index = _heldTickets.indexWhere((t) => t.id == id);
    if (index >= 0) {
      final ticket = _heldTickets.removeAt(index);
      _items.clear();
      _items.addAll(ticket.items);
      _customerDocument = ticket.customerDocument;
      _customerName = ticket.customerName;
      _customerAddress = ticket.customerAddress;
      _customerPhone = ticket.customerPhone;
      _customerEmail = ticket.customerEmail;
      _lastScannedBarcode = null;
      _errorMessage = null;
      _pendingMultiplier = null;
      notifyListeners();
    }
  }
}

class HeldTicket {
  final String id;
  final DateTime heldAt;
  final String referenceNote;
  final List<CartItem> items;
  final String customerDocument;
  final String customerName;
  final String? customerAddress;
  final String? customerPhone;
  final String? customerEmail;
  final double totalDue;

  HeldTicket({
    required this.id,
    required this.heldAt,
    required this.referenceNote,
    required this.items,
    required this.customerDocument,
    required this.customerName,
    this.customerAddress,
    this.customerPhone,
    this.customerEmail,
    required this.totalDue,
  });
}
