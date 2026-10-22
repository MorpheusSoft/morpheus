import 'package:flutter/material.dart';
import 'package:flutter/services.dart';

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
  final FocusNode _focusNode = FocusNode();
  final StringBuffer _buffer = StringBuffer();
  DateTime _lastCharTime = DateTime.now();

  @override
  void initState() {
    super.initState();
    WidgetsBinding.instance.addPostFrameCallback((_) {
      if (mounted) {
        _focusNode.requestFocus();
      }
    });
  }

  @override
  void dispose() {
    _focusNode.dispose();
    super.dispose();
  }

  void _handleKeyEvent(KeyEvent event) {
    if (!widget.enabled) return;

    if (event is KeyDownEvent) {
      final now = DateTime.now();
      // Si pasa más de 1.5 segundos entre teclas, reiniciar búfer (nueva lectura)
      if (now.difference(_lastCharTime).inMilliseconds > 1500) {
        _buffer.clear();
      }
      _lastCharTime = now;

      final key = event.logicalKey;

      if (key == LogicalKeyboardKey.enter || key == LogicalKeyboardKey.numpadEnter) {
        final code = _buffer.toString().trim();
        _buffer.clear();
        if (code.isNotEmpty) {
          widget.onBarcodeScanned(code);
        }
      } else {
        final char = event.character;
        if (char != null && char.isNotEmpty && char.codeUnitAt(0) >= 32) {
          _buffer.write(char);
        }
      }
    }
  }

  @override
  Widget build(BuildContext context) {
    return KeyboardListener(
      focusNode: _focusNode,
      autofocus: true,
      onKeyEvent: _handleKeyEvent,
      child: widget.child,
    );
  }
}
