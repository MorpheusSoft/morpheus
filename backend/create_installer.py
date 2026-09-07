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
    scripts_dir = os.path.join(build_dir, "scripts")
    os.makedirs(scripts_dir, exist_ok=True)

    print("[1/6] Extrayendo ejecutable base...")
    with zipfile.ZipFile(src_zip, "r") as z:
        with open(os.path.join(build_dir, "MorpheusSyncAgent.exe"), "wb") as f:
            f.write(z.read("msync.exe"))

    print("[2/6] Generando appsettings.json base preconfigurado...")
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

    print("[3/6] Generando Asistente Grafico de Instalacion para Tiendas (Instalador_Tienda.ps1)...")
    # Generar Instalador_Tienda.ps1 con codificación limpia y segura
    ps1_installer = '''Add-Type -AssemblyName PresentationFramework, PresentationCore, WindowsBase, System.Drawing, System.Windows.Forms

$scriptDir = Split-Path -Parent $MyInvocation.MyCommand.Definition
$settingsPath = Join-Path $scriptDir "appsettings.json"

[xml]$xaml = @"
<Window xmlns="http://schemas.microsoft.com/winfx/2006/xaml/presentation"
        xmlns:x="http://schemas.microsoft.com/winfx/2006/xaml"
        Title="Morpheus ERP - Asistente de Instalacion en Tiendas" 
        Height="690" Width="760" 
        WindowStartupLocation="CenterScreen" 
        Background="#0F172A" Foreground="#F8FAFC"
        FontFamily="Segoe UI" ResizeMode="CanMinimize">
    <Window.Resources>
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
        <Style TargetType="ComboBox">
            <Setter Property="Background" Value="#1E293B"/>
            <Setter Property="Foreground" Value="#0F172A"/>
            <Setter Property="Padding" Value="6,4"/>
            <Setter Property="FontSize" Value="12"/>
        </Style>
        <Style TargetType="CheckBox">
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
                    <TextBlock Text="Morpheus Sync Agent" FontSize="20" FontWeight="Bold" Foreground="#FFFFFF"/>
                    <TextBlock Text="Asistente de Instalacion y Configuracion para Tiendas y Sucursales" FontSize="12" Foreground="#94A3B8" Margin="0,2,0,0"/>
                </StackPanel>
                <Border Grid.Column="1" Background="#0284C7" CornerRadius="8" Padding="12,6" VerticalAlignment="Center">
                    <TextBlock Text="Instalador de Tiendas" FontSize="11" FontWeight="Bold" Foreground="#FFFFFF"/>
                </Border>
            </Grid>
        </Border>

        <!-- Form Body -->
        <Border Grid.Row="1" Background="#1E293B" CornerRadius="12" Padding="20" BorderBrush="#334155" BorderThickness="1">
            <ScrollViewer VerticalScrollBarVisibility="Auto">
                <StackPanel>
                    <!-- Paso 1: Seleccion de Tienda -->
                    <Border Background="#0F172A" CornerRadius="10" Padding="16" Margin="0,0,0,14" BorderBrush="#334155" BorderThickness="1">
                        <StackPanel>
                            <TextBlock Text="PASO 1: SELECCION DE SUCURSAL / TIENDA" FontSize="13" FontWeight="Bold" Foreground="#38BDF8" Margin="0,0,0,6"/>
                            <TextBlock Text="Indica en que tienda se esta ejecutando esta instalacion para vincular las ventas e inventario al recinto correcto:" FontSize="11" Foreground="#94A3B8" TextWrapping="Wrap" Margin="0,0,0,10"/>
                            
                            <Grid Margin="0,0,0,8">
                                <Grid.ColumnDefinitions>
                                    <ColumnDefinition Width="160"/>
                                    <ColumnDefinition Width="*"/>
                                </Grid.ColumnDefinitions>
                                <TextBlock Grid.Column="0" Text="Tienda a Instalar:" VerticalAlignment="Center" FontWeight="SemiBold" Foreground="#CBD5E1"/>
                                <ComboBox Grid.Column="1" Name="CmbStores" Height="32"/>
                            </Grid>
                            
                            <StackPanel Name="PnlCustomStore" Visibility="Collapsed" Orientation="Horizontal" Margin="160,4,0,0">
                                <TextBlock Text="ID Personalizado:" VerticalAlignment="Center" Foreground="#94A3B8" Margin="0,0,8,0"/>
                                <TextBox Name="TxtCustomStoreId" Text="1" Width="80"/>
                            </StackPanel>
                        </StackPanel>
                    </Border>

                    <!-- Paso 2: Conexion SQL Server -->
                    <Border Background="#0F172A" CornerRadius="10" Padding="16" Margin="0,0,0,14" BorderBrush="#334155" BorderThickness="1">
                        <StackPanel>
                            <TextBlock Text="PASO 2: CONEXION AL SISTEMA POS LOCAL (SQL SERVER)" FontSize="13" FontWeight="Bold" Foreground="#F59E0B" Margin="0,0,0,6"/>
                            <TextBlock Text="Parametros de enlace con la base de datos de tu tienda (VAD10):" FontSize="11" Foreground="#94A3B8" Margin="0,0,0,10"/>
                            
                            <Grid Margin="0,0,0,6">
                                <Grid.ColumnDefinitions>
                                    <ColumnDefinition Width="160"/>
                                    <ColumnDefinition Width="*"/>
                                </Grid.ColumnDefinitions>
                                <TextBlock Grid.Column="0" Text="Servidor SQL:" VerticalAlignment="Center" Foreground="#94A3B8"/>
                                <TextBox Grid.Column="1" Name="TxtSqlServer" Text="AGUERREVERE\SRVAGUERREVERE"/>
                            </Grid>

                            <Grid Margin="0,0,0,6">
                                <Grid.ColumnDefinitions>
                                    <ColumnDefinition Width="160"/>
                                    <ColumnDefinition Width="*"/>
                                </Grid.ColumnDefinitions>
                                <TextBlock Grid.Column="0" Text="Base de Datos:" VerticalAlignment="Center" Foreground="#94A3B8"/>
                                <TextBox Grid.Column="1" Name="TxtSqlDb" Text="VAD10"/>
                            </Grid>

                            <Grid Margin="0,0,0,6">
                                <Grid.ColumnDefinitions>
                                    <ColumnDefinition Width="160"/>
                                    <ColumnDefinition Width="*"/>
                                </Grid.ColumnDefinitions>
                                <TextBlock Grid.Column="0" Text="Usuario SQL:" VerticalAlignment="Center" Foreground="#94A3B8"/>
                                <TextBox Grid.Column="1" Name="TxtSqlUser" Text="jqFydZPO"/>
                            </Grid>

                            <Grid Margin="0,0,0,10">
                                <Grid.ColumnDefinitions>
                                    <ColumnDefinition Width="160"/>
                                    <ColumnDefinition Width="*"/>
                                </Grid.ColumnDefinitions>
                                <TextBlock Grid.Column="0" Text="Contrasena SQL:" VerticalAlignment="Center" Foreground="#94A3B8"/>
                                <PasswordBox Grid.Column="1" Name="TxtSqlPass" Password="+121f4T$19"/>
                            </Grid>

                            <!-- Botones de Test -->
                            <StackPanel Orientation="Horizontal" Margin="0,4,0,0">
                                <Button Name="BtnTestSql" Content="Probar Conexion SQL" Background="#334155" Foreground="#FFFFFF" FontWeight="SemiBold" Padding="14,6" Cursor="Hand" BorderThickness="0"/>
                                <TextBlock Name="TxtSqlStatus" Text="" VerticalAlignment="Center" Margin="14,0,0,0" FontSize="11" FontWeight="SemiBold"/>
                            </StackPanel>
                        </StackPanel>
                    </Border>

                    <!-- Paso 3: Destino y Opciones -->
                    <Border Background="#0F172A" CornerRadius="10" Padding="16" BorderBrush="#334155" BorderThickness="1">
                        <StackPanel>
                            <TextBlock Text="PASO 3: OPCIONES DE INSTALACION" FontSize="13" FontWeight="Bold" Foreground="#10B981" Margin="0,0,0,6"/>
                            <Grid Margin="0,0,0,8">
                                <Grid.ColumnDefinitions>
                                    <ColumnDefinition Width="160"/>
                                    <ColumnDefinition Width="*"/>
                                </Grid.ColumnDefinitions>
                                <TextBlock Grid.Column="0" Text="Carpeta Destino:" VerticalAlignment="Center" Foreground="#94A3B8"/>
                                <TextBox Grid.Column="1" Name="TxtDestDir" Text="C:\MorpheusSyncAgent"/>
                            </Grid>

                            <CheckBox Name="ChkRegisterService" Content="Registrar Servicio de Windows (Permanecera DETENIDO inicialmente)" IsChecked="True"/>
                            <CheckBox Name="ChkCreateDesktopShortcut" Content="Crear acceso directo en el Escritorio (Morpheus - Panel de Control)" IsChecked="True"/>
                        </StackPanel>
                    </Border>
                </StackPanel>
            </ScrollViewer>
        </Border>

        <!-- Footer / Action Bar -->
        <Border Grid.Row="2" Background="#1E293B" CornerRadius="12" Padding="18,12" Margin="0,14,0,0" BorderBrush="#334155" BorderThickness="1">
            <Grid>
                <Grid.ColumnDefinitions>
                    <ColumnDefinition Width="*"/>
                    <ColumnDefinition Width="Auto"/>
                </Grid.ColumnDefinitions>
                <TextBlock Grid.Column="0" Name="TxtInstallStatus" Text="Listo para configurar e instalar." VerticalAlignment="Center" FontSize="11" Foreground="#94A3B8"/>
                <StackPanel Grid.Column="1" Orientation="Horizontal">
                    <Button Name="BtnClose" Content="Salir" Background="#334155" Foreground="#CBD5E1" FontWeight="SemiBold" Padding="18,10" Margin="0,0,10,0" Cursor="Hand" BorderThickness="0"/>
                    <Button Name="BtnInstallNow" Content="INSTALAR EN ESTA TIENDA" Background="#10B981" Foreground="#FFFFFF" FontWeight="Bold" Padding="24,10" Cursor="Hand" BorderThickness="0"/>
                </StackPanel>
            </Grid>
        </Border>
    </Grid>
</Window>
"@

$reader = (New-Object System.Xml.XmlNodeReader $xaml)
$window = [Windows.Markup.XamlReader]::Load($reader)

# Controles
$CmbStores = $window.FindName("CmbStores")
$PnlCustomStore = $window.FindName("PnlCustomStore")
$TxtCustomStoreId = $window.FindName("TxtCustomStoreId")
$TxtSqlServer = $window.FindName("TxtSqlServer")
$TxtSqlDb = $window.FindName("TxtSqlDb")
$TxtSqlUser = $window.FindName("TxtSqlUser")
$TxtSqlPass = $window.FindName("TxtSqlPass")
$BtnTestSql = $window.FindName("BtnTestSql")
$TxtSqlStatus = $window.FindName("TxtSqlStatus")
$TxtDestDir = $window.FindName("TxtDestDir")
$ChkRegisterService = $window.FindName("ChkRegisterService")
$ChkCreateDesktopShortcut = $window.FindName("ChkCreateDesktopShortcut")
$TxtInstallStatus = $window.FindName("TxtInstallStatus")
$BtnClose = $window.FindName("BtnClose")
$BtnInstallNow = $window.FindName("BtnInstallNow")

# Cargar Tiendas
$storesList = @(
    @{ Id = 1; Name = "01 - PATIO TRIGAL (CAT-11)" },
    @{ Id = 10; Name = "10 - CUMBOTO (CAT-01)" },
    @{ Id = 2; Name = "02 - SUCURSAL 02" },
    @{ Id = 3; Name = "03 - SUCURSAL 03" },
    @{ Id = 4; Name = "04 - SUCURSAL 04" },
    @{ Id = 5; Name = "05 - SUCURSAL 05" },
    @{ Id = 6; Name = "06 - SUCURSAL 06" },
    @{ Id = 7; Name = "07 - SUCURSAL 07" },
    @{ Id = 8; Name = "08 - SUCURSAL 08" },
    @{ Id = 9; Name = "09 - SUCURSAL 09" },
    @{ Id = 11; Name = "11 - SUCURSAL 11" },
    @{ Id = 12; Name = "12 - SUCURSAL 12" },
    @{ Id = 13; Name = "13 - SUCURSAL 13" },
    @{ Id = 14; Name = "14 - SUCURSAL 14" },
    @{ Id = 15; Name = "15 - SUCURSAL 15" },
    @{ Id = -1; Name = "[Ingresar ID Manual / Personalizado...]" }
)

foreach ($s in $storesList) {
    [void]$CmbStores.Items.Add($s.Name)
}
$CmbStores.SelectedIndex = 0

$CmbStores.Add_SelectionChanged({
    if ($CmbStores.SelectedIndex -eq ($storesList.Count - 1)) {
        $PnlCustomStore.Visibility = [System.Windows.Visibility]::Visible
    } else {
        $PnlCustomStore.Visibility = [System.Windows.Visibility]::Collapsed
    }
})

# Cargar appsettings.json si existe
if (Test-Path $settingsPath) {
    try {
        $raw = Get-Content -Path $settingsPath -Raw -Encoding UTF8 | ConvertFrom-Json
        if ($raw.StoreFacilityId) {
            for ($i = 0; $i -lt $storesList.Count; $i++) {
                if ($storesList[$i].Id -eq $raw.StoreFacilityId) {
                    $CmbStores.SelectedIndex = $i
                    break
                }
            }
        }
        $connStr = $raw.ConnectionStrings.LocalSqlServer
        if ($connStr -match "Server=([^;]+)") { $TxtSqlServer.Text = $Matches[1] }
        if ($connStr -match "Database=([^;]+)") { $TxtSqlDb.Text = $Matches[1] }
        if ($connStr -match "User Id=([^;]+)") { $TxtSqlUser.Text = $Matches[1] }
        if ($connStr -match "Password=([^;]+)") { $TxtSqlPass.Password = $Matches[1] }
    } catch {}
}

# Prueba de Conexion SQL
$BtnTestSql.Add_Click({
    $TxtSqlStatus.Foreground = [System.Windows.Media.BrushConverter]::new().ConvertFromString("#F59E0B")
    $TxtSqlStatus.Text = "Probando conexion SQL..."
    $window.Dispatcher.Invoke([Action]{}, [System.Windows.Threading.DispatcherPriority]::Render)
    
    $testConn = "Server=$($TxtSqlServer.Text);Database=$($TxtSqlDb.Text);User Id=$($TxtSqlUser.Text);Password=$($TxtSqlPass.Password);TrustServerCertificate=True;Connect Timeout=5;"
    try {
        $conn = New-Object System.Data.SqlClient.SqlConnection($testConn)
        $conn.Open()
        $conn.Close()
        $TxtSqlStatus.Foreground = [System.Windows.Media.BrushConverter]::new().ConvertFromString("#10B981")
        $TxtSqlStatus.Text = "[OK] Conexion exitosa con SQL Server"
    } catch {
        $TxtSqlStatus.Foreground = [System.Windows.Media.BrushConverter]::new().ConvertFromString("#EF4444")
        $TxtSqlStatus.Text = "[ERROR] $($_.Exception.Message)"
    }
})

# Accion de Instalacion
$BtnInstallNow.Add_Click({
    $destDir = $TxtDestDir.Text.Trim()
    if ([string]::IsNullOrWhiteSpace($destDir)) { $destDir = "C:\MorpheusSyncAgent" }
    
    $selIndex = $CmbStores.SelectedIndex
    $facilityId = 1
    $storeName = "Tienda"
    if ($selIndex -ge 0 -and $selIndex -lt ($storesList.Count - 1)) {
        $facilityId = $storesList[$selIndex].Id
        $storeName = $storesList[$selIndex].Name
    } else {
        $facilityId = [int]$TxtCustomStoreId.Text.Trim()
        $storeName = "Tienda ID $facilityId"
    }

    $TxtInstallStatus.Foreground = [System.Windows.Media.BrushConverter]::new().ConvertFromString("#38BDF8")
    $TxtInstallStatus.Text = "Instalando en $destDir..."
    $window.Dispatcher.Invoke([Action]{}, [System.Windows.Threading.DispatcherPriority]::Render)

    try {
        # 1. Crear carpeta destino si no existe
        if (!(Test-Path $destDir)) {
            New-Item -ItemType Directory -Path $destDir -Force | Out-Null
        }

        # 2. Copiar todos los archivos desde la carpeta actual al destino (si difieren)
        if ($scriptDir.TrimEnd('\\') -ne $destDir.TrimEnd('\\')) {
            Get-ChildItem -Path $scriptDir -Recurse | ForEach-Object {
                $rel = $_.FullName.Substring($scriptDir.Length).TrimStart('\\')
                $target = Join-Path $destDir $rel
                if ($_.PSIsContainer) {
                    if (!(Test-Path $target)) { New-Item -ItemType Directory -Path $target -Force | Out-Null }
                } else {
                    Copy-Item -Path $_.FullName -Destination $target -Force
                }
            }
        }

        # 3. Actualizar appsettings.json en el destino
        $destSettings = Join-Path $destDir "appsettings.json"
        $rawJson = Get-Content -Path $destSettings -Raw -Encoding UTF8 | ConvertFrom-Json
        $newConn = "Server=$($TxtSqlServer.Text);Database=$($TxtSqlDb.Text);User Id=$($TxtSqlUser.Text);Password=$($TxtSqlPass.Password);TrustServerCertificate=True;"
        $rawJson.ConnectionStrings.LocalSqlServer = $newConn
        $rawJson.StoreFacilityId = [int]$facilityId
        $newJsonStr = $rawJson | ConvertTo-Json -Depth 10
        [System.IO.File]::WriteAllText($destSettings, $newJsonStr, [System.Text.Encoding]::UTF8)

        # 4. Registrar Servicio Windows si está seleccionado
        if ($ChkRegisterService.IsChecked) {
            $exePath = Join-Path $destDir "MorpheusSyncAgent.exe"
            Start-Process sc.exe -ArgumentList "stop MorpheusSyncAgent" -Wait -NoNewWindow 2>$null
            Start-Sleep -Seconds 1
            Start-Process sc.exe -ArgumentList "delete MorpheusSyncAgent" -Wait -NoNewWindow 2>$null
            Start-Sleep -Seconds 1

            $scArgs = "create `"MorpheusSyncAgent`" binPath= `"`"$exePath`"`" start= auto DisplayName= `"Morpheus Sync Agent`""
            Start-Process sc.exe -ArgumentList $scArgs -Wait -NoNewWindow
            Start-Process sc.exe -ArgumentList "description `"MorpheusSyncAgent`" `"Agente de sincronizacion en tiempo real de Morpheus ERP / WMS`"" -Wait -NoNewWindow
            Start-Process sc.exe -ArgumentList "failure `"MorpheusSyncAgent`" reset= 86400 actions= restart/60000/restart/60000/restart/60000" -Wait -NoNewWindow
        }

        # 5. Compilar MorpheusConfigurador.exe nativo mediante csc.exe si está disponible
        $csc = "$env:WINDIR\\Microsoft.NET\\Framework64\\v4.0.30319\\csc.exe"
        if (!(Test-Path $csc)) {
            $csc = "$env:WINDIR\\Microsoft.NET\\Framework\\v4.0.30319\\csc.exe"
        }
        $compiledExe = $null
        if (Test-Path $csc) {
            $csCode = @"
using System;
using System.Diagnostics;
using System.IO;

class Program {
    [STAThread]
    static void Main(string[] args) {
        try {
            string dir = AppDomain.CurrentDomain.BaseDirectory;
            string script = Path.Combine(dir, "Configurador.ps1");
            ProcessStartInfo psi = new ProcessStartInfo();
            psi.FileName = "powershell.exe";
            psi.Arguments = "-NoProfile -ExecutionPolicy Bypass -WindowStyle Hidden -File \"" + script + "\"";
            psi.WindowStyle = ProcessWindowStyle.Hidden;
            psi.CreateNoWindow = true;
            psi.UseShellExecute = false;
            Process.Start(psi);
        } catch {}
    }
}
"@
            $csFile = Join-Path $destDir "Launcher.cs"
            [System.IO.File]::WriteAllText($csFile, $csCode, [System.Text.Encoding]::UTF8)
            $outExe = Join-Path $destDir "MorpheusConfigurador.exe"
            Start-Process $csc -ArgumentList "/target:winexe /optimize+ /out:`"$outExe`" `"$csFile`"" -Wait -NoNewWindow 2>$null
            if (Test-Path $outExe) {
                $compiledExe = $outExe
            }
        }

        # 6. Crear acceso directo en el Escritorio
        if ($ChkCreateDesktopShortcut.IsChecked) {
            $ws = New-Object -ComObject WScript.Shell
            $desktop = [Environment]::GetFolderPath('Desktop')
            $shortcut = $ws.CreateShortcut("$desktop\\Morpheus - Panel de Control.lnk")
            if ($compiledExe -and (Test-Path $compiledExe)) {
                $shortcut.TargetPath = $compiledExe
            } else {
                $vbsLauncher = Join-Path $destDir "Configurar_Agente.vbs"
                if (Test-Path $vbsLauncher) {
                    $shortcut.TargetPath = "wscript.exe"
                    $shortcut.Arguments = "`"$vbsLauncher`""
                } else {
                    $shortcut.TargetPath = Join-Path $destDir "Configurar_Agente.bat"
                }
            }
            $shortcut.WorkingDirectory = $destDir
            $shortcut.Description = "Panel de Control y Sincronizacion Morpheus"
            $shortcut.Save()
        }

        $TxtInstallStatus.Foreground = [System.Windows.Media.BrushConverter]::new().ConvertFromString("#10B981")
        $TxtInstallStatus.Text = "[OK] Instalacion completada exitosamente."

        [System.Windows.MessageBox]::Show("La instalacion para $storeName ha culminado exitosamente.`n`nSe creo el acceso directo 'Morpheus - Panel de Control' en tu Escritorio.`nEl servicio quedo configurado y DETENIDO.`n`nA continuacion se abrira el Panel de Control para realizar la puesta a punto.", "Instalacion Exitosa", [System.Windows.MessageBoxButton]::OK, [System.Windows.MessageBoxImage]::Information)

        # Abrir Panel de Control
        $vbsControl = Join-Path $destDir "Configurar_Agente.vbs"
        if ($compiledExe -and (Test-Path $compiledExe)) {
            Start-Process $compiledExe
        } elseif (Test-Path $vbsControl) {
            Start-Process "wscript.exe" -ArgumentList "`"$vbsControl`""
        } else {
            Start-Process (Join-Path $destDir "Configurar_Agente.bat")
        }

        $window.Close()

    } catch {
        $TxtInstallStatus.Foreground = [System.Windows.Media.BrushConverter]::new().ConvertFromString("#EF4444")
        $TxtInstallStatus.Text = "Error: $($_.Exception.Message)"
        [System.Windows.MessageBox]::Show("Ocurrio un error durante la instalacion:`n`n$($_.Exception.Message)", "Error de Instalacion", [System.Windows.MessageBoxButton]::OK, [System.Windows.MessageBoxImage]::Error)
    }
})

$BtnClose.Add_Click({ $window.Close() })

$window.ShowDialog() | Out-Null
'''
    with open(os.path.join(build_dir, "Instalador_Tienda.ps1"), "w", encoding="utf-8-sig") as f:
        f.write(ps1_installer)

    print("[4/6] Generando Panel de Control Completo libre de errores (Configurador.ps1)...")
    # Generar Configurador.ps1 con codificación limpia, segura y BOM
    ps1_gui = '''Add-Type -AssemblyName PresentationFramework, PresentationCore, WindowsBase, System.Drawing, System.Windows.Forms

$scriptDir = Split-Path -Parent $MyInvocation.MyCommand.Definition
$settingsPath = Join-Path $scriptDir "appsettings.json"
$statePath = Join-Path $scriptDir "sync_state.json"
$localDbPath = Join-Path $scriptDir "morpheus_local.db"

[xml]$xaml = @"
<Window xmlns="http://schemas.microsoft.com/winfx/2006/xaml/presentation"
        xmlns:x="http://schemas.microsoft.com/winfx/2006/xaml"
        Title="Morpheus Sync Agent - Panel de Control &amp; Sincronizacion" 
        Height="780" Width="900" 
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
                            <TextBlock Text="M" FontSize="18" FontWeight="Bold" Foreground="#FFFFFF" HorizontalAlignment="Center" VerticalAlignment="Center"/>
                        </Border>
                        <StackPanel>
                            <TextBlock Text="Morpheus Sync Agent" FontSize="19" FontWeight="Bold" Foreground="#FFFFFF"/>
                            <TextBlock Text="Panel de Control y Enlace POS Tienda a Nube Morpheus" FontSize="12" Foreground="#94A3B8"/>
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
            <TabItem Header="1. Puesta a Punto (Fases 2 y 3)">
                <Border Background="#1E293B" CornerRadius="12" Padding="20" Margin="0,12,0,0" BorderBrush="#334155" BorderThickness="1">
                    <ScrollViewer VerticalScrollBarVisibility="Auto">
                        <StackPanel>
                            <!-- FASE 2: Reset Local -->
                            <Border Background="#0F172A" CornerRadius="10" Padding="16" Margin="0,0,0,14" BorderBrush="#334155" BorderThickness="1">
                                <StackPanel>
                                    <TextBlock Text="FASE 2: Resetear Estado Local (Semilla Cero)" FontSize="14" FontWeight="Bold" Foreground="#F59E0B" Margin="0,0,0,6"/>
                                    <TextBlock Text="Elimina sync_state.json y morpheus_local.db (creando un respaldo previo en /backup) para que la extraccion comience limpia y sin marcas viejas." FontSize="11" Foreground="#94A3B8" TextWrapping="Wrap" Margin="0,0,0,10"/>
                                    <StackPanel Orientation="Horizontal">
                                        <Button Name="BtnResetLocalState" Content="Limpiar / Resetear Estado Local" Background="#D97706" Foreground="#FFFFFF" FontWeight="Bold" Padding="16,8" Cursor="Hand" BorderThickness="0"/>
                                        <TextBlock Name="TxtResetResult" Text="" VerticalAlignment="Center" Margin="14,0,0,0" FontSize="11" FontWeight="SemiBold"/>
                                    </StackPanel>
                                </StackPanel>
                            </Border>
                            
                            <!-- FASE 3: Carga de Maestros a Voluntad -->
                            <Border Background="#0F172A" CornerRadius="10" Padding="16" Margin="0,0,0,14" BorderBrush="#334155" BorderThickness="1">
                                <StackPanel>
                                    <TextBlock Text="FASE 3: Carga de Maestros Inicial (Ejecucion a Voluntad)" FontSize="14" FontWeight="Bold" Foreground="#38BDF8" Margin="0,0,0,6"/>
                                    <TextBlock Text="Presiona cada boton en orden para sembrar los catalogos en Morpheus QA. Cada extraccion abrira una consola para ver el avance en vivo." FontSize="11" Foreground="#94A3B8" TextWrapping="Wrap" Margin="0,0,0,12"/>
                                    
                                    <WrapPanel Margin="0,0,0,8">
                                        <Button Name="BtnRunSuppliers" Content="1. Sincronizar Proveedores" Background="#1E293B" Foreground="#38BDF8" FontWeight="SemiBold" Padding="12,8" Margin="0,0,8,8" Cursor="Hand" BorderBrush="#0284C7" BorderThickness="1"/>
                                        <Button Name="BtnRunProducts" Content="2. Sincronizar Productos &amp; Variantes" Background="#1E293B" Foreground="#38BDF8" FontWeight="SemiBold" Padding="12,8" Margin="0,0,8,8" Cursor="Hand" BorderBrush="#0284C7" BorderThickness="1"/>
                                        <Button Name="BtnRunBarcodes" Content="3. Sincronizar Codigos de Barra" Background="#1E293B" Foreground="#38BDF8" FontWeight="SemiBold" Padding="12,8" Margin="0,0,8,8" Cursor="Hand" BorderBrush="#0284C7" BorderThickness="1"/>
                                        <Button Name="BtnRunSupplierProducts" Content="4. Sincronizar Costos &amp; Cruces" Background="#1E293B" Foreground="#38BDF8" FontWeight="SemiBold" Padding="12,8" Margin="0,0,8,8" Cursor="Hand" BorderBrush="#0284C7" BorderThickness="1"/>
                                    </WrapPanel>
                                    
                                    <!-- Baseline Configuration -->
                                    <Border Background="#1E293B" CornerRadius="8" Padding="12" Margin="0,4,0,0" BorderBrush="#334155" BorderThickness="1">
                                        <StackPanel>
                                            <TextBlock Text="5. Inventario Inicial (Baseline):" FontWeight="Bold" FontSize="12" Foreground="#FFFFFF" Margin="0,0,0,6"/>
                                            <StackPanel Orientation="Horizontal" Margin="0,0,0,8">
                                                <RadioButton Name="RbBaselineCurrent" Content="Al momento actual (Hoy)" IsChecked="True" GroupName="BaselineMode" Margin="0,0,16,0"/>
                                                <RadioButton Name="RbBaselineCutoff" Content="A fecha especifica de corte:" GroupName="BaselineMode" Margin="0,0,8,0"/>
                                                <TextBox Name="TxtBaselineDate" Text="2026-06-07" Width="100"/>
                                            </StackPanel>
                                            <Button Name="BtnRunBaseline" Content="Sincronizar Inventario Inicial (Baseline)" Background="#0284C7" Foreground="#FFFFFF" FontWeight="Bold" Padding="16,8" HorizontalAlignment="Left" Cursor="Hand" BorderThickness="0"/>
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
                                        <TextBlock Grid.Column="0" Text="Estado Actual de Sincronizacion (sync_state.json):" FontWeight="Bold" FontSize="12" Foreground="#CBD5E1"/>
                                        <Button Grid.Column="1" Name="BtnRefreshState" Content="Actualizar Marcas" Background="#334155" Foreground="#94A3B8" Padding="10,4" FontSize="11" Cursor="Hand" BorderThickness="0"/>
                                    </Grid>
                                    <Grid>
                                        <Grid.ColumnDefinitions>
                                            <ColumnDefinition Width="*"/>
                                            <ColumnDefinition Width="*"/>
                                            <ColumnDefinition Width="*"/>
                                        </Grid.ColumnDefinitions>
                                        <StackPanel Grid.Column="0" Margin="0,0,10,0">
                                            <TextBlock Text="Proveedores / Productos:" FontSize="10" Foreground="#64748B"/>
                                            <TextBlock Name="LblSyncSuppliers" Text="Consultando..." FontSize="11" FontWeight="SemiBold" Foreground="#38BDF8"/>
                                            <TextBlock Text="Codigos de Barra:" FontSize="10" Foreground="#64748B" Margin="0,6,0,0"/>
                                            <TextBlock Name="LblSyncBarcodes" Text="Consultando..." FontSize="11" FontWeight="SemiBold" Foreground="#38BDF8"/>
                                        </StackPanel>
                                        <StackPanel Grid.Column="1" Margin="0,0,10,0">
                                            <TextBlock Text="Costos Proveedor:" FontSize="10" Foreground="#64748B"/>
                                            <TextBlock Name="LblSyncSuppProd" Text="Consultando..." FontSize="11" FontWeight="SemiBold" Foreground="#38BDF8"/>
                                            <TextBlock Text="Baseline de Inventario:" FontSize="10" Foreground="#64748B" Margin="0,6,0,0"/>
                                            <TextBlock Name="LblSyncBaseline" Text="Consultando..." FontSize="11" FontWeight="SemiBold" Foreground="#F59E0B"/>
                                        </StackPanel>
                                        <StackPanel Grid.Column="2">
                                            <TextBlock Text="Ultima Venta Sincronizada:" FontSize="10" Foreground="#64748B"/>
                                            <TextBlock Name="LblSyncSales" Text="Consultando..." FontSize="11" FontWeight="SemiBold" Foreground="#10B981"/>
                                        </StackPanel>
                                    </Grid>
                                </StackPanel>
                            </Border>
                        </StackPanel>
                    </ScrollViewer>
                </Border>
            </TabItem>
            
            <!-- TAB 2: Sincronizar a Voluntad (Ventas & Movimientos) -->
            <TabItem Header="2. Sincronizar a Voluntad">
                <Border Background="#1E293B" CornerRadius="12" Padding="20" Margin="0,12,0,0" BorderBrush="#334155" BorderThickness="1">
                    <ScrollViewer VerticalScrollBarVisibility="Auto">
                        <StackPanel>
                            <Border Background="#0F172A" CornerRadius="10" Padding="16" Margin="0,0,0,14" BorderBrush="#334155" BorderThickness="1">
                                <StackPanel>
                                    <TextBlock Text="Sincronizacion de Ventas con Parametros de Tiempo:" FontSize="14" FontWeight="Bold" Foreground="#10B981" Margin="0,0,0,6"/>
                                    <TextBlock Text="Elige el rango de historico de ventas que deseas sincronizar con la nube Morpheus:" FontSize="11" Foreground="#94A3B8" Margin="0,0,0,12"/>
                                    
                                    <StackPanel Margin="0,0,0,12">
                                        <RadioButton Name="RbSales30Days" Content="Ultimos 30 dias" GroupName="SalesRange"/>
                                        <RadioButton Name="RbSales3Months" Content="Ultimos 3 meses (Recomendado para UAT)" IsChecked="True" GroupName="SalesRange"/>
                                        <RadioButton Name="RbSales6Months" Content="Ultimos 6 meses" GroupName="SalesRange"/>
                                        <RadioButton Name="RbSalesAll" Content="Todo el Historial Completo" GroupName="SalesRange"/>
                                        <StackPanel Orientation="Horizontal" Margin="0,4,0,0">
                                            <RadioButton Name="RbSalesCustom" Content="Fecha personalizada (Desde):" GroupName="SalesRange" Margin="0,0,8,0"/>
                                            <TextBox Name="TxtSalesCustomDate" Text="2026-01-01" Width="100"/>
                                        </StackPanel>
                                    </StackPanel>
                                    
                                    <Button Name="BtnRunSalesCustom" Content="Sincronizar Ventas Ahora" Background="#10B981" Foreground="#FFFFFF" FontWeight="Bold" Padding="18,10" HorizontalAlignment="Left" Cursor="Hand" BorderThickness="0"/>
                                </StackPanel>
                            </Border>
                            
                            <Border Background="#0F172A" CornerRadius="10" Padding="16" BorderBrush="#334155" BorderThickness="1">
                                <StackPanel>
                                    <TextBlock Text="Sincronizacion de Movimientos de Inventario (Kardex):" FontSize="14" FontWeight="Bold" Foreground="#6366F1" Margin="0,0,0,6"/>
                                    <TextBlock Text="Extrae las entradas, salidas, traslados y mermas registradas localmente en el POS:" FontSize="11" Foreground="#94A3B8" Margin="0,0,0,12"/>
                                    <Button Name="BtnRunMovements" Content="Sincronizar Movimientos Ahora" Background="#6366F1" Foreground="#FFFFFF" FontWeight="Bold" Padding="18,10" HorizontalAlignment="Left" Cursor="Hand" BorderThickness="0"/>
                                </StackPanel>
                            </Border>
                        </StackPanel>
                    </ScrollViewer>
                </Border>
            </TabItem>
            
            <!-- TAB 3: Servicio Continuo (Background) -->
            <TabItem Header="3. Servicio en Segundo Plano">
                <Border Background="#1E293B" CornerRadius="12" Padding="20" Margin="0,12,0,0" BorderBrush="#334155" BorderThickness="1">
                    <ScrollViewer VerticalScrollBarVisibility="Auto">
                        <StackPanel>
                            <Border Background="#0F172A" CornerRadius="10" Padding="16" Margin="0,0,0,14" BorderBrush="#334155" BorderThickness="1">
                                <StackPanel>
                                    <TextBlock Text="Que datos debe sincronizar el Servicio de Windows en segundo plano?" FontSize="14" FontWeight="Bold" Foreground="#38BDF8" Margin="0,0,0,6"/>
                                    <TextBlock Text="Marca unicamente los datos que deseas que el servicio ejecute de forma automatica en segundo plano:" FontSize="11" Foreground="#94A3B8" TextWrapping="Wrap" Margin="0,0,0,12"/>
                                    
                                    <Grid Margin="0,0,0,8">
                                        <Grid.ColumnDefinitions>
                                            <ColumnDefinition Width="260"/>
                                            <ColumnDefinition Width="120"/>
                                            <ColumnDefinition Width="*"/>
                                        </Grid.ColumnDefinitions>
                                        <Grid.RowDefinitions>
                                            <RowDefinition Height="Auto"/>
                                            <RowDefinition Height="Auto"/>
                                            <RowDefinition Height="Auto"/>
                                            <RowDefinition Height="Auto"/>
                                            <RowDefinition Height="Auto"/>
                                            <RowDefinition Height="Auto"/>
                                        </Grid.RowDefinitions>
                                        
                                        <TextBlock Grid.Row="0" Grid.Column="0" Text="Extractor / Datos" FontWeight="Bold" Foreground="#94A3B8"/>
                                        <TextBlock Grid.Row="0" Grid.Column="1" Text="Frecuencia (Min)" FontWeight="Bold" Foreground="#94A3B8"/>
                                        
                                        <CheckBox Grid.Row="1" Grid.Column="0" Name="ChkSyncSales" Content="Ventas (Recomendado activo)" IsChecked="True"/>
                                        <TextBox Grid.Row="1" Grid.Column="1" Name="TxtIntervalSales" Text="10" Margin="0,2,0,2"/>
                                        
                                        <CheckBox Grid.Row="2" Grid.Column="0" Name="ChkSyncMovements" Content="Movimientos de Inventario"/>
                                        <TextBox Grid.Row="2" Grid.Column="1" Name="TxtIntervalMovements" Text="10" Margin="0,2,0,2"/>
                                        
                                        <CheckBox Grid.Row="3" Grid.Column="0" Name="ChkSyncProducts" Content="Productos &amp; Variantes"/>
                                        <TextBox Grid.Row="3" Grid.Column="1" Name="TxtIntervalProducts" Text="60" Margin="0,2,0,2"/>
                                        
                                        <CheckBox Grid.Row="4" Grid.Column="0" Name="ChkSyncBarcodes" Content="Codigos de Barra"/>
                                        <TextBox Grid.Row="4" Grid.Column="1" Name="TxtIntervalBarcodes" Text="60" Margin="0,2,0,2"/>
                                        
                                        <CheckBox Grid.Row="5" Grid.Column="0" Name="ChkSyncSuppliers" Content="Proveedores &amp; Costos"/>
                                        <TextBox Grid.Row="5" Grid.Column="1" Name="TxtIntervalSuppliers" Text="60" Margin="0,2,0,2"/>
                                    </Grid>
                                </StackPanel>
                            </Border>
                            
                            <Border Background="#0F172A" CornerRadius="10" Padding="16" BorderBrush="#334155" BorderThickness="1">
                                <StackPanel>
                                    <TextBlock Text="Control del Servicio Windows (MorpheusSyncAgent):" FontSize="14" FontWeight="Bold" Foreground="#CBD5E1" Margin="0,0,0,10"/>
                                    <WrapPanel>
                                        <Button Name="BtnStartService" Content="Iniciar Servicio" Background="#10B981" Foreground="#FFFFFF" FontWeight="Bold" Padding="16,8" Margin="0,0,10,8" Cursor="Hand" BorderThickness="0"/>
                                        <Button Name="BtnStopService" Content="Detener Servicio" Background="#EF4444" Foreground="#FFFFFF" FontWeight="Bold" Padding="16,8" Margin="0,0,10,8" Cursor="Hand" BorderThickness="0"/>
                                        <Button Name="BtnRestartService" Content="Reiniciar Servicio" Background="#334155" Foreground="#FFFFFF" FontWeight="SemiBold" Padding="16,8" Margin="0,0,10,8" Cursor="Hand" BorderThickness="0"/>
                                        <Button Name="BtnConsoleMode" Content="Probar en Consola Visible" Background="#334155" Foreground="#38BDF8" FontWeight="SemiBold" Padding="16,8" Margin="0,0,10,8" Cursor="Hand" BorderThickness="0"/>
                                    </WrapPanel>
                                </StackPanel>
                            </Border>
                        </StackPanel>
                    </ScrollViewer>
                </Border>
            </TabItem>
            
            <!-- TAB 4: Conexiones & Diagnostico -->
            <TabItem Header="4. Conexiones y Diagnostico">
                <Border Background="#1E293B" CornerRadius="12" Padding="20" Margin="0,12,0,0" BorderBrush="#334155" BorderThickness="1">
                    <ScrollViewer VerticalScrollBarVisibility="Auto">
                        <StackPanel>
                            <Border Background="#0F172A" CornerRadius="10" Padding="16" Margin="0,0,0,14" BorderBrush="#334155" BorderThickness="1">
                                <StackPanel>
                                    <TextBlock Text="Base de Datos SQL Server Local (VAD10)" FontSize="13" FontWeight="Bold" Foreground="#CBD5E1" Margin="0,0,0,10"/>
                                    
                                    <Grid Margin="0,0,0,6">
                                        <Grid.ColumnDefinitions>
                                            <ColumnDefinition Width="140"/>
                                            <ColumnDefinition Width="*"/>
                                        </Grid.ColumnDefinitions>
                                        <TextBlock Grid.Column="0" Text="Servidor SQL:" VerticalAlignment="Center" Foreground="#94A3B8"/>
                                        <TextBox Grid.Column="1" Name="TxtSqlServer" Text="AGUERREVERE\SRVAGUERREVERE"/>
                                    </Grid>
                                    
                                    <Grid Margin="0,0,0,6">
                                        <Grid.ColumnDefinitions>
                                            <ColumnDefinition Width="140"/>
                                            <ColumnDefinition Width="*"/>
                                        </Grid.ColumnDefinitions>
                                        <TextBlock Grid.Column="0" Text="Base de Datos:" VerticalAlignment="Center" Foreground="#94A3B8"/>
                                        <TextBox Grid.Column="1" Name="TxtSqlDb" Text="VAD10"/>
                                    </Grid>
                                    
                                    <Grid Margin="0,0,0,6">
                                        <Grid.ColumnDefinitions>
                                            <ColumnDefinition Width="140"/>
                                            <ColumnDefinition Width="*"/>
                                        </Grid.ColumnDefinitions>
                                        <TextBlock Grid.Column="0" Text="Usuario SQL:" VerticalAlignment="Center" Foreground="#94A3B8"/>
                                        <TextBox Grid.Column="1" Name="TxtSqlUser" Text="jqFydZPO"/>
                                    </Grid>
                                    
                                    <Grid Margin="0,0,0,10">
                                        <Grid.ColumnDefinitions>
                                            <ColumnDefinition Width="140"/>
                                            <ColumnDefinition Width="*"/>
                                        </Grid.ColumnDefinitions>
                                        <TextBlock Grid.Column="0" Text="Contrasena SQL:" VerticalAlignment="Center" Foreground="#94A3B8"/>
                                        <PasswordBox Grid.Column="1" Name="TxtSqlPass" Password="+121f4T$19"/>
                                    </Grid>
                                    
                                    <StackPanel Orientation="Horizontal">
                                        <Button Name="BtnTestSql" Content="Probar Conexion SQL" Background="#334155" Foreground="#FFFFFF" FontWeight="SemiBold" Padding="14,8" Cursor="Hand" BorderThickness="0"/>
                                        <TextBlock Name="TxtSqlTestResult" Text="" VerticalAlignment="Center" Margin="14,0,0,0" FontSize="11" FontWeight="SemiBold"/>
                                    </StackPanel>
                                </StackPanel>
                            </Border>
                            
                            <Border Background="#0F172A" CornerRadius="10" Padding="16" BorderBrush="#334155" BorderThickness="1">
                                <StackPanel>
                                    <TextBlock Text="Servidor Central Morpheus" FontSize="13" FontWeight="Bold" Foreground="#CBD5E1" Margin="0,0,0,10"/>
                                    
                                    <Grid Margin="0,0,0,6">
                                        <Grid.ColumnDefinitions>
                                            <ColumnDefinition Width="140"/>
                                            <ColumnDefinition Width="*"/>
                                        </Grid.ColumnDefinitions>
                                        <TextBlock Grid.Column="0" Text="URL API Nube:" VerticalAlignment="Center" Foreground="#94A3B8"/>
                                        <TextBox Grid.Column="1" Name="TxtApiBaseUrl" Text="https://api.qa.morpheussoft.net"/>
                                    </Grid>
                                    
                                    <Grid Margin="0,0,0,10">
                                        <Grid.ColumnDefinitions>
                                            <ColumnDefinition Width="140"/>
                                            <ColumnDefinition Width="*"/>
                                        </Grid.ColumnDefinitions>
                                        <TextBlock Grid.Column="0" Text="ID de Tienda (Facility):" VerticalAlignment="Center" Foreground="#94A3B8"/>
                                        <TextBox Grid.Column="1" Name="TxtFacilityId" Text="1" Width="80" HorizontalAlignment="Left"/>
                                    </Grid>
                                    
                                    <StackPanel Orientation="Horizontal">
                                        <Button Name="BtnTestApi" Content="Probar Conexion Nube" Background="#334155" Foreground="#FFFFFF" FontWeight="SemiBold" Padding="14,8" Cursor="Hand" BorderThickness="0"/>
                                        <TextBlock Name="TxtApiTestResult" Text="" VerticalAlignment="Center" Margin="14,0,0,0" FontSize="11" FontWeight="SemiBold"/>
                                    </StackPanel>
                                </StackPanel>
                            </Border>
                        </StackPanel>
                    </ScrollViewer>
                </Border>
            </TabItem>
            
        </TabControl>
        
        <!-- Action Bar / Footer -->
        <Border Grid.Row="2" Background="#1E293B" CornerRadius="12" Padding="18,12" Margin="0,14,0,0" BorderBrush="#334155" BorderThickness="1">
            <Grid>
                <Grid.ColumnDefinitions>
                    <ColumnDefinition Width="*"/>
                    <ColumnDefinition Width="Auto"/>
                </Grid.ColumnDefinitions>
                <TextBlock Grid.Column="0" Name="TxtActionLog" Text="Listo para operar." VerticalAlignment="Center" FontSize="11" Foreground="#64748B" FontFamily="Consolas"/>
                
                <StackPanel Grid.Column="1" Orientation="Horizontal">
                    <Button Name="BtnCancel" Content="Cerrar" Background="#334155" Foreground="#CBD5E1" FontWeight="SemiBold" Padding="18,8" Margin="0,0,10,0" Cursor="Hand" BorderThickness="0"/>
                    <Button Name="BtnSave" Content="Guardar Configuracion" Background="#6366F1" Foreground="#FFFFFF" FontWeight="Bold" Padding="22,8" Cursor="Hand" BorderThickness="0"/>
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

# Helper: Actualizar estado de servicio (100% libre de caracteres que rompan encoding)
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
            $TxtServiceStatus.Text = "EN EJECUCION [ACTIVO]"
        } else {
            $BadgeStatus.Background = [System.Windows.Media.BrushConverter]::new().ConvertFromString("#7F1D1D")
            $LedStatus.Fill = [System.Windows.Media.BrushConverter]::new().ConvertFromString("#EF4444")
            $TxtServiceStatus.Text = "DETENIDO [PARADO]"
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
                $LblSyncBaseline.Text = "COMPLETADO [OK]"
                $LblSyncBaseline.Foreground = [System.Windows.Media.BrushConverter]::new().ConvertFromString("#10B981")
            } else {
                $LblSyncBaseline.Text = "Pendiente"
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
    $confirm = [System.Windows.MessageBox]::Show("Seguro que deseas resetear el estado local de la tienda?`n`nEsto borrara sync_state.json y morpheus_local.db para que la sincronizacion comience desde cero absoluto.`n(Se creara una copia de respaldo en la carpeta /backup).", "Confirmar Reset Local (Fase 2)", [System.Windows.MessageBoxButton]::YesNo, [System.Windows.MessageBoxImage]::Warning)
    
    if ($confirm -ne [System.Windows.MessageBoxResult]::Yes) { return }
    
    $svc = Get-Service -Name "MorpheusSyncAgent" -ErrorAction SilentlyContinue
    if ($svc -and $svc.Status -eq "Running") {
        [System.Windows.MessageBox]::Show("El servicio de Windows esta activo. Debes detenerlo antes de resetear el estado local.", "Servicio Activo", [System.Windows.MessageBoxButton]::OK, [System.Windows.MessageBoxImage]::Stop)
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
        $TxtResetResult.Text = "[OK] Estado local reseteado a cero (Backup en /backup)"
        $TxtActionLog.Text = "[$(Get-Date -Format 'HH:mm:ss')] Fase 2 completada: Estado reseteado."
        Refresh-SyncStateUI
    } catch {
        $TxtResetResult.Foreground = [System.Windows.Media.BrushConverter]::new().ConvertFromString("#EF4444")
        $TxtResetResult.Text = "[ERROR] $($_.Exception.Message)"
    }
})

# FASE 3: Botones de Extraccion a Voluntad
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

# Sincronizacion de Ventas con Parametros
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
            [System.Windows.MessageBox]::Show("Formato de fecha invalido. Usa AAAA-MM-DD.", "Fecha Invalida", [System.Windows.MessageBoxButton]::OK, [System.Windows.MessageBoxImage]::Error)
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
    $stateObj.BaselineInventoryDone = $true
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
    $TxtSqlTestResult.Text = "Probando conexion..."
    $window.Dispatcher.Invoke([Action]{}, [System.Windows.Threading.DispatcherPriority]::Render)
    
    $testConn = "Server=$($TxtSqlServer.Text);Database=$($TxtSqlDb.Text);User Id=$($TxtSqlUser.Text);Password=$($TxtSqlPass.Password);TrustServerCertificate=True;Connect Timeout=5;"
    try {
        $conn = New-Object System.Data.SqlClient.SqlConnection($testConn)
        $conn.Open()
        $conn.Close()
        $TxtSqlTestResult.Foreground = [System.Windows.Media.BrushConverter]::new().ConvertFromString("#10B981")
        $TxtSqlTestResult.Text = "[OK] Conexion Exitosa con SQL Server"
        $TxtActionLog.Text = "[$(Get-Date -Format 'HH:mm:ss')] Conexion SQL Server OK: $($TxtSqlServer.Text)"
    } catch {
        $TxtSqlTestResult.Foreground = [System.Windows.Media.BrushConverter]::new().ConvertFromString("#EF4444")
        $TxtSqlTestResult.Text = "[ERROR] $($_.Exception.Message)"
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
            $TxtApiTestResult.Text = "[OK] Conexion Exitosa con Nube Morpheus"
            $TxtActionLog.Text = "[$(Get-Date -Format 'HH:mm:ss')] API Nube Responde HTTP 200 OK"
        } else {
            $TxtApiTestResult.Foreground = [System.Windows.Media.BrushConverter]::new().ConvertFromString("#EF4444")
            $TxtApiTestResult.Text = "Codigo HTTP: $($resp.StatusCode)"
        }
    } catch {
        $TxtApiTestResult.Foreground = [System.Windows.Media.BrushConverter]::new().ConvertFromString("#EF4444")
        $TxtApiTestResult.Text = "[ERROR] $($_.Exception.Message)"
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
        
        if ($TxtBaselineDate.Text) {
            $rawJson.DirectExtractors.InventoryBaseline.BaselineCutoffDate = $TxtBaselineDate.Text.Trim()
        }
        
        $newJsonStr = $rawJson | ConvertTo-Json -Depth 10
        [System.IO.File]::WriteAllText($settingsPath, $newJsonStr, [System.Text.Encoding]::UTF8)
        
        [System.Windows.MessageBox]::Show("Configuracion guardada exitosamente en appsettings.json", "Guardado", [System.Windows.MessageBoxButton]::OK, [System.Windows.MessageBoxImage]::Information)
        $TxtActionLog.Text = "[$(Get-Date -Format 'HH:mm:ss')] Configuracion guardada en appsettings.json"
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
    with open(os.path.join(build_dir, "Configurador.ps1"), "w", encoding="utf-8-sig") as f:
        f.write(ps1_gui)

    print("[5/6] Creando lanzadores visuales sin consola (VBScript y Batch)...")
    
    # 1. Lanzador Asistente de Instalacion VBScript (Zero Console)
    vbs_installer = '''Set WshShell = CreateObject("WScript.Shell")
Set fso = CreateObject("Scripting.FileSystemObject")
ScriptDir = fso.GetParentFolderName(WScript.ScriptFullName)
psScript = ScriptDir & "\\Instalador_Tienda.ps1"
cmd = "powershell.exe -NoProfile -ExecutionPolicy Bypass -WindowStyle Hidden -File " & Chr(34) & psScript & Chr(34)
WshShell.Run cmd, 0, False
'''
    with open(os.path.join(build_dir, "1_Instalar_Morpheus_Tienda.vbs"), "w", encoding="utf-8") as f:
        f.write(vbs_installer)

    # 2. Lanzador Asistente de Instalacion Batch
    bat_installer = """@echo off
title Morpheus ERP - Asistente de Instalacion
cd /d "%~dp0"
start /b powershell.exe -NoProfile -ExecutionPolicy Bypass -WindowStyle Hidden -File "%~dp0Instalador_Tienda.ps1"
"""
    with open(os.path.join(build_dir, "1_Instalar_Morpheus_Tienda.bat"), "w", encoding="utf-8") as f:
        f.write(bat_installer)

    # 3. Lanzador Configurador VBScript (Zero Console)
    vbs_config = '''Set WshShell = CreateObject("WScript.Shell")
Set fso = CreateObject("Scripting.FileSystemObject")
ScriptDir = fso.GetParentFolderName(WScript.ScriptFullName)
psScript = ScriptDir & "\\Configurador.ps1"
cmd = "powershell.exe -NoProfile -ExecutionPolicy Bypass -WindowStyle Hidden -File " & Chr(34) & psScript & Chr(34)
WshShell.Run cmd, 0, False
'''
    with open(os.path.join(build_dir, "Configurar_Agente.vbs"), "w", encoding="utf-8") as f:
        f.write(vbs_config)

    # 4. Lanzador Configurador Batch
    bat_config = """@echo off
title Morpheus Sync Agent - Panel de Control
cd /d "%~dp0"
start /b powershell.exe -NoProfile -ExecutionPolicy Bypass -WindowStyle Hidden -File "%~dp0Configurador.ps1"
"""
    with open(os.path.join(build_dir, "Configurar_Agente.bat"), "w", encoding="utf-8") as f:
        f.write(bat_config)

    # 5. Launcher.cs para autocompilacion en exe
    cs_launcher = """using System;
using System.Diagnostics;
using System.IO;

class Program {
    [STAThread]
    static void Main(string[] args) {
        try {
            string dir = AppDomain.CurrentDomain.BaseDirectory;
            string script = Path.Combine(dir, "Configurador.ps1");
            ProcessStartInfo psi = new ProcessStartInfo();
            psi.FileName = "powershell.exe";
            psi.Arguments = "-NoProfile -ExecutionPolicy Bypass -WindowStyle Hidden -File \"" + script + "\"";
            psi.WindowStyle = ProcessWindowStyle.Hidden;
            psi.CreateNoWindow = true;
            psi.UseShellExecute = false;
            Process.Start(psi);
        } catch {}
    }
}
"""
    with open(os.path.join(scripts_dir, "Launcher.cs"), "w", encoding="utf-8") as f:
        f.write(cs_launcher)

    # Scripts tecnicos auxiliares dentro de scripts/
    bat_install_svc = """@echo off
title Instalar Servicio Morpheus
net session >nul 2>&1
if %errorlevel% neq 0 (
    echo [ERROR] Ejecuta este archivo haciendo clic derecho: "Ejecutar como administrador".
    pause
    exit /b 1
)
cd /d "%~dp0\\.."
sc.exe stop "MorpheusSyncAgent" >nul 2>&1
timeout /t 2 /nobreak >nul
sc.exe delete "MorpheusSyncAgent" >nul 2>&1
timeout /t 1 /nobreak >nul
sc.exe create "MorpheusSyncAgent" binPath= "\"%CD%\\MorpheusSyncAgent.exe\"" start= auto DisplayName= "Morpheus Sync Agent"
sc.exe description "MorpheusSyncAgent" "Agente de sincronizacion en tiempo real de Morpheus ERP / WMS"
echo.
echo Servicio registrado exitosamente (permanece DETENIDO hasta que inicies la sincronizacion).
pause
"""
    with open(os.path.join(scripts_dir, "Instalar_Servicio.bat"), "w", encoding="utf-8") as f:
        f.write(bat_install_svc)

    bat_uninstall = """@echo off
title Desinstalar Servicio Morpheus
net session >nul 2>&1
if %errorlevel% neq 0 (
    echo [ERROR] Ejecuta como administrador.
    pause
    exit /b 1
)
sc stop "MorpheusSyncAgent" >nul 2>&1
timeout /t 2 /nobreak >nul
sc delete "MorpheusSyncAgent"
echo.
echo Servicio desinstalado exitosamente.
pause
"""
    with open(os.path.join(scripts_dir, "Desinstalar_Servicio.bat"), "w", encoding="utf-8") as f:
        f.write(bat_uninstall)

    bat_start = """@echo off
net start "MorpheusSyncAgent"
pause
"""
    with open(os.path.join(scripts_dir, "Iniciar_Servicio.bat"), "w", encoding="utf-8") as f:
        f.write(bat_start)

    bat_stop = """@echo off
net stop "MorpheusSyncAgent"
pause
"""
    with open(os.path.join(scripts_dir, "Detener_Servicio.bat"), "w", encoding="utf-8") as f:
        f.write(bat_stop)

    readme = """===========================================================
  MORPHEUS SYNC AGENT - INSTALACION PROFESIONAL DE TIENDAS
===========================================================

INSTRUCCIONES PARA EL PERSONAL DE TIENDA:

1. Para INSTALAR en esta tienda:
   Haz doble clic en:
   👉 1_Instalar_Morpheus_Tienda.vbs (o 1_Instalar_Morpheus_Tienda.bat)

   Se abrira el ASISTENTE VISUAL DE INSTALACION donde podras:
   - Seleccionar tu tienda de la lista (ej. Tienda 01 - Patio Trigal, Cumboto, etc.)
   - Probar la conexion con la base de datos SQL Server de la tienda con 1 clic.
   - Presionar "INSTALAR EN ESTA TIENDA".

2. Para ABRIR EL PANEL DE CONTROL Y SINCRONIZACION:
   - Haz doble clic sobre el icono creado en tu Escritorio:
     "Morpheus - Panel de Control"
   - O abre "Configurar_Agente.vbs" dentro de la carpeta.

No requiere abrir lineas de comando ni conocimientos tecnicos avanzados.
===========================================================
"""
    with open(os.path.join(build_dir, "LEEME_INSTALACION_TIENDAS.txt"), "w", encoding="utf-8") as f:
        f.write(readme)

    print("[6/6] Empaquetando instalador final en ZIP...")
    dest_zip = os.path.join(static_dir, "MorpheusSyncAgent_Installer.zip")
    with zipfile.ZipFile(dest_zip, "w", zipfile.ZIP_DEFLATED) as z:
        for root, dirs, files in os.walk(build_dir):
            for file in files:
                full_path = os.path.join(root, file)
                rel_path = os.path.relpath(full_path, build_dir)
                z.write(full_path, rel_path)
                print(f"  -> Incluido: {rel_path} ({os.path.getsize(full_path):,} bytes)")

    # Actualizar script powershell para instalacion desatendida/web (instalar.ps1)
    ps1_web = """# Script de Instalacion Oficial Morpheus Sync Agent (Tiendas)
$ErrorActionPreference = "Stop"
$zipUrl = "https://api.qa.morpheussoft.net/static/MorpheusSyncAgent_Installer.zip"
$destDir = "C:\\MorpheusSyncAgent"
$tempZip = "$env:TEMP\\MorpheusSyncAgent_Installer.zip"

Write-Host "=========================================================" -ForegroundColor Cyan
Write-Host "  DESCARGANDO PAQUETE OFICIAL MORPHEUS TIENDAS" -ForegroundColor Cyan
Write-Host "=========================================================" -ForegroundColor Cyan

Write-Host "`n[1/3] Descargando instalador desde la nube QA..." -ForegroundColor Yellow
[Net.ServicePointManager]::SecurityProtocol = [Net.SecurityProtocolType]::Tls12
Invoke-WebRequest -Uri $zipUrl -OutFile $tempZip

Write-Host "[2/3] Extrayendo paquete en $destDir..." -ForegroundColor Yellow
if (!(Test-Path $destDir)) {
    New-Item -ItemType Directory -Path $destDir -Force | Out-Null
}
Expand-Archive -Path $tempZip -DestinationPath $destDir -Force
Remove-Item $tempZip -Force

Write-Host "[3/3] Abriendo Asistente Grafico de Instalacion..." -ForegroundColor Green
$installerScript = "$destDir\\Instalador_Tienda.ps1"
Start-Process powershell.exe -ArgumentList "-NoProfile -ExecutionPolicy Bypass -WindowStyle Hidden -File `"$installerScript`""
"""
    with open(os.path.join(static_dir, "instalar.ps1"), "w", encoding="utf-8-sig") as f:
        f.write(ps1_web)

    print(f"\n[OK] Instalador empaquetado: {dest_zip} ({os.path.getsize(dest_zip):,} bytes)")
    print(f"[OK] Script de instalacion web: {os.path.join(static_dir, 'instalar.ps1')}")

if __name__ == "__main__":
    build_installer()
