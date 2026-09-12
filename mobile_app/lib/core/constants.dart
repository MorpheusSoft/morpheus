import 'services/kiosk_config_service.dart';

class AppConstants {
  // Retorna la URL dinámica configurada en el Kiosco, con fallback al valor por defecto
  static String get baseUrl => KioskConfigService.instance.serverUrl;
}
