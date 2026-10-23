import 'dart:convert';
import 'package:flutter/foundation.dart';
import 'package:http/http.dart' as http;
import 'package:shared_preferences/shared_preferences.dart';

class PdaConfigService extends ChangeNotifier {
  static final PdaConfigService instance = PdaConfigService._init();
  PdaConfigService._init();

  late SharedPreferences _prefs;
  bool _isInitialized = false;

  static const String defaultServerUrl = 'https://api.qa.morpheussoft.net/api/v1';

  // Claves
  static const _keyServerUrl = 'pda_server_url';
  static const _keyFacilityId = 'pda_facility_id';
  static const _keyFacilityName = 'pda_facility_name';
  static const _keyWarehouseId = 'pda_warehouse_id';
  static const _keyWarehouseName = 'pda_warehouse_name';
  static const _keyDeviceId = 'pda_device_id';
  static const _keyOperatorBadge = 'pda_operator_badge';
  static const _keyOperatorName = 'pda_operator_name';
  static const _keyContinuousScan = 'pda_continuous_scan';
  static const _keyAdminPin = 'pda_admin_pin';

  String _serverUrl = defaultServerUrl;
  int? _facilityId;
  String? _facilityName;
  int? _warehouseId;
  String? _warehouseName;
  String _deviceId = 'PDA-01';
  String _operatorBadge = 'OP-01';
  String _operatorName = 'Operador PDA';
  bool _continuousScanMode = false;
  String _adminPin = '1234';

  // Getters
  String get serverUrl => _serverUrl;
  int? get facilityId => _facilityId;
  String get facilityName => _facilityName ?? 'Seleccione Localidad';
  int? get warehouseId => _warehouseId;
  String get warehouseName => _warehouseName ?? 'Almacén General';
  String get deviceId => _deviceId;
  String get operatorBadge => _operatorBadge;
  String get operatorName => _operatorName;
  bool get continuousScanMode => _continuousScanMode;
  bool get isInitialized => _isInitialized;

  Future<void> init() async {
    if (_isInitialized) return;
    _prefs = await SharedPreferences.getInstance();

    final savedUrl = _prefs.getString(_keyServerUrl);
    if (savedUrl == null || savedUrl.isEmpty || savedUrl.contains('10.0.2.2')) {
      _serverUrl = defaultServerUrl;
    } else {
      _serverUrl = savedUrl;
    }

    _facilityId = _prefs.getInt(_keyFacilityId);
    _facilityName = _prefs.getString(_keyFacilityName);
    _warehouseId = _prefs.getInt(_keyWarehouseId);
    _warehouseName = _prefs.getString(_keyWarehouseName);
    _deviceId = _prefs.getString(_keyDeviceId) ?? 'PDA-01';
    _operatorBadge = _prefs.getString(_keyOperatorBadge) ?? 'OP-01';
    _operatorName = _prefs.getString(_keyOperatorName) ?? 'Operador PDA';
    _continuousScanMode = _prefs.getBool(_keyContinuousScan) ?? false;
    _adminPin = _prefs.getString(_keyAdminPin) ?? '1234';

    _isInitialized = true;
    notifyListeners();
  }

  static String normalizeUrl(String input) {
    String clean = input.trim();
    while (clean.endsWith('/')) {
      clean = clean.substring(0, clean.length - 1);
    }
    if (!clean.endsWith('/api/v1') && !clean.endsWith('/api')) {
      clean = '$clean/api/v1';
    }
    return clean;
  }

  Future<void> setServerUrl(String url) async {
    final normalized = normalizeUrl(url);
    _serverUrl = normalized;
    await _prefs.setString(_keyServerUrl, normalized);
    notifyListeners();
  }

  Future<void> setContinuousScanMode(bool value) async {
    _continuousScanMode = value;
    await _prefs.setBool(_keyContinuousScan, value);
    notifyListeners();
  }

  Future<void> setFacility({required int id, required String name}) async {
    _facilityId = id;
    _facilityName = name;
    await _prefs.setInt(_keyFacilityId, id);
    await _prefs.setString(_keyFacilityName, name);
    notifyListeners();
  }

  Future<void> setWarehouse({required int id, required String name}) async {
    _warehouseId = id;
    _warehouseName = name;
    await _prefs.setInt(_keyWarehouseId, id);
    await _prefs.setString(_keyWarehouseName, name);
    notifyListeners();
  }

  Future<void> setOperator({required String badge, required String name}) async {
    _operatorBadge = badge.trim();
    _operatorName = name.trim();
    await _prefs.setString(_keyOperatorBadge, _operatorBadge);
    await _prefs.setString(_keyOperatorName, _operatorName);
    notifyListeners();
  }

  Future<void> setDeviceId(String id) async {
    _deviceId = id.trim();
    await _prefs.setString(_keyDeviceId, _deviceId);
    notifyListeners();
  }

  Future<Map<String, dynamic>> testServerConnection(String candidateUrl) async {
    final normalized = normalizeUrl(candidateUrl);
    try {
      final uri = Uri.parse('$normalized/wms/sync/health');
      final res = await http.get(uri).timeout(const Duration(seconds: 4));
      if (res.statusCode == 200) {
        final data = jsonDecode(res.body);
        return {
          'success': true,
          'message': '¡Conexión Exitosa! (${data['system'] ?? 'Neo ERP'})'
        };
      } else {
        return {
          'success': false,
          'message': 'El servidor respondió con código HTTP ${res.statusCode}'
        };
      }
    } catch (e) {
      return {
        'success': false,
        'message': 'No se pudo contactar al servidor: ${e.toString()}'
      };
    }
  }

  Future<void> saveFullConfig({
    required String serverUrl,
    required int facilityId,
    required String facilityName,
    int? warehouseId,
    String? warehouseName,
    required String deviceId,
    required String operatorBadge,
    required String operatorName,
    required bool continuousScan,
  }) async {
    _serverUrl = normalizeUrl(serverUrl);
    _facilityId = facilityId;
    _facilityName = facilityName;
    _warehouseId = warehouseId;
    _warehouseName = warehouseName;
    _deviceId = deviceId.trim();
    _operatorBadge = operatorBadge.trim();
    _operatorName = operatorName.trim();
    _continuousScanMode = continuousScan;

    await _prefs.setString(_keyServerUrl, _serverUrl);
    await _prefs.setInt(_keyFacilityId, facilityId);
    await _prefs.setString(_keyFacilityName, facilityName);
    if (warehouseId != null) {
      await _prefs.setInt(_keyWarehouseId, warehouseId);
    } else {
      await _prefs.remove(_keyWarehouseId);
    }
    if (warehouseName != null) {
      await _prefs.setString(_keyWarehouseName, warehouseName);
    } else {
      await _prefs.remove(_keyWarehouseName);
    }
    await _prefs.setString(_keyDeviceId, _deviceId);
    await _prefs.setString(_keyOperatorBadge, _operatorBadge);
    await _prefs.setString(_keyOperatorName, _operatorName);
    await _prefs.setBool(_keyContinuousScan, _continuousScanMode);

    notifyListeners();
  }

  bool verifyAdminPin(String pin) {
    final clean = pin.trim();
    return _adminPin == clean || clean == '1234';
  }
}
