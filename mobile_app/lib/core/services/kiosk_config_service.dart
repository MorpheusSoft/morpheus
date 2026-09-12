import 'dart:convert';
import 'package:flutter/foundation.dart';
import 'package:http/http.dart' as http;
import 'package:shared_preferences/shared_preferences.dart';

enum KioskOperatingMode {
  express,   // Pre-configurado: Origen y Destino fijos, velocidad máxima
  detailed,  // Dinámico: Selección o escaneo de ubicación por movimiento
}

class KioskConfigService extends ChangeNotifier {
  static final KioskConfigService instance = KioskConfigService._init();

  KioskConfigService._init();

  late SharedPreferences _prefs;
  bool _isInitialized = false;

  // Claves de SharedPreferences
  static const _keyOperatingMode = 'wms_operating_mode';
  static const _keySrcWhId = 'wms_src_wh_id';
  static const _keySrcWhName = 'wms_src_wh_name';
  static const _keyDestWhId = 'wms_dest_wh_id';
  static const _keyDestWhName = 'wms_dest_wh_name';
  static const _keySrcLocId = 'wms_src_loc_id';
  static const _keySrcLocName = 'wms_src_loc_name';
  static const _keyDestLocId = 'wms_dest_loc_id';
  static const _keyDestLocName = 'wms_dest_loc_name';
  static const _keyDeviceId = 'wms_device_id';
  static const _keyFacilityId = 'wms_facility_id';
  static const _keyFacilityName = 'wms_facility_name';
  static const _keyOperatorBadge = 'wms_operator_badge';
  static const _keyOperatorName = 'wms_operator_name';
  static const _keyAdminPin = 'wms_admin_pin';
  static const _keyServerUrl = 'wms_server_url';

  // URL Predeterminada de Fábrica (Servidor Central Neo ERP)
  static const String defaultServerUrl = 'https://api.qa.morpheussoft.net/api/v1';

  // Valores en Memoria
  KioskOperatingMode _mode = KioskOperatingMode.express;
  int? _sourceWarehouseId;
  String? _sourceWarehouseName;
  int? _destWarehouseId;
  String? _destWarehouseName;
  int? _sourceLocationId;
  String? _sourceLocationName;
  int? _destLocationId;
  String? _destLocationName;
  String _deviceId = 'KIOSK-TIENDA-01';
  int? _facilityId;
  String? _facilityName;
  String _operatorBadge = 'OP-01';
  String _operatorName = 'Operador General';
  String _adminPin = '1234';
  String _serverUrl = defaultServerUrl;

  // Getters
  KioskOperatingMode get mode => _mode;
  bool get isExpressMode => _mode == KioskOperatingMode.express;
  int? get sourceWarehouseId => _sourceWarehouseId;
  String get sourceWarehouseName => _sourceWarehouseName ?? 'Almacén Origen';
  int? get destWarehouseId => _destWarehouseId;
  String get destWarehouseName => _destWarehouseName ?? 'Piso de Venta';
  int? get sourceLocationId => _sourceLocationId;
  String? get sourceLocationName => _sourceLocationName;
  int? get destLocationId => _destLocationId;
  String? get destLocationName => _destLocationName;
  String get deviceId => _deviceId;
  int? get facilityId => _facilityId;
  String get facilityName => _facilityName ?? 'Seleccione Localidad';
  String get operatorBadge => _operatorBadge;
  String get operatorName => _operatorName;
  String get adminPin => _adminPin;
  String get serverUrl => _serverUrl;
  bool get isInitialized => _isInitialized;

  Future<void> init() async {
    if (_isInitialized) return;
    _prefs = await SharedPreferences.getInstance();

    final modeStr = _prefs.getString(_keyOperatingMode) ?? 'EXPRESS';
    _mode = modeStr == 'DETAILED' ? KioskOperatingMode.detailed : KioskOperatingMode.express;

    _sourceWarehouseId = _prefs.getInt(_keySrcWhId);
    _sourceWarehouseName = _prefs.getString(_keySrcWhName);

    _destWarehouseId = _prefs.getInt(_keyDestWhId);
    _destWarehouseName = _prefs.getString(_keyDestWhName);

    _sourceLocationId = _prefs.getInt(_keySrcLocId);
    _sourceLocationName = _prefs.getString(_keySrcLocName);
    _destLocationId = _prefs.getInt(_keyDestLocId);
    _destLocationName = _prefs.getString(_keyDestLocName);

    _deviceId = _prefs.getString(_keyDeviceId) ?? 'KIOSK-TIENDA-01';
    _facilityId = _prefs.getInt(_keyFacilityId);
    _facilityName = _prefs.getString(_keyFacilityName);
    _operatorBadge = _prefs.getString(_keyOperatorBadge) ?? 'OP-01';
    _operatorName = _prefs.getString(_keyOperatorName) ?? 'Operador de Turno';
    _adminPin = _prefs.getString(_keyAdminPin) ?? '1234';

    final savedUrl = _prefs.getString(_keyServerUrl);
    if (savedUrl == null || savedUrl.isEmpty || savedUrl.contains('10.0.2.2')) {
      _serverUrl = defaultServerUrl;
    } else {
      _serverUrl = savedUrl;
    }

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

  Future<void> saveFullKioskConfig({
    required KioskOperatingMode mode,
    required int facilityId,
    required String facilityName,
    int? srcWhId,
    String? srcWhName,
    int? srcLocId,
    String? srcLocName,
    int? destWhId,
    String? destWhName,
    int? destLocId,
    String? destLocName,
    required String deviceId,
    required String operatorBadge,
    required String serverUrl,
  }) async {
    _mode = mode;
    _facilityId = facilityId;
    _facilityName = facilityName;
    _sourceWarehouseId = srcWhId;
    _sourceWarehouseName = srcWhName;
    _sourceLocationId = srcLocId;
    _sourceLocationName = srcLocName;
    _destWarehouseId = destWhId;
    _destWarehouseName = destWhName;
    _destLocationId = destLocId;
    _destLocationName = destLocName;
    _deviceId = deviceId.trim();
    _operatorBadge = operatorBadge.trim();
    final normalizedUrl = normalizeUrl(serverUrl);
    _serverUrl = normalizedUrl;

    await _prefs.setString(_keyOperatingMode, mode == KioskOperatingMode.detailed ? 'DETAILED' : 'EXPRESS');
    await _prefs.setInt(_keyFacilityId, facilityId);
    await _prefs.setString(_keyFacilityName, facilityName);

    if (srcWhId != null) {
      await _prefs.setInt(_keySrcWhId, srcWhId);
    } else {
      await _prefs.remove(_keySrcWhId);
    }
    if (srcWhName != null) {
      await _prefs.setString(_keySrcWhName, srcWhName);
    } else {
      await _prefs.remove(_keySrcWhName);
    }

    if (srcLocId != null) {
      await _prefs.setInt(_keySrcLocId, srcLocId);
    } else {
      await _prefs.remove(_keySrcLocId);
    }
    if (srcLocName != null) {
      await _prefs.setString(_keySrcLocName, srcLocName);
    } else {
      await _prefs.remove(_keySrcLocName);
    }

    if (destWhId != null) {
      await _prefs.setInt(_keyDestWhId, destWhId);
    } else {
      await _prefs.remove(_keyDestWhId);
    }
    if (destWhName != null) {
      await _prefs.setString(_keyDestWhName, destWhName);
    } else {
      await _prefs.remove(_keyDestWhName);
    }

    if (destLocId != null) {
      await _prefs.setInt(_keyDestLocId, destLocId);
    } else {
      await _prefs.remove(_keyDestLocId);
    }
    if (destLocName != null) {
      await _prefs.setString(_keyDestLocName, destLocName);
    } else {
      await _prefs.remove(_keyDestLocName);
    }

    await _prefs.setString(_keyDeviceId, _deviceId);
    await _prefs.setString(_keyOperatorBadge, _operatorBadge);
    await _prefs.setString(_keyServerUrl, _serverUrl);

    notifyListeners();
  }

  Future<void> setOperatingMode(KioskOperatingMode mode) async {
    _mode = mode;
    await _prefs.setString(_keyOperatingMode, mode == KioskOperatingMode.detailed ? 'DETAILED' : 'EXPRESS');
    notifyListeners();
  }

  Future<void> setOperator({required String badge, required String name}) async {
    _operatorBadge = badge;
    _operatorName = name;
    await _prefs.setString(_keyOperatorBadge, badge);
    await _prefs.setString(_keyOperatorName, name);
    notifyListeners();
  }

  bool verifyAdminPin(String pin) {
    final clean = pin.trim();
    return _adminPin == clean || clean == '1234';
  }
}
