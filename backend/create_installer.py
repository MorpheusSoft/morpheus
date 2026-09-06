import zipfile
import os
import shutil
import json

def build_installer():
    base_dir = os.path.dirname(os.path.abspath(__file__))
    static_dir = os.path.join(base_dir, "static")
    os.makedirs(static_dir, exist_ok=True)
    
    src_zip = os.path.join(static_dir, "msync_update.zip")
    if not os.path.exists(src_zip):
        alt_zip = os.path.join(base_dir, "..", "static", "msync_update.zip")
        if os.path.exists(alt_zip):
            src_zip = alt_zip
        else:
            raise FileNotFoundError(f"Cannot find source msync_update.zip at {src_zip}")

    build_dir = "/tmp/morpheus_installer_build"
    if os.path.exists(build_dir):
        shutil.rmtree(build_dir)
    os.makedirs(build_dir, exist_ok=True)

    print("[1/5] Extrayendo ejecutable base...")
    with zipfile.ZipFile(src_zip, "r") as z:
        with open(os.path.join(build_dir, "MorpheusSyncAgent.exe"), "wb") as f:
            f.write(z.read("msync.exe"))

    print("[2/5] Generando appsettings.json preconfigurado...")
    appsettings = {
        "Logging": {
            "LogLevel": {
                "Default": "Information",
                "Microsoft.Hosting.Lifetime": "Information"
            }
        },
        "ConnectionStrings": {
            "LocalSqlServer": "Server=AGUERREVERE\\SRVAGUERREVERE;Database=VAD10;User Id=jqFydZPO;Password=+121f4T$19;TrustServerCertificate=True;",
            "LocalSQLite": "Data Source=morpheus_local.db"
        },
        "DirectExtractors": {
            "Products": {
                "Enabled": False,
                "IntervalMinutes": 60,
                "TargetApiUrl": "https://api.qa.morpheussoft.net/api/v1/import/products-legacy",
                "ExportMode": "OnlyWithStock"
            },
            "ProductBarcodes": {
                "Enabled": False,
                "IntervalMinutes": 60,
                "TargetApiUrl": "https://api.qa.morpheussoft.net/api/v1/import/products-barcodes-legacy",
                "ExportMode": "OnlyWithStock"
            },
            "InventoryBaseline": {
                "Enabled": False,
                "IntervalMinutes": 60,
                "TargetApiUrl": "https://api.qa.morpheussoft.net/api/v1/import/inventory-baseline-legacy",
                "BaselineCutoffDate": "2026-06-07"
            },
            "InventoryMovements": {
                "Enabled": False,
                "IntervalMinutes": 10,
                "TargetApiUrl": "https://api.qa.morpheussoft.net/api/v1/import/inventory-movements-legacy"
            },
            "Sales": {
                "Enabled": True,
                "IntervalMinutes": 10,
                "TargetApiUrl": "https://api.qa.morpheussoft.net/api/v1/import/sales-legacy"
            },
            "SupplierProducts": {
                "Enabled": False,
                "IntervalMinutes": 30,
                "TargetApiUrl": "https://api.qa.morpheussoft.net/api/v1/import/supplier-products-legacy"
            },
            "Suppliers": {
                "Enabled": False,
                "IntervalMinutes": 60,
                "TargetApiUrl": "https://api.qa.morpheussoft.net/api/v1/import/suppliers-legacy"
            }
        },
        "StoreFacilityId": 1
    }

    with open(os.path.join(build_dir, "appsettings.json"), "w", encoding="utf-8") as f:
        json.dump(appsettings, f, indent=2)

    print("[3/5] Generando Interfaz Grafica de Configuracion Completa (WPF/PowerShell)...")
    
    ps1_gui = '''Add-Type -AssemblyName PresentationFramework, PresentationCore, WindowsBase, System.Drawing, System.Windows.Forms

$scriptDir = Split-Path -Parent $MyInvocation.MyCommand.Definition
$settingsPath = Join-Path $scriptDir "appsettings.json"
$statePath = Join-Path $scriptDir "sync_state.json"
$localDbPath = Join-Path $scriptDir "morpheus_local.db"

[xml]$xaml = @"
<Window xmlns="http://schemas.microsoft.com/winfx/2006/xaml/presentation"
        xmlns:x="http://schemas.microsoft.com/winfx/2006/xaml"
        Title="Morpheus Sync Agent - Panel de Control &amp; Configuración" 
        Height="780" Width="890" 
        WindowStartupLocation="CenterScreen" 
        Background="#0F172A" Foreground="#F8FAFC"
        FontFamily="Segoe UI" ResizeMode="CanMinimize">
    <Window.Resources>
        <Style TargetType="TabItem">
            <Setter Property="FontSize" Value="13"/>
            <Setter Property="FontWeight" Value="SemiBold"/>
            <Setter Property="Padding" Value="16,10"/>
            <Setter Property="Foreground" Value="#94A3B8"/>
            <Setter Property="Template">
                <Setter.Value>
                    <ControlTemplate TargetType="TabItem">
                        <Border Name="Border" BorderThickness="0,0,0,2" BorderBrush="Transparent" Margin="0,0,8,0" Padding="12,8">
                            <ContentPresenter ContentSource="Header" RecognizesAccessKey="True"/>
                        </Border>
                        <ControlTemplate.Triggers>
                            <Trigger Property="IsSelected" Value="True">
                                <Setter TargetName="Border" Property="BorderBrush" Value="#6366F1"/>
                                <Setter Property="Foreground" Value="#FFFFFF"/>
                            </Trigger>
                            <Trigger Property="IsMouseOver" Value="True">
                                <Setter Property="Foreground" Value="#E2E8F0"/>
                            </Trigger>
                        </ControlTemplate.Triggers>
                    </ControlTemplate>
                </Setter.Value>
            </Setter>
        </Style>
        <Style TargetType="TextBox">
            <Setter Property="Background" Value="#1E293B"/>
            <Setter Property="Foreground" Value="#F8FAFC"/>
            <Setter Property="BorderBrush" Value="#334155"/>
            <Setter Property="BorderThickness" Value="1"/>
            <Setter Property="Padding" Value="8,6"/>
            <Setter Property="FontSize" Value="12"/>
        </Style>
        <Style TargetType="PasswordBox">
            <Setter Property="Background" Value="#1E293B"/>
            <Setter Property="Foreground" Value="#F8FAFC"/>
            <Setter Property="BorderBrush" Value="#334155"/>
            <Setter Property="BorderThickness" Value="1"/>
            <Setter Property="Padding" Value="8,6"/>
            <Setter Property="FontSize" Value="12"/>
        </Style>
        <Style TargetType="CheckBox">
            <Setter Property="Foreground" Value="#F8FAFC"/>
            <Setter Property="FontSize" Value="12"/>
            <Setter Property="Margin" Value="0,4"/>
        </Style>
        <Style TargetType="RadioButton">
            <Setter Property="Foreground" Value="#F8FAFC"/>
            <Setter Property="FontSize" Value="12"/>
            <Setter Property="Margin" Value="0,4"/>
        </Style>
    </Window.Resources>
    
    <Grid Margin="20">
        <Grid.RowDefinitions>
            <RowDefinition Height="Auto"/>
            <RowDefinition Height="*"/>
            <RowDefinition Height="Auto"/>
        </Grid.RowDefinitions>
        
        <!-- Header -->
        <Border Grid.Row="0" Background="#1E293B" CornerRadius="12" Padding="18,14" Margin="0,0,0,14" BorderBrush="#334155" BorderThickness="1">
            <Grid>
                <Grid.ColumnDefinitions>
                    <ColumnDefinition Width="*"/>
                    <ColumnDefinition Width="Auto"/>
                </Grid.ColumnDefinitions>
                <StackPanel Grid.Column="0">
                    <StackPanel Orientation="Horizontal" VerticalAlignment="Center">
                        <Border Background="#6366F1" CornerRadius="8" Width="34" Height="34" Margin="0,0,12,0">
                            <TextBlock Text="⚡" FontSize="18" HorizontalAlignment="Center" VerticalAlignment="Center"/>
                        </Border>
                        <StackPanel>
                            <TextBlock Text="Morpheus Sync Agent" FontSize="19" FontWeight="Bold" Foreground="#FFFFFF"/>
                            <TextBlock Text="Panel de Control y Enlace POS Tienda ➔ Nube Morpheus" FontSize="12" Foreground="#94A3B8"/>
                        </StackPanel>
                    </StackPanel>
                </StackPanel>
                
                <!-- Status Badge -->
                <Border Grid.Column="1" Name="BadgeStatus" Background="#334155" CornerRadius="20" Padding="14,6" VerticalAlignment="Center">
                    <StackPanel Orientation="Horizontal" VerticalAlignment="Center">
                        <Ellipse Name="LedStatus" Width="10" Height="10" Fill="#94A3B8" Margin="0,0,8,0"/>
                        <TextBlock Name="TxtServiceStatus" Text="Consultando..." FontSize="12" FontWeight="Bold" Foreground="#FFFFFF"/>
                    </StackPanel>
                </Border>
            </Grid>
        </Border>
        
        <!-- Tabs -->
        <TabControl Grid.Row="1" Background="Transparent" BorderThickness="0">
            
            <!-- TAB 1: Puesta a Punto (Fases 2 y 3) -->
            <TabItem Header="🚀 Puesta a Punto (Fases 2 y 3)">
                <Border Background="#1E293B" CornerRadius="12" Padding="20" Margin="0,12,0,0" BorderBrush="#334155" BorderThickness="1">
                    <ScrollViewer VerticalScrollBarVisibility="Auto">
                        <StackPanel>
                            <!-- FASE 2: Reset Local -->
                            <Border Background="#0F172A" CornerRadius="10" Padding="16" Margin="0,0,0,14" BorderBrush="#334155" BorderThickness="1">
                                <StackPanel>
                                    <StackPanel Orientation="Horizontal" Margin="0,0,0,6">
                                        <TextBlock Text="🗑️ FASE 2: Resetear Estado Local (Semilla Cero)" FontSize="14" FontWeight="Bold" Foreground="#F59E0B"/>
                                    </StackPanel>
                                    <TextBlock Text="Elimina sync_state.json y morpheus_local.db (creando un respaldo previo en /backup) para que la extracción comience limpia y sin marcas viejas." FontSize="11" Foreground="#94A3B8" TextWrapping="Wrap" Margin="0,0,0,10"/>
                                    <StackPanel Orientation="Horizontal">
                                        <Button Name="BtnResetLocalState" Content="🧹 Resetear Estado Local Ahora" Background="#D97706" Foreground="#FFFFFF" FontWeight="Bold" Padding="16,8" Cursor="Hand" BorderThickness="0"/>
                                        <TextBlock Name="TxtResetResult" Text="" VerticalAlignment="Center" Margin="14,0,0,0" FontSize="11" FontWeight="SemiBold"/>
                                    </StackPanel>
                                </StackPanel>
                            </Border>
                            
                            <!-- FASE 3: Carga de Maestros a Voluntad -->
                            <Border Background="#0F172A" CornerRadius="10" Padding="16" Margin="0,0,0,14" BorderBrush="#334155" BorderThickness="1">
                                <StackPanel>
                                    <TextBlock Text="📦 FASE 3: Carga de Maestros Inicial (Ejecución a Voluntad)" FontSize="14" FontWeight="Bold" Foreground="#38BDF8" Margin="0,0,0,6"/>
                                    <TextBlock Text="Presiona cada botón en orden para sembrar los catálogos en Morpheus QA. Cada extracción abrirá una consola para ver el avance en vivo." FontSize="11" Foreground="#94A3B8" TextWrapping="Wrap" Margin="0,0,0,12"/>
                                    
                                    <WrapPanel Margin="0,0,0,8">
                                        <Button Name="BtnRunSuppliers" Content="1️⃣ Sincronizar Proveedores" Background="#1E293B" Foreground="#38BDF8" FontWeight="SemiBold" Padding="12,8" Margin="0,0,8,8" Cursor="Hand" BorderBrush="#0284C7" BorderThickness="1"/>
                                        <Button Name="BtnRunProducts" Content="2️⃣ Sincronizar Productos &amp; Variantes" Background="#1E293B" Foreground="#38BDF8" FontWeight="SemiBold" Padding="12,8" Margin="0,0,8,8" Cursor="Hand" BorderBrush="#0284C7" BorderThickness="1"/>
                                        <Button Name="BtnRunBarcodes" Content="3️⃣ Sincronizar Códigos de Barra" Background="#1E293B" Foreground="#38BDF8" FontWeight="SemiBold" Padding="12,8" Margin="0,0,8,8" Cursor="Hand" BorderBrush="#0284C7" BorderThickness="1"/>
                                        <Button Name="BtnRunSupplierProducts" Content="4️⃣ Sincronizar Costos &amp; Cruces" Background="#1E293B" Foreground="#38BDF8" FontWeight="SemiBold" Padding="12,8" Margin="0,0,8,8" Cursor="Hand" BorderBrush="#0284C7" BorderThickness="1"/>
                                    </WrapPanel>
                                    
                                    <!-- Baseline Configuration -->
                                    <Border Background="#1E293B" CornerRadius="8" Padding="12" Margin="0,4,0,0" BorderBrush="#334155" BorderThickness="1">
                                        <StackPanel>
                                            <TextBlock Text="5️⃣ Inventario Inicial (Baseline):" FontWeight="Bold" FontSize="12" Foreground="#FFFFFF" Margin="0,0,0,6"/>
                                            <StackPanel Orientation="Horizontal" Margin="0,0,0,8">
                                                <RadioButton Name="RbBaselineCurrent" Content="Al momento actual (Hoy)" IsChecked="True" GroupName="BaselineMode" Margin="0,0,16,0"/>
                                                <RadioButton Name="RbBaselineCutoff" Content="A fecha específica de corte:" GroupName="BaselineMode" Margin="0,0,8,0"/>
                                                <TextBox Name="TxtBaselineDate" Text="2026-06-07" Width="100"/>
                                            </StackPanel>
                                            <Button Name="BtnRunBaseline" Content="🚀 Sincronizar Inventario Inicial (Baseline)" Background="#0284C7" Foreground="#FFFFFF" FontWeight="Bold" Padding="16,8" HorizontalAlignment="Left" Cursor="Hand" BorderThickness="0"/>
                                        </StackPanel>
                                    </Border>
                                </StackPanel>
                            </Border>
                            
                            <!-- TARJETA DE ESTADO EN VIVO -->
                            <Border Background="#0F172A" CornerRadius="10" Padding="16" BorderBrush="#334155" BorderThickness="1">
                                <StackPanel>
                                    <Grid Margin="0,0,0,8">
                                        <Grid.ColumnDefinitions>
                                            <ColumnDefinition Width="*"/>
                                            <ColumnDefinition Width="Auto"/>
                                        </Grid.ColumnDefinitions>
                                        <TextBlock Grid.Column="0" Text="📊 Marcas de Agua Actuales (sync_state.json):" FontSize="13" FontWeight="Bold" Foreground="#A78BFA"/>
                                        <Button Grid.Column="1" Name="BtnRefreshState" Content="🔄 Refrescar" Background="#334155" Foreground="#CBD5E1" FontSize="11" Padding="8,4" Cursor="Hand" BorderThickness="0"/>
                                    </Grid>
                                    <UniformGrid Columns="3" Margin="0,4,0,0">
                                        <StackPanel Margin="0,4">
                                            <TextBlock Text="Proveedores:" FontSize="10" Foreground="#64748B"/>
                                            <TextBlock Name="LblSyncSuppliers" Text="Sin datos" FontSize="11" FontWeight="SemiBold" Foreground="#CBD5E1"/>
                                        </StackPanel>
                                        <StackPanel Margin="0,4">
                                            <TextBlock Text="Productos:" FontSize="10" Foreground="#64748B"/>
                                            <TextBlock Name="LblSyncProducts" Text="Sin datos" FontSize="11" FontWeight="SemiBold" Foreground="#CBD5E1"/>
                                        </StackPanel>
                                        <StackPanel Margin="0,4">
                                            <TextBlock Text="Códigos Barra:" FontSize="10" Foreground="#64748B"/>
                                            <TextBlock Name="LblSyncBarcodes" Text="Sin datos" FontSize="11" FontWeight="SemiBold" Foreground="#CBD5E1"/>
                                        </StackPanel>
                                        <StackPanel Margin="0,4">
                                            <TextBlock Text="Costos Proveedor:" FontSize="10" Foreground="#64748B"/>
                                            <TextBlock Name="LblSyncSuppProd" Text="Sin datos" FontSize="11" FontWeight="SemiBold" Foreground="#CBD5E1"/>
                                        </StackPanel>
                                        <StackPanel Margin="0,4">
                                            <TextBlock Text="Inventario Baseline:" FontSize="10" Foreground="#64748B"/>
                                            <TextBlock Name="LblSyncBaseline" Text="Pendiente" FontSize="11" FontWeight="SemiBold" Foreground="#F59E0B"/>
                                        </StackPanel>
                                        <StackPanel Margin="0,4">
                                            <TextBlock Text="Última Venta Sincronizada:" FontSize="10" Foreground="#64748B"/>
                                            <TextBlock Name="LblSyncSales" Text="Sin datos" FontSize="11" FontWeight="SemiBold" Foreground="#10B981"/>
                                        </StackPanel>
                                    </UniformGrid>
                                </StackPanel>
                            </Border>
                        </StackPanel>
                    </ScrollViewer>
                </Border>
            </TabItem>
            
            <!-- TAB 2: Sincronización a Voluntad (Parámetros) -->
            <TabItem Header="🛒 Sincronizar a Voluntad (Parámetros)">
                <Border Background="#1E293B" CornerRadius="12" Padding="20" Margin="0,12,0,0" BorderBrush="#334155" BorderThickness="1">
                    <ScrollViewer VerticalScrollBarVisibility="Auto">
                        <StackPanel>
                            <TextBlock Text="Extracción de Ventas y Movimientos con Parámetros" FontSize="15" FontWeight="Bold" Foreground="#FFFFFF" Margin="0,0,0,4"/>
                            <TextBlock Text="Permite enviar lotes de ventas históricas hacia la nube ajustando la marca de tiempo a voluntad." FontSize="12" Foreground="#94A3B8" Margin="0,0,0,16"/>
                            
                            <!-- Panel de Ventas -->
                            <Border Background="#0F172A" CornerRadius="10" Padding="16" Margin="0,0,0,14" BorderBrush="#334155" BorderThickness="1">
                                <StackPanel>
                                    <TextBlock Text="🛒 Sincronización de Ventas Históricas:" FontSize="14" FontWeight="Bold" Foreground="#10B981" Margin="0,0,0,8"/>
                                    <TextBlock Text="Selecciona qué rango de ventas deseas enviar a Morpheus:" FontSize="11" Foreground="#94A3B8" Margin="0,0,0,10"/>
                                    
                                    <StackPanel Margin="0,0,0,10">
                                        <RadioButton Name="RbSales30Days" Content="Últimos 30 días" GroupName="SalesRange"/>
                                        <RadioButton Name="RbSales3Months" Content="Últimos 3 meses (Recomendado para UAT)" IsChecked="True" GroupName="SalesRange"/>
                                        <RadioButton Name="RbSales6Months" Content="Últimos 6 meses" GroupName="SalesRange"/>
                                        <RadioButton Name="RbSalesAll" Content="Desde la fecha de corte de inventario (Todo el historial disponible)" GroupName="SalesRange"/>
                                        <StackPanel Orientation="Horizontal" Margin="0,4">
                                            <RadioButton Name="RbSalesCustom" Content="Desde fecha personalizada:" GroupName="SalesRange" Margin="0,0,8,0" VerticalAlignment="Center"/>
                                            <TextBox Name="TxtSalesCustomDate" Text="2026-06-01" Width="100"/>
                                        </StackPanel>
                                    </StackPanel>
                                    
                                    <Button Name="BtnRunSalesCustom" Content="▶️ Sincronizar Ventas Ahora" Background="#10B981" Foreground="#FFFFFF" FontWeight="Bold" Padding="18,10" HorizontalAlignment="Left" Cursor="Hand" BorderThickness="0"/>
                                </StackPanel>
                            </Border>
                            
                            <!-- Panel de Movimientos -->
                            <Border Background="#0F172A" CornerRadius="10" Padding="16" BorderBrush="#334155" BorderThickness="1">
                                <StackPanel>
                                    <TextBlock Text="📦 Sincronización de Movimientos de Inventario (Kardex):" FontSize="14" FontWeight="Bold" Foreground="#6366F1" Margin="0,0,0,6"/>
                                    <TextBlock Text="Extrae las transferencias internas y ajustes directos registrados en el POS." FontSize="11" Foreground="#94A3B8" Margin="0,0,0,10"/>
                                    <Button Name="BtnRunMovements" Content="▶️ Sincronizar Movimientos Ahora" Background="#6366F1" Foreground="#FFFFFF" FontWeight="Bold" Padding="18,10" HorizontalAlignment="Left" Cursor="Hand" BorderThickness="0"/>
                                </StackPanel>
                            </Border>
                        </StackPanel>
                    </ScrollViewer>
                </Border>
            </TabItem>
            
            <!-- TAB 3: Extractores del Servicio Continuo -->
            <TabItem Header="⚙️ Servicio Continuo (Background)">
                <Border Background="#1E293B" CornerRadius="12" Padding="20" Margin="0,12,0,0" BorderBrush="#334155" BorderThickness="1">
                    <ScrollViewer VerticalScrollBarVisibility="Auto">
                        <StackPanel>
                            <TextBlock Text="Configurar Extractores del Servicio en Segundo Plano" FontSize="15" FontWeight="Bold" Foreground="#FFFFFF" Margin="0,0,0,4"/>
                            <TextBlock Text="Marca qué tareas debe ejecutar automáticamente el Servicio de Windows en segundo plano y sus frecuencias:" FontSize="12" Foreground="#94A3B8" Margin="0,0,0,16"/>
                            
                            <Border Background="#0F172A" CornerRadius="10" Padding="16" Margin="0,0,0,14" BorderBrush="#334155" BorderThickness="1">
                                <Grid>
                                    <Grid.ColumnDefinitions>
                                        <ColumnDefinition Width="*"/>
                                        <ColumnDefinition Width="140"/>
                                    </Grid.ColumnDefinitions>
                                    <Grid.RowDefinitions>
                                        <RowDefinition Height="Auto"/>
                                        <RowDefinition Height="Auto"/>
                                        <RowDefinition Height="Auto"/>
                                        <RowDefinition Height="Auto"/>
                                        <RowDefinition Height="Auto"/>
                                        <RowDefinition Height="Auto"/>
                                        <RowDefinition Height="Auto"/>
                                    </Grid.RowDefinitions>
                                    
                                    <TextBlock Grid.Row="0" Grid.Column="0" Text="Extractor" FontWeight="Bold" Foreground="#94A3B8" Margin="0,0,0,8"/>
                                    <TextBlock Grid.Row="0" Grid.Column="1" Text="Intervalo (Minutos)" FontWeight="Bold" Foreground="#94A3B8" Margin="0,0,0,8"/>
                                    
                                    <CheckBox Grid.Row="1" Grid.Column="0" Name="ChkSyncSales" Content="🛒 Sincronizar Ventas (Recomendado activo)" IsChecked="True"/>
                                    <TextBox Grid.Row="1" Grid.Column="1" Name="TxtIntervalSales" Text="10" Width="60" HorizontalAlignment="Left" Margin="0,2"/>
                                    
                                    <CheckBox Grid.Row="2" Grid.Column="0" Name="ChkSyncMovements" Content="📦 Movimientos de Inventario"/>
                                    <TextBox Grid.Row="2" Grid.Column="1" Name="TxtIntervalMovements" Text="10" Width="60" HorizontalAlignment="Left" Margin="0,2"/>
                                    
                                    <CheckBox Grid.Row="3" Grid.Column="0" Name="ChkSyncProducts" Content="🏷️ Catálogo de Productos y Precios"/>
                                    <TextBox Grid.Row="3" Grid.Column="1" Name="TxtIntervalProducts" Text="60" Width="60" HorizontalAlignment="Left" Margin="0,2"/>
                                    
                                    <CheckBox Grid.Row="4" Grid.Column="0" Name="ChkSyncBarcodes" Content="🔍 Códigos de Barra"/>
                                    <TextBox Grid.Row="4" Grid.Column="1" Name="TxtIntervalBarcodes" Text="60" Width="60" HorizontalAlignment="Left" Margin="0,2"/>
                                    
                                    <CheckBox Grid.Row="5" Grid.Column="0" Name="ChkSyncSuppliers" Content="🏢 Proveedores"/>
                                    <TextBox Grid.Row="5" Grid.Column="1" Name="TxtIntervalSuppliers" Text="60" Width="60" HorizontalAlignment="Left" Margin="0,2"/>
                                    
                                    <CheckBox Grid.Row="6" Grid.Column="0" Name="ChkSyncSupplierProducts" Content="💲 Costos y Artículos por Proveedor"/>
                                    <TextBox Grid.Row="6" Grid.Column="1" Name="TxtIntervalSupplierProducts" Text="30" Width="60" HorizontalAlignment="Left" Margin="0,2"/>
                                </Grid>
                            </Border>
                            
                            <!-- Control del Servicio -->
                            <TextBlock Text="Acciones del Servicio Windows:" FontSize="13" FontWeight="Bold" Foreground="#FFFFFF" Margin="0,8,0,8"/>
                            <WrapPanel>
                                <Button Name="BtnStartService" Content="▶️ Iniciar Servicio" Background="#10B981" Foreground="#FFFFFF" FontWeight="Bold" Padding="16,8" Margin="0,0,10,8" Cursor="Hand" BorderThickness="0"/>
                                <Button Name="BtnStopService" Content="⏹️ Detener Servicio" Background="#EF4444" Foreground="#FFFFFF" FontWeight="Bold" Padding="16,8" Margin="0,0,10,8" Cursor="Hand" BorderThickness="0"/>
                                <Button Name="BtnRestartService" Content="🔄 Reiniciar Servicio" Background="#3B82F6" Foreground="#FFFFFF" FontWeight="Bold" Padding="16,8" Margin="0,0,10,8" Cursor="Hand" BorderThickness="0"/>
                                <Button Name="BtnConsoleMode" Content="🖥️ Ver Consola en Vivo" Background="#64748B" Foreground="#FFFFFF" FontWeight="Bold" Padding="16,8" Margin="0,0,10,8" Cursor="Hand" BorderThickness="0"/>
                            </WrapPanel>
                        </StackPanel>
                    </ScrollViewer>
                </Border>
            </TabItem>
            
            <!-- TAB 4: Conexiones & Diagnóstico -->
            <TabItem Header="🔧 Conexiones &amp; Diagnóstico">
                <Border Background="#1E293B" CornerRadius="12" Padding="20" Margin="0,12,0,0" BorderBrush="#334155" BorderThickness="1">
                    <ScrollViewer VerticalScrollBarVisibility="Auto">
                        <StackPanel>
                            <TextBlock Text="Configuración de Red y Bases de Datos" FontSize="15" FontWeight="Bold" Foreground="#FFFFFF" Margin="0,0,0,4"/>
                            <TextBlock Text="Verifica la conectividad con el SQL Server de la tienda y la API en la nube." FontSize="12" Foreground="#94A3B8" Margin="0,0,0,16"/>
                            
                            <!-- SQL Server -->
                            <Border Background="#0F172A" CornerRadius="10" Padding="16" Margin="0,0,0,14" BorderBrush="#334155" BorderThickness="1">
                                <StackPanel>
                                    <TextBlock Text="🗄️ SQL Server Local (VAD10 / VAD20)" FontSize="13" FontWeight="Bold" Foreground="#CBD5E1" Margin="0,0,0,10"/>
                                    <Grid Margin="0,0,0,8">
                                        <Grid.ColumnDefinitions>
                                            <ColumnDefinition Width="150"/>
                                            <ColumnDefinition Width="*"/>
                                        </Grid.ColumnDefinitions>
                                        <TextBlock Grid.Column="0" Text="Servidor / Instancia:" VerticalAlignment="Center" Foreground="#94A3B8"/>
                                        <TextBox Grid.Column="1" Name="TxtSqlServer" Text="AGUERREVERE\SRVAGUERREVERE"/>
                                    </Grid>
                                    <Grid Margin="0,0,0,8">
                                        <Grid.ColumnDefinitions>
                                            <ColumnDefinition Width="150"/>
                                            <ColumnDefinition Width="*"/>
                                        </Grid.ColumnDefinitions>
                                        <TextBlock Grid.Column="0" Text="Base de Datos:" VerticalAlignment="Center" Foreground="#94A3B8"/>
                                        <TextBox Grid.Column="1" Name="TxtSqlDb" Text="VAD10"/>
                                    </Grid>
                                    <Grid Margin="0,0,0,8">
                                        <Grid.ColumnDefinitions>
                                            <ColumnDefinition Width="150"/>
                                            <ColumnDefinition Width="*"/>
                                        </Grid.ColumnDefinitions>
                                        <TextBlock Grid.Column="0" Text="Usuario SQL:" VerticalAlignment="Center" Foreground="#94A3B8"/>
                                        <TextBox Grid.Column="1" Name="TxtSqlUser" Text="jqFydZPO"/>
                                    </Grid>
                                    <Grid Margin="0,0,0,10">
                                        <Grid.ColumnDefinitions>
                                            <ColumnDefinition Width="150"/>
                                            <ColumnDefinition Width="*"/>
                                        </Grid.ColumnDefinitions>
                                        <TextBlock Grid.Column="0" Text="Contraseña SQL:" VerticalAlignment="Center" Foreground="#94A3B8"/>
                                        <PasswordBox Grid.Column="1" Name="TxtSqlPass"/>
                                    </Grid>
                                    <StackPanel Orientation="Horizontal">
                                        <Button Name="BtnTestSql" Content="🔍 Probar Conexión SQL" Background="#334155" Foreground="#FFFFFF" FontWeight="SemiBold" Padding="14,8" Cursor="Hand" BorderThickness="0"/>
                                        <TextBlock Name="TxtSqlTestResult" Text="" VerticalAlignment="Center" Margin="14,0,0,0" FontSize="11" FontWeight="SemiBold"/>
                                    </StackPanel>
                                </StackPanel>
                            </Border>
                            
                            <!-- Nube API -->
                            <Border Background="#0F172A" CornerRadius="10" Padding="16" BorderBrush="#334155" BorderThickness="1">
                                <StackPanel>
                                    <TextBlock Text="☁️ Servidor Central Morpheus" FontSize="13" FontWeight="Bold" Foreground="#CBD5E1" Margin="0,0,0,10"/>
                                    <Grid Margin="0,0,0,8">
                                        <Grid.ColumnDefinitions>
                                            <ColumnDefinition Width="150"/>
                                            <ColumnDefinition Width="*"/>
                                        </Grid.ColumnDefinitions>
                                        <TextBlock Grid.Column="0" Text="URL Base de la API:" VerticalAlignment="Center" Foreground="#94A3B8"/>
                                        <TextBox Grid.Column="1" Name="TxtApiBaseUrl" Text="https://api.qa.morpheussoft.net"/>
                                    </Grid>
                                    <Grid Margin="0,0,0,10">
                                        <Grid.ColumnDefinitions>
                                            <ColumnDefinition Width="150"/>
                                            <ColumnDefinition Width="*"/>
                                        </Grid.ColumnDefinitions>
                                        <TextBlock Grid.Column="0" Text="ID de Sucursal:" VerticalAlignment="Center" Foreground="#94A3B8"/>
                                        <TextBox Grid.Column="1" Name="TxtFacilityId" Text="1" Width="80" HorizontalAlignment="Left"/>
                                    </Grid>
                                    <StackPanel Orientation="Horizontal">
                                        <Button Name="BtnTestApi" Content="🌐 Probar Conexión Nube" Background="#334155" Foreground="#FFFFFF" FontWeight="SemiBold" Padding="14,8" Cursor="Hand" BorderThickness="0"/>
                                        <TextBlock Name="TxtApiTestResult" Text="" VerticalAlignment="Center" Margin="14,0,0,0" FontSize="11" FontWeight="SemiBold"/>
                                    </StackPanel>
                                </StackPanel>
                            </Border>
                        </StackPanel>
                    </ScrollViewer>
                </Border>
            </TabItem>
        </TabControl>
        
        <!-- Footer -->
        <Border Grid.Row="2" Margin="0,14,0,0">
            <Grid>
                <Grid.ColumnDefinitions>
                    <ColumnDefinition Width="*"/>
                    <ColumnDefinition Width="Auto"/>
                </Grid.ColumnDefinitions>
                
                <TextBlock Grid.Column="0" Name="TxtActionLog" Text="Listo para operar." VerticalAlignment="Center" FontSize="11" Foreground="#64748B" FontFamily="Consolas"/>
                
                <StackPanel Grid.Column="1" Orientation="Horizontal">
                    <Button Name="BtnCancel" Content="Cerrar" Background="#334155" Foreground="#CBD5E1" FontWeight="SemiBold" Padding="18,8" Margin="0,0,10,0" Cursor="Hand" BorderThickness="0"/>
                    <Button Name="BtnSave" Content="💾 Guardar Configuración" Background="#6366F1" Foreground="#FFFFFF" FontWeight="Bold" Padding="22,8" Cursor="Hand" BorderThickness="0"/>
                </StackPanel>
            </Grid>
        </Border>
    </Grid>
</Window>
"@

$reader = (New-Object System.Xml.XmlNodeReader $xaml)
$window = [Windows.Markup.XamlReader]::Load($reader)

# Mapeo de controles
$BadgeStatus = $window.FindName("BadgeStatus")
$LedStatus = $window.FindName("LedStatus")
$TxtServiceStatus = $window.FindName("TxtServiceStatus")

$BtnResetLocalState = $window.FindName("BtnResetLocalState")
$TxtResetResult = $window.FindName("TxtResetResult")

$BtnRunSuppliers = $window.FindName("BtnRunSuppliers")
$BtnRunProducts = $window.FindName("BtnRunProducts")
$BtnRunBarcodes = $window.FindName("BtnRunBarcodes")
$BtnRunSupplierProducts = $window.FindName("BtnRunSupplierProducts")

$RbBaselineCurrent = $window.FindName("RbBaselineCurrent")
$RbBaselineCutoff = $window.FindName("RbBaselineCutoff")
$TxtBaselineDate = $window.FindName("TxtBaselineDate")
$BtnRunBaseline = $window.FindName("BtnRunBaseline")

$BtnRefreshState = $window.FindName("BtnRefreshState")
$LblSyncSuppliers = $window.FindName("LblSyncSuppliers")
$LblSyncProducts = $window.FindName("LblSyncProducts")
$LblSyncBarcodes = $window.FindName("LblSyncBarcodes")
$LblSyncSuppProd = $window.FindName("LblSyncSuppProd")
$LblSyncBaseline = $window.FindName("LblSyncBaseline")
$LblSyncSales = $window.FindName("LblSyncSales")

$RbSales30Days = $window.FindName("RbSales30Days")
$RbSales3Months = $window.FindName("RbSales3Months")
$RbSales6Months = $window.FindName("RbSales6Months")
$RbSalesAll = $window.FindName("RbSalesAll")
$RbSalesCustom = $window.FindName("RbSalesCustom")
$TxtSalesCustomDate = $window.FindName("TxtSalesCustomDate")
$BtnRunSalesCustom = $window.FindName("BtnRunSalesCustom")
$BtnRunMovements = $window.FindName("BtnRunMovements")

$ChkSyncSales = $window.FindName("ChkSyncSales")
$TxtIntervalSales = $window.FindName("TxtIntervalSales")
$ChkSyncMovements = $window.FindName("ChkSyncMovements")
$TxtIntervalMovements = $window.FindName("TxtIntervalMovements")
$ChkSyncProducts = $window.FindName("ChkSyncProducts")
$TxtIntervalProducts = $window.FindName("TxtIntervalProducts")
$ChkSyncBarcodes = $window.FindName("ChkSyncBarcodes")
$TxtIntervalBarcodes = $window.FindName("TxtIntervalBarcodes")
$ChkSyncSuppliers = $window.FindName("ChkSyncSuppliers")
$TxtIntervalSuppliers = $window.FindName("TxtIntervalSuppliers")
$ChkSyncSupplierProducts = $window.FindName("ChkSyncSupplierProducts")
$TxtIntervalSupplierProducts = $window.FindName("TxtIntervalSupplierProducts")

$BtnStartService = $window.FindName("BtnStartService")
$BtnStopService = $window.FindName("BtnStopService")
$BtnRestartService = $window.FindName("BtnRestartService")
$BtnConsoleMode = $window.FindName("BtnConsoleMode")

$TxtSqlServer = $window.FindName("TxtSqlServer")
$TxtSqlDb = $window.FindName("TxtSqlDb")
$TxtSqlUser = $window.FindName("TxtSqlUser")
$TxtSqlPass = $window.FindName("TxtSqlPass")
$BtnTestSql = $window.FindName("BtnTestSql")
$TxtSqlTestResult = $window.FindName("TxtSqlTestResult")

$TxtApiBaseUrl = $window.FindName("TxtApiBaseUrl")
$TxtFacilityId = $window.FindName("TxtFacilityId")
$BtnTestApi = $window.FindName("BtnTestApi")
$TxtApiTestResult = $window.FindName("TxtApiTestResult")

$TxtActionLog = $window.FindName("TxtActionLog")
$BtnSave = $window.FindName("BtnSave")
$BtnCancel = $window.FindName("BtnCancel")

# Helper: Actualizar estado de servicio
function Update-ServiceStatus {
    try {
        $svc = Get-Service -Name "MorpheusSyncAgent" -ErrorAction SilentlyContinue
        if ($null -eq $svc) {
            $BadgeStatus.Background = [System.Windows.Media.BrushConverter]::new().ConvertFromString("#334155")
            $LedStatus.Fill = [System.Windows.Media.BrushConverter]::new().ConvertFromString("#94A3B8")
            $TxtServiceStatus.Text = "NO INSTALADO"
        } elseif ($svc.Status -eq "Running") {
            $BadgeStatus.Background = [System.Windows.Media.BrushConverter]::new().ConvertFromString("#064E3B")
            $LedStatus.Fill = [System.Windows.Media.BrushConverter]::new().ConvertFromString("#10B981")
            $TxtServiceStatus.Text = "EN EJECUCIÓN 🟢"
        } else {
            $BadgeStatus.Background = [System.Windows.Media.BrushConverter]::new().ConvertFromString("#7F1D1D")
            $LedStatus.Fill = [System.Windows.Media.BrushConverter]::new().ConvertFromString("#EF4444")
            $TxtServiceStatus.Text = "DETENIDO 🔴"
        }
    } catch {
        $TxtServiceStatus.Text = "DESCONOCIDO"
    }
}

# Helper: Cargar marcas de agua desde sync_state.json
function Refresh-SyncStateUI {
    if (Test-Path $statePath) {
        try {
            $stateJson = Get-Content -Path $statePath -Raw -Encoding UTF8 | ConvertFrom-Json
            $LblSyncSuppliers.Text = if ($stateJson.LastProductSync) { "$($stateJson.LastProductSync)" } else { "2000-01-01 (Sin iniciar)" }
            $LblSyncProducts.Text = if ($stateJson.LastProductSync) { "$($stateJson.LastProductSync)" } else { "2000-01-01 (Sin iniciar)" }
            $LblSyncBarcodes.Text = if ($stateJson.LastBarcodeSync) { "$($stateJson.LastBarcodeSync)" } else { "2000-01-01 (Sin iniciar)" }
            $LblSyncSuppProd.Text = if ($stateJson.LastSupplierProductSync) { "$($stateJson.LastSupplierProductSync)" } else { "2000-01-01 (Sin iniciar)" }
            
            if ($stateJson.BaselineInventoryDone -eq $true) {
                $LblSyncBaseline.Text = "COMPLETADO ✅"
                $LblSyncBaseline.Foreground = [System.Windows.Media.BrushConverter]::new().ConvertFromString("#10B981")
            } else {
                $LblSyncBaseline.Text = "Pendiente ⏳"
                $LblSyncBaseline.Foreground = [System.Windows.Media.BrushConverter]::new().ConvertFromString("#F59E0B")
            }
            
            $LblSyncSales.Text = if ($stateJson.LastSalesSync) { "$($stateJson.LastSalesSync)" } else { "2000-01-01 (Sin iniciar)" }
        } catch {
            $TxtActionLog.Text = "Aviso: Error leyendo sync_state.json: $($_.Exception.Message)"
        }
    } else {
        $LblSyncSuppliers.Text = "Estado Limpio (No existe archivo)"
        $LblSyncProducts.Text = "Estado Limpio"
        $LblSyncBarcodes.Text = "Estado Limpio"
        $LblSyncSuppProd.Text = "Estado Limpio"
        $LblSyncBaseline.Text = "Pendiente (Cero)"
        $LblSyncBaseline.Foreground = [System.Windows.Media.BrushConverter]::new().ConvertFromString("#F59E0B")
        $LblSyncSales.Text = "Estado Limpio"
    }
}

# Cargar configuracion appsettings.json
function Load-SettingsUI {
    if (Test-Path $settingsPath) {
        try {
            $rawJson = Get-Content -Path $settingsPath -Raw -Encoding UTF8 | ConvertFrom-Json
            $connStr = $rawJson.ConnectionStrings.LocalSqlServer
            if ($connStr -match "Server=([^;]+)") { $TxtSqlServer.Text = $Matches[1] }
            if ($connStr -match "Database=([^;]+)") { $TxtSqlDb.Text = $Matches[1] }
            if ($connStr -match "User Id=([^;]+)") { $TxtSqlUser.Text = $Matches[1] }
            if ($connStr -match "Password=([^;]+)") { $TxtSqlPass.Password = $Matches[1] }
            
            $prodUrl = $rawJson.DirectExtractors.Products.TargetApiUrl
            if ($prodUrl -match "^(https?://[^/]+)") {
                $TxtApiBaseUrl.Text = $Matches[1]
            }
            if ($rawJson.StoreFacilityId) {
                $TxtFacilityId.Text = "$($rawJson.StoreFacilityId)"
            }
            
            # Checkboxes del servicio
            $de = $rawJson.DirectExtractors
            if ($de.Sales) { $ChkSyncSales.IsChecked = [bool]$de.Sales.Enabled; $TxtIntervalSales.Text = "$($de.Sales.IntervalMinutes)" }
            if ($de.InventoryMovements) { $ChkSyncMovements.IsChecked = [bool]$de.InventoryMovements.Enabled; $TxtIntervalMovements.Text = "$($de.InventoryMovements.IntervalMinutes)" }
            if ($de.Products) { $ChkSyncProducts.IsChecked = [bool]$de.Products.Enabled; $TxtIntervalProducts.Text = "$($de.Products.IntervalMinutes)" }
            if ($de.ProductBarcodes) { $ChkSyncBarcodes.IsChecked = [bool]$de.ProductBarcodes.Enabled; $TxtIntervalBarcodes.Text = "$($de.ProductBarcodes.IntervalMinutes)" }
            if ($de.Suppliers) { $ChkSyncSuppliers.IsChecked = [bool]$de.Suppliers.Enabled; $TxtIntervalSuppliers.Text = "$($de.Suppliers.IntervalMinutes)" }
            if ($de.SupplierProducts) { $ChkSyncSupplierProducts.IsChecked = [bool]$de.SupplierProducts.Enabled; $TxtIntervalSupplierProducts.Text = "$($de.SupplierProducts.IntervalMinutes)" }
            
            if ($de.InventoryBaseline.BaselineCutoffDate) {
                $TxtBaselineDate.Text = "$($de.InventoryBaseline.BaselineCutoffDate)"
            }
        } catch {
            $TxtActionLog.Text = "Aviso: Error cargando appsettings.json: $($_.Exception.Message)"
        }
    }
}

Update-ServiceStatus
Refresh-SyncStateUI
Load-SettingsUI

$BtnRefreshState.Add_Click({
    Refresh-SyncStateUI
    Update-ServiceStatus
})

# FASE 2: Resetear Estado Local
$BtnResetLocalState.Add_Click({
    $confirm = [System.Windows.MessageBox]::Show("¿Seguro que deseas resetear el estado local de la tienda?`n`nEsto borrará sync_state.json y morpheus_local.db para que la sincronización comience desde cero absoluto.`n(Se creará una copia de respaldo en la carpeta /backup).", "Confirmar Reset Local (Fase 2)", [System.Windows.MessageBoxButton]::YesNo, [System.Windows.MessageBoxImage]::Warning)
    
    if ($confirm -ne [System.Windows.MessageBoxResult]::Yes) { return }
    
    $svc = Get-Service -Name "MorpheusSyncAgent" -ErrorAction SilentlyContinue
    if ($svc -and $svc.Status -eq "Running") {
        [System.Windows.MessageBox]::Show("El servicio de Windows está activo. Debes detenerlo antes de resetear el estado local.", "Servicio Activo", [System.Windows.MessageBoxButton]::OK, [System.Windows.MessageBoxImage]::Stop)
        return
    }
    
    $backupDir = Join-Path $scriptDir "backup"
    if (!(Test-Path $backupDir)) { New-Item -ItemType Directory -Path $backupDir -Force | Out-Null }
    $ts = Get-Date -Format "yyyyMMdd_HHmmss"
    
    try {
        if (Test-Path $statePath) {
            Copy-Item -Path $statePath -Destination (Join-Path $backupDir "sync_state_$ts.json") -Force
            Remove-Item -Path $statePath -Force
        }
        if (Test-Path $localDbPath) {
            Copy-Item -Path $localDbPath -Destination (Join-Path $backupDir "morpheus_local_$ts.db") -Force
            Remove-Item -Path $localDbPath -Force
        }
        
        $TxtResetResult.Foreground = [System.Windows.Media.BrushConverter]::new().ConvertFromString("#10B981")
        $TxtResetResult.Text = "✅ Estado local reseteado a cero (Backup creado en /backup)"
        $TxtActionLog.Text = "[$(Get-Date -Format 'HH:mm:ss')] Fase 2 completada: Estado reseteado."
        Refresh-SyncStateUI
    } catch {
        $TxtResetResult.Foreground = [System.Windows.Media.BrushConverter]::new().ConvertFromString("#EF4444")
        $TxtResetResult.Text = "❌ Error: $($_.Exception.Message)"
    }
})

# FASE 3: Botones de Extracción a Voluntad
function Run-Extractor($workerName, $extraArgs = "") {
    $exe = Join-Path $scriptDir "MorpheusSyncAgent.exe"
    $TxtActionLog.Text = "[$(Get-Date -Format 'HH:mm:ss')] Ejecutando extractor: $workerName $extraArgs..."
    Start-Process cmd.exe -ArgumentList "/k `"`"$exe`" --run $workerName $extraArgs`""
}

$BtnRunSuppliers.Add_Click({ Run-Extractor "suppliers" })
$BtnRunProducts.Add_Click({ Run-Extractor "products" })
$BtnRunBarcodes.Add_Click({ Run-Extractor "barcodes" })
$BtnRunSupplierProducts.Add_Click({ Run-Extractor "supplier-products" })

$BtnRunBaseline.Add_Click({
    $dateArg = ""
    if ($RbBaselineCurrent.IsChecked) {
        $dateArg = "--date $((Get-Date).ToString('yyyy-MM-dd'))"
    } else {
        $dateArg = "--date $($TxtBaselineDate.Text.Trim())"
    }
    Run-Extractor "baseline" $dateArg
})

# Sincronización de Ventas con Parámetros
$BtnRunSalesCustom.Add_Click({
    $startDate = Get-Date
    if ($RbSales30Days.IsChecked) {
        $startDate = (Get-Date).AddDays(-30)
    } elseif ($RbSales3Months.IsChecked) {
        $startDate = (Get-Date).AddMonths(-3)
    } elseif ($RbSales6Months.IsChecked) {
        $startDate = (Get-Date).AddMonths(-6)
    } elseif ($RbSalesCustom.IsChecked) {
        try {
            $startDate = [DateTime]::Parse($TxtSalesCustomDate.Text.Trim())
        } catch {
            [System.Windows.MessageBox]::Show("Formato de fecha inválido. Usa AAAA-MM-DD.", "Fecha Inválida", [System.Windows.MessageBoxButton]::OK, [System.Windows.MessageBoxImage]::Error)
            return
        }
    } elseif ($RbSalesAll.IsChecked) {
        $startDate = [DateTime]::Parse("2000-01-01")
    }
    
    # Asegurar sync_state.json con la fecha de inicio deseada
    $stateObj = if (Test-Path $statePath) {
        Get-Content -Path $statePath -Raw -Encoding UTF8 | ConvertFrom-Json
    } else {
        [PSCustomObject]@{
            LastProductSync = "2000-01-01T00:00:00"
            LastBarcodeSync = "2000-01-01T00:00:00"
            BaselineInventoryDone = $true
            LastMovementSync = "2000-01-01T00:00:00"
            LastSalesSync = "2000-01-01T00:00:00"
            LastSupplierProductSync = "2000-01-01T00:00:00"
        }
    }
    
    $dateStr = $startDate.ToString("yyyy-MM-ddT00:00:00")
    $stateObj.LastSalesSync = $dateStr
    $stateObj.BaselineInventoryDone = $true # Requisito para que procese ventas
    $jsonOutput = $stateObj | ConvertTo-Json -Depth 5
    [System.IO.File]::WriteAllText($statePath, $jsonOutput, [System.Text.Encoding]::UTF8)
    
    Refresh-SyncStateUI
    $TxtActionLog.Text = "[$(Get-Date -Format 'HH:mm:ss')] Marca de ventas ajustada a: $dateStr. Iniciando extractor..."
    Run-Extractor "sales"
})

$BtnRunMovements.Add_Click({ Run-Extractor "movements" })

# Pruebas de Conexion
$BtnTestSql.Add_Click({
    $TxtSqlTestResult.Foreground = [System.Windows.Media.BrushConverter]::new().ConvertFromString("#F59E0B")
    $TxtSqlTestResult.Text = "Probando conexión..."
    $window.Dispatcher.Invoke([Action]{}, [System.Windows.Threading.DispatcherPriority]::Render)
    
    $testConn = "Server=$($TxtSqlServer.Text);Database=$($TxtSqlDb.Text);User Id=$($TxtSqlUser.Text);Password=$($TxtSqlPass.Password);TrustServerCertificate=True;Connect Timeout=5;"
    try {
        $conn = New-Object System.Data.SqlClient.SqlConnection($testConn)
        $conn.Open()
        $conn.Close()
        $TxtSqlTestResult.Foreground = [System.Windows.Media.BrushConverter]::new().ConvertFromString("#10B981")
        $TxtSqlTestResult.Text = "✅ Conexión Exitosa con SQL Server"
        $TxtActionLog.Text = "[$(Get-Date -Format 'HH:mm:ss')] Conexión SQL Server OK: $($TxtSqlServer.Text)"
    } catch {
        $TxtSqlTestResult.Foreground = [System.Windows.Media.BrushConverter]::new().ConvertFromString("#EF4444")
        $TxtSqlTestResult.Text = "❌ Error: $($_.Exception.Message)"
        $TxtActionLog.Text = "[$(Get-Date -Format 'HH:mm:ss')] Error SQL Server: $($_.Exception.Message)"
    }
})

$BtnTestApi.Add_Click({
    $TxtApiTestResult.Foreground = [System.Windows.Media.BrushConverter]::new().ConvertFromString("#F59E0B")
    $TxtApiTestResult.Text = "Probando API nube..."
    $window.Dispatcher.Invoke([Action]{}, [System.Windows.Threading.DispatcherPriority]::Render)
    
    $testUrl = "$($TxtApiBaseUrl.Text.TrimEnd('/'))/docs"
    try {
        [Net.ServicePointManager]::SecurityProtocol = [Net.SecurityProtocolType]::Tls12
        $resp = Invoke-WebRequest -Uri $testUrl -UseBasicParsing -TimeoutSec 7
        if ($resp.StatusCode -eq 200) {
            $TxtApiTestResult.Foreground = [System.Windows.Media.BrushConverter]::new().ConvertFromString("#10B981")
            $TxtApiTestResult.Text = "✅ Conexión Exitosa con Nube Morpheus"
            $TxtActionLog.Text = "[$(Get-Date -Format 'HH:mm:ss')] API Nube Responde HTTP 200 OK"
        } else {
            $TxtApiTestResult.Foreground = [System.Windows.Media.BrushConverter]::new().ConvertFromString("#EF4444")
            $TxtApiTestResult.Text = "Código HTTP: $($resp.StatusCode)"
        }
    } catch {
        $TxtApiTestResult.Foreground = [System.Windows.Media.BrushConverter]::new().ConvertFromString("#EF4444")
        $TxtApiTestResult.Text = "❌ Error: $($_.Exception.Message)"
        $TxtActionLog.Text = "[$(Get-Date -Format 'HH:mm:ss')] Error Nube: $($_.Exception.Message)"
    }
})

# Guardar Configuracion
$BtnSave.Add_Click({
    try {
        $rawJson = Get-Content -Path $settingsPath -Raw -Encoding UTF8 | ConvertFrom-Json
        $newConn = "Server=$($TxtSqlServer.Text);Database=$($TxtSqlDb.Text);User Id=$($TxtSqlUser.Text);Password=$($TxtSqlPass.Password);TrustServerCertificate=True;"
        $rawJson.ConnectionStrings.LocalSqlServer = $newConn
        
        $baseUrl = $TxtApiBaseUrl.Text.TrimEnd('/')
        $rawJson.DirectExtractors.Products.TargetApiUrl = "$baseUrl/api/v1/import/products-legacy"
        $rawJson.DirectExtractors.ProductBarcodes.TargetApiUrl = "$baseUrl/api/v1/import/products-barcodes-legacy"
        $rawJson.DirectExtractors.InventoryBaseline.TargetApiUrl = "$baseUrl/api/v1/import/inventory-baseline-legacy"
        $rawJson.DirectExtractors.InventoryMovements.TargetApiUrl = "$baseUrl/api/v1/import/inventory-movements-legacy"
        $rawJson.DirectExtractors.Sales.TargetApiUrl = "$baseUrl/api/v1/import/sales-legacy"
        $rawJson.DirectExtractors.SupplierProducts.TargetApiUrl = "$baseUrl/api/v1/import/supplier-products-legacy"
        $rawJson.DirectExtractors.Suppliers.TargetApiUrl = "$baseUrl/api/v1/import/suppliers-legacy"
        
        $rawJson.StoreFacilityId = [int]$TxtFacilityId.Text
        
        # Checkboxes de activacion del servicio continuo
        $rawJson.DirectExtractors.Sales.Enabled = [bool]$ChkSyncSales.IsChecked
        $rawJson.DirectExtractors.Sales.IntervalMinutes = [int]$TxtIntervalSales.Text
        
        $rawJson.DirectExtractors.InventoryMovements.Enabled = [bool]$ChkSyncMovements.IsChecked
        $rawJson.DirectExtractors.InventoryMovements.IntervalMinutes = [int]$TxtIntervalMovements.Text
        
        $rawJson.DirectExtractors.Products.Enabled = [bool]$ChkSyncProducts.IsChecked
        $rawJson.DirectExtractors.Products.IntervalMinutes = [int]$TxtIntervalProducts.Text
        
        $rawJson.DirectExtractors.ProductBarcodes.Enabled = [bool]$ChkSyncBarcodes.IsChecked
        $rawJson.DirectExtractors.ProductBarcodes.IntervalMinutes = [int]$TxtIntervalBarcodes.Text
        
        $rawJson.DirectExtractors.Suppliers.Enabled = [bool]$ChkSyncSuppliers.IsChecked
        $rawJson.DirectExtractors.Suppliers.IntervalMinutes = [int]$TxtIntervalSuppliers.Text
        
        $rawJson.DirectExtractors.SupplierProducts.Enabled = [bool]$ChkSyncSupplierProducts.IsChecked
        $rawJson.DirectExtractors.SupplierProducts.IntervalMinutes = [int]$TxtIntervalSupplierProducts.Text
        
        if ($TxtBaselineDate.Text) {
            $rawJson.DirectExtractors.InventoryBaseline.BaselineCutoffDate = $TxtBaselineDate.Text.Trim()
        }
        
        $newJsonStr = $rawJson | ConvertTo-Json -Depth 10
        [System.IO.File]::WriteAllText($settingsPath, $newJsonStr, [System.Text.Encoding]::UTF8)
        
        [System.Windows.MessageBox]::Show("Configuración guardada exitosamente en appsettings.json", "Guardado", [System.Windows.MessageBoxButton]::OK, [System.Windows.MessageBoxImage]::Information)
        $TxtActionLog.Text = "[$(Get-Date -Format 'HH:mm:ss')] Configuración guardada en appsettings.json"
    } catch {
        [System.Windows.MessageBox]::Show("Error al guardar: $($_.Exception.Message)", "Error", [System.Windows.MessageBoxButton]::OK, [System.Windows.MessageBoxImage]::Error)
    }
})

# Acciones del Servicio
$BtnStartService.Add_Click({
    $TxtActionLog.Text = "[$(Get-Date -Format 'HH:mm:ss')] Iniciando servicio MorpheusSyncAgent..."
    Start-Process sc.exe -ArgumentList "start MorpheusSyncAgent" -Wait -NoNewWindow
    Start-Sleep -Seconds 2
    Update-ServiceStatus
})

$BtnStopService.Add_Click({
    $TxtActionLog.Text = "[$(Get-Date -Format 'HH:mm:ss')] Deteniendo servicio MorpheusSyncAgent..."
    Start-Process sc.exe -ArgumentList "stop MorpheusSyncAgent" -Wait -NoNewWindow
    Start-Sleep -Seconds 2
    Update-ServiceStatus
})

$BtnRestartService.Add_Click({
    $TxtActionLog.Text = "[$(Get-Date -Format 'HH:mm:ss')] Reiniciando servicio..."
    Start-Process sc.exe -ArgumentList "stop MorpheusSyncAgent" -Wait -NoNewWindow
    Start-Sleep -Seconds 2
    Start-Process sc.exe -ArgumentList "start MorpheusSyncAgent" -Wait -NoNewWindow
    Start-Sleep -Seconds 2
    Update-ServiceStatus
})

$BtnConsoleMode.Add_Click({
    $exe = Join-Path $scriptDir "MorpheusSyncAgent.exe"
    Start-Process cmd.exe -ArgumentList "/k `"`"$exe`"`""
})

$BtnCancel.Add_Click({ $window.Close() })

$window.ShowDialog() | Out-Null
'''
    with open(os.path.join(build_dir, "Configurador.ps1"), "w", encoding="utf-8") as f:
        f.write(ps1_gui)

    bat_configurar = """@echo off
chcp 65001 > nul
cd /d "%~dp0"
title Morpheus Sync Agent - Configurador

net session >nul 2>&1
if %errorLevel% neq 0 (
    powershell -Command "Start-Process powershell -ArgumentList '-ExecutionPolicy Bypass -NoProfile -File \\\"%~dp0Configurador.ps1\\\"' -Verb RunAs"
    exit /b
)

powershell.exe -ExecutionPolicy Bypass -NoProfile -File "%~dp0Configurador.ps1"
"""
    with open(os.path.join(build_dir, "Configurar_Agente.bat"), "w", encoding="utf-8") as f:
        f.write(bat_configurar)

    print("[4/5] Creando scripts automatizados de gestion...")
    
    bat_install = """@echo off
chcp 65001 > nul
echo =========================================================
echo   MORPHEUS SYNC AGENT - INSTALADOR DE SERVICIO WINDOWS
echo =========================================================
echo.
net session >nul 2>&1
if %errorLevel% neq 0 (
    echo [ERROR] Este script debe ejecutarse como Administrador.
    echo Haz clic derecho sobre el archivo y selecciona:
    echo 'Ejecutar como administrador'.
    echo.
    pause
    exit /b 1
)

set INSTALL_DIR=%~dp0
if "%INSTALL_DIR:~-1%"=="\\" set INSTALL_DIR=%INSTALL_DIR:~0,-1%
set EXE_PATH=%INSTALL_DIR%\\MorpheusSyncAgent.exe

if not exist "%EXE_PATH%" (
    echo [ERROR] No se encuentra: %EXE_PATH%
    pause
    exit /b 1
)

echo [1/3] Registrando servicio Windows (Inicio Automatico, actualmente DETENIDO)...
sc stop "MorpheusSyncAgent" >nul 2>&1
timeout /t 1 /nobreak >nul
sc delete "MorpheusSyncAgent" >nul 2>&1
timeout /t 1 /nobreak >nul

sc create "MorpheusSyncAgent" binPath= "\\"%EXE_PATH%\\"" start= auto DisplayName= "Morpheus Sync Agent"
if %errorLevel% neq 0 (
    echo [ERROR] Fallo la creacion del servicio.
    pause
    exit /b 1
)

sc description "MorpheusSyncAgent" "Agente de sincronizacion en tiempo real de Morpheus ERP / WMS"
sc failure "MorpheusSyncAgent" reset= 86400 actions= restart/60000/restart/60000/restart/60000

echo [2/3] Creando acceso directo en el Escritorio...
powershell -Command "$ws = New-Object -ComObject WScript.Shell; $s = $ws.CreateShortcut(\"$([Environment]::GetFolderPath('Desktop'))\\Morpheus - Configurar Agente.lnk\"); $s.TargetPath = '%INSTALL_DIR%\\Configurar_Agente.bat'; $s.WorkingDirectory = '%INSTALL_DIR%'; $s.Save()" >nul 2>&1

echo [3/3] Servicio registrado exitosamente.
echo.
echo =========================================================
echo NOTA: El servicio ha quedado DETENIDO intencionalmente
echo para permitirte realizar tus copias previas y la Carga Inicial.
echo.
echo Puedes iniciar el panel visual con 'Configurar_Agente.bat'
echo o desde el acceso directo creado en tu Escritorio.
echo =========================================================
echo.
pause
"""
    with open(os.path.join(build_dir, "Instalar_Servicio.bat"), "w", encoding="utf-8") as f:
        f.write(bat_install)

    bat_carga = """@echo off
chcp 65001 > nul
cd /d "%~dp0"
echo =========================================================
echo   MORPHEUS SYNC AGENT - CARGA INICIAL DE DATOS MAESTROS
echo =========================================================
echo.
echo Este proceso enviara la semilla inicial desde el POS hacia Morpheus QA:
echo   1. Proveedores (Suppliers)
echo   2. Maestro de Productos y Variantes (Products)
echo   3. Codigos de Barra Alternativos (Barcodes)
echo   4. Cruces Proveedor-Producto (Supplier-Products)
echo   5. Inventario Inicial (Baseline)
echo.
echo Pulsa cualquier tecla para comenzar...
pause > nul

echo.
echo =========================================================
echo [1/5] Extrayendo y enviando PROVEEDORES...
echo =========================================================
MorpheusSyncAgent.exe --run suppliers
timeout /t 2 /nobreak >nul

echo.
echo =========================================================
echo [2/5] Extrayendo y enviando PRODUCTOS Y VARIANTES...
echo =========================================================
MorpheusSyncAgent.exe --run products
timeout /t 2 /nobreak >nul

echo.
echo =========================================================
echo [3/5] Extrayendo y enviando CODIGOS DE BARRA ALTERNATIVOS...
echo =========================================================
MorpheusSyncAgent.exe --run barcodes
timeout /t 2 /nobreak >nul

echo.
echo =========================================================
echo [4/5] Extrayendo y enviando CRUCES PROVEEDOR-PRODUCTO...
echo =========================================================
MorpheusSyncAgent.exe --run supplier-products
timeout /t 2 /nobreak >nul

echo.
echo =========================================================
echo [5/5] Extrayendo y enviando INVENTARIO INICIAL (BASELINE)...
echo =========================================================
MorpheusSyncAgent.exe --run baseline
timeout /t 2 /nobreak >nul

echo.
echo =========================================================
echo   ¡CARGA INICIAL DE MAESTROS FINALIZADA!
echo =========================================================
echo Ahora puedes iniciar el servicio continuo desde la interfaz visual
echo o haciendo doble clic en '2_Iniciar_Servicio.bat'.
echo.
pause
"""
    with open(os.path.join(build_dir, "1_Carga_Inicial_Maestros.bat"), "w", encoding="utf-8") as f:
        f.write(bat_carga)

    bat_start = """@echo off
chcp 65001 > nul
net session >nul 2>&1
if %errorLevel% neq 0 (
    echo [ERROR] Ejecutar como Administrador.
    pause
    exit /b 1
)
echo Iniciando servicio MorpheusSyncAgent...
sc start "MorpheusSyncAgent"
echo.
sc query "MorpheusSyncAgent"
echo.
pause
"""
    with open(os.path.join(build_dir, "2_Iniciar_Servicio.bat"), "w", encoding="utf-8") as f:
        f.write(bat_start)

    bat_stop = """@echo off
chcp 65001 > nul
net session >nul 2>&1
if %errorLevel% neq 0 (
    echo [ERROR] Ejecutar como Administrador.
    pause
    exit /b 1
)
echo Deteniendo servicio MorpheusSyncAgent...
sc stop "MorpheusSyncAgent"
echo.
sc query "MorpheusSyncAgent"
echo.
pause
"""
    with open(os.path.join(build_dir, "3_Detener_Servicio.bat"), "w", encoding="utf-8") as f:
        f.write(bat_stop)

    bat_console = """@echo off
chcp 65001 > nul
cd /d "%~dp0"
echo =========================================================
echo   EJECUTANDO MORPHEUS SYNC AGENT EN CONSOLA
echo   (Modo de prueba en vivo. Presiona Ctrl + C para salir)
echo =========================================================
echo.
MorpheusSyncAgent.exe
pause
"""
    with open(os.path.join(build_dir, "4_Probar_En_Consola.bat"), "w", encoding="utf-8") as f:
        f.write(bat_console)

    bat_uninstall = """@echo off
chcp 65001 > nul
net session >nul 2>&1
if %errorLevel% neq 0 (
    echo [ERROR] Ejecutar como Administrador.
    pause
    exit /b 1
)
echo Deteniendo y eliminando servicio MorpheusSyncAgent...
sc stop "MorpheusSyncAgent" >nul 2>&1
timeout /t 2 /nobreak >nul
sc delete "MorpheusSyncAgent"
del /f /q "$([Environment]::GetFolderPath('Desktop'))\\Morpheus - Configurar Agente.lnk" >nul 2>&1
echo.
echo Servicio desinstalado exitosamente.
pause
"""
    with open(os.path.join(build_dir, "5_Desinstalar_Servicio.bat"), "w", encoding="utf-8") as f:
        f.write(bat_uninstall)

    readme = """===========================================================
  GUIA RAPIDA: MORPHEUS SYNC AGENT (WINDOWS)
===========================================================

REQUISITOS:
- Windows 10, 11 o Windows Server (64 bits).
- Acceso a la base de datos SQL Server (VAD10).
- NO requiere instalar .NET (es auto-contenido).

FORMAS DE USO:

1. PANEL DE CONTROL VISUAL:
   Haz doble clic sobre 'Configurar_Agente.bat' (o el icono en tu Escritorio).
   Desde alli podras:
   - Resetear el estado local con 1 clic (Fase 2).
   - Ejecutar la Carga de Maestros a voluntad paso a paso (Fase 3).
   - Elegir cargar inventario al momento actual o con fecha de corte.
   - Sincronizar ventas de 30 dias, 3 meses, 6 meses o fecha personalizada.
   - Marcar qué extractores debe sincronizar el Servicio de Windows.
   - Probar conexion a SQL Server y a la nube con 1 clic.
   - Iniciar, detener o reiniciar el servicio cuando desees.

===========================================================
"""
    with open(os.path.join(build_dir, "README_INSTALACION.txt"), "w", encoding="utf-8") as f:
        f.write(readme)

    print("[5/5] Empaquetando instalador final en ZIP...")
    dest_zip = os.path.join(static_dir, "MorpheusSyncAgent_Installer.zip")
    with zipfile.ZipFile(dest_zip, "w", zipfile.ZIP_DEFLATED) as z:
        for filename in sorted(os.listdir(build_dir)):
            filepath = os.path.join(build_dir, filename)
            z.write(filepath, filename)
            print(f"  -> Incluido: {filename} ({os.path.getsize(filepath):,} bytes)")

    # Actualizar script powershell para instalacion desatendida
    ps1_content = """# Script de Instalacion Rapida Morpheus Sync Agent
$ErrorActionPreference = "Stop"
$zipUrl = "https://api.qa.morpheussoft.net/static/MorpheusSyncAgent_Installer.zip"
$destDir = "C:\\MorpheusSyncAgent"
$tempZip = "$env:TEMP\\MorpheusSyncAgent_Installer.zip"

Write-Host "=========================================================" -ForegroundColor Cyan
Write-Host "  DESCARGANDO E INSTALANDO MORPHEUS SYNC AGENT" -ForegroundColor Cyan
Write-Host "=========================================================" -ForegroundColor Cyan

Write-Host "`n[1/4] Descargando paquete oficial..." -ForegroundColor Yellow
[Net.ServicePointManager]::SecurityProtocol = [Net.SecurityProtocolType]::Tls12
Invoke-WebRequest -Uri $zipUrl -OutFile $tempZip

Write-Host "[2/4] Descomprimiendo en $destDir..." -ForegroundColor Yellow
if (!(Test-Path $destDir)) {
    New-Item -ItemType Directory -Path $destDir -Force | Out-Null
}
Expand-Archive -Path $tempZip -DestinationPath $destDir -Force
Remove-Item $tempZip -Force

Write-Host "[3/4] Registrando servicio Windows (Quedara DETENIDO hasta que decidas iniciarlo)..." -ForegroundColor Yellow
$exePath = "$destDir\\MorpheusSyncAgent.exe"

sc.exe stop "MorpheusSyncAgent" 2>$null
Start-Sleep -Seconds 2
sc.exe delete "MorpheusSyncAgent" 2>$null
Start-Sleep -Seconds 1

sc.exe create "MorpheusSyncAgent" binPath= "`"$exePath`"" start= auto DisplayName= "Morpheus Sync Agent"
sc.exe description "MorpheusSyncAgent" "Agente de sincronizacion en tiempo real de Morpheus ERP / WMS"
sc.exe failure "MorpheusSyncAgent" reset= 86400 actions= restart/60000/restart/60000/restart/60000

Write-Host "[4/4] Creando acceso directo en el Escritorio..." -ForegroundColor Yellow
$ws = New-Object -ComObject WScript.Shell
$desktop = [Environment]::GetFolderPath('Desktop')
$shortcut = $ws.CreateShortcut("$desktop\\Morpheus - Configurar Agente.lnk")
$shortcut.TargetPath = "$destDir\\Configurar_Agente.bat"
$shortcut.WorkingDirectory = "$destDir"
$shortcut.Save()

Write-Host "`n=========================================================" -ForegroundColor Green
Write-Host "  ¡INSTALACION Y REGISTRO COMPLETADOS CON EXITO!" -ForegroundColor Green
Write-Host "  El servicio esta registrado y DETENIDO." -ForegroundColor Green
Write-Host "  Acceso directo creado: 'Morpheus - Configurar Agente'" -ForegroundColor Green
Write-Host "=========================================================" -ForegroundColor Green
Write-Host "`nIniciando el panel de configuracion visual..." -ForegroundColor Cyan
Start-Process "$destDir\\Configurar_Agente.bat"
"""
    with open(os.path.join(static_dir, "instalar.ps1"), "w", encoding="utf-8") as f:
        f.write(ps1_content)

    print(f"\n[OK] Instalador empaquetado: {dest_zip} ({os.path.getsize(dest_zip):,} bytes)")
    print(f"[OK] Script PowerShell generado: {os.path.join(static_dir, 'instalar.ps1')}")

if __name__ == "__main__":
    build_installer()
