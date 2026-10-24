import 'dart:async';
import 'package:flutter/material.dart';
import 'package:flutter/services.dart';

/// Listener global y ultra-robusto para lectores de códigos de barra en PDAs Android
/// (Zebra, Honeywell, Chainway, Urovo, Sunmi, Newland, etc.).
///
/// Características clave:
/// 1. Mantiene en Android nativo (`MainActivity`) un `EditText` invisible con foco activo
///    y `showSoftInputOnFocus = false`, de modo que el servicio del lector láser SIEMPRE
///    detecta un TextBox activo y lee al primer disparo, pero NUNCA despliega el teclado virtual.
/// 2. Escucha tanto por MethodChannel nativo (`onBarcodeScanned`) como por
///    [HardwareKeyboard.instance.addHandler].
/// 3. Expone [allowManualKeyboard] y [enableScannerFocus] para abrir el teclado virtual
///    únicamente cuando el usuario presiona explícitamente el botón de ingreso manual.
class BarcodeScannerListener extends StatefulWidget {
  static const MethodChannel _nativeChannel = MethodChannel('com.neo.wms.pda/barcode');
  static bool _manualKeyboardActive = false;

  /// Permite temporalmente que aparezca el teclado virtual de Android (ej. en diálogo manual).
  static Future<void> allowManualKeyboard() async {
    _manualKeyboardActive = true;
    try {
      await _nativeChannel.invokeMethod('setScannerMode', false);
    } catch (_) {}
  }

  /// Restaura el modo escáner láser sin teclado virtual (foco en EditText nativo con showSoftInputOnFocus=false).
  static Future<void> enableScannerFocus() async {
    _manualKeyboardActive = false;
    try {
      await _nativeChannel.invokeMethod('setScannerMode', true);
      await SystemChannels.textInput.invokeMethod('TextInput.hide');
    } catch (_) {}
  }

  final Widget child;
  final ValueChanged<String> onBarcodeScanned;
  final bool enabled;

  const BarcodeScannerListener({
    super.key,
    required this.child,
    required this.onBarcodeScanned,
    this.enabled = true,
  });

  @override
  State<BarcodeScannerListener> createState() => _BarcodeScannerListenerState();
}

class _BarcodeScannerListenerState extends State<BarcodeScannerListener> {
  final StringBuffer _buffer = StringBuffer();
  DateTime _lastCharTime = DateTime.now();
  Timer? _debounceTimer;
  String _lastDispatchedCode = '';
  DateTime _lastDispatchedTime = DateTime.fromMillisecondsSinceEpoch(0);

  @override
  void initState() {
    super.initState();
    BarcodeScannerListener._nativeChannel.setMethodCallHandler(_handleNativeMethodCall);
    HardwareKeyboard.instance.addHandler(_handleGlobalKeyEvent);
    WidgetsBinding.instance.addPostFrameCallback((_) {
      if (mounted && widget.enabled) {
        BarcodeScannerListener.enableScannerFocus();
      }
    });
  }

  @override
  void dispose() {
    _debounceTimer?.cancel();
    BarcodeScannerListener._nativeChannel.setMethodCallHandler(null);
    HardwareKeyboard.instance.removeHandler(_handleGlobalKeyEvent);
    super.dispose();
  }

  void _emit(String rawCode) {
    final clean = rawCode.trim();
    if (clean.isEmpty) return;
    final now = DateTime.now();
    if (clean == _lastDispatchedCode &&
        now.difference(_lastDispatchedTime).inMilliseconds < 300) {
      return;
    }
    _lastDispatchedCode = clean;
    _lastDispatchedTime = now;
    widget.onBarcodeScanned(clean);
  }

  Future<void> _handleNativeMethodCall(MethodCall call) async {
    if (!mounted || !widget.enabled || BarcodeScannerListener._manualKeyboardActive) return;

    if (call.method == 'onBarcodeScanned') {
      final code = call.arguments?.toString().trim();
      if (code != null && code.isNotEmpty) {
        _emit(code);
      }
    }
  }

  bool _handleGlobalKeyEvent(KeyEvent event) {
    if (!mounted || !widget.enabled || BarcodeScannerListener._manualKeyboardActive) {
      return false;
    }

    final route = ModalRoute.of(context);
    if (route != null && !route.isCurrent) {
      return false;
    }

    if (event is! KeyDownEvent) {
      return false;
    }

    final key = event.logicalKey;
    final now = DateTime.now();

    if (now.difference(_lastCharTime).inMilliseconds > 1200) {
      _buffer.clear();
    }
    _lastCharTime = now;

    // 1. Detección de sufijos explícitos (ENTER o TAB)
    if (key == LogicalKeyboardKey.enter ||
        key == LogicalKeyboardKey.numpadEnter ||
        key == LogicalKeyboardKey.tab) {
      _debounceTimer?.cancel();
      _dispatchBarcode();
      return true;
    }

    // 2. Extracción de carácter
    final char = _extractChar(event);
    if (char != null && char.isNotEmpty) {
      _buffer.write(char);

      _debounceTimer?.cancel();
      _debounceTimer = Timer(const Duration(milliseconds: 140), () {
        if (mounted) {
          _dispatchBarcode();
        }
      });

      return false;
    }

    return false;
  }

  void _dispatchBarcode() {
    _debounceTimer?.cancel();
    final rawCode = _buffer.toString().trim();
    _buffer.clear();

    if (rawCode.isNotEmpty) {
      _emit(rawCode);
    }
  }

  String? _extractChar(KeyEvent event) {
    final direct = event.character;
    if (direct != null && direct.isNotEmpty && direct.codeUnitAt(0) >= 32) {
      return direct;
    }

    final key = event.logicalKey;

    if (key == LogicalKeyboardKey.digit0 || key == LogicalKeyboardKey.numpad0) return '0';
    if (key == LogicalKeyboardKey.digit1 || key == LogicalKeyboardKey.numpad1) return '1';
    if (key == LogicalKeyboardKey.digit2 || key == LogicalKeyboardKey.numpad2) return '2';
    if (key == LogicalKeyboardKey.digit3 || key == LogicalKeyboardKey.numpad3) return '3';
    if (key == LogicalKeyboardKey.digit4 || key == LogicalKeyboardKey.numpad4) return '4';
    if (key == LogicalKeyboardKey.digit5 || key == LogicalKeyboardKey.numpad5) return '5';
    if (key == LogicalKeyboardKey.digit6 || key == LogicalKeyboardKey.numpad6) return '6';
    if (key == LogicalKeyboardKey.digit7 || key == LogicalKeyboardKey.numpad7) return '7';
    if (key == LogicalKeyboardKey.digit8 || key == LogicalKeyboardKey.numpad8) return '8';
    if (key == LogicalKeyboardKey.digit9 || key == LogicalKeyboardKey.numpad9) return '9';

    if (key == LogicalKeyboardKey.minus || key == LogicalKeyboardKey.numpadSubtract) return '-';
    if (key == LogicalKeyboardKey.period || key == LogicalKeyboardKey.numpadDecimal) return '.';
    if (key == LogicalKeyboardKey.slash || key == LogicalKeyboardKey.numpadDivide) return '/';
    if (key == LogicalKeyboardKey.space) return ' ';

    final label = key.keyLabel;
    if (label.length == 1) {
      final code = label.codeUnitAt(0);
      if (code >= 32 && code <= 126) {
        return label;
      }
    }

    return null;
  }

  @override
  Widget build(BuildContext context) {
    return widget.child;
  }
}
