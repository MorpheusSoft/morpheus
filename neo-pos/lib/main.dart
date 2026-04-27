import 'package:flutter/material.dart';
import 'package:provider/provider.dart';
import 'package:sqflite_common_ffi/sqflite_ffi.dart';
import 'dart:io';
import 'core/database/database_seeder.dart';
import 'core/providers/cart_provider.dart';
import 'ui/theme/app_theme.dart';
import 'ui/screens/supermarket/supermarket_screen.dart';

void main() async {
  WidgetsFlutterBinding.ensureInitialized();

  // Inicializar FFI de SQLite para entornos Desktop (Windows/Linux)
  if (Platform.isWindows || Platform.isLinux) {
    sqfliteFfiInit();
    databaseFactory = databaseFactoryFfi;
  }

  // Ejecutamos el Mock inicial si la BD está vacía
  await DatabaseSeeder.seedInitialData();

  runApp(
    MultiProvider(
      providers: [
        ChangeNotifierProvider(create: (_) => CartProvider()),
      ],
      child: const NeoPosApp(),
    ),
  );
}

class NeoPosApp extends StatelessWidget {
  const NeoPosApp({super.key});

  @override
  Widget build(BuildContext context) {
    return MaterialApp(
      title: 'Morpheus POS',
      theme: AppTheme.darkTheme,
      home: const SupermarketScreen(),
      debugShowCheckedModeBanner: false,
    );
  }
}
