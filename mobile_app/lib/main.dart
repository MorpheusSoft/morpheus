import 'dart:io';
import 'package:flutter/material.dart';
import 'package:provider/provider.dart';
import 'core/providers/cart_provider.dart';
import 'core/services/kiosk_config_service.dart';
import 'core/services/sync_service.dart';
import 'features/catalog/catalog_view.dart';
import 'features/cart/cart_view.dart';
import 'features/relocation/presentation/kiosk_relocation_view.dart';

class WmsHttpOverrides extends HttpOverrides {
  @override
  HttpClient createHttpClient(SecurityContext? context) {
    return super.createHttpClient(context)
      ..badCertificateCallback = (X509Certificate cert, String host, int port) => true;
  }
}

void main() async {
  WidgetsFlutterBinding.ensureInitialized();

  // Permitir certificados SSL en entornos de Kiosco / Windows sin CA intermedia
  HttpOverrides.global = WmsHttpOverrides();

  // Inicializar servicios Offline y Configuración de Kiosco Neo WMS
  await KioskConfigService.instance.init();
  await SyncService.instance.init();

  runApp(
    MultiProvider(
      providers: [
        ChangeNotifierProvider(create: (_) => CartProvider()),
        ChangeNotifierProvider.value(value: KioskConfigService.instance),
        ChangeNotifierProvider.value(value: SyncService.instance),
      ],
      child: const MyApp(),
    ),
  );
}

class MyApp extends StatelessWidget {
  const MyApp({super.key});

  @override
  Widget build(BuildContext context) {
    return MaterialApp(
      title: 'Neo ERP',
      debugShowCheckedModeBanner: false,
      theme: ThemeData(
        useMaterial3: true,
        brightness: Brightness.dark,
        colorScheme: ColorScheme.dark(
          primary: const Color(0xFF00D2FF),
          secondary: const Color(0xFF00E676),
          surface: const Color(0xFF1E1F2E),
          background: const Color(0xFF13141F),
        ),
      ),
      initialRoute: '/kiosk', // Por defecto inicia en el Kiosco de Reubicación
      routes: {
        '/': (context) => const AppNavigation(),
        '/cart': (context) => const CartView(),
        '/kiosk': (context) => const KioskRelocationView(),
      },
    );
  }
}

class AppNavigation extends StatefulWidget {
  const AppNavigation({super.key});

  @override
  State<AppNavigation> createState() => _AppNavigationState();
}

class _AppNavigationState extends State<AppNavigation> {
  int _currentIndex = 0;
  
  final List<Widget> _pages = [
    const KioskRelocationView(),
    const CatalogView(),
    const Center(child: Text('Maestro de Clientes')),
  ];

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      body: _pages[_currentIndex],
      bottomNavigationBar: BottomNavigationBar(
        currentIndex: _currentIndex,
        onTap: (index) => setState(() => _currentIndex = index),
        items: const [
          BottomNavigationBarItem(icon: Icon(Icons.swap_horiz), label: 'Reubicación WMS'),
          BottomNavigationBarItem(icon: Icon(Icons.list), label: 'Catálogo'),
          BottomNavigationBarItem(icon: Icon(Icons.people), label: 'Clientes'),
        ],
      ),
    );
  }
}
