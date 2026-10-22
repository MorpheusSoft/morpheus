import 'package:flutter/material.dart';
import 'package:provider/provider.dart';
import '../../../core/services/pda_config_service.dart';
import '../../../core/services/pda_sync_service.dart';
import '../../price_checker/presentation/price_checker_view.dart';
import '../../inventory_count/presentation/inventory_count_view.dart';
import '../../settings/presentation/pda_settings_view.dart';

class PdaHomeView extends StatelessWidget {
  const PdaHomeView({super.key});

  void _openSettingsWithPin(BuildContext context) {
    final pinController = TextEditingController();
    showDialog(
      context: context,
      builder: (ctx) => AlertDialog(
        backgroundColor: const Color(0xFF1E1F2E),
        title: const Row(
          children: [
            Icon(Icons.lock_outline, color: Color(0xFF00D2FF), size: 20),
            SizedBox(width: 8),
            Text('PIN de Supervisión', style: TextStyle(color: Colors.white, fontSize: 16)),
          ],
        ),
        content: Column(
          mainAxisSize: MainAxisSize.min,
          children: [
            const Text(
              'Ingrese el PIN de supervisor para acceder a la configuración (Predeterminado: 1234):',
              style: TextStyle(color: Colors.white70, fontSize: 13),
            ),
            const SizedBox(height: 14),
            TextField(
              controller: pinController,
              autofocus: true,
              obscureText: true,
              keyboardType: TextInputType.number,
              style: const TextStyle(color: Colors.white, fontSize: 18, letterSpacing: 4),
              textAlign: TextAlign.center,
              decoration: const InputDecoration(
                hintText: '••••',
                hintStyle: TextStyle(color: Colors.white24),
                border: OutlineInputBorder(),
              ),
              onSubmitted: (val) {
                if (PdaConfigService.instance.verifyAdminPin(val)) {
                  Navigator.pop(ctx);
                  Navigator.push(context, MaterialPageRoute(builder: (_) => const PdaSettingsView()));
                } else {
                  ScaffoldMessenger.of(context).showSnackBar(
                    const SnackBar(content: Text('PIN incorrecto'), backgroundColor: Colors.red),
                  );
                }
              },
            ),
          ],
        ),
        actions: [
          TextButton(
            onPressed: () => Navigator.pop(ctx),
            child: const Text('Cancelar', style: TextStyle(color: Colors.white60)),
          ),
          ElevatedButton(
            style: ElevatedButton.styleFrom(backgroundColor: const Color(0xFF00D2FF), foregroundColor: Colors.black),
            onPressed: () {
              if (PdaConfigService.instance.verifyAdminPin(pinController.text)) {
                Navigator.pop(ctx);
                Navigator.push(context, MaterialPageRoute(builder: (_) => const PdaSettingsView()));
              } else {
                ScaffoldMessenger.of(context).showSnackBar(
                  const SnackBar(content: Text('PIN incorrecto'), backgroundColor: Colors.red),
                );
              }
            },
            child: const Text('Entrar', style: TextStyle(fontWeight: FontWeight.bold)),
          ),
        ],
      ),
    );
  }

  @override
  Widget build(BuildContext context) {
    final config = context.watch<PdaConfigService>();
    final sync = context.watch<PdaSyncService>();

    return Scaffold(
      backgroundColor: const Color(0xFF0F101A),
      appBar: AppBar(
        backgroundColor: const Color(0xFF181926),
        elevation: 3,
        title: Row(
          children: [
            const Icon(Icons.document_scanner, color: Color(0xFF00D2FF), size: 24),
            const SizedBox(width: 8),
            const Text(
              'NEO PDA',
              style: TextStyle(
                color: Colors.white,
                fontSize: 18,
                fontWeight: FontWeight.w900,
                letterSpacing: 1.2,
              ),
            ),
            const Spacer(),
            // Badge de Estado de Conexión
            Container(
              padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 4),
              decoration: BoxDecoration(
                color: sync.isOnline
                    ? (sync.pendingCount == 0 ? Colors.green.withOpacity(0.2) : Colors.cyan.withOpacity(0.2))
                    : Colors.amber.withOpacity(0.2),
                borderRadius: BorderRadius.circular(6),
                border: Border.all(
                  color: sync.isOnline
                      ? (sync.pendingCount == 0 ? Colors.greenAccent : Colors.cyanAccent)
                      : Colors.amberAccent,
                ),
              ),
              child: Row(
                mainAxisSize: MainAxisSize.min,
                children: [
                  Icon(
                    sync.isOnline
                        ? (sync.pendingCount == 0 ? Icons.cloud_done : Icons.cloud_upload)
                        : Icons.cloud_off,
                    size: 12,
                    color: sync.isOnline
                        ? (sync.pendingCount == 0 ? Colors.greenAccent : Colors.cyanAccent)
                        : Colors.amberAccent,
                  ),
                  const SizedBox(width: 4),
                  Text(
                    sync.isOnline
                        ? (sync.pendingCount == 0 ? 'En Línea' : 'Subiendo (${sync.pendingCount})')
                        : 'Offline (${sync.pendingCount})',
                    style: TextStyle(
                      color: sync.isOnline
                          ? (sync.pendingCount == 0 ? Colors.greenAccent : Colors.cyanAccent)
                          : Colors.amberAccent,
                      fontSize: 10,
                      fontWeight: FontWeight.bold,
                    ),
                  ),
                ],
              ),
            ),
          ],
        ),
        actions: [
          IconButton(
            icon: const Icon(Icons.settings, color: Colors.white70),
            tooltip: 'Configuración',
            onPressed: () => _openSettingsWithPin(context),
          ),
        ],
      ),
      body: SafeArea(
        child: Padding(
          padding: const EdgeInsets.all(16.0),
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.stretch,
            children: [
              // Banner de Sucursal y Terminal
              Container(
                padding: const EdgeInsets.symmetric(horizontal: 14, vertical: 10),
                decoration: BoxDecoration(
                  color: const Color(0xFF161826),
                  borderRadius: BorderRadius.circular(10),
                  border: Border.all(color: const Color(0xFF26283C)),
                ),
                child: Row(
                  children: [
                    const Icon(Icons.store, color: Color(0xFF00D2FF), size: 18),
                    const SizedBox(width: 8),
                    Expanded(
                      child: Text(
                        config.facilityName,
                        style: const TextStyle(color: Colors.white, fontSize: 13, fontWeight: FontWeight.bold),
                        overflow: TextOverflow.ellipsis,
                      ),
                    ),
                    Container(
                      padding: const EdgeInsets.symmetric(horizontal: 6, vertical: 2),
                      decoration: BoxDecoration(
                        color: const Color(0xFF202336),
                        borderRadius: BorderRadius.circular(4),
                      ),
                      child: Text(
                        config.deviceId,
                        style: const TextStyle(color: Colors.white70, fontSize: 11),
                      ),
                    ),
                  ],
                ),
              ),
              const SizedBox(height: 18),

              // BOTÓN 1: VERIFICADOR DE PRECIOS
              Expanded(
                child: _buildMenuModuleCard(
                  context: context,
                  title: 'VERIFICADOR DE PRECIOS',
                  subtitle: 'Apunta y escanea para consultar precio al público y existencias en estantería.',
                  icon: Icons.qr_code_scanner,
                  iconColor: const Color(0xFF00D2FF),
                  gradientColors: [const Color(0xFF14243B), const Color(0xFF0E1A2C)],
                  borderColor: const Color(0xFF00D2FF).withOpacity(0.5),
                  onTap: () {
                    Navigator.push(context, MaterialPageRoute(builder: (_) => const PriceCheckerView()));
                  },
                ),
              ),
              const SizedBox(height: 14),

              // BOTÓN 2: TOMA DE INVENTARIO
              Expanded(
                child: _buildMenuModuleCard(
                  context: context,
                  title: 'TOMA DE INVENTARIO',
                  subtitle: 'Conteo físico rápido por escaneo continuo, auditoría de stock y tomas cíclicas.',
                  icon: Icons.inventory_2_outlined,
                  iconColor: Colors.greenAccent,
                  gradientColors: [const Color(0xFF132B25), const Color(0xFF0D1E1A)],
                  borderColor: Colors.greenAccent.withOpacity(0.4),
                  onTap: () {
                    Navigator.push(context, MaterialPageRoute(builder: (_) => const InventoryCountView()));
                  },
                ),
              ),
              const SizedBox(height: 14),

              // Barra inferior de estado del operador
              Container(
                padding: const EdgeInsets.symmetric(horizontal: 14, vertical: 8),
                decoration: BoxDecoration(
                  color: const Color(0xFF141522),
                  borderRadius: BorderRadius.circular(8),
                ),
                child: Row(
                  children: [
                    const Icon(Icons.person, color: Colors.white38, size: 14),
                    const SizedBox(width: 6),
                    Text(
                      'Operador: ${config.operatorBadge} (${config.operatorName})',
                      style: const TextStyle(color: Colors.white60, fontSize: 11),
                    ),
                    const Spacer(),
                    Text(
                      'Neo ERP v2.0',
                      style: TextStyle(color: Colors.white.withOpacity(0.3), fontSize: 10),
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

  Widget _buildMenuModuleCard({
    required BuildContext context,
    required String title,
    required String subtitle,
    required IconData icon,
    required Color iconColor,
    required List<Color> gradientColors,
    required Color borderColor,
    required VoidCallback onTap,
  }) {
    return Material(
      color: Colors.transparent,
      child: InkWell(
        onTap: onTap,
        borderRadius: BorderRadius.circular(16),
        child: Container(
          padding: const EdgeInsets.all(20),
          decoration: BoxDecoration(
            gradient: LinearGradient(
              colors: gradientColors,
              begin: Alignment.topLeft,
              end: Alignment.bottomRight,
            ),
            borderRadius: BorderRadius.circular(16),
            border: Border.all(color: borderColor, width: 1.5),
            boxShadow: [
              BoxShadow(
                color: iconColor.withOpacity(0.1),
                blurRadius: 10,
                offset: const Offset(0, 4),
              ),
            ],
          ),
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.start,
            mainAxisAlignment: MainAxisAlignment.center,
            children: [
              Row(
                children: [
                  Container(
                    padding: const EdgeInsets.all(12),
                    decoration: BoxDecoration(
                      color: Colors.black.withOpacity(0.3),
                      borderRadius: BorderRadius.circular(12),
                      border: Border.all(color: iconColor.withOpacity(0.4)),
                    ),
                    child: Icon(icon, color: iconColor, size: 36),
                  ),
                  const Spacer(),
                  Icon(Icons.arrow_forward_ios, color: Colors.white.withOpacity(0.3), size: 18),
                ],
              ),
              const SizedBox(height: 14),
              Text(
                title,
                style: const TextStyle(
                  color: Colors.white,
                  fontSize: 17,
                  fontWeight: FontWeight.bold,
                  letterSpacing: 0.8,
                ),
              ),
              const SizedBox(height: 6),
              Text(
                subtitle,
                style: const TextStyle(color: Colors.white60, fontSize: 12, height: 1.3),
              ),
            ],
          ),
        ),
      ),
    );
  }
}
