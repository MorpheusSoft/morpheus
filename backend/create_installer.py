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
                "Enabled": True,
                "IntervalMinutes": 60,
                "TargetApiUrl": "https://api.qa.morpheussoft.net/api/v1/import/products-legacy",
                "ExportMode": "OnlyWithStock"
            },
            "ProductBarcodes": {
                "Enabled": True,
                "IntervalMinutes": 60,
                "TargetApiUrl": "https://api.qa.morpheussoft.net/api/v1/import/products-barcodes-legacy",
                "ExportMode": "OnlyWithStock"
            },
            "InventoryBaseline": {
                "Enabled": True,
                "IntervalMinutes": 60,
                "TargetApiUrl": "https://api.qa.morpheussoft.net/api/v1/import/inventory-baseline-legacy",
                "BaselineCutoffDate": "2026-06-07"
            },
            "InventoryMovements": {
                "Enabled": True,
                "IntervalMinutes": 10,
                "TargetApiUrl": "https://api.qa.morpheussoft.net/api/v1/import/inventory-movements-legacy"
            },
            "Sales": {
                "Enabled": True,
                "IntervalMinutes": 10,
                "TargetApiUrl": "https://api.qa.morpheussoft.net/api/v1/import/sales-legacy"
            },
            "SupplierProducts": {
                "Enabled": True,
                "IntervalMinutes": 30,
                "TargetApiUrl": "https://api.qa.morpheussoft.net/api/v1/import/supplier-products-legacy"
            },
            "Suppliers": {
                "Enabled": True,
                "IntervalMinutes": 60,
                "TargetApiUrl": "https://api.qa.morpheussoft.net/api/v1/import/suppliers-legacy"
            }
        },
        "StoreFacilityId": 1
    }

    with open(os.path.join(build_dir, "appsettings.json"), "w", encoding="utf-8") as f:
        json.dump(appsettings, f, indent=2)

    print("[3/5] Generando Interfaz Grafica de Configuracion (WPF/PowerShell)...")
    
    ps1_gui = '''Add-Type -AssemblyName PresentationFramework, PresentationCore, WindowsBase, System.Drawing, System.Windows.Forms

$scriptDir = Split-Path -Parent $MyInvocation.MyCommand.Definition
$settingsPath = Join-Path $scriptDir "appsettings.json"

[xml]$xaml = @"
<Window xmlns="http://schemas.microsoft.com/winfx/2006/xaml/presentation"
        xmlns:x="http://schemas.microsoft.com/winfx/2006/xaml"
        Title="Morpheus Sync Agent - Panel de Configuración y Control" 
        Height="730" Width="850" 
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
            <Setter Property="Padding" Value="10,8"/>
            <Setter Property="FontSize" Value="13"/>
        </Style>
        <Style TargetType="PasswordBox">
            <Setter Property="Background" Value="#1E293B"/>
            <Setter Property="Foreground" Value="#F8FAFC"/>
            <Setter Property="BorderBrush" Value="#334155"/>
            <Setter Property="BorderThickness" Value="1"/>
            <Setter Property="Padding" Value="10,8"/>
            <Setter Property="FontSize" Value="13"/>
        </Style>
    </Window.Resources>
    
    <Grid Margin="24">
        <Grid.RowDefinitions>
            <RowDefinition Height="Auto"/>
            <RowDefinition Height="*"/>
            <RowDefinition Height="Auto"/>
        </Grid.RowDefinitions>
        
        <!-- Header -->
        <Border Grid.Row="0" Background="#1E293B" CornerRadius="12" Padding="20,16" Margin="0,0,0,16" BorderBrush="#334155" BorderThickness="1">
            <Grid>
                <Grid.ColumnDefinitions>
                    <ColumnDefinition Width="*"/>
                    <ColumnDefinition Width="Auto"/>
                </Grid.ColumnDefinitions>
                <StackPanel Grid.Column="0">
                    <StackPanel Orientation="Horizontal" VerticalAlignment="Center">
                        <Border Background="#6366F1" CornerRadius="8" Width="36" Height="36" Margin="0,0,12,0">
                            <TextBlock Text="⚡" FontSize="18" HorizontalAlignment="Center" VerticalAlignment="Center"/>
                        </Border>
                        <StackPanel>
                            <TextBlock Text="Morpheus Sync Agent" FontSize="20" FontWeight="Bold" Foreground="#FFFFFF"/>
                            <TextBlock Text="Panel de Configuración y Enlace Tienda ➔ Nube" FontSize="12" Foreground="#94A3B8"/>
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
            <!-- TAB 1: Base de Datos Local -->
            <TabItem Header="🗄️ SQL Server (POS Local)">
                <Border Background="#1E293B" CornerRadius="12" Padding="24" Margin="0,16,0,0" BorderBrush="#334155" BorderThickness="1">
                    <ScrollViewer VerticalScrollBarVisibility="Auto">
                        <StackPanel>
                            <TextBlock Text="Conexión a la Base de Datos del POS (VAD10 / VAD20)" FontSize="15" FontWeight="Bold" Foreground="#FFFFFF" Margin="0,0,0,4"/>
                            <TextBlock Text="Credenciales de acceso local para extraer catálogo, inventario y ventas." FontSize="12" Foreground="#94A3B8" Margin="0,0,0,16"/>
                            
                            <Grid Margin="0,0,0,12">
                                <Grid.ColumnDefinitions>
                                    <ColumnDefinition Width="180"/>
                                    <ColumnDefinition Width="*"/>
                                </Grid.ColumnDefinitions>
                                <TextBlock Grid.Column="0" Text="Servidor / Instancia:" VerticalAlignment="Center" FontWeight="SemiBold" Foreground="#CBD5E1"/>
                                <TextBox Grid.Column="1" Name="TxtSqlServer" Text="AGUERREVERE\SRVAGUERREVERE"/>
                            </Grid>
                            
                            <Grid Margin="0,0,0,12">
                                <Grid.ColumnDefinitions>
                                    <ColumnDefinition Width="180"/>
                                    <ColumnDefinition Width="*"/>
                                </Grid.ColumnDefinitions>
                                <TextBlock Grid.Column="0" Text="Base de Datos:" VerticalAlignment="Center" FontWeight="SemiBold" Foreground="#CBD5E1"/>
                                <TextBox Grid.Column="1" Name="TxtSqlDb" Text="VAD10"/>
                            </Grid>
                            
                            <Grid Margin="0,0,0,12">
                                <Grid.ColumnDefinitions>
                                    <ColumnDefinition Width="180"/>
                                    <ColumnDefinition Width="*"/>
                                </Grid.ColumnDefinitions>
                                <TextBlock Grid.Column="0" Text="Usuario SQL:" VerticalAlignment="Center" FontWeight="SemiBold" Foreground="#CBD5E1"/>
                                <TextBox Grid.Column="1" Name="TxtSqlUser" Text="jqFydZPO"/>
                            </Grid>
                            
                            <Grid Margin="0,0,0,18">
                                <Grid.ColumnDefinitions>
                                    <ColumnDefinition Width="180"/>
                                    <ColumnDefinition Width="*"/>
                                </Grid.ColumnDefinitions>
                                <TextBlock Grid.Column="0" Text="Contraseña SQL:" VerticalAlignment="Center" FontWeight="SemiBold" Foreground="#CBD5E1"/>
                                <PasswordBox Grid.Column="1" Name="TxtSqlPass"/>
                            </Grid>
                            
                            <StackPanel Orientation="Horizontal">
                                <Button Name="BtnTestSql" Content="🔍 Probar Conexión SQL" Background="#334155" Foreground="#FFFFFF" FontWeight="SemiBold" Padding="16,9" Cursor="Hand" BorderThickness="0"/>
                                <TextBlock Name="TxtSqlTestResult" Text="" VerticalAlignment="Center" Margin="16,0,0,0" FontSize="12" FontWeight="SemiBold"/>
                            </StackPanel>
                        </StackPanel>
                    </ScrollViewer>
                </Border>
            </TabItem>
            
            <!-- TAB 2: Nube Morpheus -->
            <TabItem Header="☁️ Nube Morpheus">
                <Border Background="#1E293B" CornerRadius="12" Padding="24" Margin="0,16,0,0" BorderBrush="#334155" BorderThickness="1">
                    <ScrollViewer VerticalScrollBarVisibility="Auto">
                        <StackPanel>
                            <TextBlock Text="Destino de la Información en la Nube" FontSize="15" FontWeight="Bold" Foreground="#FFFFFF" Margin="0,0,0,4"/>
                            <TextBlock Text="Configura el servidor central de Morpheus y el código de esta sucursal." FontSize="12" Foreground="#94A3B8" Margin="0,0,0,16"/>
                            
                            <Grid Margin="0,0,0,12">
                                <Grid.ColumnDefinitions>
                                    <ColumnDefinition Width="180"/>
                                    <ColumnDefinition Width="*"/>
                                </Grid.ColumnDefinitions>
                                <TextBlock Grid.Column="0" Text="URL Base de la API:" VerticalAlignment="Center" FontWeight="SemiBold" Foreground="#CBD5E1"/>
                                <TextBox Grid.Column="1" Name="TxtApiBaseUrl" Text="https://api.qa.morpheussoft.net"/>
                            </Grid>
                            
                            <Grid Margin="0,0,0,18">
                                <Grid.ColumnDefinitions>
                                    <ColumnDefinition Width="180"/>
                                    <ColumnDefinition Width="*"/>
                                </Grid.ColumnDefinitions>
                                <TextBlock Grid.Column="0" Text="ID de Sucursal (Facility ID):" VerticalAlignment="Center" FontWeight="SemiBold" Foreground="#CBD5E1"/>
                                <TextBox Grid.Column="1" Name="TxtFacilityId" Text="1" Width="100" HorizontalAlignment="Left"/>
                            </Grid>
                            
                            <StackPanel Orientation="Horizontal">
                                <Button Name="BtnTestApi" Content="🌐 Probar Conexión Nube" Background="#334155" Foreground="#FFFFFF" FontWeight="SemiBold" Padding="16,9" Cursor="Hand" BorderThickness="0"/>
                                <TextBlock Name="TxtApiTestResult" Text="" VerticalAlignment="Center" Margin="16,0,0,0" FontSize="12" FontWeight="SemiBold"/>
                            </StackPanel>
                        </StackPanel>
                    </ScrollViewer>
                </Border>
            </TabItem>
            
            <!-- TAB 3: Control y Acciones -->
            <TabItem Header="⚡ Control del Servicio">
                <Border Background="#1E293B" CornerRadius="12" Padding="24" Margin="0,16,0,0" BorderBrush="#334155" BorderThickness="1">
                    <StackPanel>
                        <TextBlock Text="Gestión del Servicio Windows en Segundo Plano" FontSize="15" FontWeight="Bold" Foreground="#FFFFFF" Margin="0,0,0,4"/>
                        <TextBlock Text="El servicio sincroniza automáticamente las ventas y movimientos continuos." FontSize="12" Foreground="#94A3B8" Margin="0,0,0,16"/>
                        
                        <WrapPanel Margin="0,0,0,16">
                            <Button Name="BtnStartService" Content="▶️ Iniciar Servicio" Background="#10B981" Foreground="#FFFFFF" FontWeight="Bold" Padding="16,9" Margin="0,0,10,10" Cursor="Hand" BorderThickness="0"/>
                            <Button Name="BtnStopService" Content="⏹️ Detener Servicio" Background="#EF4444" Foreground="#FFFFFF" FontWeight="Bold" Padding="16,9" Margin="0,0,10,10" Cursor="Hand" BorderThickness="0"/>
                            <Button Name="BtnRestartService" Content="🔄 Reiniciar Servicio" Background="#3B82F6" Foreground="#FFFFFF" FontWeight="Bold" Padding="16,9" Margin="0,0,10,10" Cursor="Hand" BorderThickness="0"/>
                            <Button Name="BtnConsoleMode" Content="🖥️ Probar en Consola" Background="#64748B" Foreground="#FFFFFF" FontWeight="Bold" Padding="16,9" Margin="0,0,10,10" Cursor="Hand" BorderThickness="0"/>
                        </WrapPanel>
                        
                        <TextBlock Text="Carga Inicial y Envíos Manuales:" FontSize="14" FontWeight="Bold" Foreground="#FFFFFF" Margin="0,6,0,8"/>
                        
                        <WrapPanel Margin="0,0,0,10">
                            <Button Name="BtnRunAll" Content="📦 Carga Inicial Completa (Maestros)" Background="#6366F1" Foreground="#FFFFFF" FontWeight="Bold" Padding="16,9" Margin="0,0,10,8" Cursor="Hand" BorderThickness="0"/>
                            <Button Name="BtnRunSuppliers" Content="Proveedores" Background="#334155" Foreground="#CBD5E1" FontWeight="SemiBold" Padding="12,8" Margin="0,0,8,8" Cursor="Hand" BorderThickness="0"/>
                            <Button Name="BtnRunProducts" Content="Productos" Background="#334155" Foreground="#CBD5E1" FontWeight="SemiBold" Padding="12,8" Margin="0,0,8,8" Cursor="Hand" BorderThickness="0"/>
                            <Button Name="BtnRunBarcodes" Content="Códigos de Barra" Background="#334155" Foreground="#CBD5E1" FontWeight="SemiBold" Padding="12,8" Margin="0,0,8,8" Cursor="Hand" BorderThickness="0"/>
                            <Button Name="BtnRunSupplierProducts" Content="Costos &amp; Cruces" Background="#334155" Foreground="#CBD5E1" FontWeight="SemiBold" Padding="12,8" Margin="0,0,8,8" Cursor="Hand" BorderThickness="0"/>
                            <Button Name="BtnRunBaseline" Content="Inventario Inicial" Background="#334155" Foreground="#CBD5E1" FontWeight="SemiBold" Padding="12,8" Margin="0,0,8,8" Cursor="Hand" BorderThickness="0"/>
                            <Button Name="BtnRunSales" Content="Ventas Recientes" Background="#334155" Foreground="#CBD5E1" FontWeight="SemiBold" Padding="12,8" Margin="0,0,8,8" Cursor="Hand" BorderThickness="0"/>
                        </WrapPanel>
                        
                        <Border Background="#0B0F19" CornerRadius="8" Padding="12" Margin="0,8,0,0" BorderBrush="#1E293B" BorderThickness="1">
                            <TextBlock Name="TxtActionLog" Text="Listo para operar." FontSize="11" Foreground="#64748B" FontFamily="Consolas"/>
                        </Border>
                    </StackPanel>
                </Border>
            </TabItem>
        </TabControl>
        
        <!-- Footer -->
        <Border Grid.Row="2" Margin="0,16,0,0">
            <Grid>
                <Grid.ColumnDefinitions>
                    <ColumnDefinition Width="*"/>
                    <ColumnDefinition Width="Auto"/>
                </Grid.ColumnDefinitions>
                
                <TextBlock Grid.Column="0" Text="Morpheus ERP Sync Service v1.0.0" VerticalAlignment="Center" FontSize="11" Foreground="#64748B"/>
                
                <StackPanel Grid.Column="1" Orientation="Horizontal">
                    <Button Name="BtnCancel" Content="Cerrar" Background="#334155" Foreground="#CBD5E1" FontWeight="SemiBold" Padding="18,9" Margin="0,0,12,0" Cursor="Hand" BorderThickness="0"/>
                    <Button Name="BtnSave" Content="💾 Guardar Cambios" Background="#6366F1" Foreground="#FFFFFF" FontWeight="Bold" Padding="22,9" Cursor="Hand" BorderThickness="0"/>
                </StackPanel>
            </Grid>
        </Border>
    </Grid>
</Window>
"@

$reader = (New-Object System.Xml.XmlNodeReader $xaml)
$window = [Windows.Markup.XamlReader]::Load($reader)

# Controles
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

$BadgeStatus = $window.FindName("BadgeStatus")
$LedStatus = $window.FindName("LedStatus")
$TxtServiceStatus = $window.FindName("TxtServiceStatus")

$BtnStartService = $window.FindName("BtnStartService")
$BtnStopService = $window.FindName("BtnStopService")
$BtnRestartService = $window.FindName("BtnRestartService")
$BtnConsoleMode = $window.FindName("BtnConsoleMode")

$BtnRunAll = $window.FindName("BtnRunAll")
$BtnRunSuppliers = $window.FindName("BtnRunSuppliers")
$BtnRunProducts = $window.FindName("BtnRunProducts")
$BtnRunBarcodes = $window.FindName("BtnRunBarcodes")
$BtnRunSupplierProducts = $window.FindName("BtnRunSupplierProducts")
$BtnRunBaseline = $window.FindName("BtnRunBaseline")
$BtnRunSales = $window.FindName("BtnRunSales")

$TxtActionLog = $window.FindName("TxtActionLog")
$BtnSave = $window.FindName("BtnSave")
$BtnCancel = $window.FindName("BtnCancel")

# Funcion para actualizar el estado del servicio
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

# Cargar configuracion actual
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
    } catch {
        $TxtActionLog.Text = "Aviso: No se pudo parsear appsettings.json: $($_.Exception.Message)"
    }
}

Update-ServiceStatus

# Evento: Probar SQL
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

# Evento: Probar API Nube
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

# Evento: Guardar Cambios
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
        
        $newJsonStr = $rawJson | ConvertTo-Json -Depth 10
        [System.IO.File]::WriteAllText($settingsPath, $newJsonStr, [System.Text.Encoding]::UTF8)
        
        [System.Windows.MessageBox]::Show("Configuración guardada exitosamente en appsettings.json", "Guardado", [System.Windows.MessageBoxButton]::OK, [System.Windows.MessageBoxImage]::Information)
        $TxtActionLog.Text = "[$(Get-Date -Format 'HH:mm:ss')] Configuración guardada en appsettings.json"
    } catch {
        [System.Windows.MessageBox]::Show("Error al guardar: $($_.Exception.Message)", "Error", [System.Windows.MessageBoxButton]::OK, [System.Windows.MessageBoxImage]::Error)
    }
})

# Acciones de Servicio
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

# Acciones de Extraccion Manual
function Run-Extractor($workerName) {
    $exe = Join-Path $scriptDir "MorpheusSyncAgent.exe"
    $TxtActionLog.Text = "[$(Get-Date -Format 'HH:mm:ss')] Ejecutando extractor: $workerName..."
    Start-Process cmd.exe -ArgumentList "/k `"`"$exe`" --run $workerName`""
}

$BtnRunSuppliers.Add_Click({ Run-Extractor "suppliers" })
$BtnRunProducts.Add_Click({ Run-Extractor "products" })
$BtnRunBarcodes.Add_Click({ Run-Extractor "barcodes" })
$BtnRunSupplierProducts.Add_Click({ Run-Extractor "supplier-products" })
$BtnRunBaseline.Add_Click({ Run-Extractor "baseline" })
$BtnRunSales.Add_Click({ Run-Extractor "sales" })

$BtnRunAll.Add_Click({
    $bat = Join-Path $scriptDir "1_Carga_Inicial_Maestros.bat"
    $TxtActionLog.Text = "[$(Get-Date -Format 'HH:mm:ss')] Ejecutando Carga Inicial Completa..."
    Start-Process cmd.exe -ArgumentList "/k `"`"$bat`"`""
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

echo [1/4] Deteniendo servicio previo si existe...
sc stop "MorpheusSyncAgent" >nul 2>&1
timeout /t 2 /nobreak >nul

echo [2/4] Registrando servicio Windows...
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

echo [3/4] Creando acceso directo en el Escritorio...
powershell -Command "$ws = New-Object -ComObject WScript.Shell; $s = $ws.CreateShortcut(\"$([Environment]::GetFolderPath('Desktop'))\\Morpheus - Configurar Agente.lnk\"); $s.TargetPath = '%INSTALL_DIR%\\Configurar_Agente.bat'; $s.WorkingDirectory = '%INSTALL_DIR%'; $s.Save()" >nul 2>&1

echo [4/4] Servicio instalado exitosamente con inicio automatico.
echo.
echo =========================================================
echo ¡LISTO!
echo Se ha creado el acceso directo 'Morpheus - Configurar Agente'
echo en tu Escritorio para abrir la interfaz visual en cualquier momento.
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
echo Ahora puedes iniciar el servicio de fondo con '2_Iniciar_Servicio.bat'
echo o directamente desde la interfaz visual 'Configurar_Agente.bat'.
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
   - Probar la conexion a SQL Server con 1 clic.
   - Probar la conexion con la Nube Morpheus con 1 clic.
   - Guardar cambios en appsettings.json comodamente.
   - Iniciar, detener o reiniciar el Servicio de Windows.
   - Disparar la Carga Inicial de datos o sincronizaciones manuales.

2. ASISTENTE RAPIDO POR CONSOLA:
   - '1_Carga_Inicial_Maestros.bat': Envia proveedores, productos, barras, costos y baseline.
   - 'Instalar_Servicio.bat': Registra el Servicio de Windows de inicio automatico.
   - '2_Iniciar_Servicio.bat': Enciende el servicio en segundo plano.

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

    # Actualizar script powershell para instalacion en un solo paso
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

Write-Host "[3/4] Registrando servicio Windows con inicio automatico..." -ForegroundColor Yellow
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
Write-Host "  ¡INSTALACION Y CONFIGURACION COMPLETADAS!" -ForegroundColor Green
Write-Host "  Acceso directo creado en tu Escritorio: 'Morpheus - Configurar Agente'" -ForegroundColor Green
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
