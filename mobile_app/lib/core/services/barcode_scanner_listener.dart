import 'package:flutter/material.dart';
import 'package:flutter/services.dart';

/// Intercepta a nivel de hardware la ráfaga de teclas enviada por lectores
/// de códigos de barra en modo Keyboard Wedge (emulación de teclado) en Windows/Desktop.
class BarcodeScannerListener extends StatefulWidget {
  final Widget child;
  final ValueChanged<String> onBarcodeScanned;

  const BarcodeScannerListener({
    super.key,
    required this.child,
    required this.onBarcodeScanned,
  });

  @override
  State<BarcodeScannerListener> createState() => _BarcodeScannerListenerState();
}

class _BarcodeScannerListenerState extends State<BarcodeScannerListener> {
  final StringBuffer _buffer = StringBuffer();
  DateTime? _lastKeyTime;

  bool _handleKeyEvent(KeyEvent event) {
    if (event is! KeyDownEvent) return false;

    final now = DateTime.now();
    // Si el tiempo entre teclas supera 150ms, consideramos que es digitación
    // humana lenta o un nuevo escaneo, por lo que limpiamos el buffer.
    if (_lastKeyTime != null && now.difference(_lastKeyTime!).inMilliseconds > 150) {
      _buffer.clear();
    }
    _lastKeyTime = now;

    if (event.logicalKey == LogicalKeyboardKey.enter || 
        event.logicalKey == LogicalKeyboardKey.numpadEnter) {
      final code = _buffer.toString().trim();
      _buffer.clear();
      if (code.isNotEmpty) {
        widget.onBarcodeScanned(code);
        return true; // Consumir evento
      }
    } else if (event.character != null && event.character!.isNotEmpty) {
      // Ignorar teclas de control no imprimibles
      if (event.character!.codeUnitAt(0) >= 32) {
        _buffer.write(event.character);
      }
    }
    return false;
  }

  @override
  void initState() {
    super.initState();
    HardwareKeyboard.instance.addHandler(_handleKeyEvent);
  }

  @override
  void dispose() {
    HardwareKeyboard.instance.removeHandler(_handleKeyEvent);
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    return widget.child;
  }
}
