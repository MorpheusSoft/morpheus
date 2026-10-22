import 'services/pda_config_service.dart';

class AppConstants {
  static const String appName = 'Neo PDA';
  static const String systemName = 'Neo ERP - WMS Handheld';

  // URL dinámica configurada en la PDA
  static String get baseUrl => PdaConfigService.instance.serverUrl;
}
