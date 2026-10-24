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
  bool _isContinuousMode = false; // Modo rápido (+1) o Detallado
  String? _bannerMessage;
  Color _bannerColor = const Color(0xFF1E2030);

  final TextEditingController _manualCodeController = TextEditingController();

  String _lastScannedBarcode = '';
  DateTime _lastScanTimestamp = DateTime.fromMillisecondsSinceEpoch(0);
  bool _isQuantityModalOpen = false;

  @override
  void initState() {
    super.initState();
    BarcodeScannerListener.enableScannerFocus();
    _loadInitialData();
  }

  Future<void> _loadInitialData() async {
    setState(() => _isLoading = true);
    final config = PdaConfigService.instance;
    final sync = PdaSyncService.instance;

    _isContinuousMode = config.continuousScanMode;

    // Si la base de datos local aún no tiene categorías jerárquicas o category_id en productos, sincronizar catálogo automáticamente
    if (await PdaDatabaseHelper.instance.needsCategoryCatalogRefresh()) {
      await sync.syncCatalog(specificFacilityId: config.facilityId);
    }

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
    if (mounted) {
      setState(() => _isLoading = false);
      BarcodeScannerListener.enableScannerFocus();
    }
  }

  Future<Set<int>> _resolveValidCategoryIdsForSession(Map<String, dynamic> session) async {
    final validCatIds = <int>{};
    final rawList = session['valid_category_ids'] as List?;
    if (rawList != null) {
      for (final e in rawList) {
        if (e is num) validCatIds.add(e.toInt());
      }
    }
    final int? sessionCatId = (session['category_id'] as num?)?.toInt() ??
        int.tryParse((session['scope_value'] ?? '').toString().trim());
    if (sessionCatId != null) {
      final hierarchicalIds = await PdaDatabaseHelper.instance.getRelatedCategoryIds(sessionCatId);
      validCatIds.addAll(hierarchicalIds);
    }
    return validCatIds;
  }

  Future<void> _reloadLocalCounts() async {
    if (_selectedSessionId != null) {
      final session = _availableSessions.firstWhere(
        (s) => s['id'] == _selectedSessionId,
        orElse: () => <String, dynamic>{},
      );
      final validCatIds = await _resolveValidCategoryIdsForSession(session);
      if (validCatIds.isNotEmpty) {
        await PdaDatabaseHelper.instance.purgeInvalidOutboxCountsForSession(
          _selectedSessionId!,
          validCatIds,
        );
      }
    }
    final counts = await PdaDatabaseHelper.instance.getLocalCountsForSession(_selectedSessionId);
    if (mounted) {
      setState(() {
        _countedItems = counts;
      });
    }
    await PdaSyncService.instance.refreshPendingCount();
  }

  // ===========================================================================
  // Manejo de Escaneo Físico con la PDA (Sin desplegar teclado virtual)
  // ===========================================================================
  Future<void> _handleCountScan(String barcode) async {
    final clean = barcode.trim();
    if (clean.isEmpty) return;

    final now = DateTime.now();
    if (clean == _lastScannedBarcode && now.difference(_lastScanTimestamp).inMilliseconds < 350) {
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
      BarcodeScannerListener.enableScannerFocus();
      return;
    }

    var product = await PdaDatabaseHelper.instance.findProductByBarcode(clean);
    if (product == null || product['category_id'] == null) {
      final config = PdaConfigService.instance;
      final onlineProd = await PdaSyncService.instance.lookupProduct(clean, facilityId: config.facilityId);
      if (onlineProd != null) {
        product = onlineProd;
      }
    }

    if (product == null) {
      HapticFeedback.vibrate();
      if (mounted) {
        setState(() {
          _bannerMessage = '⚠️ Producto no encontrado con código: "$clean"';
          _bannerColor = Colors.red.shade900;
        });
      }
      BarcodeScannerListener.enableScannerFocus();
      return;
    }

    final prod = product;

    // Validación de Criterios de la Toma de Inventario
    final session = _availableSessions.firstWhere(
      (s) => s['id'] == _selectedSessionId,
      orElse: () => <String, dynamic>{},
    );

    // 1. Criterio Estricto de Categoría Jerárquica (Departamento > Grupo > Subgrupo)
    final scopeType = (session['scope_type'] ?? '').toString().toUpperCase();
    final int? sessionCatId = (session['category_id'] as num?)?.toInt() ??
        int.tryParse((session['scope_value'] ?? '').toString().trim());
    final validCatIds = await _resolveValidCategoryIdsForSession(session);
    final int? prodCatId = (prod['category_id'] as num?)?.toInt();

    final isCategoryScoped =
        scopeType == 'CATEGORY' || scopeType == 'CYCLIC' || sessionCatId != null || validCatIds.isNotEmpty;

    if (isCategoryScoped) {
      if (prodCatId == null || validCatIds.isEmpty || !validCatIds.contains(prodCatId)) {
        if (_isQuantityModalOpen && mounted) {
          Navigator.of(context).pop();
        }
        HapticFeedback.vibrate();
        final catTargetLabel = session['category_full_path'] ?? session['category_name'] ?? session['name'] ?? 'la categoría seleccionada';
        if (mounted) {
          setState(() {
            _bannerMessage =
                '⛔ No permitido: "${prod['name']}" no pertenece al grupo de categoría de esta toma ($catTargetLabel).';
            _bannerColor = Colors.red.shade900;
          });
        }
        BarcodeScannerListener.enableScannerFocus();
        return;
      }
    } else {
      // 2. Criterio de Variantes planificadas específicas (cuando no es por categoría)
      final validVarIds = (session['valid_variant_ids'] as List?)
              ?.map((e) => (e as num).toInt())
              .toList() ??
          [];
      final int? prodVarId = (prod['variant_id'] as num?)?.toInt();

      if (validVarIds.isNotEmpty && (prodVarId == null || !validVarIds.contains(prodVarId))) {
        if (_isQuantityModalOpen && mounted) {
          Navigator.of(context).pop();
        }
        HapticFeedback.vibrate();
        if (mounted) {
          setState(() {
            _bannerMessage = '⛔ No permitido: "${prod['name']}" no está planificado en esta toma física.';
            _bannerColor = Colors.red.shade900;
          });
        }
        BarcodeScannerListener.enableScannerFocus();
        return;
      }
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
      // Si ya había un modal de cantidad abierto y el usuario escaneó otro código, cerrarlo primero
      if (_isQuantityModalOpen && mounted) {
        Navigator.of(context).pop();
      }
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

    if (mounted) {
      setState(() {
        _bannerMessage =
            '✅ +${totalAdd.toStringAsFixed(totalAdd % 1 == 0 ? 0 : 2)} ${product['uom_base'] ?? 'UND'} "${product['name']}" (Total: ${newTotal.toStringAsFixed(newTotal % 1 == 0 ? 0 : 2)} ${product['uom_base'] ?? 'UND'})';
        _bannerColor = Colors.green.shade800;
      });
    }

    BarcodeScannerListener.enableScannerFocus();
    await _reloadLocalCounts();
    PdaSyncService.instance.checkConnectivityAndSync();
  }

  // ===========================================================================
  // Modal de Cantidad con Teclado Numérico Integrado (NUNCA abre el teclado Android)
  // ===========================================================================
  void _showQuantityModal(Map<String, dynamic> product, String barcode) {
    String qtyText = '1';
    bool replaceOnNextDigit = true;
    _isQuantityModalOpen = true;
    BarcodeScannerListener.enableScannerFocus();

    showModalBottomSheet(
      context: context,
      backgroundColor: const Color(0xFF1E2032),
      isScrollControlled: true,
      shape: const RoundedRectangleBorder(
        borderRadius: BorderRadius.vertical(top: Radius.circular(20)),
      ),
      builder: (ctx) {
        return StatefulBuilder(
          builder: (context, setModalState) {
            void appendDigit(String d) {
              HapticFeedback.selectionClick();
              setModalState(() {
                if (replaceOnNextDigit) {
                  qtyText = (d == '.') ? '0.' : d;
                  replaceOnNextDigit = false;
                } else {
                  if (d == '.' && qtyText.contains('.')) return;
                  if (qtyText == '0' && d != '.') {
                    qtyText = d;
                  } else if (qtyText.length < 9) {
                    qtyText += d;
                  }
                }
              });
            }

            void backspace() {
              HapticFeedback.selectionClick();
              setModalState(() {
                replaceOnNextDigit = false;
                if (qtyText.length > 1) {
                  qtyText = qtyText.substring(0, qtyText.length - 1);
                } else {
                  qtyText = '0';
                  replaceOnNextDigit = true;
                }
              });
            }

            void addStep(int step) {
              HapticFeedback.selectionClick();
              setModalState(() {
                final current = replaceOnNextDigit ? 0.0 : (double.tryParse(qtyText) ?? 0.0);
                final next = current + step;
                qtyText = next % 1 == 0 ? next.toInt().toString() : next.toStringAsFixed(2);
                replaceOnNextDigit = false;
              });
            }

            void confirm() {
              final numVal = double.tryParse(qtyText.trim()) ?? 1.0;
              if (numVal > 0) {
                Navigator.pop(ctx);
                _registerCount(product: product, barcode: barcode, quantity: numVal);
              }
            }

            Widget buildNumKey(String label, {VoidCallback? onTap, Color? bgColor, Color? textColor}) {
              return Expanded(
                child: Padding(
                  padding: const EdgeInsets.all(4.0),
                  child: Material(
                    color: bgColor ?? const Color(0xFF282B42),
                    borderRadius: BorderRadius.circular(12),
                    child: InkWell(
                      borderRadius: BorderRadius.circular(12),
                      onTap: onTap ?? () => appendDigit(label),
                      child: Container(
                        height: 48,
                        alignment: Alignment.center,
                        child: Text(
                          label,
                          style: TextStyle(
                            color: textColor ?? Colors.white,
                            fontSize: 20,
                            fontWeight: FontWeight.bold,
                          ),
                        ),
                      ),
                    ),
                  ),
                ),
              );
            }

            return Padding(
              padding: const EdgeInsets.fromLTRB(16, 16, 16, 16),
              child: Column(
                mainAxisSize: MainAxisSize.min,
                crossAxisAlignment: CrossAxisAlignment.stretch,
                children: [
                  Row(
                    children: [
                      Expanded(
                        child: Column(
                          crossAxisAlignment: CrossAxisAlignment.start,
                          children: [
                            Text(
                              product['name'] ?? '',
                              style: const TextStyle(
                                color: Colors.white,
                                fontSize: 15,
                                fontWeight: FontWeight.bold,
                              ),
                              maxLines: 2,
                              overflow: TextOverflow.ellipsis,
                            ),
                            const SizedBox(height: 2),
                            Text(
                              'SKU: ${product['sku']} • Cód: $barcode',
                              style: const TextStyle(color: Color(0xFF00D2FF), fontSize: 11),
                            ),
                          ],
                        ),
                      ),
                      IconButton(
                        icon: const Icon(Icons.close, color: Colors.white54),
                        onPressed: () => Navigator.pop(ctx),
                      ),
                    ],
                  ),
                  const SizedBox(height: 10),

                  // Visor digital de cantidad (sin TextField de Android para no abrir teclado)
                  Container(
                    padding: const EdgeInsets.symmetric(horizontal: 16, vertical: 10),
                    decoration: BoxDecoration(
                      color: const Color(0xFF141523),
                      borderRadius: BorderRadius.circular(12),
                      border: Border.all(color: const Color(0xFF00D2FF), width: 1.8),
                    ),
                    child: Row(
                      mainAxisAlignment: MainAxisAlignment.spaceBetween,
                      children: [
                        const Text(
                          'CANTIDAD:',
                          style: TextStyle(
                            color: Colors.white60,
                            fontSize: 12,
                            fontWeight: FontWeight.bold,
                          ),
                        ),
                        Row(
                          children: [
                            Text(
                              qtyText,
                              style: const TextStyle(
                                color: Colors.white,
                                fontSize: 30,
                                fontWeight: FontWeight.w900,
                              ),
                            ),
                            const SizedBox(width: 8),
                            Text(
                              product['uom_base'] ?? 'UND',
                              style: const TextStyle(
                                color: Color(0xFF00D2FF),
                                fontSize: 14,
                                fontWeight: FontWeight.bold,
                              ),
                            ),
                          ],
                        ),
                      ],
                    ),
                  ),
                  const SizedBox(height: 8),

                  // Botones de incremento rápido (+1, +5, +10, +25)
                  Row(
                    mainAxisAlignment: MainAxisAlignment.spaceBetween,
                    children: [1, 5, 10, 25].map((step) {
                      return Expanded(
                        child: Padding(
                          padding: const EdgeInsets.symmetric(horizontal: 3),
                          child: OutlinedButton(
                            style: OutlinedButton.styleFrom(
                              foregroundColor: const Color(0xFF00D2FF),
                              side: const BorderSide(color: Color(0xFF2E3048)),
                              padding: const EdgeInsets.symmetric(vertical: 8),
                            ),
                            onPressed: () => addStep(step),
                            child: Text('+$step', style: const TextStyle(fontWeight: FontWeight.bold)),
                          ),
                        ),
                      );
                    }).toList(),
                  ),
                  const SizedBox(height: 6),

                  // Teclado Numérico Integrado
                  Row(
                    children: [
                      buildNumKey('1'),
                      buildNumKey('2'),
                      buildNumKey('3'),
                    ],
                  ),
                  Row(
                    children: [
                      buildNumKey('4'),
                      buildNumKey('5'),
                      buildNumKey('6'),
                    ],
                  ),
                  Row(
                    children: [
                      buildNumKey('7'),
                      buildNumKey('8'),
                      buildNumKey('9'),
                    ],
                  ),
                  Row(
                    children: [
                      buildNumKey(
                        '.',
                        onTap: () => appendDigit('.'),
                        bgColor: const Color(0xFF1F2235),
                      ),
                      buildNumKey('0'),
                      buildNumKey(
                        '⌫',
                        onTap: backspace,
                        bgColor: const Color(0xFF3A202A),
                        textColor: Colors.redAccent,
                      ),
                    ],
                  ),
                  const SizedBox(height: 10),

                  ElevatedButton.icon(
                    style: ElevatedButton.styleFrom(
                      backgroundColor: const Color(0xFF00D2FF),
                      foregroundColor: Colors.black,
                      padding: const EdgeInsets.symmetric(vertical: 14),
                      shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(12)),
                    ),
                    icon: const Icon(Icons.check_circle_outline, size: 20),
                    onPressed: confirm,
                    label: const Text(
                      'Confirmar Conteo',
                      style: TextStyle(fontWeight: FontWeight.w900, fontSize: 16),
                    ),
                  ),
                ],
              ),
            );
          },
        );
      },
    ).whenComplete(() {
      _isQuantityModalOpen = false;
      if (mounted) {
        BarcodeScannerListener.enableScannerFocus();
      }
    });
  }

  // ===========================================================================
  // Diálogo de Ingreso Manual (Único lugar donde se habilita el teclado virtual)
  // ===========================================================================
  Future<void> _showManualInputDialog() async {
    _manualCodeController.clear();
    await BarcodeScannerListener.allowManualKeyboard();
    if (!mounted) return;

    await showDialog(
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
            Navigator.pop(ctx, val);
          },
        ),
        actions: [
          TextButton(
            onPressed: () => Navigator.pop(ctx, null),
            child: const Text('Cancelar', style: TextStyle(color: Colors.white60)),
          ),
          ElevatedButton(
            style: ElevatedButton.styleFrom(
              backgroundColor: const Color(0xFF00D2FF),
              foregroundColor: Colors.black,
            ),
            onPressed: () {
              Navigator.pop(ctx, _manualCodeController.text);
            },
            child: const Text('Buscar', style: TextStyle(fontWeight: FontWeight.bold)),
          ),
        ],
      ),
    ).then((result) async {
      await BarcodeScannerListener.enableScannerFocus();
      if (result != null && result.toString().trim().isNotEmpty) {
        _handleCountScan(result.toString().trim());
      }
    });
  }

  @override
  void dispose() {
    _manualCodeController.dispose();
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
                            BarcodeScannerListener.enableScannerFocus();
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
                            BarcodeScannerListener.enableScannerFocus();
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

              // Barra visual de estado del Escáner Láser (foco en EditText nativo sin teclado virtual)
              Container(
                padding: const EdgeInsets.symmetric(horizontal: 14, vertical: 8),
                color: const Color(0xFF141523),
                child: Row(
                  children: [
                    Expanded(
                      child: InkWell(
                        borderRadius: BorderRadius.circular(8),
                        onTap: () => BarcodeScannerListener.enableScannerFocus(),
                        child: Container(
                          padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 10),
                          decoration: BoxDecoration(
                            color: const Color(0xFF1E2032),
                            borderRadius: BorderRadius.circular(8),
                            border: Border.all(color: const Color(0xFF00D2FF), width: 1.5),
                          ),
                          child: Row(
                            children: [
                              const Icon(Icons.qr_code_scanner, color: Color(0xFF00D2FF), size: 20),
                              const SizedBox(width: 10),
                              Expanded(
                                child: Text(
                                  _lastScannedBarcode.isEmpty
                                      ? 'Láser activo (Sin teclado) — Dispare para escanear'
                                      : 'Láser activo • Último: $_lastScannedBarcode',
                                  style: const TextStyle(
                                    color: Colors.white,
                                    fontSize: 12.5,
                                    fontWeight: FontWeight.w600,
                                  ),
                                  overflow: TextOverflow.ellipsis,
                                ),
                              ),
                              Container(
                                width: 8,
                                height: 8,
                                decoration: const BoxDecoration(
                                  color: Colors.greenAccent,
                                  shape: BoxShape.circle,
                                ),
                              ),
                            ],
                          ),
                        ),
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
                              BarcodeScannerListener.enableScannerFocus();
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
                  BarcodeScannerListener.enableScannerFocus();
                },
              ),
              Text(
                '${qty.toStringAsFixed(qty % 1 == 0 ? 0 : 2)} $uom',
                style: const TextStyle(color: Colors.white, fontSize: 15, fontWeight: FontWeight.bold),
              ),
              IconButton(
                icon: const Icon(Icons.add_circle_outline, color: Color(0xFF00D2FF), size: 20),
                onPressed: () async {
                  await PdaDatabaseHelper.instance.updateLocalCountQuantity(item['client_uuid'], qty + 1);
                  await _reloadLocalCounts();
                  BarcodeScannerListener.enableScannerFocus();
                },
              ),
            ],
          ),
        ],
      ),
    );
  }
}
