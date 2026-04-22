import 'dart:convert';
import 'package:http/http.dart' as http;
import '../constants.dart';

class ApiService {
  Future<List<dynamic>> fetchCustomers() async {
    final response = await http.get(Uri.parse('${AppConstants.baseUrl}/customers/'));
    if (response.statusCode == 200) {
      return json.decode(response.body);
    } else {
      throw Exception('Failed to load customers');
    }
  }

  Future<Map<String, dynamic>> createCustomer(Map<String, dynamic> data) async {
    final response = await http.post(
      Uri.parse('${AppConstants.baseUrl}/customers/'),
      headers: {'Content-Type': 'application/json'},
      body: json.encode(data),
    );
    if (response.statusCode == 200 || response.statusCode == 201) {
      return json.decode(response.body);
    } else {
      throw Exception('Failed to create customer');
    }
  }

  Future<List<dynamic>> fetchCatalog() async {
    final response = await http.get(Uri.parse('${AppConstants.baseUrl}/catalog/'));
    if (response.statusCode == 200) {
      return json.decode(response.body);
    } else {
      throw Exception('Failed to load catalog');
    }
  }

  Future<Map<String, dynamic>> createOrder(Map<String, dynamic> data) async {
    final response = await http.post(
      Uri.parse('${AppConstants.baseUrl}/orders/'),
      headers: {'Content-Type': 'application/json'},
      body: json.encode(data),
    );
    if (response.statusCode == 200 || response.statusCode == 201) {
      return json.decode(response.body);
    } else {
      throw Exception('Failed to create order');
    }
  }
}
