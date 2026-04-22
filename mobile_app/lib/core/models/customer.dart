class Customer {
  final int? id;
  final String rif;
  final String name;
  final String? address;
  final String? shippingAddress;
  final String? phone;
  final String? email;
  final int isActive;
  final int isSynced;

  Customer({
    this.id,
    required this.rif,
    required this.name,
    this.address,
    this.shippingAddress,
    this.phone,
    this.email,
    this.isActive = 1,
    this.isSynced = 1,
  });

  factory Customer.fromJson(Map<String, dynamic> json) {
    return Customer(
      id: json['id'],
      rif: json['rif'],
      name: json['name'],
      address: json['address'],
      shippingAddress: json['shipping_address'] ?? json['shippingAddress'],
      phone: json['phone'],
      email: json['email'],
      isActive: json['is_active'] == true || json['is_active'] == 1 ? 1 : 0,
      isSynced: 1, // From API means synced
    );
  }

  Map<String, dynamic> toJson() {
    return {
      'id': id,
      'rif': rif,
      'name': name,
      'address': address,
      'shipping_address': shippingAddress,
      'phone': phone,
      'email': email,
      'is_active': isActive == 1,
    };
  }

  factory Customer.fromMap(Map<String, dynamic> map) {
    return Customer(
      id: map['id'],
      rif: map['rif'],
      name: map['name'],
      address: map['address'],
      shippingAddress: map['shipping_address'],
      phone: map['phone'],
      email: map['email'],
      isActive: map['is_active'],
      isSynced: map['is_synced'] ?? 1,
    );
  }

  Map<String, dynamic> toMap() {
    return {
      if (id != null) 'id': id,
      'rif': rif,
      'name': name,
      'address': address,
      'shipping_address': shippingAddress,
      'phone': phone,
      'email': email,
      'is_active': isActive,
      'is_synced': isSynced,
    };
  }
}
