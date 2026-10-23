import 'dart:async';
import 'package:flutter/material.dart';
import 'package:flutter/services.dart';

/// Listener global y ultra-robusto para lectores de códigos de barra en PDAs Android
/// (Zebra, Honeywell, Chainway, Urovo, Sunmi, Newland, etc.).
///
/// Características clave:
/// 1. Escucha a nivel global con [HardwareKeyboard.instance.addHandler] sin perder
///    el foco aunque el usuario toque la pantalla.
/// 2. Extracción de caracteres compatible con controladores OEM de PDA donde
///    [event.character] puede ser null (mapea LogicalKeyboardKey directamente).
/// 3. Soporte para sufijos ENTER y TAB.
/// 4. Detección automática por ráfaga (Burst Debounce de 150ms): Si el lector físico
///    NO tiene configurado el envío de tecla Enter, procesa automáticamente al terminar
///    la ráfaga de caracteres.
class BarcodeScannerListener extends StatefulWidget {
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
  static const MethodChannel _nativeChannel = MethodChannel('com.neo.wms.pda/barcode');
  final StringBuffer _buffer = StringBuffer();
  DateTime _lastCharTime = DateTime.now();
  Timer? _debounceTimer;

  @override
  void initState() {
    super.initState();
    _nativeChannel.setMethodCallHandler(_handleNativeMethodCall);
    HardwareKeyboard.instance.addHandler(_handleGlobalKeyEvent);
  }

  @override
  void dispose() {
    _debounceTimer?.cancel();
    _nativeChannel.setMethodCallHandler(null);
    HardwareKeyboard.instance.removeHandler(_handleGlobalKeyEvent);
    super.dispose();
  }

  Future<void> _handleNativeMethodCall(MethodCall call) async {
    if (!mounted || !widget.enabled) return;
    final route = ModalRoute.of(context);
    if (route != null && !route.isCurrent) return;

    if (call.method == 'onBarcodeScanned') {
      final code = call.arguments?.toString().trim();
      if (code != null && code.length >= 3) {
        widget.onBarcodeScanned(code);
      }
    }
  }

  bool _handleGlobalKeyEvent(KeyEvent event) {
    if (!mounted || !widget.enabled) return false;

    // Si hay un modal o diálogo encima de esta pantalla (ej. diálogo de ingreso manual),
    // no interceptamos para permitir escribir normalmente en el TextField.
    final route = ModalRoute.of(context);
    if (route != null && !route.isCurrent) {
      return false;
    }

    if (event is! KeyDownEvent) {
      return false;
    }

    final key = event.logicalKey;
    final now = DateTime.now();

    // Si pasaron más de 1200ms desde el último caracter, descartar búfer anterior
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
      return true; // Consumido
    }

    // 2. Extracción de carácter
    final char = _extractChar(event);
    if (char != null && char.isNotEmpty) {
      _buffer.write(char);

      // Reiniciar temporizador de ráfaga (Burst Fallback):
      // Si la PDA no envía tecla Enter, al pasar 150ms sin nuevas teclas
      // se auto-dispara el escaneo si el búfer tiene al menos 3 caracteres.
      _debounceTimer?.cancel();
      _debounceTimer = Timer(const Duration(milliseconds: 150), () {
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

    if (rawCode.length >= 3) {
      widget.onBarcodeScanned(rawCode);
    }
  }

  /// Extrae el caracter ya sea desde event.character o directamente
  /// desde LogicalKeyboardKey para máxima compatibilidad con Android OEM drivers.
  String? _extractChar(KeyEvent event) {
    final direct = event.character;
    if (direct != null && direct.isNotEmpty && direct.codeUnitAt(0) >= 32) {
      return direct;
    }

    final key = event.logicalKey;

    // Dígitos estándar (0-9)
    if (key == LogicalKeyboardKey.digit0) return '0';
    if (key == LogicalKeyboardKey.digit1) return '1';
    if (key == LogicalKeyboardKey.digit2) return '2';
    if (key == LogicalKeyboardKey.digit3) return '3';
    if (key == LogicalKeyboardKey.digit4) return '4';
    if (key == LogicalKeyboardKey.digit5) return '5';
    if (key == LogicalKeyboardKey.digit6) return '6';
    if (key == LogicalKeyboardKey.digit7) return '7';
    if (key == LogicalKeyboardKey.digit8) return '8';
    if (key == LogicalKeyboardKey.digit9) return '9';

    // Teclado numérico (Numpad 0-9)
    if (key == LogicalKeyboardKey.numpad0) return '0';
    if (key == LogicalKeyboardKey.numpad1) return '1';
    if (key == LogicalKeyboardKey.numpad2) return '2';
    if (key == LogicalKeyboardKey.numpad3) return '3';
    if (key == LogicalKeyboardKey.numpad4) return '4';
    if (key == LogicalKeyboardKey.numpad5) return '5';
    if (key == LogicalKeyboardKey.numpad6) return '6';
    if (key == LogicalKeyboardKey.numpad7) return '7';
    if (key == LogicalKeyboardKey.numpad8) return '8';
    if (key == LogicalKeyboardKey.numpad9) return '9';

    // Símbolos frecuentes en códigos de barra
    if (key == LogicalKeyboardKey.minus || key == LogicalKeyboardKey.numpadSubtract) return '-';
    if (key == LogicalKeyboardKey.period || key == LogicalKeyboardKey.numpadDecimal) return '.';
    if (key == LogicalKeyboardKey.slash || key == LogicalKeyboardKey.numpadDivide) return '/';
    if (key == LogicalKeyboardKey.space) return ' ';

    // Si keyLabel es un solo carácter imprimible (ej. letras A-Z)
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
