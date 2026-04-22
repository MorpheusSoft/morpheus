class Order {
  final int? localId;
  final int? serverId;
  final int customerId;
  final String status;
  final double totalAmount;
  final String? notes;
  final String createdAt;
  final int isSynced;
  final List<OrderItem> items;

  Order({
    this.localId,
    this.serverId,
    required this.customerId,
    this.status = 'PENDING',
    required this.totalAmount,
    this.notes,
    required this.createdAt,
    this.isSynced = 0,
    required this.items,
  });

  Map<String, dynamic> toApiJson() {
    return {
      'customer_id': customerId,
      'status': status,
      'total_amount': totalAmount,
      'notes': notes,
      'items': items.map((item) => item.toApiJson()).toList(),
    };
  }

  Map<String, dynamic> toDbMap() {
    return {
      if (localId != null) 'local_id': localId,
      'server_id': serverId,
      'customer_id': customerId,
      'status': status,
      'total_amount': totalAmount,
      'notes': notes,
      'created_at': createdAt,
      'is_synced': isSynced,
    };
  }
}

class OrderItem {
  final int? id;
  final int? orderLocalId;
  final int productId;
  final int quantity;
  final double unitPrice;
  final double subtotal;

  OrderItem({
    this.id,
    this.orderLocalId,
    required this.productId,
    required this.quantity,
    required this.unitPrice,
    required this.subtotal,
  });

  Map<String, dynamic> toApiJson() {
    return {
      'product_id': productId,
      'quantity': quantity,
      'unit_price': unitPrice,
      'subtotal': subtotal,
    };
  }

  Map<String, dynamic> toDbMap(int localOrderId) {
    return {
      if (id != null) 'id': id,
      'order_local_id': localOrderId,
      'product_id': productId,
      'quantity': quantity,
      'unit_price': unitPrice,
      'subtotal': subtotal,
    };
  }
}
