class Product {
  final int id;
  final String sku;
  final String name;
  final String? description;
  final double price;
  final int stock;

  Product({
    required this.id,
    required this.sku,
    required this.name,
    this.description,
    required this.price,
    required this.stock,
  });

  factory Product.fromJson(Map<String, dynamic> json) {
    return Product(
      id: json['id'],
      sku: json['sku'],
      name: json['name'],
      description: json['description'],
      price: (json['price'] ?? 0).toDouble(), // Replace based on API structure
      stock: json['stock'] ?? 0,
    );
  }

  factory Product.fromMap(Map<String, dynamic> map) {
    return Product(
      id: map['id'],
      sku: map['sku'],
      name: map['name'],
      description: map['description'],
      price: map['price'],
      stock: map['stock'],
    );
  }

  Map<String, dynamic> toMap() {
    return {
      'id': id,
      'sku': sku,
      'name': name,
      'description': description,
      'price': price,
      'stock': stock,
    };
  }
}
