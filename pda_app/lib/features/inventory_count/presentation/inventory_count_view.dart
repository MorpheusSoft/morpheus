import 'dart:async';
import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:provider/provider.dart';
import 'package:uuid/uuid.dart';
import '../../../core/database/pda_db_helper.dart';
import '../../../core/services/barcode_scanner_listener.dart';
import '../../../core/services/pda_config_service.dart';
import '../../../core/services/pda_sync_service.dart';

class InventoryCountView extends StatefulWidget {
  const InventoryCountView({super.key});

  @override
  State<InventoryCountView> createState() => _InventoryCountViewState();
}

class _InventoryCountViewState extends State<InventoryCountView> {
  final _uuid = const Uuid();
  List<Map<String, dynamic>> _availableSessions = [];
  int? _selectedSessionId;
  String? _selectedSessionName;

  List<Map<String, dynamic>> _countedItems = [];
  bool _isLoading = true;
  bool _isContinuousMode = false; // Modo rápido (+1) por defecto APAGADO
  String? _bannerMessage;
  Color _bannerColor = const Color(0xFF1E2030);

  final TextEditingController _manualCodeController = TextEditingController();
  final TextEditingController _barcodeInputController = TextEditingController();
  final FocusNode _barcodeFocusNode = FocusNode();

  Timer? _inputDebounceTimer;
  String _lastScannedBarcode = '';
  DateTime _lastScanTimestamp = DateTime.fromMillisecondsSinceEpoch(0);

  @override
  void initState() {
    super.initState();
    _setupFocus();
    _loadInitialData();
  }

  void _setupFocus() {
    WidgetsBinding.instance.addPostFrameCallback((_) {
      if (mounted) {
        _barcodeFocusNode.requestFocus();
        SystemChannels.textInput.invokeMethod('TextInput.hide');
      }
    });

    _barcodeFocusNode.addListener(() {
      if (!_barcodeFocusNode.hasFocus && mounted) {
        WidgetsBinding.instance.addPostFrameCallback((_) {
          if (mounted && (ModalRoute.of(context)?.isCurrent ?? false)) {
            _barcodeFocusNode.requestFocus();
            SystemChannels.textInput.invokeMethod('TextInput.hide');
          }
        });
      }
    });
  }

  Future<void> _loadInitialData() async {
    setState(() => _isLoading = true);
    final config = PdaConfigService.instance;
    final sync = PdaSyncService.instance;

    _isContinuousMode = config.continuousScanMode;

    // Cargar únicamente sesiones planificadas y abiertas (IN_PROGRESS o DRAFT)
    final allSessions = await sync.fetchInventorySessions(facilityId: config.facilityId);
    final openSessions = allSessions.where((s) {
      final state = (s['state'] ?? '').toString().toUpperCase();
      return state == 'IN_PROGRESS' || state == 'DRAFT';
    }).toList();

    if (openSessions.isNotEmpty) {
      _selectedSessionId = openSessions.first['id'];
      _selectedSessionName = openSessions.first['name'];
    } else {
      _selectedSessionId = null;
      _selectedSessionName = null;
    }

    _availableSessions = openSessions;
    await _reloadLocalCounts();
    setState(() => _isLoading = false);
  }

  Future<void> _reloadLocalCounts() async {
    final counts = await PdaDatabaseHelper.instance.getLocalCountsForSession(_selectedSessionId);
    setState(() {
      _countedItems = counts;
    });
    await PdaSyncService.instance.refreshPendingCount();
  }

  // ===========================================================================
  // Manejo de Escaneo Físico con la PDA
  // ===========================================================================
  Future<void> _handleCountScan(String barcode) async {
    final clean = barcode.trim();
    if (clean.isEmpty) return;

    final now = DateTime.now();
    if (clean == _lastScannedBarcode && now.difference(_lastScanTimestamp).inMilliseconds < 400) {
      return;
    }
    _lastScannedBarcode = clean;
    _lastScanTimestamp = now;

    if (_selectedSessionId == null) {
      HapticFeedback.vibrate();
      setState(() {
        _bannerMessage = '⚠️ No hay ninguna toma física abierta seleccionada.';
        _bannerColor = Colors.amber.shade900;
      });
      return;
    }

    var product = await PdaDatabaseHelper.instance.findProductByBarcode(clean);
    if (product == null) {
      final config = PdaConfigService.instance;
      product = await PdaSyncService.instance.lookupProduct(clean, facilityId: config.facilityId);
    }

    if (product == null) {
      HapticFeedback.vibrate();
      setState(() {
        _bannerMessage = '⚠️ Producto no encontrado con código: "$clean"';
        _bannerColor = Colors.red.shade900;
      });
      return;
    }

    final prod = product;

    // Validación de Criterios de la Toma de Inventario
    final session = _availableSessions.firstWhere(
      (s) => s['id'] == _selectedSessionId,
      orElse: () => <String, dynamic>{},
    );

    // 1. Criterio de Categoría
    final validCatIds = (session['valid_category_ids'] as List?)
            ?.map((e) => (e as num).toInt())
            .toList() ??
        [];
    final prodCatId = prod['category_id'] as int?;

    if (session['scope_type'] == 'CATEGORY' || validCatIds.isNotEmpty) {
      if (prodCatId != null && validCatIds.isNotEmpty && !validCatIds.contains(prodCatId)) {
        HapticFeedback.vibrate();
        setState(() {
          _bannerMessage = '⚠️ No permitido: "${prod['name']}" no pertenece a la categoría de esta toma física.';
          _bannerColor = Colors.red.shade900;
        });
        return;
      }
    }

    // 2. Criterio de Variantes planificadas específicas
    final validVarIds = (session['valid_variant_ids'] as List?)
            ?.map((e) => (e as num).toInt())
            .toList() ??
        [];
    final prodVarId = prod['variant_id'] as int?;

    if (validVarIds.isNotEmpty && prodVarId != null && !validVarIds.contains(prodVarId)) {
      HapticFeedback.vibrate();
      setState(() {
        _bannerMessage = '⚠️ No permitido: "${prod['name']}" no está planificado en esta toma física.';
        _bannerColor = Colors.red.shade900;
      });
      return;
    }

    if (_isContinuousMode) {
      // Modo rápido: sumar 1 unidad automáticamente acumulando por cada escaneo
      await _registerCount(
        product: prod,
        barcode: clean,
        quantity: 1.0,
        factor: 1.0,
      );
    } else {
      // Modo detallado: abrir modal con campo numérico para digitar la cantidad
      _showQuantityModal(prod, clean);
    }
  }

  Future<void> _registerCount({
    required Map<String, dynamic> product,
    required String barcode,
    required double quantity,
    int? packagingId,
    double factor = 1.0,
  }) async {
    final config = PdaConfigService.instance;
    final now = DateTime.now().toIso8601String();
    final clientUuid = _uuid.v4();

    final totalAdd = quantity * factor;

    final row = {
      'client_uuid': clientUuid,
      'session_id': _selectedSessionId,
      'session_name': _selectedSessionName ?? 'Toma de Inventario',
      'barcode': barcode,
      'variant_id': product['variant_id'],
      'product_name': product['name'],
      'sku': product['sku'],
      'facility_id': config.facilityId,
      'warehouse_id': config.warehouseId,
      'counted_qty': totalAdd,
      'uom': product['uom_base'] ?? 'UND',
      'packaging_id': packagingId,
      'factor': factor,
      'operator_code': config.operatorBadge,
      'device_id': config.deviceId,
      'offline_scanned_at': now,
      'sync_status': 'PENDING',
      'created_at': now,
    };

    final newTotal = await PdaDatabaseHelper.instance.upsertIncrementInventoryCount(row, totalAdd);
    SystemSound.play(SystemSoundType.click);
    HapticFeedback.mediumImpact();

    setState(() {
      _bannerMessage = '✅ +${totalAdd.toStringAsFixed(0)} ${product['uom_base'] ?? 'UND'} "${product['name']}" (Total: ${newTotal.toStringAsFixed(0)} ${product['uom_base'] ?? 'UND'})';
      _bannerColor = Colors.green.shade800;
    });

    _barcodeInputController.clear();
    WidgetsBinding.instance.addPostFrameCallback((_) {
      if (mounted && (ModalRoute.of(context)?.isCurrent ?? false)) {
        _barcodeFocusNode.requestFocus();
        SystemChannels.textInput.invokeMethod('TextInput.hide');
      }
    });

    await _reloadLocalCounts();
    PdaSyncService.instance.checkConnectivityAndSync();
  }

  void _showQuantityModal(Map<String, dynamic> product, String barcode) {
    final TextEditingController qtyController = TextEditingController(text: '1');

    showModalBottomSheet(
      context: context,
      backgroundColor: const Color(0xFF1E2032),
      isScrollControlled: true,
      shape: const RoundedRectangleBorder(borderRadius: BorderRadius.vertical(top: Radius.circular(20))),
      builder: (ctx) {
        return Padding(
          padding: EdgeInsets.only(
            left: 20,
            right: 20,
            top: 20,
            bottom: MediaQuery.of(ctx).viewInsets.bottom + 20,
          ),
          child: Column(
            mainAxisSize: MainAxisSize.min,
            crossAxisAlignment: CrossAxisAlignment.stretch,
            children: [
              Text(
                product['name'] ?? '',
                style: const TextStyle(color: Colors.white, fontSize: 16, fontWeight: FontWeight.bold),
              ),
              Text(
                'SKU: ${product['sku']} • Unidad: ${product['uom_base'] ?? 'UND'}',
                style: const TextStyle(color: Color(0xFF00D2FF), fontSize: 12),
              ),
              const SizedBox(height: 16),

              // Campo de texto numérico para digitar la cantidad directamente
              TextField(
                controller: qtyController,
                autofocus: true,
                textAlign: TextAlign.center,
                keyboardType: const TextInputType.numberWithOptions(decimal: true),
                style: const TextStyle(color: Colors.white, fontSize: 32, fontWeight: FontWeight.bold),
                decoration: InputDecoration(
                  filled: true,
                  fillColor: const Color(0xFF141523),
                  labelText: 'Cantidad a contar',
                  labelStyle: const TextStyle(color: Colors.white60, fontSize: 13),
                  suffixText: product['uom_base'] ?? 'UND',
                  suffixStyle: const TextStyle(color: Color(0xFF00D2FF), fontSize: 15, fontWeight: FontWeight.bold),
                  border: OutlineInputBorder(borderRadius: BorderRadius.circular(12)),
                  focusedBorder: OutlineInputBorder(
                    borderRadius: BorderRadius.circular(12),
                    borderSide: const BorderSide(color: Color(0xFF00D2FF), width: 2),
                  ),
                ),
                onSubmitted: (val) {
                  final numVal = double.tryParse(val.trim()) ?? 1.0;
                  if (numVal > 0) {
                    Navigator.pop(ctx);
                    _registerCount(product: product, barcode: barcode, quantity: numVal);
                  }
                },
              ),
              const SizedBox(height: 12),

              // Botones de incremento rápido (+1, +5, +10, +25)
              Row(
                mainAxisAlignment: MainAxisAlignment.spaceEvenly,
                children: [1, 5, 10, 25].map((step) {
                  return OutlinedButton(
                    style: OutlinedButton.styleFrom(
                      foregroundColor: const Color(0xFF00D2FF),
                      side: const BorderSide(color: Color(0xFF2E3048)),
                      padding: const EdgeInsets.symmetric(horizontal: 14, vertical: 8),
                    ),
                    onPressed: () {
                      final current = double.tryParse(qtyController.text.trim()) ?? 0.0;
                      qtyController.text = (current + step).toStringAsFixed(0);
                    },
                    child: Text('+$step', style: const TextStyle(fontWeight: FontWeight.bold)),
                  );
                }).toList(),
              ),
              const SizedBox(height: 18),

              ElevatedButton(
                style: ElevatedButton.styleFrom(
                  backgroundColor: const Color(0xFF00D2FF),
                  foregroundColor: Colors.black,
                  padding: const EdgeInsets.symmetric(vertical: 14),
                ),
                onPressed: () {
                  final numVal = double.tryParse(qtyController.text.trim()) ?? 1.0;
                  if (numVal > 0) {
                    Navigator.pop(ctx);
                    _registerCount(product: product, barcode: barcode, quantity: numVal);
                  }
                },
                child: const Text('Confirmar Conteo', style: TextStyle(fontWeight: FontWeight.bold, fontSize: 15)),
              ),
            ],
          ),
        );
      },
    ).then((_) {
      if (mounted) {
        WidgetsBinding.instance.addPostFrameCallback((_) {
          _barcodeFocusNode.requestFocus();
          SystemChannels.textInput.invokeMethod('TextInput.hide');
        });
      }
    });
  }

  void _showManualInputDialog() {
    _manualCodeController.clear();
    showDialog(
      context: context,
      builder: (ctx) => AlertDialog(
        backgroundColor: const Color(0xFF1E1F2E),
        title: const Text('Digitar Código / SKU', style: TextStyle(color: Colors.white, fontSize: 16)),
        content: TextField(
          controller: _manualCodeController,
          autofocus: true,
          keyboardType: TextInputType.text,
          style: const TextStyle(color: Colors.white),
          decoration: const InputDecoration(
            hintText: 'Ej. 759000123 o SKU',
            hintStyle: TextStyle(color: Colors.white38),
            border: OutlineInputBorder(),
          ),
          onSubmitted: (val) {
            Navigator.pop(ctx);
            _handleCountScan(val);
          },
        ),
        actions: [
          TextButton(
            onPressed: () => Navigator.pop(ctx),
            child: const Text('Cancelar', style: TextStyle(color: Colors.white60)),
          ),
          ElevatedButton(
            style: ElevatedButton.styleFrom(backgroundColor: const Color(0xFF00D2FF), foregroundColor: Colors.black),
            onPressed: () {
              Navigator.pop(ctx);
              _handleCountScan(_manualCodeController.text);
            },
            child: const Text('Buscar', style: TextStyle(fontWeight: FontWeight.bold)),
          ),
        ],
      ),
    ).then((_) {
      if (mounted) {
        WidgetsBinding.instance.addPostFrameCallback((_) {
          _barcodeFocusNode.requestFocus();
          SystemChannels.textInput.invokeMethod('TextInput.hide');
        });
      }
    });
  }

  @override
  void dispose() {
    _inputDebounceTimer?.cancel();
    _manualCodeController.dispose();
    _barcodeInputController.dispose();
    _barcodeFocusNode.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    final config = context.watch<PdaConfigService>();
    final sync = context.watch<PdaSyncService>();

    final totalItems = _countedItems.length;
    final totalUnits = _countedItems.fold<double>(
      0.0,
      (sum, item) => sum + (item['counted_qty'] as num).toDouble(),
    );

    return BarcodeScannerListener(
      onBarcodeScanned: _handleCountScan,
      child: Scaffold(
        backgroundColor: const Color(0xFF0F101A),
        appBar: AppBar(
          backgroundColor: const Color(0xFF181926),
          elevation: 2,
          leading: IconButton(
            icon: const Icon(Icons.arrow_back, color: Colors.white),
            onPressed: () => Navigator.pop(context),
          ),
          title: Column(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              const Text(
                'TOMA DE INVENTARIO',
                style: TextStyle(color: Colors.white, fontSize: 15, fontWeight: FontWeight.bold, letterSpacing: 0.8),
              ),
              Text(
                '${config.facilityName} • ${config.warehouseName}',
                style: const TextStyle(color: Colors.white60, fontSize: 11),
              ),
            ],
          ),
          actions: [
            IconButton(
              icon: const Icon(Icons.keyboard, color: Color(0xFF00D2FF)),
              tooltip: 'Ingresar código manual',
              onPressed: _showManualInputDialog,
            ),
          ],
        ),
        body: SafeArea(
          child: Column(
            children: [
              // Barra de selección de Sesión de Inventario
              Container(
                padding: const EdgeInsets.symmetric(horizontal: 14, vertical: 8),
                color: const Color(0xFF161826),
                child: Row(
                  children: [
                    const Icon(Icons.assignment_outlined, color: Color(0xFF00D2FF), size: 18),
                    const SizedBox(width: 8),
                    Expanded(
                      child: DropdownButtonHideUnderline(
                        child: DropdownButton<int?>(
                          dropdownColor: const Color(0xFF1E2032),
                          value: _selectedSessionId,
                          hint: Text(
                            _availableSessions.isEmpty
                                ? 'No hay tomas abiertas'
                                : 'Seleccione toma planificada',
                            style: const TextStyle(color: Colors.white70, fontSize: 13),
                          ),
                          items: _availableSessions.map((s) => DropdownMenuItem<int?>(
                                value: s['id'] as int,
                                child: Text(
                                  '#${s['id']} - ${s['name']}',
                                  style: const TextStyle(color: Colors.white, fontSize: 13),
                                  overflow: TextOverflow.ellipsis,
                                ),
                              )).toList(),
                          onChanged: (val) {
                            if (val == null) return;
                            setState(() {
                              _selectedSessionId = val;
                              _selectedSessionName = _availableSessions.firstWhere((s) => s['id'] == val)['name'];
                            });
                            _reloadLocalCounts();
                          },
                        ),
                      ),
                    ),
                    // Switch de modo rápido
                    Row(
                      children: [
                        Text(
                          _isContinuousMode ? '+1 Rápido' : 'Detallado',
                          style: TextStyle(
                            color: _isContinuousMode ? const Color(0xFF00D2FF) : Colors.white60,
                            fontSize: 11,
                            fontWeight: FontWeight.bold,
                          ),
                        ),
                        Switch(
                          value: _isContinuousMode,
                          activeColor: const Color(0xFF00D2FF),
                          onChanged: (val) {
                            setState(() => _isContinuousMode = val);
                            config.setContinuousScanMode(val);
                          },
                        ),
                      ],
                    ),
                  ],
                ),
              ),

              // Advertencia si no hay tomas abiertas
              if (_availableSessions.isEmpty)
                Container(
                  width: double.infinity,
                  padding: const EdgeInsets.symmetric(horizontal: 14, vertical: 8),
                  color: Colors.amber.shade900.withOpacity(0.3),
                  child: const Row(
                    children: [
                      Icon(Icons.warning_amber_rounded, color: Colors.amberAccent, size: 18),
                      SizedBox(width: 8),
                      Expanded(
                        child: Text(
                          'No hay tomas físicas abiertas en esta sucursal. Debe planificar una en Neo.',
                          style: TextStyle(color: Colors.amberAccent, fontSize: 12),
                        ),
                      ),
                    ],
                  ),
                ),

              // Barra activa de escaneo con láser e ingreso directo
              Container(
                padding: const EdgeInsets.symmetric(horizontal: 14, vertical: 6),
                color: const Color(0xFF141523),
                child: Row(
                  children: [
                    Expanded(
                      child: TextField(
                        controller: _barcodeInputController,
                        focusNode: _barcodeFocusNode,
                        autofocus: true,
                        keyboardType: TextInputType.none, // BLOQUEA el teclado virtual de Android
                        showCursor: false,
                        enableInteractiveSelection: false,
                        textInputAction: TextInputAction.none,
                        style: const TextStyle(color: Colors.white, fontSize: 14),
                        decoration: InputDecoration(
                          filled: true,
                          fillColor: const Color(0xFF1E2032),
                          hintText: 'Láser activo... o toca para escribir',
                          hintStyle: const TextStyle(color: Colors.white38, fontSize: 12),
                          prefixIcon: const Icon(Icons.qr_code_scanner, color: Color(0xFF00D2FF), size: 18),
                          suffixIcon: IconButton(
                            icon: const Icon(Icons.keyboard, color: Color(0xFF00D2FF), size: 18),
                            tooltip: 'Digitar manualmente',
                            onPressed: _showManualInputDialog,
                          ),
                          isDense: true,
                          contentPadding: const EdgeInsets.symmetric(horizontal: 10, vertical: 10),
                          border: OutlineInputBorder(
                            borderRadius: BorderRadius.circular(8),
                            borderSide: const BorderSide(color: Color(0xFF2E3048)),
                          ),
                          enabledBorder: OutlineInputBorder(
                            borderRadius: BorderRadius.circular(8),
                            borderSide: const BorderSide(color: Color(0xFF2E3048)),
                          ),
                          focusedBorder: OutlineInputBorder(
                            borderRadius: BorderRadius.circular(8),
                            borderSide: const BorderSide(color: Color(0xFF00D2FF), width: 1.5),
                          ),
                        ),
                        onTap: () {
                          // Si el usuario toca con su dedo en la caja, abre el teclado virtual
                          _showManualInputDialog();
                        },
                        onChanged: (val) {
                          _inputDebounceTimer?.cancel();
                          if (val.contains('\n') || val.contains('\r')) {
                            final code = val.replaceAll('\n', '').replaceAll('\r', '').trim();
                            if (code.isNotEmpty) {
                              _barcodeInputController.clear();
                              _handleCountScan(code);
                            }
                          } else if (val.trim().length >= 3) {
                            _inputDebounceTimer = Timer(const Duration(milliseconds: 150), () {
                              final code = _barcodeInputController.text.trim();
                              if (code.isNotEmpty) {
                                _barcodeInputController.clear();
                                _handleCountScan(code);
                              }
                            });
                          }
                        },
                        onSubmitted: (val) {
                          _inputDebounceTimer?.cancel();
                          final code = val.trim();
                          if (code.isNotEmpty) {
                            _barcodeInputController.clear();
                            _handleCountScan(code);
                          }
                        },
                      ),
                    ),
                    const SizedBox(width: 8),
                    IconButton.filled(
                      style: IconButton.styleFrom(
                        backgroundColor: const Color(0xFF00D2FF),
                        foregroundColor: Colors.black,
                        shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(8)),
                        padding: const EdgeInsets.all(10),
                      ),
                      icon: const Icon(Icons.keyboard, size: 18),
                      tooltip: 'Escribir código manual',
                      onPressed: _showManualInputDialog,
                    ),
                  ],
                ),
              ),

              // Banner de feedback de escaneo
              if (_bannerMessage != null)
                Container(
                  width: double.infinity,
                  padding: const EdgeInsets.symmetric(horizontal: 16, vertical: 8),
                  color: _bannerColor,
                  child: Text(
                    _bannerMessage!,
                    style: const TextStyle(color: Colors.white, fontSize: 13, fontWeight: FontWeight.bold),
                  ),
                ),

              // Lista de productos contados
              Expanded(
                child: _isLoading
                    ? const Center(child: CircularProgressIndicator(color: Color(0xFF00D2FF)))
                    : _countedItems.isEmpty
                        ? _buildEmptyState()
                        : ListView.separated(
                            padding: const EdgeInsets.symmetric(horizontal: 14, vertical: 10),
                            itemCount: _countedItems.length,
                            separatorBuilder: (_, __) => const SizedBox(height: 8),
                            itemBuilder: (context, index) {
                              final item = _countedItems[index];
                              return _buildCountItemCard(item);
                            },
                          ),
              ),

              // Barra inferior con totales y botón de sincronización
              Container(
                padding: const EdgeInsets.symmetric(horizontal: 16, vertical: 12),
                decoration: const BoxDecoration(
                  color: Color(0xFF141523),
                  border: Border(top: BorderSide(color: Color(0xFF26283C))),
                ),
                child: Row(
                  children: [
                    Column(
                      crossAxisAlignment: CrossAxisAlignment.start,
                      children: [
                        Text(
                          '$totalItems productos',
                          style: const TextStyle(color: Colors.white70, fontSize: 12),
                        ),
                        Text(
                          '${totalUnits.toStringAsFixed(0)} unidades',
                          style: const TextStyle(color: Colors.white, fontSize: 16, fontWeight: FontWeight.bold),
                        ),
                      ],
                    ),
                    const Spacer(),
                    ElevatedButton.icon(
                      style: ElevatedButton.styleFrom(
                        backgroundColor: sync.pendingCount > 0 ? const Color(0xFF00D2FF) : Colors.green.shade700,
                        foregroundColor: sync.pendingCount > 0 ? Colors.black : Colors.white,
                        padding: const EdgeInsets.symmetric(horizontal: 16, vertical: 12),
                      ),
                      icon: sync.isSyncing
                          ? const SizedBox(width: 16, height: 16, child: CircularProgressIndicator(strokeWidth: 2, color: Colors.black))
                          : Icon(sync.pendingCount > 0 ? Icons.cloud_upload : Icons.cloud_done, size: 18),
                      label: Text(
                        sync.isSyncing
                            ? 'Sincronizando...'
                            : sync.pendingCount > 0
                                ? 'Subir (${sync.pendingCount})'
                                : 'Sincronizado',
                        style: const TextStyle(fontWeight: FontWeight.bold, fontSize: 13),
                      ),
                      onPressed: sync.isSyncing
                          ? null
                          : () async {
                              await sync.syncPendingCounts();
                              await _reloadLocalCounts();
                              if (context.mounted) {
                                ScaffoldMessenger.of(context).showSnackBar(
                                  SnackBar(
                                    content: Text(sync.lastError ?? '✓ Conteos sincronizados con Neo ERP exitosamente.'),
                                    backgroundColor: sync.lastError != null ? Colors.red.shade800 : Colors.green.shade800,
                                  ),
                                );
                              }
                            },
                    ),
                  ],
                ),
              ),
            ],
          ),
        ),
      ),
    );
  }

  Widget _buildEmptyState() {
    return Center(
      child: Column(
        mainAxisAlignment: MainAxisAlignment.center,
        children: [
          Icon(Icons.inventory_2_outlined, size: 64, color: Colors.white.withOpacity(0.2)),
          const SizedBox(height: 16),
          const Text(
            'Sin conteos registrados',
            style: TextStyle(color: Colors.white70, fontSize: 17, fontWeight: FontWeight.bold),
          ),
          const SizedBox(height: 6),
          const Text(
            'Dispara el lector láser hacia los productos\npara comenzar a registrar el inventario.',
            textAlign: TextAlign.center,
            style: TextStyle(color: Colors.white38, fontSize: 13),
          ),
        ],
      ),
    );
  }

  Widget _buildCountItemCard(Map<String, dynamic> item) {
    final double qty = (item['counted_qty'] as num).toDouble();
    final String uom = item['uom'] ?? 'UND';
    final bool isSynced = item['sync_status'] == 'SYNCED';

    return Container(
      padding: const EdgeInsets.symmetric(horizontal: 14, vertical: 10),
      decoration: BoxDecoration(
        color: const Color(0xFF191B2A),
        borderRadius: BorderRadius.circular(10),
        border: Border.all(
          color: isSynced ? Colors.green.withOpacity(0.3) : const Color(0xFF282B42),
        ),
      ),
      child: Row(
        children: [
          Expanded(
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Text(
                  item['product_name'] ?? 'Producto',
                  style: const TextStyle(color: Colors.white, fontSize: 14, fontWeight: FontWeight.bold),
                  maxLines: 1,
                  overflow: TextOverflow.ellipsis,
                ),
                const SizedBox(height: 4),
                Row(
                  children: [
                    Text('SKU: ${item['sku']}', style: const TextStyle(color: Color(0xFF00D2FF), fontSize: 11)),
                    const SizedBox(width: 8),
                    Icon(
                      isSynced ? Icons.cloud_done : Icons.cloud_queue,
                      size: 14,
                      color: isSynced ? Colors.greenAccent : Colors.amberAccent,
                    ),
                  ],
                ),
              ],
            ),
          ),

          // Cantidad contada y controles rápidos
          Row(
            children: [
              IconButton(
                icon: const Icon(Icons.remove_circle_outline, color: Colors.white38, size: 20),
                onPressed: () async {
                  if (qty > 1) {
                    await PdaDatabaseHelper.instance.updateLocalCountQuantity(item['client_uuid'], qty - 1);
                    await _reloadLocalCounts();
                  } else {
                    await PdaDatabaseHelper.instance.deleteLocalCount(item['client_uuid']);
                    await _reloadLocalCounts();
                  }
                },
              ),
              Text(
                '${qty.toStringAsFixed(0)} $uom',
                style: const TextStyle(color: Colors.white, fontSize: 15, fontWeight: FontWeight.bold),
              ),
              IconButton(
                icon: const Icon(Icons.add_circle_outline, color: Color(0xFF00D2FF), size: 20),
                onPressed: () async {
                  await PdaDatabaseHelper.instance.updateLocalCountQuantity(item['client_uuid'], qty + 1);
                  await _reloadLocalCounts();
                },
              ),
            ],
          ),
        ],
      ),
    );
  }
}
