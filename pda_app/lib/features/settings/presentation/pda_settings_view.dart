import 'package:flutter/material.dart';
import 'package:provider/provider.dart';
import '../../../core/database/pda_db_helper.dart';
import '../../../core/services/pda_config_service.dart';
import '../../../core/services/pda_sync_service.dart';

class PdaSettingsView extends StatefulWidget {
  const PdaSettingsView({super.key});

  @override
  State<PdaSettingsView> createState() => _PdaSettingsViewState();
}

class _PdaSettingsViewState extends State<PdaSettingsView> {
  final _serverUrlController = TextEditingController();
  final _deviceIdController = TextEditingController();
  final _operatorBadgeController = TextEditingController();
  final _operatorNameController = TextEditingController();

  List<Map<String, dynamic>> _facilities = [];
  List<Map<String, dynamic>> _warehouses = [];
  int? _selectedFacilityId;
  String? _selectedFacilityName;
  int? _selectedWarehouseId;
  String? _selectedWarehouseName;

  bool _isTestingConn = false;
  String? _connMessage;
  bool? _connSuccess;
  bool _isSyncingCatalog = false;

  @override
  void initState() {
    super.initState();
    final config = PdaConfigService.instance;
    _serverUrlController.text = config.serverUrl;
    _deviceIdController.text = config.deviceId;
    _operatorBadgeController.text = config.operatorBadge;
    _operatorNameController.text = config.operatorName;
    _selectedFacilityId = config.facilityId;
    _selectedFacilityName = config.facilityName;
    _selectedWarehouseId = config.warehouseId;
    _selectedWarehouseName = config.warehouseName;

    _loadLocalDropdownData();
  }

  Future<void> _loadLocalDropdownData() async {
    final facs = await PdaDatabaseHelper.instance.getCachedFacilities();
    final whs = await PdaDatabaseHelper.instance.getCachedWarehouses(facilityId: _selectedFacilityId);
    setState(() {
      _facilities = facs;
      _warehouses = whs;
    });
  }

  @override
  void dispose() {
    _serverUrlController.dispose();
    _deviceIdController.dispose();
    _operatorBadgeController.dispose();
    _operatorNameController.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    final config = context.watch<PdaConfigService>();
    final sync = context.watch<PdaSyncService>();

    return Scaffold(
      backgroundColor: const Color(0xFF0F101A),
      appBar: AppBar(
        backgroundColor: const Color(0xFF181926),
        elevation: 2,
        leading: IconButton(
          icon: const Icon(Icons.arrow_back, color: Colors.white),
          onPressed: () => Navigator.pop(context),
        ),
        title: const Text(
          'CONFIGURACIÓN NEO PDA',
          style: TextStyle(color: Colors.white, fontSize: 16, fontWeight: FontWeight.bold, letterSpacing: 0.8),
        ),
      ),
      body: SafeArea(
        child: SingleChildScrollView(
          padding: const EdgeInsets.all(16),
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.stretch,
            children: [
              // 1. SERVIDOR CENTRAL NEO ERP
              _buildSectionCard(
                title: 'SERVIDOR CENTRAL NEO ERP',
                icon: Icons.dns_outlined,
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.stretch,
                  children: [
                    TextField(
                      controller: _serverUrlController,
                      style: const TextStyle(color: Colors.white, fontSize: 14),
                      decoration: const InputDecoration(
                        labelText: 'URL de la API',
                        labelStyle: TextStyle(color: Colors.white60),
                        hintText: 'https://api.qa.morpheussoft.net/api/v1',
                        border: OutlineInputBorder(),
                      ),
                    ),
                    const SizedBox(height: 12),
                    Row(
                      children: [
                        ElevatedButton.icon(
                          style: ElevatedButton.styleFrom(
                            backgroundColor: const Color(0xFF2E3148),
                            foregroundColor: Colors.white,
                          ),
                          icon: _isTestingConn
                              ? const SizedBox(width: 14, height: 14, child: CircularProgressIndicator(strokeWidth: 2, color: Colors.white))
                              : const Icon(Icons.network_ping, size: 16),
                          label: const Text('Probar Conexión', style: TextStyle(fontSize: 12)),
                          onPressed: _isTestingConn
                              ? null
                              : () async {
                                  setState(() {
                                    _isTestingConn = true;
                                    _connMessage = null;
                                  });
                                  final res = await config.testServerConnection(_serverUrlController.text);
                                  setState(() {
                                    _isTestingConn = false;
                                    _connSuccess = res['success'];
                                    _connMessage = res['message'];
                                  });
                                },
                        ),
                      ],
                    ),
                    if (_connMessage != null) ...[
                      const SizedBox(height: 10),
                      Text(
                        _connMessage!,
                        style: TextStyle(
                          color: _connSuccess == true ? Colors.greenAccent : Colors.redAccent,
                          fontSize: 12,
                          fontWeight: FontWeight.bold,
                        ),
                      ),
                    ],
                    const SizedBox(height: 14),
                    OutlinedButton.icon(
                      style: OutlinedButton.styleFrom(
                        side: const BorderSide(color: Color(0xFF00D2FF)),
                        padding: const EdgeInsets.symmetric(vertical: 12),
                      ),
                      icon: _isSyncingCatalog
                          ? const SizedBox(width: 16, height: 16, child: CircularProgressIndicator(strokeWidth: 2, color: Color(0xFF00D2FF)))
                          : const Icon(Icons.cloud_download, color: Color(0xFF00D2FF)),
                      label: Text(
                        _isSyncingCatalog ? 'Descargando Catálogo...' : 'Descargar / Actualizar Catálogo Maestro',
                        style: const TextStyle(color: Color(0xFF00D2FF), fontWeight: FontWeight.bold),
                      ),
                      onPressed: _isSyncingCatalog
                          ? null
                          : () async {
                              setState(() => _isSyncingCatalog = true);
                              await config.setServerUrl(_serverUrlController.text);
                              final ok = await sync.syncCatalog();
                              if (ok) {
                                await _loadLocalDropdownData();
                              }
                              setState(() => _isSyncingCatalog = false);
                              if (context.mounted) {
                                ScaffoldMessenger.of(context).showSnackBar(
                                  SnackBar(
                                    content: Text(ok
                                        ? '✓ Catálogo maestro descargado exitosamente.'
                                        : '✗ ${sync.lastError ?? "Error al descargar catálogo"}'),
                                    backgroundColor: ok ? Colors.green.shade800 : Colors.red.shade800,
                                  ),
                                );
                              }
                            },
                    ),
                  ],
                ),
              ),
              const SizedBox(height: 16),

              // 2. LOCALIDAD Y ALMACÉN
              _buildSectionCard(
                title: 'SUCURSAL Y ALMACÉN',
                icon: Icons.store_outlined,
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.stretch,
                  children: [
                    DropdownButtonFormField<int?>(
                      dropdownColor: const Color(0xFF1E2032),
                      style: const TextStyle(color: Colors.white, fontSize: 14),
                      decoration: const InputDecoration(
                        labelText: 'Sucursal / Tienda',
                        labelStyle: TextStyle(color: Colors.white60),
                        border: OutlineInputBorder(),
                      ),
                      value: _selectedFacilityId,
                      items: _facilities.map((f) {
                        return DropdownMenuItem<int?>(
                          value: f['id'],
                          child: Text('${f['code']} - ${f['name']}', overflow: TextOverflow.ellipsis),
                        );
                      }).toList(),
                      onChanged: (val) async {
                        setState(() {
                          _selectedFacilityId = val;
                          _selectedFacilityName = val != null
                              ? _facilities.firstWhere((f) => f['id'] == val)['name']
                              : null;
                          _selectedWarehouseId = null;
                        });
                        final whs = await PdaDatabaseHelper.instance.getCachedWarehouses(facilityId: val);
                        setState(() {
                          _warehouses = whs;
                          if (whs.isNotEmpty) {
                            _selectedWarehouseId = whs.first['id'];
                            _selectedWarehouseName = whs.first['name'];
                          }
                        });
                      },
                    ),
                    const SizedBox(height: 14),
                    DropdownButtonFormField<int?>(
                      dropdownColor: const Color(0xFF1E2032),
                      style: const TextStyle(color: Colors.white, fontSize: 14),
                      decoration: const InputDecoration(
                        labelText: 'Almacén Predeterminado',
                        labelStyle: TextStyle(color: Colors.white60),
                        border: OutlineInputBorder(),
                      ),
                      value: _selectedWarehouseId,
                      items: _warehouses.map((w) {
                        return DropdownMenuItem<int?>(
                          value: w['id'],
                          child: Text('${w['code']} - ${w['name']}', overflow: TextOverflow.ellipsis),
                        );
                      }).toList(),
                      onChanged: (val) {
                        setState(() {
                          _selectedWarehouseId = val;
                          _selectedWarehouseName = val != null
                              ? _warehouses.firstWhere((w) => w['id'] == val)['name']
                              : null;
                        });
                      },
                    ),
                  ],
                ),
              ),
              const SizedBox(height: 16),

              // 3. IDENTIFICADOR DE TERMINAL Y OPERADOR
              _buildSectionCard(
                title: 'TERMINAL Y OPERADOR',
                icon: Icons.person_outline,
                child: Column(
                  children: [
                    TextField(
                      controller: _deviceIdController,
                      style: const TextStyle(color: Colors.white, fontSize: 14),
                      decoration: const InputDecoration(
                        labelText: 'Identificador de PDA',
                        labelStyle: TextStyle(color: Colors.white60),
                        hintText: 'Ej. PDA-01',
                        border: OutlineInputBorder(),
                      ),
                    ),
                    const SizedBox(height: 14),
                    TextField(
                      controller: _operatorBadgeController,
                      style: const TextStyle(color: Colors.white, fontSize: 14),
                      decoration: const InputDecoration(
                        labelText: 'Carnet / Código de Operador',
                        labelStyle: TextStyle(color: Colors.white60),
                        hintText: 'Ej. OP-01 o Cédula',
                        border: OutlineInputBorder(),
                      ),
                    ),
                  ],
                ),
              ),
              const SizedBox(height: 24),

              // BOTÓN GUARDAR
              ElevatedButton.icon(
                style: ElevatedButton.styleFrom(
                  backgroundColor: const Color(0xFF00D2FF),
                  foregroundColor: Colors.black,
                  padding: const EdgeInsets.symmetric(vertical: 14),
                  shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(10)),
                ),
                icon: const Icon(Icons.save, size: 20),
                label: const Text('GUARDAR CONFIGURACIÓN', style: TextStyle(fontWeight: FontWeight.bold, fontSize: 15)),
                onPressed: () async {
                  if (_selectedFacilityId == null) {
                    ScaffoldMessenger.of(context).showSnackBar(
                      const SnackBar(content: Text('Por favor seleccione una sucursal.')),
                    );
                    return;
                  }
                  await config.saveFullConfig(
                    serverUrl: _serverUrlController.text,
                    facilityId: _selectedFacilityId!,
                    facilityName: _selectedFacilityName ?? 'Sucursal',
                    warehouseId: _selectedWarehouseId,
                    warehouseName: _selectedWarehouseName,
                    deviceId: _deviceIdController.text,
                    operatorBadge: _operatorBadgeController.text,
                    operatorName: _operatorNameController.text,
                    continuousScan: config.continuousScanMode,
                  );
                  if (context.mounted) {
                    ScaffoldMessenger.of(context).showSnackBar(
                      const SnackBar(
                        content: Text('✓ Configuración guardada correctamente.'),
                        backgroundColor: Colors.green,
                      ),
                    );
                    Navigator.pop(context);
                  }
                },
              ),
            ],
          ),
        ),
      ),
    );
  }

  Widget _buildSectionCard({
    required String title,
    required IconData icon,
    required Widget child,
  }) {
    return Container(
      padding: const EdgeInsets.all(16),
      decoration: BoxDecoration(
        color: const Color(0xFF161826),
        borderRadius: BorderRadius.circular(12),
        border: Border.all(color: const Color(0xFF26293E)),
      ),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Row(
            children: [
              Icon(icon, color: const Color(0xFF00D2FF), size: 18),
              const SizedBox(width: 8),
              Text(
                title,
                style: const TextStyle(
                  color: Color(0xFF00D2FF),
                  fontSize: 12,
                  fontWeight: FontWeight.bold,
                  letterSpacing: 0.8,
                ),
              ),
            ],
          ),
          const SizedBox(height: 14),
          child,
        ],
      ),
    );
  }
}
