import 'package:flutter/foundation.dart';
import '../models/product.dart';
import '../models/order.dart';

class CartItem {
  final Product product;
  int quantity;

  CartItem({required this.product, this.quantity = 1});

  double get subtotal => product.price * quantity;
}

class CartProvider with ChangeNotifier {
  final Map<int, CartItem> _items = {};

  Map<int, CartItem> get items => {..._items};

  int get itemCount => _items.length;

  double get totalAmount {
    var total = 0.0;
    _items.forEach((key, cartItem) {
      total += cartItem.subtotal;
    });
    return total;
  }

  void addItem(Product product) {
    if (_items.containsKey(product.id)) {
      _items.update(
        product.id,
        (existingCartItem) => CartItem(
          product: existingCartItem.product,
          quantity: existingCartItem.quantity + 1,
        ),
      );
    } else {
      _items.putIfAbsent(
        product.id,
        () => CartItem(product: product, quantity: 1),
      );
    }
    notifyListeners();
  }

  void removeItem(int productId) {
    _items.remove(productId);
    notifyListeners();
  }

  void clear() {
    _items.clear();
    notifyListeners();
  }

  void updateQuantity(int productId, int newQuantity) {
      if (newQuantity <= 0) {
          removeItem(productId);
          return;
      }
      if (_items.containsKey(productId)) {
          _items.update(
              productId,
              (existing) => CartItem(product: existing.product, quantity: newQuantity)
          );
          notifyListeners();
      }
  }

  List<OrderItem> toOrderItems(int orderLocalId) {
      return _items.values.map((cartItem) => OrderItem(
          orderLocalId: orderLocalId,
          productId: cartItem.product.id,
          quantity: cartItem.quantity,
          unitPrice: cartItem.product.price,
          subtotal: cartItem.subtotal,
      )).toList();
  }
}
