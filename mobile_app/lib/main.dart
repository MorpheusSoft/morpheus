import 'package:flutter/material.dart';
import 'package:provider/provider.dart';
import 'core/providers/cart_provider.dart';
import 'features/catalog/catalog_view.dart';
import 'features/cart/cart_view.dart';

void main() {
  runApp(
    MultiProvider(
      providers: [
        ChangeNotifierProvider(create: (_) => CartProvider()),
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
      title: 'Morpheus Orders',
      theme: ThemeData(
        useMaterial3: true,
        primarySwatch: Colors.blue,
      ),
      initialRoute: '/',
      routes: {
        '/': (context) => const AppNavigation(),
        '/cart': (context) => const CartView(),
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
    const CatalogView(),
    // Replace with customers view later if needed
    const Center(child: Text('Maestro de Clientes')),
  ];

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      body: _pages[_currentIndex],
      floatingActionButton: FloatingActionButton(
        onPressed: () => Navigator.pushNamed(context, '/cart'),
        child: const Icon(Icons.shopping_cart),
      ),
      floatingActionButtonLocation: FloatingActionButtonLocation.centerDocked,
      bottomNavigationBar: BottomNavigationBar(
        currentIndex: _currentIndex,
        onTap: (index) => setState(() => _currentIndex = index),
        items: const [
          BottomNavigationBarItem(icon: Icon(Icons.list), label: 'Catálogo'),
          BottomNavigationBarItem(icon: Icon(Icons.people), label: 'Clientes'),
        ],
      ),
    );
  }
}
