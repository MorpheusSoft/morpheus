import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:provider/provider.dart';
import 'core/services/pda_config_service.dart';
import 'core/services/pda_sync_service.dart';
import 'features/home/presentation/pda_home_view.dart';

void main() async {
  WidgetsFlutterBinding.ensureInitialized();

  // Forzar orientación vertical en la PDA
  await SystemChrome.setPreferredOrientations([
    DeviceOrientation.portraitUp,
    DeviceOrientation.portraitDown,
  ]);

  // Barra de estado translúcida
  SystemChrome.setSystemUIOverlayStyle(
    const SystemUiOverlayStyle(
      statusBarColor: Colors.transparent,
      statusBarIconBrightness: Brightness.light,
    ),
  );

  await PdaConfigService.instance.init();
  await PdaSyncService.instance.init();

  runApp(const NeoPdaApp());
}

class NeoPdaApp extends StatelessWidget {
  const NeoPdaApp({super.key});

  @override
  Widget build(BuildContext context) {
    return MultiProvider(
      providers: [
        ChangeNotifierProvider.value(value: PdaConfigService.instance),
        ChangeNotifierProvider.value(value: PdaSyncService.instance),
      ],
      child: MaterialApp(
        title: 'Neo PDA',
        debugShowCheckedModeBanner: false,
        theme: ThemeData(
          useMaterial3: true,
          brightness: Brightness.dark,
          scaffoldBackgroundColor: const Color(0xFF0F101A),
          colorScheme: const ColorScheme.dark(
            primary: Color(0xFF00D2FF),
            secondary: Colors.greenAccent,
            surface: Color(0xFF161826),
          ),
          inputDecorationTheme: InputDecorationTheme(
            filled: true,
            fillColor: const Color(0xFF1B1D2D),
            border: OutlineInputBorder(
              borderRadius: BorderRadius.circular(10),
              borderSide: const BorderSide(color: Color(0xFF2E3148)),
            ),
            enabledBorder: OutlineInputBorder(
              borderRadius: BorderRadius.circular(10),
              borderSide: const BorderSide(color: Color(0xFF2E3148)),
            ),
            focusedBorder: OutlineInputBorder(
              borderRadius: BorderRadius.circular(10),
              borderSide: const BorderSide(color: Color(0xFF00D2FF), width: 1.5),
            ),
          ),
        ),
        home: const PdaHomeView(),
      ),
    );
  }
}
