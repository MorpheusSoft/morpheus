import 'dart:async';
import 'dart:convert';
import 'package:flutter/foundation.dart';
import 'package:http/http.dart' as http;
import '../constants.dart';
import '../database/pda_db_helper.dart';
import 'pda_config_service.dart';

class PdaSyncService extends ChangeNotifier {
  static final PdaSyncService instance = PdaSyncService._init();
  PdaSyncService._init();

  bool _isOnline = false;
  bool _isSyncing = false;
  int _pendingCount = 0;
  String? _lastError;
  DateTime? _lastSyncTime;
  Timer? _autoSyncTimer;

  bool get isOnline => _isOnline;
  bool get isSyncing => _isSyncing;
  int get pendingCount => _pendingCount;
  String? get lastError => _lastError;
  DateTime? get lastSyncTime => _lastSyncTime;

  Future<void> init() async {
    await refreshPendingCount();
    _startPeriodicSync();
    checkConnectivityAndSync();
  }

  void _startPeriodicSync() {
    _autoSyncTimer?.cancel();
    _autoSyncTimer = Timer.periodic(const Duration(seconds: 15), (_) {
      checkConnectivityAndSync();
    });
  }

  Future<void> refreshPendingCount() async {
    _pendingCount = await PdaDatabaseHelper.instance.getPendingCountsCount();
    notifyListeners();
  }

  // ===========================================================================
  // 1. Verificación de Conectividad
  // ===========================================================================
  Future<bool> checkConnectivity() async {
    try {
      final url = Uri.parse('${AppConstants.baseUrl}/wms/sync/health');
      final response = await http.get(url).timeout(const Duration(seconds: 3));
      if (response.statusCode == 200) {
        _isOnline = true;
        _lastError = null;
        notifyListeners();
        return true;
      }
    } catch (_) {}

    _isOnline = false;
    notifyListeners();
    return false;
  }

  // ===========================================================================
  // 2. Descarga de Catálogo Maestro
  // ===========================================================================
  Future<bool> syncCatalog({int? specificFacilityId}) async {
    if (_isSyncing) return false;
    _isSyncing = true;
    notifyListeners();

    try {
      final queryParam = specificFacilityId != null ? '?facility_id=$specificFacilityId' : '';
      final url = Uri.parse('${AppConstants.baseUrl}/wms/sync/catalog$queryParam');
      final response = await http.get(url).timeout(const Duration(seconds: 60));

      if (response.statusCode == 200) {
        final data = jsonDecode(utf8.decode(response.bodyBytes));
        final facilities = data['facilities'] as List? ?? [];
        final warehouses = data['warehouses'] as List? ?? [];
        final locations = data['locations'] as List? ?? [];
        final products = data['products'] as List? ?? [];

        await PdaDatabaseHelper.instance.saveCatalogToCache(
          facilities: facilities,
          warehouses: warehouses,
          locations: locations,
          products: products,
        );

        // También descargar sesiones activas
        await fetchInventorySessions(facilityId: specificFacilityId);

        _isOnline = true;
        _lastSyncTime = DateTime.now();
        _lastError = null;
        _isSyncing = false;
        notifyListeners();
        return true;
      } else {
        _lastError = 'Error del servidor (${response.statusCode}): ${response.reasonPhrase}';
      }
    } catch (e) {
      _isOnline = false;
      _lastError = 'Error de conexión al descargar catálogo: $e';
    }

    _isSyncing = false;
    notifyListeners();
    return false;
  }

  // ===========================================================================
  // 3. Consulta de Sesiones de Inventario Activas
  // ===========================================================================
  Future<List<Map<String, dynamic>>> fetchInventorySessions({int? facilityId}) async {
    try {
      final queryParam = facilityId != null ? '?facility_id=$facilityId' : '';
      final url = Uri.parse('${AppConstants.baseUrl}/wms/sync/inventory-sessions$queryParam');
      final response = await http.get(url).timeout(const Duration(seconds: 6));

      if (response.statusCode == 200) {
        final List sessions = jsonDecode(utf8.decode(response.bodyBytes));
        await PdaDatabaseHelper.instance.saveSessionsToCache(sessions);
        _isOnline = true;
        notifyListeners();
        return List<Map<String, dynamic>>.from(sessions);
      }
    } catch (_) {}

    // Si falló la red, obtener de SQLite
    return await PdaDatabaseHelper.instance.getCachedSessions(facilityId: facilityId);
  }

  // ===========================================================================
  // 4. Verificador de Precios (Online con fallback a SQLite)
  // ===========================================================================
  Future<Map<String, dynamic>?> lookupProduct(String code, {int? facilityId}) async {
    final clean = code.trim();
    if (clean.isEmpty) return null;

    // A. Si hay red, intentar consulta en tiempo real para obtener existencias actualizadas
    if (_isOnline) {
      try {
        final queryParam = facilityId != null ? '&facility_id=$facilityId' : '';
        final url = Uri.parse('${AppConstants.baseUrl}/wms/sync/product-inquiry?code=${Uri.encodeComponent(clean)}$queryParam');
        final response = await http.get(url).timeout(const Duration(seconds: 4));

        if (response.statusCode == 200) {
          final data = jsonDecode(utf8.decode(response.bodyBytes));
          data['is_online_data'] = true;
          return Map<String, dynamic>.from(data);
        }
      } catch (_) {}
    }

    // B. Fallback Offline: Buscar en SQLite local
    final localRow = await PdaDatabaseHelper.instance.findProductByBarcode(clean);
    if (localRow != null) {
      List packagings = [];
      try {
        if (localRow['packagings_json'] != null) {
          packagings = jsonDecode(localRow['packagings_json']);
        }
      } catch (_) {}

      return {
        'variant_id': localRow['variant_id'],
        'product_id': localRow['product_id'],
        'sku': localRow['sku'],
        'name': localRow['name'],
        'uom_base': localRow['uom_base'] ?? 'UND',
        'sales_price': (localRow['sales_price'] ?? 0.0).toDouble(),
        'stock_facility': null, // No disponible offline
        'facility_id': facilityId,
        'packagings': packagings,
        'warehouses': [],
        'is_online_data': false,
      };
    }

    return null;
  }

  // ===========================================================================
  // 5. Envío de Conteos Pendientes (Outbox)
  // ===========================================================================
  Future<void> syncPendingCounts() async {
    if (_isSyncing) return;

    final pending = await PdaDatabaseHelper.instance.getPendingCounts();
    if (pending.isEmpty) {
      _pendingCount = 0;
      notifyListeners();
      return;
    }

    _isSyncing = true;
    notifyListeners();

    try {
      final config = PdaConfigService.instance;
      final items = pending.map((row) {
        return {
          'client_uuid': row['client_uuid'],
          'session_id': row['session_id'],
          'barcode': row['barcode'],
          'variant_id': row['variant_id'],
          'facility_id': row['facility_id'] ?? config.facilityId,
          'warehouse_id': row['warehouse_id'] ?? config.warehouseId,
          'location_id': row['location_id'],
          'counted_qty': row['counted_qty'],
          'uom': row['uom'] ?? 'UND',
          'packaging_id': row['packaging_id'],
          'factor': row['factor'] ?? 1.0,
          'operator_code': row['operator_code'] ?? config.operatorBadge,
          'device_id': row['device_id'] ?? config.deviceId,
          'offline_scanned_at': row['offline_scanned_at'],
        };
      }).toList();

      final payload = {
        'device_id': config.deviceId,
        'operator_code': config.operatorBadge,
        'facility_id': config.facilityId,
        'warehouse_id': config.warehouseId,
        'items': items,
      };

      final url = Uri.parse('${AppConstants.baseUrl}/wms/sync/inventory-counts');
      final response = await http.post(
        url,
        headers: {'Content-Type': 'application/json'},
        body: jsonEncode(payload),
      ).timeout(const Duration(seconds: 15));

      if (response.statusCode == 200) {
        final data = jsonDecode(utf8.decode(response.bodyBytes));
        final results = data['results'] as List? ?? [];
        final syncedUuids = <String>[];

        for (final res in results) {
          final uuid = res['client_uuid'];
          final status = res['status'];
          if (status == 'SYNCED' || status == 'ALREADY_SYNCED') {
            syncedUuids.add(uuid);
          } else if (status == 'ERROR') {
            await PdaDatabaseHelper.instance.markCountError(uuid, res['message'] ?? 'Error desconocido');
          }
        }

        if (syncedUuids.isNotEmpty) {
          await PdaDatabaseHelper.instance.markCountsAsSynced(syncedUuids);
        }

        _isOnline = true;
        _lastSyncTime = DateTime.now();
        _lastError = null;
      } else {
        _lastError = 'Error al sincronizar conteos (${response.statusCode})';
      }
    } catch (e) {
      _isOnline = false;
      _lastError = 'Error de conexión al sincronizar conteos: $e';
    }

    await refreshPendingCount();
    _isSyncing = false;
    notifyListeners();
  }

  Future<void> checkConnectivityAndSync() async {
    final online = await checkConnectivity();
    if (online) {
      await syncPendingCounts();
    } else {
      await refreshPendingCount();
    }
  }

  @override
  void dispose() {
    _autoSyncTimer?.cancel();
    super.dispose();
  }
}
