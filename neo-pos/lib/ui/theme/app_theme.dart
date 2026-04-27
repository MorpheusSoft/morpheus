import 'package:flutter/material.dart';

class AppTheme {
  static const Color slateGrey = Color(0xFF0F172A);
  static const Color surfaceDark = Color(0xFF1E293B);
  static const Color neonCyan = Color(0xFF06B6D4);
  static const Color glassBorder = Color(0xFF334155);
  static const Color textBody = Color(0xFF94A3B8);

  static ThemeData get darkTheme {
    return ThemeData(
      brightness: Brightness.dark,
      scaffoldBackgroundColor: slateGrey,
      colorScheme: const ColorScheme.dark(
        primary: neonCyan,
        surface: surfaceDark,
      ),
      appBarTheme: const AppBarTheme(
        backgroundColor: slateGrey,
        elevation: 0,
      ),
    );
  }
}
