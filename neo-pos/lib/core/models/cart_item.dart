import 'package:equatable/equatable.dart';

class CartItem extends Equatable {
  final String barcode;
  final String name;
  final double quantity;
  final double price;

  const CartItem({
    required this.barcode,
    required this.name,
    required this.quantity,
    required this.price,
  });

  double get subtotal => quantity * price;

  CartItem copyWith({
    String? barcode,
    String? name,
    double? quantity,
    double? price,
  }) {
    return CartItem(
      barcode: barcode ?? this.barcode,
      name: name ?? this.name,
      quantity: quantity ?? this.quantity,
      price: price ?? this.price,
    );
  }

  @override
  List<Object?> get props => [barcode, name, quantity, price];
}
