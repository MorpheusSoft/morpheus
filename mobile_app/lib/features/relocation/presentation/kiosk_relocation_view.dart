import 'dart:io';
import 'dart:convert';
import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:provider/provider.dart';
import 'package:uuid/uuid.dart';

import '../../../core/database/db_helper.dart';
import '../../../core/services/kiosk_config_service.dart';
import '../../../core/services/sync_service.dart';
import '../../../core/services/barcode_scanner_listener.dart';

class KioskRelocationView extends StatefulWidget {
  const KioskRelocationView({super.key});

  @override
  State<KioskRelocationView> createState() => _KioskRelocationViewState();
}

class _KioskRelocationViewState extends State<KioskRelocationView> {
  final TextEditingController _barcodeInputController = TextEditingController();
  final FocusNode _manualInputFocusNode = FocusNode();

  // Estado del producto actualmente escaneado
  Map<String, dynamic>? _scannedProduct;
  double _quantity = 1.0;
  String? _selectedUom = 'UND';

  // Almacenes y ubicaciones para Modo Detallado
  int? _detailSourceWhId;
  String? _detailSourceWhName;
  int? _detailDestWhId;
  String? _detailDestWhName;
  int? _detailSourceLocId;
  String? _detailSourceLocName;
  int? _detailDestLocId;
  String? _detailDestLocName;
  List<Map<String, dynamic>> _cachedWarehouses = [];

  // Feedback visual
  String _bannerMessage = 'Kiosco listo para reubicación de mercancía';
  Color _bannerColor = const Color(0xFF2A2B3D);
  bool _isSuccessFlash = false;

  @override
  void initState() {
    super.initState();
    WidgetsBinding.instance.addPostFrameCallback((_) {
      _loadCachedWarehouses();
      // Iniciar descarga inicial de catálogo si está en línea y vacío
      SyncService.instance.checkConnectivityAndSync();
    });
  }

  Future<void> _loadCachedWarehouses() async {
    final config = KioskConfigService.instance;
    final whs = await DatabaseHelper.instance.getCachedWarehouses(facilityId: config.facilityId);
    if (mounted) {
      setState(() {
        _cachedWarehouses = whs;
        _detailSourceWhId = config.sourceWarehouseId ?? (whs.isNotEmpty ? whs.first['id'] : null);
        _detailDestWhId = config.destWarehouseId ?? (whs.length > 1 ? whs[1]['id'] : (whs.isNotEmpty ? whs.first['id'] : null));
        if (whs.isNotEmpty) {
          _detailSourceWhName = whs.firstWhere((w) => w['id'] == _detailSourceWhId, orElse: () => {'name': config.sourceWarehouseName})['name'];
          _detailDestWhName = whs.firstWhere((w) => w['id'] == _detailDestWhId, orElse: () => {'name': config.destWarehouseName})['name'];
        }
      });
    }
  }

  @override
  void dispose() {
    _barcodeInputController.dispose();
    _manualInputFocusNode.dispose();
    super.dispose();
  }

  // ===========================================================================
  // MANEJO DE ESCANEO DE CÓDIGO DE BARRAS
  // ===========================================================================
  Future<void> _handleBarcode(String rawCode) async {
    final cleanCode = rawCode.trim();
    if (cleanCode.isEmpty) return;

    SystemSound.play(SystemSoundType.click);

    final config = KioskConfigService.instance;

    // En Modo Detallado: verificar primero si el código corresponde a una UBICACIÓN
    if (!config.isExpressMode) {
      final location = await DatabaseHelper.instance.findLocationByBarcode(cleanCode);
      if (location != null) {
        _showLocationAssignDialog(location);
        return;
      }
    }

    // Buscar en base de datos local SQLite el producto
    final product = await DatabaseHelper.instance.findProductByBarcode(cleanCode);

    if (product == null) {
      // Producto no encontrado en caché local
      setState(() {
        _scannedProduct = null;
        _bannerMessage = '⚠️ Producto con código "$cleanCode" no encontrado en catálogo local.';
        _bannerColor = Colors.red.shade900;
        _isSuccessFlash = false;
      });
      return;
    }

    setState(() {
      _scannedProduct = product;
      _quantity = 1.0;
      _selectedUom = product['uom_base'] ?? 'UND';
      _bannerMessage = 'Producto detectado: ${product['name']} (${product['sku']})';
      _bannerColor = const Color(0xFF1E3A8A);
      _isSuccessFlash = false;
    });
  }

  // ===========================================================================
  // CONFIRMAR Y ASENTAR REUBICACIÓN (OFFLINE-FIRST)
  // ===========================================================================
  Future<void> _confirmRelocation() async {
    if (_scannedProduct == null) return;

    final config = KioskConfigService.instance;
    final isExpress = config.isExpressMode;

    final srcWhId = isExpress ? config.sourceWarehouseId : _detailSourceWhId;
    final destWhId = isExpress ? config.destWarehouseId : _detailDestWhId;
    final srcWhName = isExpress ? config.sourceWarehouseName : (_detailSourceWhName ?? 'Almacén Origen');
    final destWhName = isExpress ? config.destWarehouseName : (_detailDestWhName ?? 'Almacén Destino');
    final srcLocId = isExpress ? config.sourceLocationId : _detailSourceLocId;
    final destLocId = isExpress ? config.destLocationId : _detailDestLocId;

    if (srcWhId == null || destWhId == null) {
      ScaffoldMessenger.of(context).showSnackBar(
        const SnackBar(content: Text('Debe seleccionar almacén de origen y destino')),
      );
      return;
    }

    if (srcWhId == destWhId && srcLocId == destLocId && srcLocId != null) {
      ScaffoldMessenger.of(context).showSnackBar(
        const SnackBar(content: Text('El origen y destino no pueden ser exactamente los mismos')),
      );
      return;
    }

    final clientUuid = const Uuid().v4();
    final now = DateTime.now().toIso8601String();

    // 1. Guardar de forma inmediata en SQLite (Outbox local)
    final outboxEntry = {
      'client_uuid': clientUuid,
      'barcode': _scannedProduct!['sku'],
      'variant_id': _scannedProduct!['variant_id'],
      'product_name': _scannedProduct!['name'],
      'sku': _scannedProduct!['sku'],
      'source_warehouse_id': srcWhId,
      'source_warehouse_name': srcWhName,
      'dest_warehouse_id': destWhId,
      'dest_warehouse_name': destWhName,
      'source_location_id': srcLocId,
      'dest_location_id': destLocId,
      'quantity': _quantity,
      'uom': _selectedUom,
      'operator_code': config.operatorBadge,
      'device_id': config.deviceId,
      'offline_scanned_at': now,
      'sync_status': 'PENDING',
      'created_at': now,
    };

    await DatabaseHelper.instance.insertRelocationOutbox(outboxEntry);

    // 2. Feedback multisensorial de éxito
    SystemSound.play(SystemSoundType.click);

    setState(() {
      _isSuccessFlash = true;
      _bannerMessage = '✅ TRASLADO REGISTRADO: ${_quantity.toStringAsFixed(0)} $_selectedUom de "${_scannedProduct!['name']}" guardado en Outbox';
      _bannerColor = Colors.green.shade800;
      _scannedProduct = null;
      _quantity = 1.0;
      _barcodeInputController.clear();
    });

    // 3. Notificar al worker para sincronizar si hay red
    SyncService.instance.checkConnectivityAndSync();

    Future.delayed(const Duration(milliseconds: 1800), () {
      if (mounted) {
        setState(() {
          _isSuccessFlash = false;
        });
      }
    });
  }

  void _cancelCurrentScan() {
    setState(() {
      _scannedProduct = null;
      _quantity = 1.0;
      _barcodeInputController.clear();
      _bannerMessage = 'Escaneo cancelado. Listo para nuevo producto.';
      _bannerColor = const Color(0xFF2A2B3D);
    });
  }

  // ===========================================================================
  // INTERFAZ DE USUARIO (UI / UX KIOSK)
  // ===========================================================================
  @override
  Widget build(BuildContext context) {
    return BarcodeScannerListener(
      onBarcodeScanned: _handleBarcode,
      child: Scaffold(
        backgroundColor: const Color(0xFF13141F),
        body: SafeArea(
          child: Column(
            children: [
              _buildTopHeader(),
              _buildWarehouseBar(),
              _buildStatusBanner(),
              Expanded(
                child: Padding(
                  padding: const EdgeInsets.symmetric(horizontal: 24.0, vertical: 12.0),
                  child: _scannedProduct == null
                      ? _buildScanWaitingArea()
                      : _buildProductDetailsCard(),
                ),
              ),
              _buildBottomControls(),
            ],
          ),
        ),
      ),
    );
  }

  // Barra Superior (Header Kiosco con Branding Neo WMS)
  Widget _buildTopHeader() {
    return Consumer2<SyncService, KioskConfigService>(
      builder: (context, sync, config, _) {
        final isOnline = sync.isOnline;
        final pendingCount = sync.pendingCount;

        Color badgeColor;
        String badgeText;
        IconData badgeIcon;

        if (sync.isSyncing) {
          badgeColor = Colors.blueAccent;
          badgeText = 'Sincronizando ($pendingCount)...';
          badgeIcon = Icons.sync;
        } else if (isOnline && pendingCount == 0) {
          badgeColor = Colors.greenAccent.shade400;
          badgeText = 'En Línea • Sincronizado';
          badgeIcon = Icons.cloud_done;
        } else if (isOnline && pendingCount > 0) {
          badgeColor = Colors.cyanAccent.shade400;
          badgeText = 'En Línea ($pendingCount enviando...)';
          badgeIcon = Icons.cloud_upload;
        } else {
          badgeColor = Colors.amberAccent.shade400;
          badgeText = 'Modo Offline ($pendingCount pendientes)';
          badgeIcon = Icons.cloud_off;
        }

        return Container(
          padding: const EdgeInsets.symmetric(horizontal: 24, vertical: 12),
          color: const Color(0xFF1B1C2B),
          child: Row(
            children: [
              // Logo / Título Neo WMS
              const Icon(Icons.swap_horiz, color: Color(0xFF00D2FF), size: 32),
              const SizedBox(width: 12),
              Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  const Text(
                    'NEO WMS',
                    style: TextStyle(
                      color: Colors.white,
                      fontSize: 18,
                      fontWeight: FontWeight.w900,
                      letterSpacing: 1.2,
                    ),
                  ),
                  Text(
                    'Reubicación Express • ${config.deviceId}',
                    style: TextStyle(color: Colors.white.withOpacity(0.6), fontSize: 12),
                  ),
                ],
              ),
              const Spacer(),

              // Badge de Localidad (Sucursal / Tienda)
              Container(
                padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 6),
                decoration: BoxDecoration(
                  color: Colors.cyan.withOpacity(0.12),
                  borderRadius: BorderRadius.circular(8),
                  border: Border.all(color: Colors.cyan.withOpacity(0.4)),
                ),
                child: Row(
                  mainAxisSize: MainAxisSize.min,
                  children: [
                    const Icon(Icons.store, color: Colors.cyanAccent, size: 15),
                    const SizedBox(width: 6),
                    Text(
                      config.facilityName.toUpperCase(),
                      style: const TextStyle(
                        color: Colors.cyanAccent,
                        fontSize: 12,
                        fontWeight: FontWeight.bold,
                      ),
                    ),
                  ],
                ),
              ),
              const SizedBox(width: 12),

              // Badge de Modo (Express vs Detallado)
              Container(
                padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 6),
                decoration: BoxDecoration(
                  color: config.isExpressMode
                      ? Colors.indigo.withOpacity(0.3)
                      : Colors.purple.withOpacity(0.3),
                  borderRadius: BorderRadius.circular(8),
                  border: Border.all(
                    color: config.isExpressMode ? Colors.indigoAccent : Colors.purpleAccent,
                  ),
                ),
                child: Text(
                  config.isExpressMode ? '⚡ MODO EXPRESS' : '📋 MODO DETALLADO',
                  style: TextStyle(
                    color: config.isExpressMode ? Colors.indigoAccent : Colors.purpleAccent,
                    fontSize: 12,
                    fontWeight: FontWeight.bold,
                  ),
                ),
              ),
              const SizedBox(width: 16),

              // Badge de Conectividad (Clickeable para ver cola de pendientes)
              InkWell(
                onTap: () => _showOutboxDialog(context),
                borderRadius: BorderRadius.circular(8),
                child: Container(
                  padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 6),
                  decoration: BoxDecoration(
                    color: badgeColor.withOpacity(0.15),
                    borderRadius: BorderRadius.circular(8),
                    border: Border.all(color: badgeColor),
                  ),
                  child: Row(
                    children: [
                      Icon(badgeIcon, color: badgeColor, size: 16),
                      const SizedBox(width: 6),
                      Text(
                        badgeText,
                        style: TextStyle(
                          color: badgeColor,
                          fontSize: 13,
                          fontWeight: FontWeight.w600,
                        ),
                      ),
                    ],
                  ),
                ),
              ),
              const SizedBox(width: 16),

              // Operador
              Container(
                padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 6),
                decoration: BoxDecoration(
                  color: Colors.white.withOpacity(0.05),
                  borderRadius: BorderRadius.circular(8),
                ),
                child: Row(
                  children: [
                    const Icon(Icons.person, color: Colors.white70, size: 16),
                    const SizedBox(width: 6),
                    Text(
                      config.operatorBadge,
                      style: const TextStyle(color: Colors.white, fontWeight: FontWeight.bold, fontSize: 13),
                    ),
                  ],
                ),
              ),
              const SizedBox(width: 8),

              // Botón Teclado Táctil en Pantalla (para Kiosco / Pantallas táctiles)
              IconButton(
                icon: const Icon(Icons.keyboard_alt_outlined, color: Colors.cyanAccent),
                tooltip: 'Teclado Táctil en Pantalla',
                onPressed: () => _openTouchKeyboardMenu(context),
              ),
              const SizedBox(width: 4),

              // Botón Configuración de Supervisor
              IconButton(
                icon: const Icon(Icons.settings, color: Colors.white70),
                tooltip: 'Configuración Kiosco',
                onPressed: () => _showSupervisorAuthDialog(context),
              ),
            ],
          ),
        );
      },
    );
  }

  // Barra de Almacén Origen -> Destino
  Widget _buildWarehouseBar() {
    return Consumer<KioskConfigService>(
      builder: (context, config, _) {
        final isExpress = config.isExpressMode;

        return Container(
          margin: const EdgeInsets.fromLTRB(24, 16, 24, 8),
          padding: const EdgeInsets.symmetric(horizontal: 20, vertical: 14),
          decoration: BoxDecoration(
            color: const Color(0xFF1E1F2E),
            borderRadius: BorderRadius.circular(12),
            border: Border.all(color: const Color(0xFF2E3048)),
          ),
          child: Row(
            children: [
              // Almacén Origen
              Expanded(
                child: InkWell(
                  onTap: isExpress ? null : () => _pickWarehouseForDetail(isSource: true),
                  borderRadius: BorderRadius.circular(8),
                  child: Row(
                    children: [
                      Container(
                        padding: const EdgeInsets.all(8),
                        decoration: BoxDecoration(
                          color: Colors.amber.withOpacity(0.15),
                          borderRadius: BorderRadius.circular(8),
                        ),
                        child: const Icon(Icons.warehouse_outlined, color: Colors.amberAccent, size: 24),
                      ),
                      const SizedBox(width: 12),
                      Expanded(
                        child: Column(
                          crossAxisAlignment: CrossAxisAlignment.start,
                          children: [
                            Row(
                              children: [
                                Text('ALMACÉN ORIGEN', style: TextStyle(color: Colors.white.withOpacity(0.5), fontSize: 11, fontWeight: FontWeight.bold)),
                                if (!isExpress) ...[
                                  const SizedBox(width: 4),
                                  const Icon(Icons.arrow_drop_down, color: Colors.amberAccent, size: 16),
                                ],
                              ],
                            ),
                            Text(
                              isExpress ? config.sourceWarehouseName : (_detailSourceWhName ?? 'Seleccionar Almacén'),
                              style: const TextStyle(color: Colors.white, fontSize: 16, fontWeight: FontWeight.bold),
                              overflow: TextOverflow.ellipsis,
                            ),
                            if (isExpress ? config.sourceLocationName != null : _detailSourceLocName != null)
                              Row(
                                children: [
                                  Text(
                                    '📍 ${isExpress ? config.sourceLocationName : _detailSourceLocName}',
                                    style: const TextStyle(color: Colors.amberAccent, fontSize: 11, fontWeight: FontWeight.bold),
                                  ),
                                  if (!isExpress) ...[
                                    const SizedBox(width: 4),
                                    GestureDetector(
                                      onTap: () => setState(() {
                                        _detailSourceLocId = null;
                                        _detailSourceLocName = null;
                                      }),
                                      child: const Icon(Icons.close, size: 12, color: Colors.white54),
                                    ),
                                  ],
                                ],
                              ),
                          ],
                        ),
                      ),
                    ],
                  ),
                ),
              ),

              // Flecha de traslado
              const Padding(
                padding: EdgeInsets.symmetric(horizontal: 16),
                child: Icon(Icons.arrow_forward_rounded, color: Color(0xFF00D2FF), size: 28),
              ),

              // Almacén Destino
              Expanded(
                child: InkWell(
                  onTap: isExpress ? null : () => _pickWarehouseForDetail(isSource: false),
                  borderRadius: BorderRadius.circular(8),
                  child: Row(
                    children: [
                      Container(
                        padding: const EdgeInsets.all(8),
                        decoration: BoxDecoration(
                          color: Colors.cyan.withOpacity(0.15),
                          borderRadius: BorderRadius.circular(8),
                        ),
                        child: const Icon(Icons.storefront_outlined, color: Colors.cyanAccent, size: 24),
                      ),
                      const SizedBox(width: 12),
                      Expanded(
                        child: Column(
                          crossAxisAlignment: CrossAxisAlignment.start,
                          children: [
                            Row(
                              children: [
                                Text('ALMACÉN DESTINO', style: TextStyle(color: Colors.white.withOpacity(0.5), fontSize: 11, fontWeight: FontWeight.bold)),
                                if (!isExpress) ...[
                                  const SizedBox(width: 4),
                                  const Icon(Icons.arrow_drop_down, color: Colors.cyanAccent, size: 16),
                                ],
                              ],
                            ),
                            Text(
                              isExpress ? config.destWarehouseName : (_detailDestWhName ?? 'Seleccionar Almacén'),
                              style: const TextStyle(color: Colors.white, fontSize: 16, fontWeight: FontWeight.bold),
                              overflow: TextOverflow.ellipsis,
                            ),
                            if (isExpress ? config.destLocationName != null : _detailDestLocName != null)
                              Row(
                                children: [
                                  Text(
                                    '📍 ${isExpress ? config.destLocationName : _detailDestLocName}',
                                    style: const TextStyle(color: Colors.cyanAccent, fontSize: 11, fontWeight: FontWeight.bold),
                                  ),
                                  if (!isExpress) ...[
                                    const SizedBox(width: 4),
                                    GestureDetector(
                                      onTap: () => setState(() {
                                        _detailDestLocId = null;
                                        _detailDestLocName = null;
                                      }),
                                      child: const Icon(Icons.close, size: 12, color: Colors.white54),
                                    ),
                                  ],
                                ],
                              ),
                          ],
                        ),
                      ),
                    ],
                  ),
                ),
              ),

              if (isExpress)
                Tooltip(
                  message: 'Almacenes pre-configurados fijos en Modo Express',
                  child: Container(
                    padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 4),
                    decoration: BoxDecoration(
                      color: Colors.white.withOpacity(0.08),
                      borderRadius: BorderRadius.circular(6),
                    ),
                    child: const Row(
                      children: [
                        Icon(Icons.lock, color: Colors.white54, size: 14),
                        SizedBox(width: 4),
                        Text('FIJO', style: TextStyle(color: Colors.white54, fontSize: 11, fontWeight: FontWeight.bold)),
                      ],
                    ),
                  ),
                )
              else
                Tooltip(
                  message: 'Modo Detallado: Toque los almacenes o escanee una ubicación',
                  child: Container(
                    padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 4),
                    decoration: BoxDecoration(
                      color: Colors.purple.withOpacity(0.2),
                      borderRadius: BorderRadius.circular(6),
                      border: Border.all(color: Colors.purpleAccent),
                    ),
                    child: const Row(
                      children: [
                        Icon(Icons.touch_app, color: Colors.purpleAccent, size: 14),
                        SizedBox(width: 4),
                        Text('DINÁMICO', style: TextStyle(color: Colors.purpleAccent, fontSize: 11, fontWeight: FontWeight.bold)),
                      ],
                    ),
                  ),
                ),
            ],
          ),
        );
      },
    );

  }

  // Banner Informativo / Flash de Éxito
  Widget _buildStatusBanner() {
    return Container(
      width: double.infinity,
      margin: const EdgeInsets.symmetric(horizontal: 24, vertical: 6),
      padding: const EdgeInsets.symmetric(horizontal: 16, vertical: 10),
      decoration: BoxDecoration(
        color: _bannerColor,
        borderRadius: BorderRadius.circular(8),
        border: _isSuccessFlash ? Border.all(color: Colors.greenAccent, width: 2) : null,
      ),
      child: Text(
        _bannerMessage,
        style: const TextStyle(color: Colors.white, fontSize: 14, fontWeight: FontWeight.w600),
        textAlign: TextAlign.center,
      ),
    );
  }

  // Área 1: Espera de Escaneo (Idle)
  Widget _buildScanWaitingArea() {
    return Container(
      width: double.infinity,
      decoration: BoxDecoration(
        color: const Color(0xFF1B1C2B),
        borderRadius: BorderRadius.circular(16),
        border: Border.all(color: const Color(0xFF2A2B3D)),
      ),
      child: Column(
        mainAxisAlignment: MainAxisAlignment.center,
        children: [
          Container(
            padding: const EdgeInsets.all(28),
            decoration: BoxDecoration(
              shape: BoxShape.circle,
              color: const Color(0xFF00D2FF).withOpacity(0.08),
              border: Border.all(color: const Color(0xFF00D2FF).withOpacity(0.3), width: 2),
            ),
            child: const Icon(Icons.qr_code_scanner_rounded, size: 84, color: Color(0xFF00D2FF)),
          ),
          const SizedBox(height: 24),
          const Text(
            'PASE EL CÓDIGO POR EL ESCÁNER',
            style: TextStyle(
              color: Colors.white,
              fontSize: 22,
              fontWeight: FontWeight.bold,
              letterSpacing: 1.1,
            ),
          ),
          const SizedBox(height: 8),
          Text(
            'El lector omnidireccional capturará automáticamente el producto',
            style: TextStyle(color: Colors.white.withOpacity(0.6), fontSize: 14),
          ),
          const SizedBox(height: 32),

          // Campo manual auxiliar por teclado o pantalla táctil (útil si la etiqueta está rota o borrosa)
          Container(
            width: 480,
            padding: const EdgeInsets.symmetric(horizontal: 16),
            decoration: BoxDecoration(
              color: const Color(0xFF13141F),
              borderRadius: BorderRadius.circular(10),
              border: Border.all(color: Colors.white24),
            ),
            child: Row(
              children: [
                const Icon(Icons.keyboard, color: Colors.white54),
                const SizedBox(width: 10),
                Expanded(
                  child: TextField(
                    controller: _barcodeInputController,
                    focusNode: _manualInputFocusNode,
                    style: const TextStyle(color: Colors.white),
                    decoration: const InputDecoration(
                      hintText: 'O digite código / SKU manual...',
                      hintStyle: TextStyle(color: Colors.white38),
                      border: InputBorder.none,
                    ),
                    onSubmitted: _handleBarcode,
                  ),
                ),
                IconButton(
                  icon: const Icon(Icons.keyboard_alt_outlined, color: Color(0xFF00D2FF)),
                  tooltip: 'Abrir Teclado Táctil en Pantalla',
                  onPressed: () => _showVirtualKeyboardDialog(_barcodeInputController, onSubmitted: _handleBarcode),
                ),
                IconButton(
                  icon: const Icon(Icons.arrow_forward, color: Color(0xFF00E676)),
                  tooltip: 'Buscar / Procesar',
                  onPressed: () => _handleBarcode(_barcodeInputController.text),
                ),
              ],
            ),
          ),
        ],
      ),
    );
  }

  // Área 2: Detalle de Producto Escaneado y Teclado Numérico
  Widget _buildProductDetailsCard() {
    final prod = _scannedProduct!;
    final name = prod['name'] ?? 'Producto Sin Nombre';
    final sku = prod['sku'] ?? 'N/A';
    final uom = _selectedUom ?? 'UND';

    return Container(
      width: double.infinity,
      padding: const EdgeInsets.all(24),
      decoration: BoxDecoration(
        color: const Color(0xFF1E1F2E),
        borderRadius: BorderRadius.circular(16),
        border: Border.all(color: const Color(0xFF00D2FF).withOpacity(0.4), width: 2),
      ),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          // Cabecera Producto
          Row(
            children: [
              Container(
                padding: const EdgeInsets.all(12),
                decoration: BoxDecoration(
                  color: const Color(0xFF00D2FF).withOpacity(0.1),
                  borderRadius: BorderRadius.circular(12),
                ),
                child: const Icon(Icons.inventory_2_outlined, color: Color(0xFF00D2FF), size: 36),
              ),
              const SizedBox(width: 16),
              Expanded(
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    Text(
                      name,
                      style: const TextStyle(color: Colors.white, fontSize: 22, fontWeight: FontWeight.bold),
                      maxLines: 2,
                      overflow: TextOverflow.ellipsis,
                    ),
                    const SizedBox(height: 4),
                    Text(
                      'SKU: $sku  •  Unidad Base: $uom',
                      style: TextStyle(color: Colors.white.withOpacity(0.7), fontSize: 14),
                    ),
                  ],
                ),
              ),
            ],
          ),
          const Divider(color: Colors.white12, height: 32),

          // Selector de Cantidad Gigante
          Row(
            children: [
              Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  Text('CANTIDAD A TRASLADAR', style: TextStyle(color: Colors.white.withOpacity(0.6), fontSize: 12, fontWeight: FontWeight.bold)),
                  const SizedBox(height: 6),
                  InkWell(
                    onTap: _showQuantityKeypadDialog,
                    borderRadius: BorderRadius.circular(12),
                    child: Container(
                      padding: const EdgeInsets.symmetric(horizontal: 20, vertical: 12),
                      decoration: BoxDecoration(
                        color: const Color(0xFF13141F),
                        borderRadius: BorderRadius.circular(12),
                        border: Border.all(color: const Color(0xFF00D2FF)),
                      ),
                      child: Row(
                        children: [
                          Text(
                            _quantity.toStringAsFixed(_quantity % 1 == 0 ? 0 : 2),
                            style: const TextStyle(color: Colors.white, fontSize: 36, fontWeight: FontWeight.bold),
                          ),
                          const SizedBox(width: 8),
                          Text(uom, style: const TextStyle(color: Color(0xFF00D2FF), fontSize: 18, fontWeight: FontWeight.bold)),
                          const SizedBox(width: 12),
                          const Icon(Icons.edit_note, color: Color(0xFF00D2FF), size: 24),
                        ],
                      ),
                    ),
                  ),
                ],
              ),
              const SizedBox(width: 24),

              // Botones de incremento rápido
              Expanded(
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    Text('INCREMENTO RÁPIDO', style: TextStyle(color: Colors.white.withOpacity(0.6), fontSize: 12, fontWeight: FontWeight.bold)),
                    const SizedBox(height: 6),
                    Wrap(
                      spacing: 8,
                      runSpacing: 8,
                      children: [1, 6, 12, 24, 48].map((val) {
                        return ElevatedButton(
                          style: ElevatedButton.styleFrom(
                            backgroundColor: const Color(0xFF2A2B3D),
                            foregroundColor: Colors.white,
                            padding: const EdgeInsets.symmetric(horizontal: 16, vertical: 12),
                            shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(8)),
                          ),
                          onPressed: () {
                            setState(() {
                              _quantity += val;
                            });
                          },
                          child: Text('+$val', style: const TextStyle(fontSize: 16, fontWeight: FontWeight.bold)),
                        );
                      }).toList()..add(
                        ElevatedButton(
                          style: ElevatedButton.styleFrom(
                            backgroundColor: Colors.red.shade900.withOpacity(0.4),
                            foregroundColor: Colors.redAccent,
                            padding: const EdgeInsets.symmetric(horizontal: 16, vertical: 12),
                            shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(8)),
                          ),
                          onPressed: () {
                            setState(() {
                              _quantity = 1.0;
                            });
                          },
                          child: const Text('Reset', style: TextStyle(fontSize: 14, fontWeight: FontWeight.bold)),
                        ),
                      ),
                    ),
                  ],
                ),
              ),
            ],
          ),
        ],
      ),
    );
  }

  // Barra Inferior de Acción
  Widget _buildBottomControls() {
    if (_scannedProduct == null) {
      return const SizedBox.shrink();
    }

    return Container(
      padding: const EdgeInsets.symmetric(horizontal: 24, vertical: 16),
      color: const Color(0xFF1B1C2B),
      child: Row(
        children: [
          Expanded(
            flex: 2,
            child: OutlinedButton.icon(
              style: OutlinedButton.styleFrom(
                padding: const EdgeInsets.symmetric(vertical: 18),
                side: const BorderSide(color: Colors.redAccent),
                shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(12)),
              ),
              icon: const Icon(Icons.close, color: Colors.redAccent, size: 24),
              label: const Text('DESCARTAR (ESC)', style: TextStyle(color: Colors.redAccent, fontSize: 16, fontWeight: FontWeight.bold)),
              onPressed: _cancelCurrentScan,
            ),
          ),
          const SizedBox(width: 16),
          Expanded(
            flex: 3,
            child: ElevatedButton.icon(
              style: ElevatedButton.styleFrom(
                backgroundColor: const Color(0xFF00E676),
                foregroundColor: Colors.black,
                padding: const EdgeInsets.symmetric(vertical: 18),
                shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(12)),
                elevation: 4,
              ),
              icon: const Icon(Icons.check_circle_outline, size: 28),
              label: const Text(
                'CONFIRMAR REUBICACIÓN (ENTER)',
                style: TextStyle(fontSize: 18, fontWeight: FontWeight.w900),
              ),
              onPressed: _confirmRelocation,
            ),
          ),
        ],
      ),
    );
  }

  // ===========================================================================
  // MODAL: Selector Táctil de Almacén para Modo Detallado
  // ===========================================================================
  void _pickWarehouseForDetail({required bool isSource}) {
    showDialog(
      context: context,
      builder: (ctx) {
        return AlertDialog(
          backgroundColor: const Color(0xFF1E1F2E),
          title: Row(
            children: [
              Icon(isSource ? Icons.warehouse : Icons.storefront, color: isSource ? Colors.amberAccent : Colors.cyanAccent),
              const SizedBox(width: 10),
              Text(
                isSource ? 'Seleccionar Almacén ORIGEN' : 'Seleccionar Almacén DESTINO',
                style: const TextStyle(color: Colors.white, fontSize: 18),
              ),
            ],
          ),
          content: SizedBox(
            width: 480,
            child: _cachedWarehouses.isEmpty
                ? const Padding(
                    padding: EdgeInsets.all(16.0),
                    child: Text('No hay almacenes en caché local. Descargue el catálogo primero.', style: TextStyle(color: Colors.white60)),
                  )
                : ListView.separated(
                    shrinkWrap: true,
                    itemCount: _cachedWarehouses.length,
                    separatorBuilder: (_, __) => const Divider(color: Colors.white12),
                    itemBuilder: (ctx, i) {
                      final wh = _cachedWarehouses[i];
                      final isSelected = isSource ? (_detailSourceWhId == wh['id']) : (_detailDestWhId == wh['id']);
                      return ListTile(
                        selected: isSelected,
                        selectedTileColor: (isSource ? Colors.amber : Colors.cyan).withOpacity(0.15),
                        shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(8)),
                        leading: Icon(
                          isSource ? Icons.warehouse_outlined : Icons.storefront_outlined,
                          color: isSource ? Colors.amberAccent : Colors.cyanAccent,
                        ),
                        title: Text(wh['name'], style: const TextStyle(color: Colors.white, fontWeight: FontWeight.bold)),
                        subtitle: Text('Código: ${wh['code']}', style: const TextStyle(color: Colors.white54, fontSize: 12)),
                        trailing: isSelected ? const Icon(Icons.check_circle, color: Colors.greenAccent) : null,
                        onTap: () {
                          setState(() {
                            if (isSource) {
                              _detailSourceWhId = wh['id'];
                              _detailSourceWhName = wh['name'];
                              _detailSourceLocId = null;
                              _detailSourceLocName = null;
                            } else {
                              _detailDestWhId = wh['id'];
                              _detailDestWhName = wh['name'];
                              _detailDestLocId = null;
                              _detailDestLocName = null;
                            }
                          });
                          Navigator.pop(ctx);
                        },
                      );
                    },
                  ),
          ),
          actions: [
            TextButton(
              onPressed: () => Navigator.pop(ctx),
              child: const Text('Cerrar', style: TextStyle(color: Colors.white70)),
            ),
          ],
        );
      },
    );
  }

  // ===========================================================================
  // MODAL: Asignación Rápida de Ubicación Escaneada (Modo Detallado)
  // ===========================================================================
  void _showLocationAssignDialog(Map<String, dynamic> loc) {
    showDialog(
      context: context,
      builder: (ctx) {
        return AlertDialog(
          backgroundColor: const Color(0xFF1E1F2E),
          title: Row(
            children: [
              const Icon(Icons.place, color: Color(0xFF00D2FF)),
              const SizedBox(width: 10),
              Expanded(
                child: Text(
                  'Ubicación: ${loc['name']} (${loc['code']})',
                  style: const TextStyle(color: Colors.white, fontSize: 18),
                  overflow: TextOverflow.ellipsis,
                ),
              ),
            ],
          ),
          content: Text(
            'Se escaneó una etiqueta de ubicación. ¿Desea fijarla como ORIGEN o como DESTINO para los próximos traslados?',
            style: const TextStyle(color: Colors.white70, fontSize: 14),
          ),
          actions: [
            ElevatedButton.icon(
              style: ElevatedButton.styleFrom(backgroundColor: Colors.amber.shade800, foregroundColor: Colors.white),
              icon: const Icon(Icons.arrow_upward),
              label: const Text('Fijar como ORIGEN'),
              onPressed: () {
                setState(() {
                  _detailSourceLocId = loc['id'];
                  _detailSourceLocName = loc['name'];
                  _detailSourceWhId = loc['warehouse_id'];
                  final matchWh = _cachedWarehouses.firstWhere(
                    (w) => w['id'] == loc['warehouse_id'],
                    orElse: () => {'name': 'Almacén'},
                  );
                  _detailSourceWhName = matchWh['name'];
                  _bannerMessage = '📍 Origen fijado: ${loc['name']} (${matchWh['name']})';
                  _bannerColor = const Color(0xFF2A2B3D);
                });
                Navigator.pop(ctx);
              },
            ),
            ElevatedButton.icon(
              style: ElevatedButton.styleFrom(backgroundColor: Colors.cyan.shade700, foregroundColor: Colors.white),
              icon: const Icon(Icons.arrow_downward),
              label: const Text('Fijar como DESTINO'),
              onPressed: () {
                setState(() {
                  _detailDestLocId = loc['id'];
                  _detailDestLocName = loc['name'];
                  _detailDestWhId = loc['warehouse_id'];
                  final matchWh = _cachedWarehouses.firstWhere(
                    (w) => w['id'] == loc['warehouse_id'],
                    orElse: () => {'name': 'Almacén'},
                  );
                  _detailDestWhName = matchWh['name'];
                  _bannerMessage = '📍 Destino fijado: ${loc['name']} (${matchWh['name']})';
                  _bannerColor = const Color(0xFF2A2B3D);
                });
                Navigator.pop(ctx);
              },
            ),
          ],
        );
      },
    );
  }

  // ===========================================================================
  // MODAL: Inspección de Cola Outbox (Movimientos Offline Pendientes)
  // ===========================================================================
  void _showOutboxDialog(BuildContext context) async {
    final pending = await DatabaseHelper.instance.getPendingRelocations();

    if (!context.mounted) return;

    showDialog(
      context: context,
      builder: (ctx) {
        return AlertDialog(
          backgroundColor: const Color(0xFF1E1F2E),
          title: Row(
            children: [
              const Icon(Icons.cloud_upload_outlined, color: Color(0xFF00D2FF)),
              const SizedBox(width: 10),
              const Text('Bandeja de Salida (Outbox Offline)', style: TextStyle(color: Colors.white)),
            ],
          ),
          content: SizedBox(
            width: 600,
            height: 400,
            child: pending.isEmpty
                ? const Center(
                    child: Text('No hay movimientos pendientes de sincronización.', style: TextStyle(color: Colors.white60)),
                  )
                : ListView.separated(
                    itemCount: pending.length,
                    separatorBuilder: (_, __) => const Divider(color: Colors.white12),
                    itemBuilder: (ctx, i) {
                      final item = pending[i];
                      return ListTile(
                        leading: const Icon(Icons.swap_horiz, color: Colors.amberAccent),
                        title: Text(item['product_name'] ?? item['sku'], style: const TextStyle(color: Colors.white, fontWeight: FontWeight.bold)),
                        subtitle: Text(
                          '${item['quantity']} ${item['uom']} • ${item['source_warehouse_name']} -> ${item['dest_warehouse_name']}\nEscaneado: ${item['offline_scanned_at']}',
                          style: const TextStyle(color: Colors.white60, fontSize: 12),
                        ),
                        trailing: Container(
                          padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 4),
                          decoration: BoxDecoration(
                            color: Colors.amber.withOpacity(0.2),
                            borderRadius: BorderRadius.circular(6),
                          ),
                          child: const Text('PENDIENTE', style: TextStyle(color: Colors.amberAccent, fontSize: 11, fontWeight: FontWeight.bold)),
                        ),
                      );
                    },
                  ),
          ),
          actions: [
            TextButton(
              onPressed: () => Navigator.pop(ctx),
              child: const Text('Cerrar', style: TextStyle(color: Colors.white70)),
            ),
            ElevatedButton.icon(
              style: ElevatedButton.styleFrom(backgroundColor: const Color(0xFF00D2FF), foregroundColor: Colors.black),
              icon: const Icon(Icons.sync),
              label: const Text('Sincronizar Ahora'),
              onPressed: () async {
                Navigator.pop(ctx);
                await SyncService.instance.syncPendingRelocations();
              },
            ),
          ],
        );
      },
    );
  }

  // ===========================================================================
  // MÓDULOS DE TECLADO TÁCTIL EN PANTALLA (KIOSCO)
  // ===========================================================================

  // 1. Teclado Táctil Alfanumérico Completo (Búsqueda de producto o SKU manual)
  void _showVirtualKeyboardDialog(TextEditingController targetController, {required Function(String) onSubmitted}) {
    String buffer = targetController.text;

    showDialog(
      context: context,
      builder: (dialogCtx) {
        return StatefulBuilder(
          builder: (ctx, setKbdState) {
            void updateText(String newText) {
              setKbdState(() {
                buffer = newText;
              });
            }

            void appendChar(String char) {
              updateText(buffer + char);
            }

            void deleteLast() {
              if (buffer.isNotEmpty) {
                updateText(buffer.substring(0, buffer.length - 1));
              }
            }

            void clearAll() {
              updateText('');
            }

            void confirm() {
              targetController.text = buffer;
              Navigator.pop(dialogCtx);
              onSubmitted(buffer);
            }

            Widget buildKeyBtn(String label, {VoidCallback? onTap, Color? color, double width = 54, IconData? icon}) {
              return SizedBox(
                width: width,
                height: 50,
                child: ElevatedButton(
                  style: ElevatedButton.styleFrom(
                    backgroundColor: color ?? const Color(0xFF282A3E),
                    foregroundColor: Colors.white,
                    padding: EdgeInsets.zero,
                    shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(8)),
                    elevation: 2,
                  ),
                  onPressed: onTap ?? () => appendChar(label),
                  child: icon != null
                      ? Icon(icon, size: 22, color: Colors.white)
                      : Text(label, style: const TextStyle(fontSize: 18, fontWeight: FontWeight.bold)),
                ),
              );
            }

            return AlertDialog(
              backgroundColor: const Color(0xFF191A27),
              shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(16)),
              contentPadding: const EdgeInsets.all(20),
              title: Row(
                children: [
                  const Icon(Icons.keyboard_alt_outlined, color: Color(0xFF00D2FF)),
                  const SizedBox(width: 10),
                  const Text('Teclado Táctil en Pantalla', style: TextStyle(color: Colors.white, fontSize: 18)),
                  const Spacer(),
                  if (Platform.isWindows)
                    TextButton.icon(
                      style: TextButton.styleFrom(foregroundColor: Colors.white70),
                      icon: const Icon(Icons.open_in_new, size: 16),
                      label: const Text('Teclado Windows (OSK)', style: TextStyle(fontSize: 12)),
                      onPressed: () {
                        Process.run('cmd', ['/c', 'start', 'osk']);
                      },
                    ),
                  IconButton(
                    icon: const Icon(Icons.close, color: Colors.white54),
                    onPressed: () => Navigator.pop(dialogCtx),
                  ),
                ],
              ),
              content: SizedBox(
                width: 760,
                child: Column(
                  mainAxisSize: MainAxisSize.min,
                  children: [
                    // Campo de visualización de texto
                    Container(
                      padding: const EdgeInsets.symmetric(horizontal: 16, vertical: 10),
                      decoration: BoxDecoration(
                        color: const Color(0xFF10111A),
                        borderRadius: BorderRadius.circular(10),
                        border: Border.all(color: const Color(0xFF00D2FF).withOpacity(0.6), width: 1.5),
                      ),
                      child: Row(
                        children: [
                          const Icon(Icons.search, color: Color(0xFF00D2FF)),
                          const SizedBox(width: 12),
                          Expanded(
                            child: Text(
                              buffer.isEmpty ? 'Escriba código de barras, SKU o ubicación...' : buffer,
                              style: TextStyle(
                                color: buffer.isEmpty ? Colors.white30 : Colors.white,
                                fontSize: 22,
                                fontWeight: FontWeight.bold,
                                letterSpacing: 1.2,
                              ),
                            ),
                          ),
                          if (buffer.isNotEmpty)
                            IconButton(
                              icon: const Icon(Icons.clear, color: Colors.redAccent),
                              onPressed: clearAll,
                            ),
                        ],
                      ),
                    ),
                    const SizedBox(height: 16),

                    // FILA 1: Números (1 2 3 4 5 6 7 8 9 0 -)
                    Row(
                      mainAxisAlignment: MainAxisAlignment.center,
                      children: [
                        ...'1234567890-'.split('').map((ch) => Padding(
                          padding: const EdgeInsets.all(3.0),
                          child: buildKeyBtn(ch, color: const Color(0xFF222436)),
                        )),
                      ],
                    ),
                    const SizedBox(height: 4),

                    // FILA 2: Q W E R T Y U I O P
                    Row(
                      mainAxisAlignment: MainAxisAlignment.center,
                      children: [
                        ...'QWERTYUIOP'.split('').map((ch) => Padding(
                          padding: const EdgeInsets.all(3.0),
                          child: buildKeyBtn(ch),
                        )),
                      ],
                    ),
                    const SizedBox(height: 4),

                    // FILA 3: A S D F G H J K L Ñ
                    Row(
                      mainAxisAlignment: MainAxisAlignment.center,
                      children: [
                        ...'ASDFGHJKLÑ'.split('').map((ch) => Padding(
                          padding: const EdgeInsets.all(3.0),
                          child: buildKeyBtn(ch),
                        )),
                      ],
                    ),
                    const SizedBox(height: 4),

                    // FILA 4: Z X C V B N M . _ / ⌫
                    Row(
                      mainAxisAlignment: MainAxisAlignment.center,
                      children: [
                        ...'ZXCVBNM._/'.split('').map((ch) => Padding(
                          padding: const EdgeInsets.all(3.0),
                          child: buildKeyBtn(ch),
                        )),
                        Padding(
                          padding: const EdgeInsets.all(3.0),
                          child: buildKeyBtn('⌫', icon: Icons.backspace_outlined, onTap: deleteLast, color: Colors.red.shade900.withOpacity(0.6), width: 68),
                        ),
                      ],
                    ),
                    const SizedBox(height: 10),

                    // FILA 5: Espacio y Botón de Confirmar
                    Row(
                      mainAxisAlignment: MainAxisAlignment.center,
                      children: [
                        buildKeyBtn('LIMPIAR', onTap: clearAll, color: Colors.red.shade900.withOpacity(0.4), width: 100),
                        const SizedBox(width: 8),
                        buildKeyBtn('ESPACIO', onTap: () => appendChar(' '), color: const Color(0xFF2E3148), width: 280),
                        const SizedBox(width: 8),
                        SizedBox(
                          width: 220,
                          height: 50,
                          child: ElevatedButton.icon(
                            style: ElevatedButton.styleFrom(
                              backgroundColor: const Color(0xFF00E676),
                              foregroundColor: Colors.black,
                              shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(8)),
                            ),
                            icon: const Icon(Icons.search, size: 22),
                            label: const Text('BUSCAR / PROCESAR', style: TextStyle(fontWeight: FontWeight.bold, fontSize: 13)),
                            onPressed: confirm,
                          ),
                        ),
                      ],
                    ),
                  ],
                ),
              ),
            );
          },
        );
      },
    );
  }

  // 2. Teclado Numérico Táctil para Ajuste de Cantidad
  void _showQuantityKeypadDialog() {
    String qtyStr = _quantity % 1 == 0 ? _quantity.toInt().toString() : _quantity.toString();
    bool customStarted = false;

    showDialog(
      context: context,
      builder: (dialogCtx) {
        return StatefulBuilder(
          builder: (ctx, setKbdState) {
            void addDigit(String d) {
              setKbdState(() {
                if (qtyStr == '0' || (!customStarted && d != '.')) {
                  qtyStr = d;
                  customStarted = true;
                } else {
                  qtyStr += d;
                }
              });
            }

            void addDot() {
              if (!qtyStr.contains('.')) {
                setKbdState(() {
                  qtyStr = qtyStr.isEmpty ? '0.' : '$qtyStr.';
                  customStarted = true;
                });
              }
            }

            void backspace() {
              setKbdState(() {
                if (qtyStr.isNotEmpty) {
                  qtyStr = qtyStr.substring(0, qtyStr.length - 1);
                }
                if (qtyStr.isEmpty) qtyStr = '1';
              });
            }

            void addQuick(double val) {
              setKbdState(() {
                final current = double.tryParse(qtyStr) ?? 0.0;
                final result = current + val;
                qtyStr = result % 1 == 0 ? result.toInt().toString() : result.toString();
              });
            }

            void confirm() {
              final val = double.tryParse(qtyStr);
              if (val != null && val > 0) {
                setState(() {
                  _quantity = val;
                });
                Navigator.pop(dialogCtx);
              }
            }

            Widget buildNumKey(String label, {VoidCallback? onTap, Color? color, IconData? icon}) {
              return SizedBox(
                width: 76,
                height: 54,
                child: ElevatedButton(
                  style: ElevatedButton.styleFrom(
                    backgroundColor: color ?? const Color(0xFF282A3E),
                    foregroundColor: Colors.white,
                    shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(10)),
                    padding: EdgeInsets.zero,
                  ),
                  onPressed: onTap ?? () => addDigit(label),
                  child: icon != null
                      ? Icon(icon, size: 24)
                      : Text(label, style: const TextStyle(fontSize: 22, fontWeight: FontWeight.bold)),
                ),
              );
            }

            return AlertDialog(
              backgroundColor: const Color(0xFF1E1F2E),
              shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(16)),
              title: const Row(
                children: [
                  Icon(Icons.dialpad, color: Color(0xFF00D2FF)),
                  SizedBox(width: 10),
                  Text('Ingresar Cantidad', style: TextStyle(color: Colors.white, fontSize: 18)),
                ],
              ),
              content: SizedBox(
                width: 320,
                child: Column(
                  mainAxisSize: MainAxisSize.min,
                  children: [
                    // Visualizador de Cantidad
                    Container(
                      padding: const EdgeInsets.symmetric(horizontal: 16, vertical: 12),
                      decoration: BoxDecoration(
                        color: const Color(0xFF13141F),
                        borderRadius: BorderRadius.circular(12),
                        border: Border.all(color: const Color(0xFF00D2FF), width: 2),
                      ),
                      child: Row(
                        mainAxisAlignment: MainAxisAlignment.center,
                        children: [
                          Text(
                            qtyStr.isEmpty ? '0' : qtyStr,
                            style: const TextStyle(color: Colors.white, fontSize: 36, fontWeight: FontWeight.bold),
                          ),
                          const SizedBox(width: 10),
                          Text(
                            _selectedUom ?? 'UND',
                            style: const TextStyle(color: Color(0xFF00D2FF), fontSize: 18, fontWeight: FontWeight.bold),
                          ),
                        ],
                      ),
                    ),
                    const SizedBox(height: 12),

                    // Accesos rápidos +5, +10, +25, +50
                    Row(
                      mainAxisAlignment: MainAxisAlignment.spaceEvenly,
                      children: [
                        for (final q in [5.0, 10.0, 25.0, 50.0])
                          InkWell(
                            onTap: () => addQuick(q),
                            borderRadius: BorderRadius.circular(8),
                            child: Container(
                              padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 6),
                              decoration: BoxDecoration(
                                color: const Color(0xFF222436),
                                borderRadius: BorderRadius.circular(8),
                                border: Border.all(color: Colors.white24),
                              ),
                              child: Text('+${q.toInt()}', style: const TextStyle(color: Color(0xFF00D2FF), fontWeight: FontWeight.bold)),
                            ),
                          ),
                      ],
                    ),
                    const SizedBox(height: 16),

                    // Teclado Numérico
                    Column(
                      children: [
                        Row(
                          mainAxisAlignment: MainAxisAlignment.spaceEvenly,
                          children: [
                            buildNumKey('7'),
                            buildNumKey('8'),
                            buildNumKey('9'),
                          ],
                        ),
                        const SizedBox(height: 10),
                        Row(
                          mainAxisAlignment: MainAxisAlignment.spaceEvenly,
                          children: [
                            buildNumKey('4'),
                            buildNumKey('5'),
                            buildNumKey('6'),
                          ],
                        ),
                        const SizedBox(height: 10),
                        Row(
                          mainAxisAlignment: MainAxisAlignment.spaceEvenly,
                          children: [
                            buildNumKey('1'),
                            buildNumKey('2'),
                            buildNumKey('3'),
                          ],
                        ),
                        const SizedBox(height: 10),
                        Row(
                          mainAxisAlignment: MainAxisAlignment.spaceEvenly,
                          children: [
                            buildNumKey('.', onTap: addDot),
                            buildNumKey('0'),
                            buildNumKey('⌫', icon: Icons.backspace_outlined, onTap: backspace, color: const Color(0xFF3B3D55)),
                          ],
                        ),
                      ],
                    ),
                  ],
                ),
              ),
              actions: [
                TextButton(
                  onPressed: () => Navigator.pop(dialogCtx),
                  child: const Text('Cancelar', style: TextStyle(color: Colors.white70)),
                ),
                ElevatedButton.icon(
                  style: ElevatedButton.styleFrom(
                    backgroundColor: const Color(0xFF00E676),
                    foregroundColor: Colors.black,
                    padding: const EdgeInsets.symmetric(horizontal: 24, vertical: 12),
                  ),
                  icon: const Icon(Icons.check_circle, size: 20),
                  label: const Text('Confirmar', style: TextStyle(fontWeight: FontWeight.bold)),
                  onPressed: confirm,
                ),
              ],
            );
          },
        );
      },
    );
  }

  // 3. Menú de Opciones de Teclado Táctil en Barra Superior
  void _openTouchKeyboardMenu(BuildContext context) {
    showModalBottomSheet(
      context: context,
      backgroundColor: const Color(0xFF1E1F2E),
      shape: const RoundedRectangleBorder(borderRadius: BorderRadius.vertical(top: Radius.circular(16))),
      builder: (ctx) {
        return Padding(
          padding: const EdgeInsets.symmetric(vertical: 20, horizontal: 16),
          child: Column(
            mainAxisSize: MainAxisSize.min,
            children: [
              const Row(
                children: [
                  Icon(Icons.keyboard, color: Color(0xFF00D2FF)),
                  SizedBox(width: 10),
                  Text('Opciones de Teclado Táctil para Kiosco', style: TextStyle(color: Colors.white, fontSize: 18, fontWeight: FontWeight.bold)),
                ],
              ),
              const SizedBox(height: 16),
              ListTile(
                leading: const Icon(Icons.dialpad, color: Color(0xFF00E676), size: 28),
                title: const Text('Teclado Táctil Integrado Neo ERP', style: TextStyle(color: Colors.white, fontWeight: FontWeight.bold)),
                subtitle: const Text('Digitar código de producto, SKU o pasillo en pantalla táctil', style: TextStyle(color: Colors.white60, fontSize: 12)),
                onTap: () {
                  Navigator.pop(ctx);
                  _showVirtualKeyboardDialog(_barcodeInputController, onSubmitted: _handleBarcode);
                },
              ),
              if (Platform.isWindows) ...[
                const Divider(color: Colors.white12),
                ListTile(
                  leading: const Icon(Icons.desktop_windows, color: Colors.cyanAccent, size: 28),
                  title: const Text('Abrir Teclado en Pantalla de Windows (OSK)', style: TextStyle(color: Colors.white, fontWeight: FontWeight.bold)),
                  subtitle: const Text('Lanza el teclado táctil flotante del sistema operativo Windows', style: TextStyle(color: Colors.white60, fontSize: 12)),
                  onTap: () {
                    Navigator.pop(ctx);
                    Process.run('cmd', ['/c', 'start', 'osk']);
                  },
                ),
              ],
            ],
          ),
        );
      },
    );
  }

  // ===========================================================================
  // MODAL: Autenticación de Supervisor para Configuración del Kiosco
  // ===========================================================================
  void _showSupervisorAuthDialog(BuildContext context) {
    String currentPin = '';
    final pinController = TextEditingController();

    showDialog(
      context: context,
      builder: (ctx) {
        return StatefulBuilder(
          builder: (dialogCtx, setModalState) {
            void submitPin() {
              final pin = currentPin.trim();
              if (pin == '1234' || KioskConfigService.instance.verifyAdminPin(pin)) {
                Navigator.pop(dialogCtx);
                _showSettingsDialog(context);
              } else {
                setModalState(() {
                  currentPin = '';
                  pinController.clear();
                });
                ScaffoldMessenger.of(context).showSnackBar(
                  const SnackBar(
                    content: Text('PIN de supervisor incorrecto (PIN predeterminado: 1234)'),
                    backgroundColor: Colors.redAccent,
                  ),
                );
              }
            }

            void addDigit(String d) {
              if (currentPin.length < 6) {
                setModalState(() {
                  currentPin += d;
                  pinController.text = currentPin;
                });
                if (currentPin.length == 4 && (currentPin == '1234' || KioskConfigService.instance.verifyAdminPin(currentPin))) {
                  submitPin();
                }
              }
            }

            void backspace() {
              if (currentPin.isNotEmpty) {
                setModalState(() {
                  currentPin = currentPin.substring(0, currentPin.length - 1);
                  pinController.text = currentPin;
                });
              }
            }

            void clear() {
              setModalState(() {
                currentPin = '';
                pinController.clear();
              });
            }

            Widget buildKey(String label, {VoidCallback? onTap, IconData? icon, Color? color}) {
              return SizedBox(
                width: 78,
                height: 54,
                child: ElevatedButton(
                  style: ElevatedButton.styleFrom(
                    backgroundColor: color ?? const Color(0xFF282A3E),
                    foregroundColor: Colors.white,
                    shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(10)),
                    padding: EdgeInsets.zero,
                    elevation: 2,
                  ),
                  onPressed: onTap,
                  child: icon != null
                      ? Icon(icon, size: 24, color: Colors.white)
                      : Text(label, style: const TextStyle(fontSize: 22, fontWeight: FontWeight.bold)),
                ),
              );
            }

            return AlertDialog(
              backgroundColor: const Color(0xFF1E1F2E),
              shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(16)),
              title: const Row(
                children: [
                  Icon(Icons.security, color: Colors.amberAccent),
                  SizedBox(width: 10),
                  Text('Acceso de Supervisor', style: TextStyle(color: Colors.white, fontSize: 18)),
                ],
              ),
              content: SizedBox(
                width: 320,
                child: Column(
                  mainAxisSize: MainAxisSize.min,
                  children: [
                    const Text(
                      'Ingrese el PIN de supervisor para configurar el kiosco (predeterminado: 1234):',
                      textAlign: TextAlign.center,
                      style: TextStyle(color: Colors.white70, fontSize: 13),
                    ),
                    const SizedBox(height: 16),

                    // Visualizador de PIN con puntos táctiles
                    Container(
                      height: 52,
                      width: double.infinity,
                      padding: const EdgeInsets.symmetric(horizontal: 16),
                      decoration: BoxDecoration(
                        color: const Color(0xFF13141F),
                        borderRadius: BorderRadius.circular(10),
                        border: Border.all(color: const Color(0xFF00D2FF).withOpacity(0.5)),
                      ),
                      alignment: Alignment.center,
                      child: Row(
                        mainAxisAlignment: MainAxisAlignment.center,
                        children: List.generate(4, (index) {
                          final isFilled = index < currentPin.length;
                          return Container(
                            margin: const EdgeInsets.symmetric(horizontal: 8),
                            width: 16,
                            height: 16,
                            decoration: BoxDecoration(
                              shape: BoxShape.circle,
                              color: isFilled ? const Color(0xFF00D2FF) : Colors.white24,
                            ),
                          );
                        }),
                      ),
                    ),
                    const SizedBox(height: 18),

                    // Teclado Numérico Táctil
                    Column(
                      children: [
                        Row(
                          mainAxisAlignment: MainAxisAlignment.spaceEvenly,
                          children: [
                            buildKey('1', onTap: () => addDigit('1')),
                            buildKey('2', onTap: () => addDigit('2')),
                            buildKey('3', onTap: () => addDigit('3')),
                          ],
                        ),
                        const SizedBox(height: 10),
                        Row(
                          mainAxisAlignment: MainAxisAlignment.spaceEvenly,
                          children: [
                            buildKey('4', onTap: () => addDigit('4')),
                            buildKey('5', onTap: () => addDigit('5')),
                            buildKey('6', onTap: () => addDigit('6')),
                          ],
                        ),
                        const SizedBox(height: 10),
                        Row(
                          mainAxisAlignment: MainAxisAlignment.spaceEvenly,
                          children: [
                            buildKey('7', onTap: () => addDigit('7')),
                            buildKey('8', onTap: () => addDigit('8')),
                            buildKey('9', onTap: () => addDigit('9')),
                          ],
                        ),
                        const SizedBox(height: 10),
                        Row(
                          mainAxisAlignment: MainAxisAlignment.spaceEvenly,
                          children: [
                            buildKey('C', onTap: clear, color: Colors.red.shade900.withOpacity(0.5)),
                            buildKey('0', onTap: () => addDigit('0')),
                            buildKey('⌫', icon: Icons.backspace_outlined, onTap: backspace, color: const Color(0xFF3B3D55)),
                          ],
                        ),
                      ],
                    ),

                    // Soporte simultáneo para teclado físico si está conectado
                    Opacity(
                      opacity: 0.0,
                      child: SizedBox(
                        height: 1,
                        child: TextField(
                          controller: pinController,
                          autofocus: true,
                          keyboardType: TextInputType.number,
                          textInputAction: TextInputAction.done,
                          onChanged: (val) {
                            setModalState(() => currentPin = val);
                            if (val.length == 4 && (val == '1234' || KioskConfigService.instance.verifyAdminPin(val))) {
                              submitPin();
                            }
                          },
                          onSubmitted: (_) => submitPin(),
                        ),
                      ),
                    ),
                  ],
                ),
              ),
              actions: [
                TextButton(
                  onPressed: () => Navigator.pop(ctx),
                  child: const Text('Cancelar', style: TextStyle(color: Colors.white70)),
                ),
                ElevatedButton.icon(
                  style: ElevatedButton.styleFrom(
                    backgroundColor: const Color(0xFF00D2FF),
                    foregroundColor: Colors.black,
                    padding: const EdgeInsets.symmetric(horizontal: 20, vertical: 10),
                  ),
                  icon: const Icon(Icons.check, size: 18),
                  label: const Text('Entrar', style: TextStyle(fontWeight: FontWeight.bold)),
                  onPressed: submitPin,
                ),
              ],
            );
          },
        );
      },
    );
  }

  // ===========================================================================
  // MODAL: Panel de Configuración Kiosk (Localidad, Almacenes y Ubicaciones)
  // ===========================================================================
  void _showSettingsDialog(BuildContext context) async {
    final config = KioskConfigService.instance;
    List<Map<String, dynamic>> initialFacilities = [];
    List<Map<String, dynamic>> initialWarehouses = [];

    try {
      initialFacilities = await DatabaseHelper.instance.getCachedFacilities();
      initialWarehouses = await DatabaseHelper.instance.getCachedWarehouses();
    } catch (e) {
      debugPrint('Error al cargar instalaciones locales: $e');
    }

    if (!context.mounted) return;

    KioskOperatingMode selectedMode = config.mode;
    int? selectedFacilityId = config.facilityId;
    String? selectedFacilityName = config.facilityName;

    int? selectedSrcWhId = config.sourceWarehouseId;
    String? selectedSrcWhName = config.sourceWarehouseName;
    int? selectedSrcLocId = config.sourceLocationId;
    String? selectedSrcLocName = config.sourceLocationName;

    int? selectedDestWhId = config.destWarehouseId;
    String? selectedDestWhName = config.destWarehouseName;
    int? selectedDestLocId = config.destLocationId;
    String? selectedDestLocName = config.destLocationName;

    final deviceController = TextEditingController(text: config.deviceId);
    final opController = TextEditingController(text: config.operatorBadge);
    final serverUrlController = TextEditingController(
      text: config.serverUrl.isNotEmpty ? config.serverUrl : KioskConfigService.defaultServerUrl,
    );

    bool isTestingConn = false;
    String? connMessage;
    bool? connSuccess;
    bool isSyncingCatalog = false;

    List<Map<String, dynamic>> allFacilities = initialFacilities;
    List<Map<String, dynamic>> allWarehouses = initialWarehouses;
    List<Map<String, dynamic>> srcLocations = [];
    List<Map<String, dynamic>> destLocations = [];

    // Auto-seleccionar localidad inicial si no está configurada o si cambió
    if ((selectedFacilityId == null || !allFacilities.any((f) => f['id'] == selectedFacilityId)) && allFacilities.isNotEmpty) {
      selectedFacilityId = allFacilities.first['id'] as int;
      selectedFacilityName = allFacilities.first['name'] as String;
    }

    // Cargar ubicaciones iniciales de manera segura si hay almacén seleccionado
    try {
      if (selectedSrcWhId != null) {
        srcLocations = await DatabaseHelper.instance.getCachedLocations(selectedSrcWhId);
      }
      if (selectedDestWhId != null) {
        destLocations = await DatabaseHelper.instance.getCachedLocations(selectedDestWhId);
      }
    } catch (e) {
      debugPrint('Error al cargar ubicaciones iniciales: $e');
    }

    showDialog(
      context: context,
      barrierDismissible: false,
      builder: (ctx) {
        return StatefulBuilder(
          builder: (dialogCtx, setDialogState) {
            // Función para recargar la memoria local en caliente tras descargar catálogo
            Future<void> reloadLocalData() async {
              try {
                final facs = await DatabaseHelper.instance.getCachedFacilities();
                final whs = await DatabaseHelper.instance.getCachedWarehouses();

                int? facId = selectedFacilityId;
                String? facName = selectedFacilityName;
                if ((facId == null || !facs.any((f) => f['id'] == facId)) && facs.isNotEmpty) {
                  facId = facs.first['id'] as int;
                  facName = facs.first['name'] as String;
                }

                final filteredWhs = whs.where((w) => w['facility_id'] == facId).toList();

                int? sWhId = selectedSrcWhId;
                String? sWhName = selectedSrcWhName;
                if ((sWhId == null || !filteredWhs.any((w) => w['id'] == sWhId)) && filteredWhs.isNotEmpty) {
                  sWhId = filteredWhs.first['id'] as int;
                  sWhName = filteredWhs.first['name'] as String;
                }

                int? dWhId = selectedDestWhId;
                String? dWhName = selectedDestWhName;
                if ((dWhId == null || !filteredWhs.any((w) => w['id'] == dWhId)) && filteredWhs.isNotEmpty) {
                  if (filteredWhs.length > 1) {
                    dWhId = filteredWhs[1]['id'] as int;
                    dWhName = filteredWhs[1]['name'] as String;
                  } else {
                    dWhId = filteredWhs.first['id'] as int;
                    dWhName = filteredWhs.first['name'] as String;
                  }
                }

                List<Map<String, dynamic>> sLocs = [];
                if (sWhId != null) {
                  sLocs = await DatabaseHelper.instance.getCachedLocations(sWhId);
                }
                List<Map<String, dynamic>> dLocs = [];
                if (dWhId != null) {
                  dLocs = await DatabaseHelper.instance.getCachedLocations(dWhId);
                }

                setDialogState(() {
                  allFacilities = facs;
                  allWarehouses = whs;
                  selectedFacilityId = facId;
                  selectedFacilityName = facName;
                  selectedSrcWhId = sWhId;
                  selectedSrcWhName = sWhName;
                  selectedDestWhId = dWhId;
                  selectedDestWhName = dWhName;
                  srcLocations = sLocs;
                  destLocations = dLocs;
                });
              } catch (e) {
                debugPrint('Error al recargar datos locales: $e');
              }
            }

            final availableWarehouses = selectedFacilityId != null
                ? allWarehouses.where((w) => w['facility_id'] == selectedFacilityId).toList()
                : allWarehouses;

            return AlertDialog(
              backgroundColor: const Color(0xFF1E1F2E),
              title: const Row(
                children: [
                  Icon(Icons.tune, color: Color(0xFF00D2FF)),
                  SizedBox(width: 10),
                  Text('Configuración del Kiosco Neo WMS', style: TextStyle(color: Colors.white)),
                ],
              ),
              content: SizedBox(
                width: 600,
                child: SingleChildScrollView(
                  child: Column(
                    crossAxisAlignment: CrossAxisAlignment.start,
                    mainAxisSize: MainAxisSize.min,
                    children: [
                      // SECCIÓN 1: SERVIDOR CENTRAL NEO ERP
                      Container(
                        padding: const EdgeInsets.all(14),
                        decoration: BoxDecoration(
                          color: const Color(0xFF13141F),
                          borderRadius: BorderRadius.circular(10),
                          border: Border.all(color: const Color(0xFF2E3048)),
                        ),
                        child: Column(
                          crossAxisAlignment: CrossAxisAlignment.start,
                          children: [
                            const Row(
                              children: [
                                Icon(Icons.dns_outlined, color: Color(0xFF00D2FF), size: 18),
                                SizedBox(width: 8),
                                Text(
                                  'SERVIDOR CENTRAL NEO ERP (PREDETERMINADO):',
                                  style: TextStyle(color: Color(0xFF00D2FF), fontWeight: FontWeight.bold, fontSize: 12),
                                ),
                              ],
                            ),
                            const SizedBox(height: 10),
                            TextField(
                              controller: serverUrlController,
                              style: const TextStyle(color: Colors.white, fontSize: 14),
                              decoration: const InputDecoration(
                                hintText: 'https://api.qa.morpheussoft.net/api/v1',
                                hintStyle: TextStyle(color: Colors.white30),
                                border: OutlineInputBorder(),
                                contentPadding: EdgeInsets.symmetric(horizontal: 12, vertical: 12),
                              ),
                            ),
                            const SizedBox(height: 10),
                            Row(
                              children: [
                                ElevatedButton.icon(
                                  style: ElevatedButton.styleFrom(
                                    backgroundColor: const Color(0xFF2B2C40),
                                    foregroundColor: Colors.white,
                                    padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 8),
                                  ),
                                  icon: isTestingConn
                                      ? const SizedBox(width: 14, height: 14, child: CircularProgressIndicator(strokeWidth: 2, color: Colors.white))
                                      : const Icon(Icons.network_ping, size: 16),
                                  label: const Text('Probar Conexión', style: TextStyle(fontSize: 12)),
                                  onPressed: isTestingConn
                                      ? null
                                      : () async {
                                          setDialogState(() {
                                            isTestingConn = true;
                                            connMessage = null;
                                            connSuccess = null;
                                          });
                                          final res = await config.testServerConnection(serverUrlController.text);
                                          setDialogState(() {
                                            isTestingConn = false;
                                            connSuccess = res['success'];
                                            connMessage = res['message'];
                                          });
                                        },
                                ),
                                const SizedBox(width: 12),
                                if (connMessage != null)
                                  Expanded(
                                    child: Text(
                                      connMessage!,
                                      style: TextStyle(
                                        color: connSuccess == true ? Colors.greenAccent : Colors.redAccent,
                                        fontSize: 12,
                                        fontWeight: FontWeight.bold,
                                      ),
                                    ),
                                  ),
                              ],
                            ),
                            const SizedBox(height: 10),
                            // Botón para refrescar catálogo en caliente
                            SizedBox(
                              width: double.infinity,
                              child: OutlinedButton.icon(
                                style: OutlinedButton.styleFrom(
                                  side: const BorderSide(color: Color(0xFF00D2FF)),
                                  padding: const EdgeInsets.symmetric(vertical: 10),
                                ),
                                icon: isSyncingCatalog
                                    ? const SizedBox(width: 16, height: 16, child: CircularProgressIndicator(strokeWidth: 2, color: Color(0xFF00D2FF)))
                                    : const Icon(Icons.cloud_download, color: Color(0xFF00D2FF)),
                                label: Text(
                                  isSyncingCatalog ? 'Descargando Catálogo Maestro...' : 'Descargar / Actualizar Catálogo Maestro Ahora',
                                  style: const TextStyle(color: Color(0xFF00D2FF), fontWeight: FontWeight.bold),
                                ),
                                onPressed: isSyncingCatalog
                                    ? null
                                    : () async {
                                        setDialogState(() => isSyncingCatalog = true);
                                        await config.setServerUrl(serverUrlController.text);
                                        final ok = await SyncService.instance.syncCatalog();
                                        if (ok) {
                                          await reloadLocalData();
                                        }
                                        setDialogState(() => isSyncingCatalog = false);
                                        if (context.mounted) {
                                          ScaffoldMessenger.of(context).showSnackBar(
                                            SnackBar(
                                              backgroundColor: ok ? Colors.green.shade800 : Colors.red.shade800,
                                              content: Text(ok
                                                  ? '✓ Catálogo maestro y localidades descargadas exitosamente'
                                                  : '✗ ${SyncService.instance.lastError ?? "Error al descargar catálogo (revise URL y conexión)"}'),
                                            ),
                                          );
                                        }
                                      },
                              ),
                            ),
                          ],
                        ),
                      ),
                      const SizedBox(height: 18),

                      // SECCIÓN 2: LOCALIDAD / SUCURSAL DEL DISPOSITIVO
                      const Row(
                        children: [
                          Icon(Icons.store, color: Colors.cyanAccent, size: 16),
                          SizedBox(width: 6),
                          Text(
                            'LOCALIDAD / SUCURSAL DONDE ESTÁ EL KIOSCO:',
                            style: TextStyle(color: Colors.cyanAccent, fontWeight: FontWeight.bold, fontSize: 12),
                          ),
                        ],
                      ),
                      const SizedBox(height: 8),
                      if (allFacilities.isEmpty)
                        Container(
                          padding: const EdgeInsets.all(12),
                          decoration: BoxDecoration(
                            color: Colors.amber.withOpacity(0.1),
                            borderRadius: BorderRadius.circular(8),
                            border: Border.all(color: Colors.amber.withOpacity(0.4)),
                          ),
                          child: const Row(
                            children: [
                              Icon(Icons.info_outline, color: Colors.amberAccent, size: 20),
                              SizedBox(width: 10),
                              Expanded(
                                child: Text(
                                  'No hay localidades en caché local. Presione el botón "Descargar / Actualizar Catálogo Maestro Ahora" arriba para obtenerlas.',
                                  style: TextStyle(color: Colors.amberAccent, fontSize: 12),
                                ),
                              ),
                            ],
                          ),
                        )
                      else
                        DropdownButtonFormField<int>(
                          value: (selectedFacilityId != null && allFacilities.any((f) => f['id'] == selectedFacilityId))
                              ? selectedFacilityId
                              : (allFacilities.isNotEmpty ? allFacilities.first['id'] as int : null),
                          dropdownColor: const Color(0xFF1E1F2E),
                          decoration: const InputDecoration(
                            labelText: 'Seleccione Localidad / Sucursal',
                            labelStyle: TextStyle(color: Colors.white70),
                            border: OutlineInputBorder(),
                            prefixIcon: Icon(Icons.location_city, color: Colors.cyanAccent),
                          ),
                          style: const TextStyle(color: Colors.white, fontWeight: FontWeight.bold),
                          items: allFacilities.map((fac) {
                            return DropdownMenuItem<int>(
                              value: fac['id'] as int,
                              child: Text('${fac['name']} (${fac['code']})'),
                            );
                          }).toList(),
                          onChanged: (newFacId) async {
                            if (newFacId == null) return;
                            final fac = allFacilities.firstWhere((f) => f['id'] == newFacId);
                            final filteredWhs = allWarehouses.where((w) => w['facility_id'] == newFacId).toList();
                            final newSrcWh = filteredWhs.isNotEmpty ? filteredWhs.first : null;
                            final newDestWh = filteredWhs.length > 1 ? filteredWhs[1] : newSrcWh;

                            List<Map<String, dynamic>> sLocs = [];
                            if (newSrcWh != null) {
                              sLocs = await DatabaseHelper.instance.getCachedLocations(newSrcWh['id'] as int);
                            }
                            List<Map<String, dynamic>> dLocs = [];
                            if (newDestWh != null) {
                              dLocs = await DatabaseHelper.instance.getCachedLocations(newDestWh['id'] as int);
                            }

                            setDialogState(() {
                              selectedFacilityId = newFacId;
                              selectedFacilityName = fac['name'] as String;
                              selectedSrcWhId = newSrcWh?['id'] as int?;
                              selectedSrcWhName = newSrcWh?['name'] as String?;
                              selectedSrcLocId = null;
                              selectedSrcLocName = null;
                              selectedDestWhId = newDestWh?['id'] as int?;
                              selectedDestWhName = newDestWh?['name'] as String?;
                              selectedDestLocId = null;
                              selectedDestLocName = null;
                              srcLocations = sLocs;
                              destLocations = dLocs;
                            });
                          },
                        ),
                      const SizedBox(height: 18),

                      // SECCIÓN 3: MODO DE TRABAJO
                      const Text('MODO DE TRABAJO:', style: TextStyle(color: Colors.white70, fontWeight: FontWeight.bold, fontSize: 12)),
                      const SizedBox(height: 6),
                      RadioListTile<KioskOperatingMode>(
                        dense: true,
                        contentPadding: EdgeInsets.zero,
                        title: const Text('⚡ Modo Express (Pre-configurado)', style: TextStyle(color: Colors.white, fontWeight: FontWeight.bold)),
                        subtitle: const Text('Origen y destino fijos. Máxima velocidad de escaneo sin clics.', style: TextStyle(color: Colors.white54, fontSize: 12)),
                        value: KioskOperatingMode.express,
                        groupValue: selectedMode,
                        onChanged: (val) => setDialogState(() => selectedMode = val!),
                      ),
                      RadioListTile<KioskOperatingMode>(
                        dense: true,
                        contentPadding: EdgeInsets.zero,
                        title: const Text('📋 Modo Detallado / Manual', style: TextStyle(color: Colors.white, fontWeight: FontWeight.bold)),
                        subtitle: const Text('Multi-almacén o por pasillo. El operador indica origen y destino.', style: TextStyle(color: Colors.white54, fontSize: 12)),
                        value: KioskOperatingMode.detailed,
                        groupValue: selectedMode,
                        onChanged: (val) => setDialogState(() => selectedMode = val!),
                      ),
                      const Divider(color: Colors.white24, height: 24),

                      // SECCIÓN 4: PARÁMETROS FIJOS PARA MODO EXPRESS
                      if (selectedMode == KioskOperatingMode.express) ...[
                        const Row(
                          children: [
                            Icon(Icons.bolt, color: Colors.amberAccent, size: 16),
                            SizedBox(width: 6),
                            Text('ORIGEN Y DESTINO FIJOS (MODO EXPRESS):', style: TextStyle(color: Colors.amberAccent, fontWeight: FontWeight.bold, fontSize: 12)),
                          ],
                        ),
                        const SizedBox(height: 12),

                        // ORIGEN FIJO (Almacén y Ubicación)
                        Container(
                          padding: const EdgeInsets.all(12),
                          decoration: BoxDecoration(
                            color: Colors.amber.withOpacity(0.06),
                            borderRadius: BorderRadius.circular(8),
                            border: Border.all(color: Colors.amber.withOpacity(0.3)),
                          ),
                          child: Column(
                            crossAxisAlignment: CrossAxisAlignment.start,
                            children: [
                              const Text('ORIGEN FIJO:', style: TextStyle(color: Colors.amberAccent, fontWeight: FontWeight.bold, fontSize: 11)),
                              const SizedBox(height: 8),
                              if (availableWarehouses.isEmpty)
                                Container(
                                  padding: const EdgeInsets.all(10),
                                  decoration: BoxDecoration(
                                    color: Colors.amber.withOpacity(0.08),
                                    borderRadius: BorderRadius.circular(6),
                                  ),
                                  child: const Text(
                                    'No hay almacenes para esta localidad. Descargue el catálogo maestro primero.',
                                    style: TextStyle(color: Colors.amberAccent, fontSize: 12),
                                  ),
                                )
                              else
                                DropdownButtonFormField<int>(
                                  value: (selectedSrcWhId != null && availableWarehouses.any((w) => w['id'] == selectedSrcWhId))
                                      ? selectedSrcWhId
                                      : (availableWarehouses.isNotEmpty ? availableWarehouses.first['id'] as int : null),
                                  dropdownColor: const Color(0xFF1E1F2E),
                                  decoration: const InputDecoration(
                                    labelText: 'Almacén de Origen',
                                    labelStyle: TextStyle(color: Colors.white70),
                                    border: OutlineInputBorder(),
                                    prefixIcon: Icon(Icons.warehouse, color: Colors.amberAccent),
                                  ),
                                  style: const TextStyle(color: Colors.white),
                                  items: availableWarehouses.map((wh) {
                                    return DropdownMenuItem<int>(
                                      value: wh['id'] as int,
                                      child: Text(wh['name'] as String),
                                    );
                                  }).toList(),
                                  onChanged: (val) async {
                                    if (val == null) return;
                                    final wh = availableWarehouses.firstWhere((w) => w['id'] == val);
                                    final locs = await DatabaseHelper.instance.getCachedLocations(val);
                                    setDialogState(() {
                                      selectedSrcWhId = val;
                                      selectedSrcWhName = wh['name'] as String;
                                      selectedSrcLocId = null;
                                      selectedSrcLocName = null;
                                      srcLocations = locs;
                                    });
                                  },
                                ),
                              const SizedBox(height: 8),
                              DropdownButtonFormField<int?>(
                                value: (selectedSrcLocId != null && srcLocations.any((l) => l['id'] == selectedSrcLocId))
                                    ? selectedSrcLocId
                                    : null,
                                dropdownColor: const Color(0xFF1E1F2E),
                                decoration: const InputDecoration(
                                  labelText: 'Ubicación de Origen (Opcional)',
                                  labelStyle: TextStyle(color: Colors.white70),
                                  border: OutlineInputBorder(),
                                  prefixIcon: Icon(Icons.place, color: Colors.amberAccent),
                                ),
                                style: const TextStyle(color: Colors.white),
                                items: [
                                  const DropdownMenuItem<int?>(
                                    value: null,
                                    child: Text('📍 Ubicación General / Por Defecto', style: TextStyle(color: Colors.white70)),
                                  ),
                                  ...srcLocations.map((loc) {
                                    return DropdownMenuItem<int?>(
                                      value: loc['id'] as int,
                                      child: Text('📍 ${loc['name']} (${loc['code']})'),
                                    );
                                  }),
                                ],
                                onChanged: (val) {
                                  setDialogState(() {
                                    selectedSrcLocId = val;
                                    if (val != null) {
                                      final loc = srcLocations.firstWhere((l) => l['id'] == val);
                                      selectedSrcLocName = loc['name'] as String;
                                    } else {
                                      selectedSrcLocName = null;
                                    }
                                  });
                                },
                              ),
                            ],
                          ),
                        ),
                        const SizedBox(height: 12),

                        // DESTINO FIJO (Almacén y Ubicación)
                        Container(
                          padding: const EdgeInsets.all(12),
                          decoration: BoxDecoration(
                            color: Colors.cyan.withOpacity(0.06),
                            borderRadius: BorderRadius.circular(8),
                            border: Border.all(color: Colors.cyan.withOpacity(0.3)),
                          ),
                          child: Column(
                            crossAxisAlignment: CrossAxisAlignment.start,
                            children: [
                              const Text('DESTINO FIJO:', style: TextStyle(color: Colors.cyanAccent, fontWeight: FontWeight.bold, fontSize: 11)),
                              const SizedBox(height: 8),
                              if (availableWarehouses.isEmpty)
                                Container(
                                  padding: const EdgeInsets.all(10),
                                  decoration: BoxDecoration(
                                    color: Colors.cyan.withOpacity(0.08),
                                    borderRadius: BorderRadius.circular(6),
                                  ),
                                  child: const Text(
                                    'No hay almacenes registrados para esta localidad.',
                                    style: TextStyle(color: Colors.cyanAccent, fontSize: 12),
                                  ),
                                )
                              else
                                DropdownButtonFormField<int>(
                                  value: (selectedDestWhId != null && availableWarehouses.any((w) => w['id'] == selectedDestWhId))
                                      ? selectedDestWhId
                                      : (availableWarehouses.length > 1
                                          ? availableWarehouses[1]['id'] as int
                                          : (availableWarehouses.isNotEmpty ? availableWarehouses.first['id'] as int : null)),
                                  dropdownColor: const Color(0xFF1E1F2E),
                                  decoration: const InputDecoration(
                                    labelText: 'Almacén de Destino',
                                    labelStyle: TextStyle(color: Colors.white70),
                                    border: OutlineInputBorder(),
                                    prefixIcon: Icon(Icons.storefront, color: Colors.cyanAccent),
                                  ),
                                  style: const TextStyle(color: Colors.white),
                                  items: availableWarehouses.map((wh) {
                                    return DropdownMenuItem<int>(
                                      value: wh['id'] as int,
                                      child: Text(wh['name'] as String),
                                    );
                                  }).toList(),
                                  onChanged: (val) async {
                                    if (val == null) return;
                                    final wh = availableWarehouses.firstWhere((w) => w['id'] == val);
                                    final locs = await DatabaseHelper.instance.getCachedLocations(val);
                                    setDialogState(() {
                                      selectedDestWhId = val;
                                      selectedDestWhName = wh['name'] as String;
                                      selectedDestLocId = null;
                                      selectedDestLocName = null;
                                      destLocations = locs;
                                    });
                                  },
                                ),
                              const SizedBox(height: 8),
                              DropdownButtonFormField<int?>(
                                value: (selectedDestLocId != null && destLocations.any((l) => l['id'] == selectedDestLocId))
                                    ? selectedDestLocId
                                    : null,
                                dropdownColor: const Color(0xFF1E1F2E),
                                decoration: const InputDecoration(
                                  labelText: 'Ubicación de Destino (Opcional)',
                                  labelStyle: TextStyle(color: Colors.white70),
                                  border: OutlineInputBorder(),
                                  prefixIcon: Icon(Icons.place, color: Colors.cyanAccent),
                                ),
                                style: const TextStyle(color: Colors.white),
                                items: [
                                  const DropdownMenuItem<int?>(
                                    value: null,
                                    child: Text('📍 Ubicación General / Por Defecto', style: TextStyle(color: Colors.white70)),
                                  ),
                                  ...destLocations.map((loc) {
                                    return DropdownMenuItem<int?>(
                                      value: loc['id'] as int,
                                      child: Text('📍 ${loc['name']} (${loc['code']})'),
                                    );
                                  }),
                                ],
                                onChanged: (val) {
                                  setDialogState(() {
                                    selectedDestLocId = val;
                                    if (val != null) {
                                      final loc = destLocations.firstWhere((l) => l['id'] == val);
                                      selectedDestLocName = loc['name'] as String;
                                    } else {
                                      selectedDestLocName = null;
                                    }
                                  });
                                },
                              ),
                            ],
                          ),
                        ),
                        const Divider(color: Colors.white24, height: 24),
                      ],

                      // Identificador del Kiosco y Operador
                      TextField(
                        controller: deviceController,
                        style: const TextStyle(color: Colors.white),
                        decoration: const InputDecoration(labelText: 'Nombre / ID del Kiosco', labelStyle: TextStyle(color: Colors.white70), border: OutlineInputBorder()),
                      ),
                      const SizedBox(height: 12),
                      TextField(
                        controller: opController,
                        style: const TextStyle(color: Colors.white),
                        decoration: const InputDecoration(labelText: 'Código / Carnet de Operador', labelStyle: TextStyle(color: Colors.white70), border: OutlineInputBorder()),
                      ),
                    ],
                  ),
                ),
              ),
              actions: [
                TextButton(
                  onPressed: () => Navigator.pop(ctx),
                  child: const Text('Cancelar', style: TextStyle(color: Colors.white70)),
                ),
                ElevatedButton(
                  style: ElevatedButton.styleFrom(backgroundColor: const Color(0xFF00D2FF), foregroundColor: Colors.black),
                  onPressed: () async {
                    // Validar localidad
                    final effectiveFacId = (selectedFacilityId != null && allFacilities.any((f) => f['id'] == selectedFacilityId))
                        ? selectedFacilityId
                        : (allFacilities.isNotEmpty ? allFacilities.first['id'] as int : null);

                    if (effectiveFacId == null) {
                      ScaffoldMessenger.of(context).showSnackBar(
                        const SnackBar(content: Text('Debe seleccionar la localidad donde opera este kiosco (o descargue el catálogo primero)')),
                      );
                      return;
                    }

                    final effectiveSrcWhId = (selectedSrcWhId != null && availableWarehouses.any((w) => w['id'] == selectedSrcWhId))
                        ? selectedSrcWhId
                        : (availableWarehouses.isNotEmpty ? availableWarehouses.first['id'] as int : null);

                    final effectiveDestWhId = (selectedDestWhId != null && availableWarehouses.any((w) => w['id'] == selectedDestWhId))
                        ? selectedDestWhId
                        : (availableWarehouses.length > 1
                            ? availableWarehouses[1]['id'] as int
                            : (availableWarehouses.isNotEmpty ? availableWarehouses.first['id'] as int : null));

                    if (selectedMode == KioskOperatingMode.express) {
                      if (effectiveSrcWhId == null || effectiveDestWhId == null) {
                        ScaffoldMessenger.of(context).showSnackBar(
                          const SnackBar(content: Text('Debe configurar almacén de origen y destino para Modo Express')),
                        );
                        return;
                      }

                      if (effectiveSrcWhId == effectiveDestWhId && selectedSrcLocId == selectedDestLocId) {
                        ScaffoldMessenger.of(context).showSnackBar(
                          const SnackBar(content: Text('El origen y destino no pueden ser exactamente iguales (deben variar de almacén o ubicación)')),
                        );
                        return;
                      }
                    }

                    // Resolver nombres
                    final facRecord = allFacilities.firstWhere((f) => f['id'] == effectiveFacId, orElse: () => {});
                    final effectiveFacName = facRecord['name'] as String? ?? selectedFacilityName ?? 'Localidad';

                    final srcWhRecord = availableWarehouses.firstWhere((w) => w['id'] == effectiveSrcWhId, orElse: () => {});
                    final effectiveSrcWhName = srcWhRecord['name'] as String? ?? selectedSrcWhName ?? 'Almacén Origen';

                    final destWhRecord = availableWarehouses.firstWhere((w) => w['id'] == effectiveDestWhId, orElse: () => {});
                    final effectiveDestWhName = destWhRecord['name'] as String? ?? selectedDestWhName ?? 'Almacén Destino';

                    await config.saveFullKioskConfig(
                      mode: selectedMode,
                      facilityId: effectiveFacId,
                      facilityName: effectiveFacName,
                      srcWhId: effectiveSrcWhId,
                      srcWhName: effectiveSrcWhName,
                      srcLocId: selectedSrcLocId,
                      srcLocName: selectedSrcLocName,
                      destWhId: effectiveDestWhId,
                      destWhName: effectiveDestWhName,
                      destLocId: selectedDestLocId,
                      destLocName: selectedDestLocName,
                      deviceId: deviceController.text.trim(),
                      operatorBadge: opController.text.trim(),
                      serverUrl: serverUrlController.text.trim(),
                    );

                    // Recargar caché local en la vista principal
                    await _loadCachedWarehouses();

                    // Notificar al servicio de sincronización
                    SyncService.instance.checkConnectivityAndSync();

                    if (ctx.mounted) Navigator.pop(ctx);
                    setState(() {});
                  },
                  child: const Text('Guardar'),
                ),
              ],
            );
          },
        );
      },
    );
  }
}
