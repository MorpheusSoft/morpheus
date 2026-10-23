import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:provider/provider.dart';
import '../../../core/services/barcode_scanner_listener.dart';
import '../../../core/services/pda_config_service.dart';
import '../../../core/services/pda_sync_service.dart';

class PriceCheckerView extends StatefulWidget {
  const PriceCheckerView({super.key});

  @override
  State<PriceCheckerView> createState() => _PriceCheckerViewState();
}

class _PriceCheckerViewState extends State<PriceCheckerView> {
  Map<String, dynamic>? _scannedProduct;
  bool _isLoading = false;
  String? _errorMessage;
  bool _isSuccessFlash = false;
  final TextEditingController _manualInputController = TextEditingController();
  final TextEditingController _barcodeInputController = TextEditingController();
  final FocusNode _barcodeFocusNode = FocusNode();

  @override
  void initState() {
    super.initState();
    WidgetsBinding.instance.addPostFrameCallback((_) {
      if (mounted) {
        _barcodeFocusNode.requestFocus();
        SystemChannels.textInput.invokeMethod('TextInput.hide');
      }
    });
  }

  Future<void> _handleScan(String code) async {
    final clean = code.trim();
    if (clean.isEmpty || _isLoading) return;

    setState(() {
      _isLoading = true;
      _errorMessage = null;
      _scannedProduct = null;
    });

    try {
      final config = PdaConfigService.instance;
      final sync = PdaSyncService.instance;

      final product = await sync.lookupProduct(clean, facilityId: config.facilityId);

      if (product != null) {
        SystemSound.play(SystemSoundType.click);
        HapticFeedback.heavyImpact();
        setState(() {
          _scannedProduct = product;
          _isLoading = false;
          _isSuccessFlash = true;
        });

        Future.delayed(const Duration(milliseconds: 600), () {
          if (mounted) setState(() => _isSuccessFlash = false);
        });
      } else {
        HapticFeedback.vibrate();
        setState(() {
          _isLoading = false;
          _errorMessage = 'Producto no encontrado con el código:\n"$clean"';
        });
      }
    } catch (e) {
      setState(() {
        _isLoading = false;
        _errorMessage = 'Error al consultar producto: $e';
      });
    } finally {
      WidgetsBinding.instance.addPostFrameCallback((_) {
        if (mounted) {
          _barcodeFocusNode.requestFocus();
          SystemChannels.textInput.invokeMethod('TextInput.hide');
        }
      });
    }
  }

  void _showManualInputDialog() {
    _manualInputController.clear();
    showDialog(
      context: context,
      builder: (ctx) => AlertDialog(
        backgroundColor: const Color(0xFF1E1F2E),
        title: const Text('Ingreso Manual de Código', style: TextStyle(color: Colors.white, fontSize: 16)),
        content: TextField(
          controller: _manualInputController,
          autofocus: true,
          style: const TextStyle(color: Colors.white, fontSize: 16),
          decoration: const InputDecoration(
            hintText: 'Ej. 759123456789 o SKU',
            hintStyle: TextStyle(color: Colors.white38),
            border: OutlineInputBorder(),
          ),
          onSubmitted: (val) {
            Navigator.pop(ctx);
            _handleScan(val);
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
              _handleScan(_manualInputController.text);
            },
            child: const Text('Buscar', style: TextStyle(fontWeight: FontWeight.bold)),
          ),
        ],
      ),
    );
  }

  @override
  void dispose() {
    _manualInputController.dispose();
    _barcodeInputController.dispose();
    _barcodeFocusNode.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    final config = context.watch<PdaConfigService>();
    final sync = context.watch<PdaSyncService>();

    return BarcodeScannerListener(
      onBarcodeScanned: _handleScan,
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
                'VERIFICADOR DE PRECIOS',
                style: TextStyle(color: Colors.white, fontSize: 15, fontWeight: FontWeight.bold, letterSpacing: 0.8),
              ),
              Text(
                '${config.facilityName} • ${sync.isOnline ? "En Línea" : "Modo Offline"}',
                style: TextStyle(
                  color: sync.isOnline ? Colors.greenAccent : Colors.amberAccent,
                  fontSize: 11,
                ),
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
              // Barra indicadora de flash de escaneo
              AnimatedContainer(
                duration: const Duration(milliseconds: 300),
                height: 4,
                color: _isSuccessFlash ? const Color(0xFF00D2FF) : Colors.transparent,
              ),

              Expanded(
                child: Padding(
                  padding: const EdgeInsets.all(16.0),
                  child: _isLoading
                      ? const Center(
                          child: Column(
                            mainAxisAlignment: MainAxisAlignment.center,
                            children: [
                              CircularProgressIndicator(color: Color(0xFF00D2FF)),
                              SizedBox(height: 16),
                              Text('Consultando producto...', style: TextStyle(color: Colors.white70)),
                            ],
                          ),
                        )
                      : _errorMessage != null
                          ? _buildErrorView()
                          : _scannedProduct != null
                              ? _buildProductView(_scannedProduct!)
                              : _buildIdleWaitingView(),
                ),
              ),

              // Barra activa de escaneo con láser e ingreso manual directo
              Container(
                padding: const EdgeInsets.symmetric(horizontal: 14, vertical: 8),
                decoration: const BoxDecoration(
                  color: Color(0xFF151624),
                  border: Border(top: BorderSide(color: Color(0xFF26283C), width: 1)),
                ),
                child: Row(
                  children: [
                    Expanded(
                      child: TextField(
                        controller: _barcodeInputController,
                        focusNode: _barcodeFocusNode,
                        autofocus: true,
                        style: const TextStyle(color: Colors.white, fontSize: 15),
                        textInputAction: TextInputAction.search,
                        decoration: InputDecoration(
                          filled: true,
                          fillColor: const Color(0xFF1E2032),
                          hintText: 'Apunta el láser o digita código...',
                          hintStyle: const TextStyle(color: Colors.white38, fontSize: 13),
                          prefixIcon: const Icon(Icons.qr_code_scanner, color: Color(0xFF00D2FF), size: 20),
                          suffixIcon: _barcodeInputController.text.isNotEmpty
                              ? IconButton(
                                  icon: const Icon(Icons.clear, color: Colors.white38, size: 18),
                                  onPressed: () {
                                    _barcodeInputController.clear();
                                    setState(() {});
                                  },
                                )
                              : null,
                          contentPadding: const EdgeInsets.symmetric(horizontal: 14, vertical: 10),
                          border: OutlineInputBorder(
                            borderRadius: BorderRadius.circular(10),
                            borderSide: const BorderSide(color: Color(0xFF2E3048)),
                          ),
                          enabledBorder: OutlineInputBorder(
                            borderRadius: BorderRadius.circular(10),
                            borderSide: const BorderSide(color: Color(0xFF2E3048)),
                          ),
                          focusedBorder: OutlineInputBorder(
                            borderRadius: BorderRadius.circular(10),
                            borderSide: const BorderSide(color: Color(0xFF00D2FF), width: 1.5),
                          ),
                        ),
                        onChanged: (val) {
                          if (val.contains('\n') || val.contains('\r')) {
                            final code = val.replaceAll('\n', '').replaceAll('\r', '').trim();
                            if (code.isNotEmpty) {
                              _barcodeInputController.clear();
                              _handleScan(code);
                            }
                          }
                        },
                        onSubmitted: (val) {
                          final code = val.trim();
                          if (code.isNotEmpty) {
                            _barcodeInputController.clear();
                            _handleScan(code);
                          }
                        },
                      ),
                    ),
                    const SizedBox(width: 8),
                    IconButton.filled(
                      style: IconButton.styleFrom(
                        backgroundColor: const Color(0xFF00D2FF),
                        foregroundColor: Colors.black,
                        shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(10)),
                        padding: const EdgeInsets.all(12),
                      ),
                      icon: const Icon(Icons.search, size: 20),
                      tooltip: 'Buscar código',
                      onPressed: () {
                        final code = _barcodeInputController.text.trim();
                        if (code.isNotEmpty) {
                          _barcodeInputController.clear();
                          _handleScan(code);
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

  // Vista en reposo: Esperando disparo del láser
  Widget _buildIdleWaitingView() {
    return Center(
      child: Column(
        mainAxisAlignment: MainAxisAlignment.center,
        children: [
          Container(
            padding: const EdgeInsets.all(28),
            decoration: BoxDecoration(
              color: const Color(0xFF181A2A),
              shape: BoxShape.circle,
              border: Border.all(color: const Color(0xFF00D2FF).withOpacity(0.3), width: 2),
            ),
            child: const Icon(
              Icons.qr_code_scanner,
              size: 72,
              color: Color(0xFF00D2FF),
            ),
          ),
          const SizedBox(height: 24),
          const Text(
            'Listo para Escanear',
            style: TextStyle(color: Colors.white, fontSize: 20, fontWeight: FontWeight.bold),
          ),
          const SizedBox(height: 8),
          const Text(
            'Apunta el láser de la PDA hacia el código de barras y presiona el gatillo físico.',
            textAlign: TextAlign.center,
            style: TextStyle(color: Colors.white60, fontSize: 13),
          ),
        ],
      ),
    );
  }

  // Vista de error: Producto no encontrado
  Widget _buildErrorView() {
    return Center(
      child: Container(
        padding: const EdgeInsets.all(24),
        decoration: BoxDecoration(
          color: const Color(0xFF24151B),
          borderRadius: BorderRadius.circular(16),
          border: Border.all(color: Colors.redAccent.withOpacity(0.5)),
        ),
        child: Column(
          mainAxisSize: MainAxisSize.min,
          children: [
            const Icon(Icons.error_outline, color: Colors.redAccent, size: 56),
            const SizedBox(height: 16),
            const Text(
              'No Encontrado',
              style: TextStyle(color: Colors.white, fontSize: 18, fontWeight: FontWeight.bold),
            ),
            const SizedBox(height: 10),
            Text(
              _errorMessage ?? '',
              textAlign: TextAlign.center,
              style: const TextStyle(color: Colors.white70, fontSize: 13),
            ),
            const SizedBox(height: 20),
            ElevatedButton.icon(
              style: ElevatedButton.styleFrom(backgroundColor: const Color(0xFF2E3048)),
              icon: const Icon(Icons.refresh, size: 16, color: Colors.white),
              label: const Text('Limpiar', style: TextStyle(color: Colors.white)),
              onPressed: () => setState(() => _errorMessage = null),
            ),
          ],
        ),
      ),
    );
  }

  // Vista de Producto Encontrado: Detalle de Precio y Existencias
  Widget _buildProductView(Map<String, dynamic> prod) {
    final double salesPrice = (prod['sales_price'] ?? 0.0).toDouble();
    final String uom = prod['uom_base'] ?? 'UND';
    final List packagings = prod['packagings'] as List? ?? [];
    final double? stockFacility = prod['stock_facility'] != null ? (prod['stock_facility'] as num).toDouble() : null;
    final bool isOnlineData = prod['is_online_data'] == true;

    return SingleChildScrollView(
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.stretch,
        children: [
          // Tarjeta Principal de Información
          Container(
            padding: const EdgeInsets.all(16),
            decoration: BoxDecoration(
              color: const Color(0xFF161827),
              borderRadius: BorderRadius.circular(16),
              border: Border.all(color: const Color(0xFF27293D)),
            ),
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                // SKU y badge de estado
                Row(
                  children: [
                    Container(
                      padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 4),
                      decoration: BoxDecoration(
                        color: const Color(0xFF24273E),
                        borderRadius: BorderRadius.circular(6),
                      ),
                      child: Text(
                        'SKU: ${prod['sku'] ?? 'N/A'}',
                        style: const TextStyle(color: Color(0xFF00D2FF), fontSize: 12, fontWeight: FontWeight.bold),
                      ),
                    ),
                    const Spacer(),
                    Container(
                      padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 4),
                      decoration: BoxDecoration(
                        color: isOnlineData ? Colors.green.withOpacity(0.2) : Colors.amber.withOpacity(0.2),
                        borderRadius: BorderRadius.circular(6),
                        border: Border.all(
                          color: isOnlineData ? Colors.greenAccent.withOpacity(0.4) : Colors.amberAccent.withOpacity(0.4),
                        ),
                      ),
                      child: Text(
                        isOnlineData ? 'EN VIVO' : 'LOCAL',
                        style: TextStyle(
                          color: isOnlineData ? Colors.greenAccent : Colors.amberAccent,
                          fontSize: 10,
                          fontWeight: FontWeight.bold,
                        ),
                      ),
                    ),
                  ],
                ),
                const SizedBox(height: 12),

                // Nombre del producto
                Text(
                  prod['name'] ?? 'Producto sin nombre',
                  style: const TextStyle(
                    color: Colors.white,
                    fontSize: 18,
                    fontWeight: FontWeight.bold,
                    height: 1.25,
                  ),
                ),
              ],
            ),
          ),
          const SizedBox(height: 14),

          // TARJETA GIGANTE DE PRECIO
          Container(
            padding: const EdgeInsets.symmetric(vertical: 20, horizontal: 16),
            decoration: BoxDecoration(
              gradient: const LinearGradient(
                colors: [Color(0xFF112233), Color(0xFF0C2738)],
                begin: Alignment.topLeft,
                end: Alignment.bottomRight,
              ),
              borderRadius: BorderRadius.circular(16),
              border: Border.all(color: const Color(0xFF00D2FF), width: 1.5),
            ),
            child: Column(
              children: [
                const Text(
                  'PRECIO DE VENTA',
                  style: TextStyle(color: Color(0xFF00D2FF), fontSize: 12, fontWeight: FontWeight.w900, letterSpacing: 1.2),
                ),
                const SizedBox(height: 8),
                Text(
                  '\$ ${salesPrice.toStringAsFixed(2)}',
                  style: const TextStyle(
                    color: Colors.white,
                    fontSize: 40,
                    fontWeight: FontWeight.w900,
                    letterSpacing: -0.5,
                  ),
                ),
                Text(
                  'por $uom',
                  style: const TextStyle(color: Colors.white60, fontSize: 13),
                ),
              ],
            ),
          ),
          const SizedBox(height: 14),

          // SECCIÓN DE EMPAQUES / PRECIO POR CAJA O BULTO
          if (packagings.isNotEmpty) ...[
            const Text(
              'PRESENTACIONES Y EMPAQUES',
              style: TextStyle(color: Colors.white70, fontSize: 11, fontWeight: FontWeight.bold),
            ),
            const SizedBox(height: 8),
            ...packagings.map((pkg) {
              final double factor = (pkg['qty_per_unit'] ?? 1.0).toDouble();
              final double pkgPrice = (pkg['calculated_price'] != null)
                  ? (pkg['calculated_price'] as num).toDouble()
                  : salesPrice * factor;
              return Container(
                margin: const EdgeInsets.only(bottom: 8),
                padding: const EdgeInsets.symmetric(horizontal: 14, vertical: 10),
                decoration: BoxDecoration(
                  color: const Color(0xFF17192A),
                  borderRadius: BorderRadius.circular(10),
                  border: Border.all(color: const Color(0xFF27293D)),
                ),
                child: Row(
                  children: [
                    const Icon(Icons.inventory_2_outlined, color: Color(0xFF00D2FF), size: 18),
                    const SizedBox(width: 10),
                    Expanded(
                      child: Text(
                        '${pkg['name']} (x${factor.toStringAsFixed(0)} $uom)',
                        style: const TextStyle(color: Colors.white, fontSize: 13, fontWeight: FontWeight.w500),
                      ),
                    ),
                    Text(
                      '\$ ${pkgPrice.toStringAsFixed(2)}',
                      style: const TextStyle(color: Colors.greenAccent, fontSize: 14, fontWeight: FontWeight.bold),
                    ),
                  ],
                ),
              );
            }),
            const SizedBox(height: 10),
          ],

          // SECCIÓN DE EXISTENCIAS / STOCK EN SUCURSAL
          const Text(
            'EXISTENCIAS EN SUCURSAL',
            style: TextStyle(color: Colors.white70, fontSize: 11, fontWeight: FontWeight.bold),
          ),
          const SizedBox(height: 8),
          Container(
            padding: const EdgeInsets.all(14),
            decoration: BoxDecoration(
              color: const Color(0xFF17192A),
              borderRadius: BorderRadius.circular(12),
              border: Border.all(color: const Color(0xFF27293D)),
            ),
            child: Row(
              children: [
                const Icon(Icons.warehouse_outlined, color: Colors.cyanAccent, size: 24),
                const SizedBox(width: 12),
                Expanded(
                  child: Column(
                    crossAxisAlignment: CrossAxisAlignment.start,
                    children: [
                      const Text(
                        'Stock Total Sucursal',
                        style: TextStyle(color: Colors.white60, fontSize: 12),
                      ),
                      Text(
                        stockFacility != null ? '${stockFacility.toStringAsFixed(0)} $uom' : 'Consultar en línea',
                        style: TextStyle(
                          color: (stockFacility ?? 0) > 0 ? Colors.greenAccent : Colors.amberAccent,
                          fontSize: 16,
                          fontWeight: FontWeight.bold,
                        ),
                      ),
                    ],
                  ),
                ),
              ],
            ),
          ),
        ],
      ),
    );
  }
}
