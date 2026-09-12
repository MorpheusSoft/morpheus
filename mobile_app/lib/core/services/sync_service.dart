import 'dart:async';
import 'dart:convert';
import 'package:flutter/foundation.dart';
import 'package:http/http.dart' as http;
import '../constants.dart';
import '../database/db_helper.dart';
import 'kiosk_config_service.dart';

class SyncService extends ChangeNotifier {
  static final SyncService instance = SyncService._init();

  SyncService._init();

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
    // Iniciar verificación de conectividad y sincronización periódica
    _startPeriodicSync();
    // Ejecutar chequeo inicial
    checkConnectivityAndSync();
  }

  void _startPeriodicSync() {
    _autoSyncTimer?.cancel();
    // Intentar sincronizar cada 15 segundos en segundo plano
    _autoSyncTimer = Timer.periodic(const Duration(seconds: 15), (_) {
      checkConnectivityAndSync();
    });
  }

  Future<void> refreshPendingCount() async {
    _pendingCount = await DatabaseHelper.instance.getPendingRelocationsCount();
    notifyListeners();
  }

  // ===========================================================================
  // 1. Verificación de Salud / Conectividad
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
  // 2. Descarga del Catálogo Maestro
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

        await DatabaseHelper.instance.saveCatalogToCache(
          facilities: facilities,
          warehouses: warehouses,
          locations: locations,
          products: products,
        );

        _isOnline = true;
        _lastSyncTime = DateTime.now();
        _lastError = null;
        _isSyncing = false;
        notifyListeners();
        return true;
      } else {
        _lastError = 'Error al descargar catálogo (${response.statusCode}): ${response.reasonPhrase}';
      }
    } catch (e) {
      _isOnline = false;
      _lastError = 'Error de conexión: $e';
    }

    _isSyncing = false;
    notifyListeners();
    return false;
  }

  // ===========================================================================
  // 3. Envío de la Cola Outbox de Reubicaciones
  // ===========================================================================
  Future<void> syncPendingRelocations() async {
    if (_isSyncing) return;

    final pending = await DatabaseHelper.instance.getPendingRelocations();
    if (pending.isEmpty) {
      _pendingCount = 0;
      notifyListeners();
      return;
    }

    _isSyncing = true;
    notifyListeners();

    try {
      final config = KioskConfigService.instance;
      final items = pending.map((row) {
        return {
          'client_uuid': row['client_uuid'],
          'barcode': row['barcode'],
          'variant_id': row['variant_id'],
          'source_warehouse_id': row['source_warehouse_id'],
          'source_location_id': row['source_location_id'],
          'dest_warehouse_id': row['dest_warehouse_id'],
          'dest_location_id': row['dest_location_id'],
          'quantity': row['quantity'],
          'uom': row['uom'] ?? 'UND',
          'operator_code': row['operator_code'],
          'device_id': row['device_id'],
          'offline_scanned_at': row['offline_scanned_at'],
        };
      }).toList();

      final payload = {
        'device_id': config.deviceId,
        'operator_code': config.operatorBadge,
        'facility_id': config.facilityId,
        'items': items,
      };

      final url = Uri.parse('${AppConstants.baseUrl}/wms/sync/relocations');
      final response = await http.post(
        url,
        headers: {'Content-Type': 'application/json'},
        body: jsonEncode(payload),
      ).timeout(const Duration(seconds: 12));

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
            await DatabaseHelper.instance.markRelocationError(uuid, res['message'] ?? 'Error desconocido');
          }
        }

        if (syncedUuids.isNotEmpty) {
          await DatabaseHelper.instance.markRelocationsAsSynced(syncedUuids);
        }

        _isOnline = true;
        _lastSyncTime = DateTime.now();
        _lastError = null;
      } else {
        _lastError = 'Error de sincronización (${response.statusCode})';
      }
    } catch (e) {
      _isOnline = false;
      _lastError = 'Fallo de conexión al sincronizar movimientos';
    }

    await refreshPendingCount();
    _isSyncing = false;
    notifyListeners();
  }

  // ===========================================================================
  // 4. Ciclo Integral: Chequeo de red y Despacho
  // ===========================================================================
  Future<void> checkConnectivityAndSync() async {
    final online = await checkConnectivity();
    if (online) {
      // 1. Despachar movimientos pendientes
      await syncPendingRelocations();
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
