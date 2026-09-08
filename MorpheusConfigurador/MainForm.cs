using System;
using System.Diagnostics;
using System.Drawing;
using System.IO;
using System.Net.Http;
using System.ServiceProcess;
using System.Text.Json;
using System.Text.Json.Nodes;
using System.Threading.Tasks;
using System.Windows.Forms;
using Microsoft.Data.SqlClient;

namespace MorpheusConfigurador;

public class MainForm : Form
{
    private readonly string _baseDir;
    private readonly string _appSettingsPath;
    private readonly string _syncStatePath;
    private readonly string _localDbPath;
    private readonly string _agentExePath;

    // Controls
    private Label lblServiceStatus = null!;
    
    // Tab 1: Puesta a Punto
    private Button btnResetLocalState = null!;
    private Label lblResetStatus = null!;
    private Button btnSyncCategories = null!;
    private Button btnSyncSuppliers = null!;
    private Button btnSyncProducts = null!;
    private Button btnSyncBarcodes = null!;
    private Button btnSyncCosts = null!;
    private RadioButton rbBaselineToday = null!;
    private RadioButton rbBaselineCustom = null!;
    private TextBox txtBaselineDate = null!;
    private Button btnSyncBaseline = null!;
    
    private Label lblLastSuppliers = null!;
    private Label lblLastBarcodes = null!;
    private Label lblLastCosts = null!;
    private Label lblLastBaseline = null!;
    private Label lblLastSales = null!;

    // Tab 2: Ventas y Movimientos
    private RadioButton rbSales30Days = null!;
    private RadioButton rbSales3Months = null!;
    private RadioButton rbSales6Months = null!;
    private RadioButton rbSalesAll = null!;
    private RadioButton rbSalesCustom = null!;
    private TextBox txtSalesCustomDate = null!;
    private Button btnSyncSales = null!;
    private Button btnSyncMovements = null!;
    private RadioButton rbMovementsIncremental = null!;
    private RadioButton rbMovementsCustom = null!;
    private TextBox txtMovementsCustomDate = null!;
    private Label lblMovementsInfo = null!;

    // Tab 3: Servicio de Windows
    private Button btnStartService = null!;
    private Button btnStopService = null!;
    private Button btnRestartService = null!;
    private Label lblServiceTabStatus = null!;
    private CheckBox chkAutoSales = null!;
    private TextBox txtIntervalSales = null!;
    private CheckBox chkAutoMovements = null!;
    private TextBox txtIntervalMovements = null!;
    private CheckBox chkAutoProducts = null!;
    private TextBox txtIntervalProducts = null!;
    private CheckBox chkAutoBarcodes = null!;
    private TextBox txtIntervalBarcodes = null!;
    private CheckBox chkAutoSuppliers = null!;
    private TextBox txtIntervalSuppliers = null!;

    // Tab 4: Conexiones & Sucursal
    private TextBox txtSqlServer = null!;
    private TextBox txtSqlDb = null!;
    private TextBox txtSqlUser = null!;
    private TextBox txtSqlPass = null!;
    private Button btnTestSql = null!;
    private Label lblSqlTestResult = null!;

    private TextBox txtCloudUrl = null!;
    private ComboBox cmbStores = null!;
    private TextBox txtCustomStoreId = null!;
    private Button btnTestCloud = null!;
    private Label lblCloudTestResult = null!;

    private Button btnSaveAll = null!;
    private StatusStrip statusStrip = null!;
    private ToolStripStatusLabel lblStatusText = null!;

    public MainForm()
    {
        _baseDir = AppDomain.CurrentDomain.BaseDirectory;
        _appSettingsPath = Path.Combine(_baseDir, "appsettings.json");
        _syncStatePath = Path.Combine(_baseDir, "sync_state.json");
        _localDbPath = Path.Combine(_baseDir, "morpheus_local.db");
        _agentExePath = Path.Combine(_baseDir, "MorpheusSyncAgent.exe");

        InitializeComponent();
        LoadSettings();
        RefreshSyncState();
        UpdateServiceStatus();
    }

    private void InitializeComponent()
    {
        this.Text = "Morpheus Sync Agent - Panel de Control Oficial";
        this.Size = new Size(880, 720);
        this.MinimumSize = new Size(820, 680);
        this.StartPosition = FormStartPosition.CenterScreen;
        this.Font = new Font("Segoe UI", 9.5f, FontStyle.Regular);
        this.BackColor = Color.FromArgb(15, 23, 42); // Slate-900
        this.ForeColor = Color.FromArgb(248, 250, 252);

        // Header Panel
        var pnlHeader = new Panel
        {
            Dock = DockStyle.Top,
            Height = 70,
            BackColor = Color.FromArgb(30, 41, 59), // Slate-800
            Padding = new Padding(16, 12, 16, 12)
        };

        var lblLogo = new Label
        {
            Text = "M",
            Font = new Font("Segoe UI", 16f, FontStyle.Bold),
            ForeColor = Color.White,
            BackColor = Color.FromArgb(99, 102, 241), // Indigo-500
            TextAlign = ContentAlignment.MiddleCenter,
            Size = new Size(38, 38),
            Location = new Point(16, 14)
        };
        pnlHeader.Controls.Add(lblLogo);

        var lblTitle = new Label
        {
            Text = "Morpheus Sync Agent",
            Font = new Font("Segoe UI", 13f, FontStyle.Bold),
            ForeColor = Color.White,
            AutoSize = true,
            Location = new Point(62, 12)
        };
        pnlHeader.Controls.Add(lblTitle);

        var lblSubTitle = new Label
        {
            Text = "Panel de Control y Enlace POS Tienda a Nube Morpheus",
            Font = new Font("Segoe UI", 8.5f),
            ForeColor = Color.FromArgb(148, 163, 184),
            AutoSize = true,
            Location = new Point(64, 36)
        };
        pnlHeader.Controls.Add(lblSubTitle);

        lblServiceStatus = new Label
        {
            Text = "CONSULTANDO...",
            Font = new Font("Segoe UI", 9.5f, FontStyle.Bold),
            ForeColor = Color.White,
            BackColor = Color.FromArgb(51, 65, 85),
            TextAlign = ContentAlignment.MiddleCenter,
            Size = new Size(160, 32),
            Location = new Point(680, 18),
            Anchor = AnchorStyles.Top | AnchorStyles.Right
        };
        pnlHeader.Controls.Add(lblServiceStatus);

        this.Controls.Add(pnlHeader);

        // Status Strip
        statusStrip = new StatusStrip
        {
            BackColor = Color.FromArgb(30, 41, 59),
            ForeColor = Color.FromArgb(148, 163, 184)
        };
        lblStatusText = new ToolStripStatusLabel("Listo para operar.") { ForeColor = Color.FromArgb(203, 213, 225) };
        statusStrip.Items.Add(lblStatusText);
        this.Controls.Add(statusStrip);

        // TabControl
        var tabControl = new TabControl
        {
            Dock = DockStyle.Fill,
            Padding = new Point(14, 8),
            Font = new Font("Segoe UI", 10f, FontStyle.Bold)
        };

        // Tab 1: Puesta a Punto
        var tab1 = new TabPage("1. Puesta a Punto (Fases 2 y 3)");
        tab1.BackColor = Color.FromArgb(15, 23, 42);
        BuildTab1(tab1);
        tabControl.TabPages.Add(tab1);

        // Tab 2: Sincronizar a Voluntad
        var tab2 = new TabPage("2. Sincronizar a Voluntad");
        tab2.BackColor = Color.FromArgb(15, 23, 42);
        BuildTab2(tab2);
        tabControl.TabPages.Add(tab2);

        // Tab 3: Servicio Segundo Plano
        var tab3 = new TabPage("3. Servicio en Fondo");
        tab3.BackColor = Color.FromArgb(15, 23, 42);
        BuildTab3(tab3);
        tabControl.TabPages.Add(tab3);

        // Tab 4: Conexiones & Tienda
        var tab4 = new TabPage("4. Conexiones & Tienda");
        tab4.BackColor = Color.FromArgb(15, 23, 42);
        BuildTab4(tab4);
        tabControl.TabPages.Add(tab4);

        this.Controls.Add(tabControl);
        tabControl.BringToFront();
    }

    private void BuildTab1(TabPage page)
    {
        var panel = new Panel { AutoScroll = true, Dock = DockStyle.Fill, Padding = new Padding(16) };

        // Group 1: Fase 2
        var gbFase2 = CreateGroupBox("FASE 2: Resetear Estado Local (Semilla Cero)", 16, 12, 810, 110, Color.FromArgb(245, 158, 11));
        var lblFase2Desc = new Label
        {
            Text = "Elimina sync_state.json y morpheus_local.db (creando un respaldo previo en /backup) para que la extraccion comience limpia.",
            Font = new Font("Segoe UI", 9f),
            ForeColor = Color.FromArgb(148, 163, 184),
            Location = new Point(16, 26),
            Size = new Size(770, 32)
        };
        gbFase2.Controls.Add(lblFase2Desc);

        btnResetLocalState = CreateButton("Limpiar / Resetear Estado Local", 16, 62, 240, 36, Color.FromArgb(217, 119, 6));
        btnResetLocalState.Click += BtnResetLocalState_Click;
        gbFase2.Controls.Add(btnResetLocalState);

        lblResetStatus = new Label { Location = new Point(270, 70), AutoSize = true, Font = new Font("Segoe UI", 9f, FontStyle.Bold) };
        gbFase2.Controls.Add(lblResetStatus);
        panel.Controls.Add(gbFase2);

        // Group 2: Fase 3
        var gbFase3 = CreateGroupBox("FASE 3: Carga de Maestros Inicial (Ejecucion a Voluntad)", 16, 132, 810, 220, Color.FromArgb(56, 189, 248));
        var lblFase3Desc = new Label
        {
            Text = "Presiona cada boton en orden estricto para sembrar los catalogos en Morpheus QA:",
            Font = new Font("Segoe UI", 9f),
            ForeColor = Color.FromArgb(148, 163, 184),
            Location = new Point(16, 26),
            Size = new Size(770, 20)
        };
        gbFase3.Controls.Add(lblFase3Desc);

        btnSyncCategories = CreateButton("0. Sincronizar Categorías (Árbol)", 16, 54, 230, 34, Color.FromArgb(14, 165, 233));
        btnSyncCategories.Click += (s, e) => RunExtractor("categories");
        gbFase3.Controls.Add(btnSyncCategories);

        btnSyncSuppliers = CreateButton("1. Sincronizar Proveedores", 256, 54, 220, 34, Color.FromArgb(2, 132, 199));
        btnSyncSuppliers.Click += (s, e) => RunExtractor("suppliers");
        gbFase3.Controls.Add(btnSyncSuppliers);

        btnSyncProducts = CreateButton("2. Sincronizar Productos & Variantes", 486, 54, 270, 34, Color.FromArgb(2, 132, 199));
        btnSyncProducts.Click += (s, e) => RunExtractor("products");
        gbFase3.Controls.Add(btnSyncProducts);

        btnSyncBarcodes = CreateButton("3. Sincronizar Codigos Barra", 16, 96, 230, 34, Color.FromArgb(2, 132, 199));
        btnSyncBarcodes.Click += (s, e) => RunExtractor("barcodes");
        gbFase3.Controls.Add(btnSyncBarcodes);

        btnSyncCosts = CreateButton("4. Sincronizar Costos & Cruces", 256, 96, 220, 34, Color.FromArgb(2, 132, 199));
        btnSyncCosts.Click += (s, e) => RunExtractor("supplier-products");
        gbFase3.Controls.Add(btnSyncCosts);

        // Baseline Controls
        var pnlBaseline = new Panel { Location = new Point(16, 140), Size = new Size(770, 72), BackColor = Color.FromArgb(30, 41, 59) };
        var lblBaselineTitle = new Label { Text = "5. Inventario Inicial (Baseline):", Location = new Point(12, 8), AutoSize = true, Font = new Font("Segoe UI", 9.5f, FontStyle.Bold), ForeColor = Color.White };
        pnlBaseline.Controls.Add(lblBaselineTitle);

        rbBaselineToday = new RadioButton 
        { 
            Text = "Hoy (Inventario Vivo)", 
            Checked = true, 
            Location = new Point(14, 34), 
            AutoSize = true, 
            ForeColor = Color.White,
            Cursor = Cursors.Hand
        };
        pnlBaseline.Controls.Add(rbBaselineToday);

        rbBaselineCustom = new RadioButton 
        { 
            Text = "A fecha de corte:", 
            Location = new Point(220, 34), 
            AutoSize = true, 
            ForeColor = Color.White,
            Cursor = Cursors.Hand
        };
        pnlBaseline.Controls.Add(rbBaselineCustom);

        txtBaselineDate = new TextBox 
        { 
            Text = DateTime.Today.ToString("yyyy-MM-dd"), 
            Location = new Point(365, 32), 
            Width = 95, 
            BackColor = Color.FromArgb(15, 23, 42), 
            ForeColor = Color.White,
            TextAlign = HorizontalAlignment.Center
        };
        pnlBaseline.Controls.Add(txtBaselineDate);

        btnSyncBaseline = CreateButton("Sincronizar Inventario (Baseline)", 495, 26, 260, 36, Color.FromArgb(16, 185, 129));
        btnSyncBaseline.Click += BtnSyncBaseline_Click;
        pnlBaseline.Controls.Add(btnSyncBaseline);

        void UpdateBaselineLayout()
        {
            rbBaselineToday.Location = new Point(14, 34);
            rbBaselineCustom.Location = new Point(rbBaselineToday.Right + 25, 34);
            txtBaselineDate.Location = new Point(rbBaselineCustom.Right + 8, 31);
            btnSyncBaseline.Location = new Point(pnlBaseline.Width - btnSyncBaseline.Width - 14, 26);
        }

        pnlBaseline.Layout += (s, e) => UpdateBaselineLayout();

        rbBaselineToday.CheckedChanged += (s, e) =>
        {
            if (rbBaselineToday.Checked)
            {
                txtBaselineDate.Enabled = false;
                txtBaselineDate.ForeColor = Color.Gray;
            }
        };

        rbBaselineCustom.CheckedChanged += (s, e) =>
        {
            if (rbBaselineCustom.Checked)
            {
                txtBaselineDate.Enabled = true;
                txtBaselineDate.ForeColor = Color.White;
                txtBaselineDate.Focus();
            }
        };

        txtBaselineDate.Click += (s, e) =>
        {
            rbBaselineCustom.Checked = true;
        };

        UpdateBaselineLayout();

        gbFase3.Controls.Add(pnlBaseline);
        panel.Controls.Add(gbFase3);

        // Group 3: Live State Card
        var gbState = CreateGroupBox("Estado Actual de Sincronizacion (sync_state.json)", 16, 362, 810, 160, Color.FromArgb(203, 213, 225));
        
        lblLastSuppliers = new Label { Location = new Point(16, 30), Size = new Size(240, 36), Text = "Proveedores / Productos:\nCargando...", ForeColor = Color.FromArgb(56, 189, 248) };
        lblLastBarcodes = new Label { Location = new Point(16, 75), Size = new Size(240, 36), Text = "Codigos de Barra:\nCargando...", ForeColor = Color.FromArgb(56, 189, 248) };
        lblLastCosts = new Label { Location = new Point(270, 30), Size = new Size(240, 36), Text = "Costos Proveedor:\nCargando...", ForeColor = Color.FromArgb(56, 189, 248) };
        lblLastBaseline = new Label { Location = new Point(270, 75), Size = new Size(240, 36), Text = "Inventario Baseline:\nCargando...", ForeColor = Color.FromArgb(245, 158, 11) };
        lblLastSales = new Label { Location = new Point(530, 30), Size = new Size(260, 36), Text = "Ultima Venta Sincronizada:\nCargando...", ForeColor = Color.FromArgb(16, 185, 129) };

        gbState.Controls.Add(lblLastSuppliers);
        gbState.Controls.Add(lblLastBarcodes);
        gbState.Controls.Add(lblLastCosts);
        gbState.Controls.Add(lblLastBaseline);
        gbState.Controls.Add(lblLastSales);

        var btnRefresh = CreateButton("Refrescar Marcas", 16, 118, 150, 28, Color.FromArgb(51, 65, 85));
        btnRefresh.Click += (s, e) => RefreshSyncState();
        gbState.Controls.Add(btnRefresh);

        panel.Controls.Add(gbState);
        page.Controls.Add(panel);
    }

    private void BuildTab2(TabPage page)
    {
        var panel = new Panel { AutoScroll = true, Dock = DockStyle.Fill, Padding = new Padding(16) };

        var gbSales = CreateGroupBox("Sincronizacion de Ventas con Parametros", 16, 12, 810, 240, Color.FromArgb(16, 185, 129));
        var lblSalesDesc = new Label
        {
            Text = "Selecciona el rango de historico de ventas del POS que deseas transmitir para alimentar el MRP:",
            Location = new Point(16, 26),
            Size = new Size(770, 20),
            ForeColor = Color.FromArgb(148, 163, 184)
        };
        gbSales.Controls.Add(lblSalesDesc);

        rbSales30Days = new RadioButton { Text = "Ultimos 30 dias", Location = new Point(20, 56), AutoSize = true, ForeColor = Color.White };
        rbSales3Months = new RadioButton { Text = "Ultimos 3 meses (Recomendado para UAT)", Checked = true, Location = new Point(20, 84), AutoSize = true, ForeColor = Color.White };
        rbSales6Months = new RadioButton { Text = "Ultimos 6 meses", Location = new Point(20, 112), AutoSize = true, ForeColor = Color.White };
        rbSalesAll = new RadioButton { Text = "Todo el Historial Completo", Location = new Point(20, 140), AutoSize = true, ForeColor = Color.White };

        rbSalesCustom = new RadioButton { Text = "Desde fecha especifica:", Location = new Point(20, 168), AutoSize = true, ForeColor = Color.White };
        txtSalesCustomDate = new TextBox { Text = "2026-01-01", Location = new Point(190, 166), Width = 100, BackColor = Color.FromArgb(15, 23, 42), ForeColor = Color.White };

        gbSales.Controls.Add(rbSales30Days);
        gbSales.Controls.Add(rbSales3Months);
        gbSales.Controls.Add(rbSales6Months);
        gbSales.Controls.Add(rbSalesAll);
        gbSales.Controls.Add(rbSalesCustom);
        gbSales.Controls.Add(txtSalesCustomDate);

        btnSyncSales = CreateButton("Sincronizar Ventas Ahora", 20, 196, 220, 36, Color.FromArgb(16, 185, 129));
        btnSyncSales.Click += BtnSyncSales_Click;
        gbSales.Controls.Add(btnSyncSales);

        panel.Controls.Add(gbSales);

        // Movimientos
        var gbMovements = CreateGroupBox("Sincronizacion de Movimientos de Almacen (Kardex)", 16, 265, 810, 190, Color.FromArgb(99, 102, 241));
        var lblMovDesc = new Label
        {
            Text = "Extrae entradas, salidas, traslados y mermas registradas localmente posteriores al inventario inicial:",
            Location = new Point(16, 26),
            Size = new Size(770, 20),
            ForeColor = Color.FromArgb(148, 163, 184)
        };
        gbMovements.Controls.Add(lblMovDesc);

        lblMovementsInfo = new Label
        {
            Text = "Ultima sincronizacion de movimientos: Verificando...",
            Location = new Point(20, 50),
            Size = new Size(760, 22),
            ForeColor = Color.FromArgb(56, 189, 248),
            Font = new Font("Segoe UI", 9F, FontStyle.Bold)
        };
        gbMovements.Controls.Add(lblMovementsInfo);

        rbMovementsIncremental = new RadioButton
        {
            Text = "Sincronizacion incremental (Recomendado: posterior a la ultima fecha o corte de Baseline)",
            Checked = true,
            Location = new Point(20, 76),
            AutoSize = true,
            ForeColor = Color.White
        };
        gbMovements.Controls.Add(rbMovementsIncremental);

        rbMovementsCustom = new RadioButton
        {
            Text = "Desde fecha especifica:",
            Location = new Point(20, 104),
            AutoSize = true,
            ForeColor = Color.White
        };
        txtMovementsCustomDate = new TextBox
        {
            Text = DateTime.Today.ToString("yyyy-MM-dd"),
            Location = new Point(200, 102),
            Width = 100,
            BackColor = Color.FromArgb(15, 23, 42),
            ForeColor = Color.White
        };
        gbMovements.Controls.Add(rbMovementsCustom);
        gbMovements.Controls.Add(txtMovementsCustomDate);

        btnSyncMovements = CreateButton("Sincronizar Movimientos Ahora", 20, 136, 250, 36, Color.FromArgb(99, 102, 241));
        btnSyncMovements.Click += BtnSyncMovements_Click;
        gbMovements.Controls.Add(btnSyncMovements);

        panel.Controls.Add(gbMovements);
        page.Controls.Add(panel);
    }

    private void BuildTab3(TabPage page)
    {
        var panel = new Panel { AutoScroll = true, Dock = DockStyle.Fill, Padding = new Padding(16) };

        var gbControl = CreateGroupBox("Control del Servicio de Windows (NEO)", 16, 12, 810, 140, Color.FromArgb(203, 213, 225));
        
        btnStartService = CreateButton("Iniciar Servicio", 16, 36, 160, 38, Color.FromArgb(16, 185, 129));
        btnStartService.Click += (s, e) => ControlService("start");
        gbControl.Controls.Add(btnStartService);

        btnStopService = CreateButton("Detener Servicio", 186, 36, 160, 38, Color.FromArgb(239, 68, 68));
        btnStopService.Click += (s, e) => ControlService("stop");
        gbControl.Controls.Add(btnStopService);

        btnRestartService = CreateButton("Reiniciar Servicio", 356, 36, 160, 38, Color.FromArgb(51, 65, 85));
        btnRestartService.Click += (s, e) => ControlService("restart");
        gbControl.Controls.Add(btnRestartService);

        var btnConsole = CreateButton("Probar en Consola", 526, 36, 160, 38, Color.FromArgb(51, 65, 85));
        btnConsole.Click += (s, e) => RunExtractor("");
        gbControl.Controls.Add(btnConsole);

        lblServiceTabStatus = new Label
        {
            Text = "Estado actual del servicio: Verificando...",
            Location = new Point(20, 92),
            Size = new Size(760, 32),
            Font = new Font("Segoe UI", 10F, FontStyle.Bold),
            ForeColor = Color.FromArgb(148, 163, 184)
        };
        gbControl.Controls.Add(lblServiceTabStatus);

        panel.Controls.Add(gbControl);

        // Extractores automaticos
        var gbExtractors = CreateGroupBox("Que datos debe sincronizar el servicio en segundo plano?", 16, 165, 810, 240, Color.FromArgb(56, 189, 248));
        
        chkAutoSales = new CheckBox { Text = "Ventas (Recomendado activo)", Checked = true, Location = new Point(20, 36), AutoSize = true, ForeColor = Color.White };
        txtIntervalSales = new TextBox { Text = "10", Location = new Point(260, 34), Width = 50, BackColor = Color.FromArgb(15, 23, 42), ForeColor = Color.White };
        var lblInt1 = new Label { Text = "minutos", Location = new Point(316, 38), AutoSize = true, ForeColor = Color.FromArgb(148, 163, 184) };

        chkAutoMovements = new CheckBox { Text = "Movimientos de Inventario", Location = new Point(20, 72), AutoSize = true, ForeColor = Color.White };
        txtIntervalMovements = new TextBox { Text = "10", Location = new Point(260, 70), Width = 50, BackColor = Color.FromArgb(15, 23, 42), ForeColor = Color.White };
        var lblInt2 = new Label { Text = "minutos", Location = new Point(316, 74), AutoSize = true, ForeColor = Color.FromArgb(148, 163, 184) };

        chkAutoProducts = new CheckBox { Text = "Productos & Variantes", Location = new Point(20, 108), AutoSize = true, ForeColor = Color.White };
        txtIntervalProducts = new TextBox { Text = "60", Location = new Point(260, 106), Width = 50, BackColor = Color.FromArgb(15, 23, 42), ForeColor = Color.White };
        var lblInt3 = new Label { Text = "minutos", Location = new Point(316, 110), AutoSize = true, ForeColor = Color.FromArgb(148, 163, 184) };

        chkAutoBarcodes = new CheckBox { Text = "Codigos de Barra", Location = new Point(20, 144), AutoSize = true, ForeColor = Color.White };
        txtIntervalBarcodes = new TextBox { Text = "60", Location = new Point(260, 142), Width = 50, BackColor = Color.FromArgb(15, 23, 42), ForeColor = Color.White };
        var lblInt4 = new Label { Text = "minutos", Location = new Point(316, 146), AutoSize = true, ForeColor = Color.FromArgb(148, 163, 184) };

        chkAutoSuppliers = new CheckBox { Text = "Proveedores", Location = new Point(20, 180), AutoSize = true, ForeColor = Color.White };
        txtIntervalSuppliers = new TextBox { Text = "60", Location = new Point(260, 178), Width = 50, BackColor = Color.FromArgb(15, 23, 42), ForeColor = Color.White };
        var lblInt5 = new Label { Text = "minutos", Location = new Point(316, 182), AutoSize = true, ForeColor = Color.FromArgb(148, 163, 184) };

        gbExtractors.Controls.AddRange(new Control[] {
            chkAutoSales, txtIntervalSales, lblInt1,
            chkAutoMovements, txtIntervalMovements, lblInt2,
            chkAutoProducts, txtIntervalProducts, lblInt3,
            chkAutoBarcodes, txtIntervalBarcodes, lblInt4,
            chkAutoSuppliers, txtIntervalSuppliers, lblInt5
        });

        panel.Controls.Add(gbExtractors);

        // Mantenimiento de Servicio & Escritorio
        var gbInstall = CreateGroupBox("Mantenimiento del Servicio & Escritorio", 16, 420, 810, 90, Color.FromArgb(203, 213, 225));

        var btnInstall = CreateButton("Registrar Servicio Windows", 16, 32, 230, 36, Color.FromArgb(16, 185, 129));
        btnInstall.Click += (s, e) => InstallService();
        gbInstall.Controls.Add(btnInstall);

        var btnUninstall = CreateButton("Desinstalar Servicio", 256, 32, 200, 36, Color.FromArgb(239, 68, 68));
        btnUninstall.Click += (s, e) => UninstallService();
        gbInstall.Controls.Add(btnUninstall);

        var btnShortcut = CreateButton("Crear Icono en Escritorio", 466, 32, 230, 36, Color.FromArgb(99, 102, 241));
        btnShortcut.Click += (s, e) => CreateDesktopShortcut();
        gbInstall.Controls.Add(btnShortcut);

        panel.Controls.Add(gbInstall);
        page.Controls.Add(panel);
    }

    private void BuildTab4(TabPage page)
    {
        var panel = new Panel { AutoScroll = true, Dock = DockStyle.Fill, Padding = new Padding(16) };

        // SQL Server
        var gbSql = CreateGroupBox("Base de Datos SQL Server Local (VAD10)", 16, 12, 810, 190, Color.FromArgb(203, 213, 225));
        
        var lblSrv = new Label { Text = "Servidor SQL:", Location = new Point(20, 30), AutoSize = true, ForeColor = Color.FromArgb(148, 163, 184) };
        txtSqlServer = new TextBox { Text = @"AGUERREVERE\SRVAGUERREVERE", Location = new Point(140, 26), Width = 300, BackColor = Color.FromArgb(15, 23, 42), ForeColor = Color.White };

        var lblDb = new Label { Text = "Base de Datos:", Location = new Point(20, 62), AutoSize = true, ForeColor = Color.FromArgb(148, 163, 184) };
        txtSqlDb = new TextBox { Text = "VAD10", Location = new Point(140, 58), Width = 300, BackColor = Color.FromArgb(15, 23, 42), ForeColor = Color.White };

        var lblUsr = new Label { Text = "Usuario SQL:", Location = new Point(20, 94), AutoSize = true, ForeColor = Color.FromArgb(148, 163, 184) };
        txtSqlUser = new TextBox { Text = "jqFydZPO", Location = new Point(140, 90), Width = 300, BackColor = Color.FromArgb(15, 23, 42), ForeColor = Color.White };

        var lblPass = new Label { Text = "Contrasena SQL:", Location = new Point(20, 126), AutoSize = true, ForeColor = Color.FromArgb(148, 163, 184) };
        txtSqlPass = new TextBox { Text = "+121f4T$19", Location = new Point(140, 122), Width = 300, PasswordChar = '*', BackColor = Color.FromArgb(15, 23, 42), ForeColor = Color.White };

        btnTestSql = CreateButton("Probar Conexion SQL", 140, 154, 180, 28, Color.FromArgb(51, 65, 85));
        btnTestSql.Click += BtnTestSql_Click;

        lblSqlTestResult = new Label { Location = new Point(330, 159), AutoSize = true, Font = new Font("Segoe UI", 9f, FontStyle.Bold) };

        gbSql.Controls.AddRange(new Control[] { lblSrv, txtSqlServer, lblDb, txtSqlDb, lblUsr, txtSqlUser, lblPass, txtSqlPass, btnTestSql, lblSqlTestResult });
        panel.Controls.Add(gbSql);

        // Nube & Tienda
        var gbCloud = CreateGroupBox("Servidor Central Morpheus & Sucursal", 16, 210, 810, 150, Color.FromArgb(56, 189, 248));
        
        var lblUrl = new Label { Text = "URL API Nube:", Location = new Point(20, 30), AutoSize = true, ForeColor = Color.FromArgb(148, 163, 184) };
        txtCloudUrl = new TextBox { Text = "https://api.qa.morpheussoft.net", Location = new Point(140, 26), Width = 300, BackColor = Color.FromArgb(15, 23, 42), ForeColor = Color.White };

        var lblStore = new Label { Text = "Tienda / Sucursal:", Location = new Point(20, 62), AutoSize = true, ForeColor = Color.FromArgb(148, 163, 184) };
        cmbStores = new ComboBox { Location = new Point(140, 58), Width = 300, DropDownStyle = ComboBoxStyle.DropDownList };
        PopulateStoresComboBox();

        txtCustomStoreId = new TextBox { Location = new Point(450, 58), Width = 60, Text = "1", Visible = false, BackColor = Color.FromArgb(15, 23, 42), ForeColor = Color.White };

        btnTestCloud = CreateButton("Probar Conexion Nube", 140, 96, 180, 28, Color.FromArgb(51, 65, 85));
        btnTestCloud.Click += BtnTestCloud_Click;

        lblCloudTestResult = new Label { Location = new Point(330, 101), AutoSize = true, Font = new Font("Segoe UI", 9f, FontStyle.Bold) };

        gbCloud.Controls.AddRange(new Control[] { lblUrl, txtCloudUrl, lblStore, cmbStores, txtCustomStoreId, btnTestCloud, lblCloudTestResult });
        panel.Controls.Add(gbCloud);

        // Boton Guardar Todo
        btnSaveAll = CreateButton("Guardar Toda la Configuracion", 16, 370, 250, 42, Color.FromArgb(99, 102, 241));
        btnSaveAll.Click += BtnSaveAll_Click;
        panel.Controls.Add(btnSaveAll);

        page.Controls.Add(panel);
    }

    private GroupBox CreateGroupBox(string title, int x, int y, int w, int h, Color titleColor)
    {
        return new GroupBox
        {
            Text = title,
            Location = new Point(x, y),
            Size = new Size(w, h),
            ForeColor = titleColor,
            Font = new Font("Segoe UI", 9.5f, FontStyle.Bold),
            BackColor = Color.FromArgb(30, 41, 59)
        };
    }

    private Button CreateButton(string text, int x, int y, int w, int h, Color bg)
    {
        var btn = new Button
        {
            Text = text,
            Location = new Point(x, y),
            Size = new Size(w, h),
            BackColor = bg,
            ForeColor = Color.White,
            FlatStyle = FlatStyle.Flat,
            Font = new Font("Segoe UI", 9f, FontStyle.Bold),
            Cursor = Cursors.Hand
        };
        btn.FlatAppearance.BorderSize = 0;
        return btn;
    }

    private void PopulateStoresComboBox(List<FacilityOption>? dynamicFacilities = null)
    {
        cmbStores.Items.Clear();

        if (dynamicFacilities != null && dynamicFacilities.Count > 0)
        {
            foreach (var fac in dynamicFacilities)
            {
                cmbStores.Items.Add(fac);
            }
        }
        else
        {
            // Sedes conocidas en Morpheus QA
            cmbStores.Items.Add(new FacilityOption { Id = 10, Code = "CAT-01", Name = "10 - TUCACAS" });
            cmbStores.Items.Add(new FacilityOption { Id = 11, Code = "CAT-02", Name = "08 - MARACAY" });
            cmbStores.Items.Add(new FacilityOption { Id = 1, Code = "CAT-11", Name = "01 - PATIO TRIGAL" });
        }

        cmbStores.Items.Add("[Ingresar ID Personalizado...]");
        if (cmbStores.Items.Count > 0)
        {
            cmbStores.SelectedIndex = 0;
        }

        cmbStores.SelectedIndexChanged -= CmbStores_SelectedIndexChanged;
        cmbStores.SelectedIndexChanged += CmbStores_SelectedIndexChanged;
    }

    private void CmbStores_SelectedIndexChanged(object? s, EventArgs e)
    {
        txtCustomStoreId.Visible = (cmbStores.SelectedIndex == cmbStores.Items.Count - 1);
    }

    private int GetSelectedFacilityId()
    {
        if (cmbStores.SelectedItem is FacilityOption opt) return opt.Id;
        if (cmbStores.SelectedIndex == cmbStores.Items.Count - 1 && int.TryParse(txtCustomStoreId.Text.Trim(), out var customId)) return customId;
        return 1;
    }

    private string GetSelectedFacilityCode()
    {
        if (cmbStores.SelectedItem is FacilityOption opt) return opt.Code;
        return string.Empty;
    }

    private void SelectFacilityByIdOrCode(int targetId, string? targetCode)
    {
        for (int i = 0; i < cmbStores.Items.Count - 1; i++)
        {
            if (cmbStores.Items[i] is FacilityOption opt)
            {
                if (opt.Id == targetId || (!string.IsNullOrEmpty(targetCode) && opt.Code.Equals(targetCode, StringComparison.OrdinalIgnoreCase)))
                {
                    cmbStores.SelectedIndex = i;
                    txtCustomStoreId.Visible = false;
                    return;
                }
            }
        }

        cmbStores.SelectedIndex = cmbStores.Items.Count - 1;
        txtCustomStoreId.Text = targetId.ToString();
        txtCustomStoreId.Visible = true;
    }

    private async Task<List<FacilityOption>?> FetchFacilitiesFromCloudAsync(string baseUrl)
    {
        try
        {
            using var http = new HttpClient { Timeout = TimeSpan.FromSeconds(6) };
            string url = $"{baseUrl.TrimEnd('/')}/api/v1/import/facilities";
            var resp = await http.GetAsync(url);
            if (resp.IsSuccessStatusCode)
            {
                var json = await resp.Content.ReadAsStringAsync();
                var options = new JsonSerializerOptions { PropertyNameCaseInsensitive = true };
                return JsonSerializer.Deserialize<List<FacilityOption>>(json, options);
            }
        }
        catch { }
        return null;
    }

    private ServiceController? GetActiveServiceController(out string detectedServiceName)
    {
        try
        {
            var sc = new ServiceController("NEO");
            var _ = sc.Status;
            detectedServiceName = "NEO";
            return sc;
        }
        catch
        {
            try
            {
                var scOld = new ServiceController("MorpheusSyncAgent");
                var _ = scOld.Status;
                detectedServiceName = "MorpheusSyncAgent";
                return scOld;
            }
            catch
            {
                detectedServiceName = "NEO";
                return null;
            }
        }
    }

    private void UpdateServiceStatus()
    {
        try
        {
            using var sc = GetActiveServiceController(out string svcName);
            if (sc == null)
            {
                lblServiceStatus.Text = "NO INSTALADO";
                lblServiceStatus.BackColor = Color.FromArgb(51, 65, 85);
                if (lblServiceTabStatus != null)
                {
                    lblServiceTabStatus.Text = "⚠ Estado del servicio: NO INSTALADO en este equipo (Registralo abajo como 'NEO')";
                    lblServiceTabStatus.ForeColor = Color.FromArgb(245, 158, 11);
                }
                return;
            }

            var status = sc.Status;
            if (status == ServiceControllerStatus.Running)
            {
                lblServiceStatus.Text = "EN EJECUCION [OK]";
                lblServiceStatus.BackColor = Color.FromArgb(16, 185, 129);
                if (lblServiceTabStatus != null)
                {
                    lblServiceTabStatus.Text = $"● Estado del servicio ({svcName}): EN EJECUCIÓN [ACTIVO]";
                    lblServiceTabStatus.ForeColor = Color.FromArgb(16, 185, 129);
                }
            }
            else if (status == ServiceControllerStatus.Stopped)
            {
                lblServiceStatus.Text = "DETENIDO";
                lblServiceStatus.BackColor = Color.FromArgb(239, 68, 68);
                if (lblServiceTabStatus != null)
                {
                    lblServiceTabStatus.Text = $"■ Estado del servicio ({svcName}): DETENIDO (No sincroniza en segundo plano)";
                    lblServiceTabStatus.ForeColor = Color.FromArgb(239, 68, 68);
                }
            }
            else
            {
                lblServiceStatus.Text = status.ToString().ToUpper();
                lblServiceStatus.BackColor = Color.FromArgb(245, 158, 11);
                if (lblServiceTabStatus != null)
                {
                    lblServiceTabStatus.Text = $"▲ Estado del servicio ({svcName}): {status.ToString().ToUpper()}";
                    lblServiceTabStatus.ForeColor = Color.FromArgb(245, 158, 11);
                }
            }
        }
        catch
        {
            lblServiceStatus.Text = "NO INSTALADO";
            lblServiceStatus.BackColor = Color.FromArgb(51, 65, 85);
            if (lblServiceTabStatus != null)
            {
                lblServiceTabStatus.Text = "⚠ Estado del servicio: NO INSTALADO en este equipo";
                lblServiceTabStatus.ForeColor = Color.FromArgb(245, 158, 11);
            }
        }
    }

    private void ControlService(string action)
    {
        try
        {
            using var sc = GetActiveServiceController(out string svcName);
            if (sc == null)
            {
                MessageBox.Show("El servicio de Windows 'NEO' no esta instalado.\n\nPor favor haz clic en 'Registrar Servicio Windows' abajo para registrarlo.", "Servicio No Instalado", MessageBoxButtons.OK, MessageBoxIcon.Warning);
                return;
            }

            lblStatusText.Text = $"Ejecutando accion '{action}' en servicio {svcName}...";

            if (action == "start")
            {
                if (sc.Status == ServiceControllerStatus.Running)
                {
                    UpdateServiceStatus();
                    MessageBox.Show($"El servicio {svcName} ya se encuentra en ejecucion.", "Servicio Activo", MessageBoxButtons.OK, MessageBoxIcon.Information);
                    return;
                }
                sc.Start();
                sc.WaitForStatus(ServiceControllerStatus.Running, TimeSpan.FromSeconds(10));
                UpdateServiceStatus();
                lblStatusText.Text = "Servicio iniciado con exito.";
                MessageBox.Show($"El servicio de Windows '{svcName}' se ha INICIADO con exito.\n\nAhora esta sincronizando en segundo plano segun los intervalos configurados.", "Servicio Iniciado", MessageBoxButtons.OK, MessageBoxIcon.Information);
            }
            else if (action == "stop")
            {
                if (sc.Status == ServiceControllerStatus.Stopped)
                {
                    UpdateServiceStatus();
                    MessageBox.Show($"El servicio {svcName} ya se encuentra detenido.", "Servicio Detenido", MessageBoxButtons.OK, MessageBoxIcon.Information);
                    return;
                }
                sc.Stop();
                sc.WaitForStatus(ServiceControllerStatus.Stopped, TimeSpan.FromSeconds(10));
                UpdateServiceStatus();
                lblStatusText.Text = "Servicio detenido con exito.";
                MessageBox.Show($"El servicio de Windows '{svcName}' se ha DETENIDO con exito.", "Servicio Detenido", MessageBoxButtons.OK, MessageBoxIcon.Information);
            }
            else if (action == "restart")
            {
                if (sc.Status == ServiceControllerStatus.Running)
                {
                    sc.Stop();
                    sc.WaitForStatus(ServiceControllerStatus.Stopped, TimeSpan.FromSeconds(10));
                }
                sc.Start();
                sc.WaitForStatus(ServiceControllerStatus.Running, TimeSpan.FromSeconds(10));
                UpdateServiceStatus();
                lblStatusText.Text = "Servicio reiniciado con exito.";
                MessageBox.Show($"El servicio de Windows '{svcName}' se ha REINICIADO con exito y se encuentra en ejecucion.", "Servicio Reiniciado", MessageBoxButtons.OK, MessageBoxIcon.Information);
            }
        }
        catch (Exception ex)
        {
            UpdateServiceStatus();
            MessageBox.Show($"Error al controlar el servicio:\n{ex.Message}\n\nVerifica que la aplicacion se este ejecutando con permisos de Administrador.", "Error de Servicio", MessageBoxButtons.OK, MessageBoxIcon.Error);
            lblStatusText.Text = $"Error: {ex.Message}";
        }
    }

    private void RefreshSyncState()
    {
        if (File.Exists(_syncStatePath))
        {
            try
            {
                var json = File.ReadAllText(_syncStatePath);
                var doc = JsonNode.Parse(json);
                if (doc != null)
                {
                    lblLastSuppliers.Text = $"Proveedores / Productos:\n{doc["LastProductSync"]?.ToString() ?? "Sin iniciar"}";
                    lblLastBarcodes.Text = $"Codigos de Barra:\n{doc["LastBarcodeSync"]?.ToString() ?? "Sin iniciar"}";
                    lblLastCosts.Text = $"Costos Proveedor:\n{doc["LastSupplierProductSync"]?.ToString() ?? "Sin iniciar"}";
                    
                    bool baseline = doc["BaselineInventoryDone"]?.GetValue<bool>() ?? false;
                    lblLastBaseline.Text = $"Inventario Baseline:\n{(baseline ? "COMPLETADO [OK]" : "Pendiente")}";
                    lblLastBaseline.ForeColor = baseline ? Color.FromArgb(16, 185, 129) : Color.FromArgb(245, 158, 11);

                    lblLastSales.Text = $"Ultima Venta:\n{doc["LastSalesSync"]?.ToString() ?? "Sin iniciar"}";

                    string lastMov = doc["LastMovementSync"]?.ToString() ?? "Sin iniciar";
                    if (lblMovementsInfo != null)
                    {
                        lblMovementsInfo.Text = $"Ultima sincronizacion de movimientos registrada: {lastMov}";
                    }
                }
            }
            catch (Exception ex)
            {
                lblStatusText.Text = $"Error leyendo sync_state.json: {ex.Message}";
            }
        }
        else
        {
            lblLastSuppliers.Text = "Proveedores:\nEstado Limpio";
            lblLastBarcodes.Text = "Codigos Barra:\nEstado Limpio";
            lblLastCosts.Text = "Costos:\nEstado Limpio";
            lblLastBaseline.Text = "Baseline:\nPendiente (Cero)";
            lblLastSales.Text = "Ventas:\nEstado Limpio";
            if (lblMovementsInfo != null)
            {
                lblMovementsInfo.Text = "Ultima sincronizacion de movimientos: Sin registrar (Estado limpio)";
            }
        }
        UpdateServiceStatus();
    }

    private void BtnResetLocalState_Click(object? sender, EventArgs e)
    {
        var res = MessageBox.Show("¿Seguro que deseas resetear el estado local de la tienda?\n\nEsto eliminara sync_state.json y morpheus_local.db (creando respaldo en /backup) para comenzar desde cero absoluto.", "Confirmar Reset Local", MessageBoxButtons.YesNo, MessageBoxIcon.Warning);
        if (res != DialogResult.Yes) return;

        try
        {
            using var sc = GetActiveServiceController(out string svcName);
            if (sc != null && sc.Status == ServiceControllerStatus.Running)
            {
                MessageBox.Show($"El servicio de Windows '{svcName}' esta activo. Debes detenerlo antes de resetear.", "Servicio Activo", MessageBoxButtons.OK, MessageBoxIcon.Stop);
                return;
            }
        }
        catch {}

        try
        {
            string backupDir = Path.Combine(_baseDir, "backup");
            Directory.CreateDirectory(backupDir);
            string ts = DateTime.Now.ToString("yyyyMMdd_HHmmss");

            if (File.Exists(_syncStatePath))
            {
                File.Copy(_syncStatePath, Path.Combine(backupDir, $"sync_state_{ts}.json"), true);
                File.Delete(_syncStatePath);
            }
            if (File.Exists(_localDbPath))
            {
                File.Copy(_localDbPath, Path.Combine(backupDir, $"morpheus_local_{ts}.db"), true);
                File.Delete(_localDbPath);
            }

            lblResetStatus.ForeColor = Color.FromArgb(16, 185, 129);
            lblResetStatus.Text = "[OK] Estado reseteado a cero (Backup en /backup)";
            lblStatusText.Text = "Fase 2 completada: Estado local limpio.";
            RefreshSyncState();
        }
        catch (Exception ex)
        {
            lblResetStatus.ForeColor = Color.FromArgb(239, 68, 68);
            lblResetStatus.Text = $"Error: {ex.Message}";
        }
    }

    private void RunExtractor(string workerName, string extraArgs = "")
    {
        if (!File.Exists(_agentExePath))
        {
            MessageBox.Show($"No se encontro MorpheusSyncAgent.exe en:\n{_agentExePath}", "Archivo no encontrado", MessageBoxButtons.OK, MessageBoxIcon.Error);
            return;
        }

        string args = string.IsNullOrEmpty(workerName) ? "" : $"--run {workerName} {extraArgs}".Trim();
        lblStatusText.Text = $"Ejecutando {workerName}...";

        var psi = new ProcessStartInfo
        {
            FileName = "cmd.exe",
            Arguments = $"/k \"\"{_agentExePath}\" {args}\"",
            WorkingDirectory = _baseDir,
            UseShellExecute = true
        };
        Process.Start(psi);
    }

    private void BtnSyncBaseline_Click(object? sender, EventArgs e)
    {
        string date = rbBaselineToday.Checked ? "now" : txtBaselineDate.Text.Trim();
        RunExtractor("baseline", $"--date {date}");
    }

    private void BtnSyncSales_Click(object? sender, EventArgs e)
    {
        DateTime start = DateTime.Today;
        if (rbSales30Days.Checked) start = DateTime.Today.AddDays(-30);
        else if (rbSales3Months.Checked) start = DateTime.Today.AddMonths(-3);
        else if (rbSales6Months.Checked) start = DateTime.Today.AddMonths(-6);
        else if (rbSalesAll.Checked) start = new DateTime(2000, 1, 1);
        else if (rbSalesCustom.Checked)
        {
            if (!DateTime.TryParse(txtSalesCustomDate.Text.Trim(), out start))
            {
                MessageBox.Show("Formato de fecha invalido. Usa AAAA-MM-DD.", "Fecha Invalida", MessageBoxButtons.OK, MessageBoxIcon.Error);
                return;
            }
        }

        try
        {
            JsonNode stateObj;
            if (File.Exists(_syncStatePath))
            {
                stateObj = JsonNode.Parse(File.ReadAllText(_syncStatePath)) ?? new JsonObject();
            }
            else
            {
                stateObj = new JsonObject
                {
                    ["LastProductSync"] = "2000-01-01T00:00:00",
                    ["LastBarcodeSync"] = "2000-01-01T00:00:00",
                    ["BaselineInventoryDone"] = true,
                    ["LastMovementSync"] = "2000-01-01T00:00:00",
                    ["LastSalesSync"] = "2000-01-01T00:00:00",
                    ["LastSupplierProductSync"] = "2000-01-01T00:00:00"
                };
            }

            stateObj["LastSalesSync"] = start.ToString("yyyy-MM-ddT00:00:00");
            stateObj["BaselineInventoryDone"] = true;
            File.WriteAllText(_syncStatePath, stateObj.ToJsonString(new JsonSerializerOptions { WriteIndented = true }));

            RefreshSyncState();
            RunExtractor("sales");
        }
        catch (Exception ex)
        {
            MessageBox.Show($"Error ajustando fecha de ventas:\n{ex.Message}", "Error", MessageBoxButtons.OK, MessageBoxIcon.Error);
        }
    }

    private void BtnSyncMovements_Click(object? sender, EventArgs e)
    {
        if (rbMovementsCustom.Checked)
        {
            if (!DateTime.TryParse(txtMovementsCustomDate.Text.Trim(), out DateTime start))
            {
                MessageBox.Show("Formato de fecha invalido para movimientos. Usa AAAA-MM-DD.", "Fecha Invalida", MessageBoxButtons.OK, MessageBoxIcon.Error);
                return;
            }

            try
            {
                JsonNode stateObj;
                if (File.Exists(_syncStatePath))
                {
                    stateObj = JsonNode.Parse(File.ReadAllText(_syncStatePath)) ?? new JsonObject();
                }
                else
                {
                    stateObj = new JsonObject
                    {
                        ["LastProductSync"] = "2000-01-01T00:00:00",
                        ["LastBarcodeSync"] = "2000-01-01T00:00:00",
                        ["BaselineInventoryDone"] = true,
                        ["LastMovementSync"] = "2000-01-01T00:00:00",
                        ["LastSalesSync"] = "2000-01-01T00:00:00",
                        ["LastSupplierProductSync"] = "2000-01-01T00:00:00"
                    };
                }

                stateObj["LastMovementSync"] = start.ToString("yyyy-MM-ddT00:00:00");
                stateObj["BaselineInventoryDone"] = true;
                File.WriteAllText(_syncStatePath, stateObj.ToJsonString(new JsonSerializerOptions { WriteIndented = true }));

                RefreshSyncState();
            }
            catch (Exception ex)
            {
                MessageBox.Show($"Error ajustando fecha de movimientos:\n{ex.Message}", "Error", MessageBoxButtons.OK, MessageBoxIcon.Error);
                return;
            }
        }

        RunExtractor("movements");
    }

    private async void BtnTestSql_Click(object? sender, EventArgs e)
    {
        lblSqlTestResult.ForeColor = Color.FromArgb(245, 158, 11);
        lblSqlTestResult.Text = "Probando conexion...";
        lblStatusText.Text = "Probando SQL Server...";

        string connStr = $"Server={txtSqlServer.Text};Database={txtSqlDb.Text};User Id={txtSqlUser.Text};Password={txtSqlPass.Text};TrustServerCertificate=True;Connect Timeout=5;";
        try
        {
            await using var conn = new SqlConnection(connStr);
            await conn.OpenAsync();
            lblSqlTestResult.ForeColor = Color.FromArgb(16, 185, 129);
            lblSqlTestResult.Text = "[OK] Conexion exitosa con SQL Server";
            lblStatusText.Text = "SQL Server conectado OK.";
        }
        catch (Exception ex)
        {
            lblSqlTestResult.ForeColor = Color.FromArgb(239, 68, 68);
            lblSqlTestResult.Text = "[ERROR] Fallo al conectar";
            MessageBox.Show($"Error conectando a SQL Server:\n{ex.Message}", "Fallo de Conexion SQL", MessageBoxButtons.OK, MessageBoxIcon.Error);
        }
    }

    private async void BtnTestCloud_Click(object? sender, EventArgs e)
    {
        lblCloudTestResult.ForeColor = Color.FromArgb(245, 158, 11);
        lblCloudTestResult.Text = "Probando API nube...";
        lblStatusText.Text = "Probando conexión con Nube Morpheus y sincronizando sedes...";

        string baseUrl = txtCloudUrl.Text.TrimEnd('/');
        try
        {
            var facilities = await FetchFacilitiesFromCloudAsync(baseUrl);
            if (facilities != null && facilities.Count > 0)
            {
                int currentId = GetSelectedFacilityId();
                string currentCode = GetSelectedFacilityCode();
                PopulateStoresComboBox(facilities);
                SelectFacilityByIdOrCode(currentId, currentCode);

                lblCloudTestResult.ForeColor = Color.FromArgb(16, 185, 129);
                lblCloudTestResult.Text = $"[OK] Conectado ({facilities.Count} sedes activas en NEO)";
                lblStatusText.Text = $"Conexión exitosa. Se sincronizaron {facilities.Count} sedes registradas en NEO.";
                return;
            }

            using var http = new HttpClient { Timeout = TimeSpan.FromSeconds(7) };
            var resp = await http.GetAsync($"{baseUrl}/docs");
            if (resp.IsSuccessStatusCode)
            {
                lblCloudTestResult.ForeColor = Color.FromArgb(16, 185, 129);
                lblCloudTestResult.Text = "[OK] Conexion exitosa con Nube Morpheus";
                lblStatusText.Text = "API Nube responde OK (200).";
            }
            else
            {
                lblCloudTestResult.ForeColor = Color.FromArgb(239, 68, 68);
                lblCloudTestResult.Text = $"HTTP {(int)resp.StatusCode}";
            }
        }
        catch (Exception ex)
        {
            lblCloudTestResult.ForeColor = Color.FromArgb(239, 68, 68);
            lblCloudTestResult.Text = "[ERROR] Fallo al conectar";
            MessageBox.Show($"Error conectando con la Nube Morpheus:\n{ex.Message}", "Fallo de Conexion Nube", MessageBoxButtons.OK, MessageBoxIcon.Error);
        }
    }

    private void LoadSettings()
    {
        if (!File.Exists(_appSettingsPath)) return;
        try
        {
            var json = File.ReadAllText(_appSettingsPath);
            var doc = JsonNode.Parse(json);
            if (doc == null) return;

            string? connStr = doc["ConnectionStrings"]?["LocalSqlServer"]?.ToString();
            if (!string.IsNullOrEmpty(connStr))
            {
                foreach (var part in connStr.Split(';'))
                {
                    if (part.StartsWith("Server=", StringComparison.OrdinalIgnoreCase)) txtSqlServer.Text = part.Substring(7);
                    else if (part.StartsWith("Database=", StringComparison.OrdinalIgnoreCase)) txtSqlDb.Text = part.Substring(9);
                    else if (part.StartsWith("User Id=", StringComparison.OrdinalIgnoreCase)) txtSqlUser.Text = part.Substring(8);
                    else if (part.StartsWith("Password=", StringComparison.OrdinalIgnoreCase)) txtSqlPass.Text = part.Substring(9);
                }
            }

            string? prodUrl = doc["DirectExtractors"]?["Products"]?["TargetApiUrl"]?.ToString();
            if (!string.IsNullOrEmpty(prodUrl) && Uri.TryCreate(prodUrl, UriKind.Absolute, out var uri))
            {
                txtCloudUrl.Text = $"{uri.Scheme}://{uri.Authority}";
            }

            int facId = doc["StoreFacilityId"]?.GetValue<int>() ?? 1;
            string? facCode = doc["StoreFacilityCode"]?.ToString();
            SelectFacilityByIdOrCode(facId, facCode);

            // Cargar sedes dinámicamente en segundo plano
            _ = Task.Run(async () =>
            {
                var liveFacilities = await FetchFacilitiesFromCloudAsync(txtCloudUrl.Text.Trim());
                if (liveFacilities != null && liveFacilities.Count > 0)
                {
                    this.Invoke(() =>
                    {
                        PopulateStoresComboBox(liveFacilities);
                        SelectFacilityByIdOrCode(facId, facCode);
                    });
                }
            });

            var de = doc["DirectExtractors"];
            if (de != null)
            {
                chkAutoSales.Checked = de["Sales"]?["Enabled"]?.GetValue<bool>() ?? true;
                txtIntervalSales.Text = de["Sales"]?["IntervalMinutes"]?.ToString() ?? "10";

                chkAutoMovements.Checked = de["InventoryMovements"]?["Enabled"]?.GetValue<bool>() ?? false;
                txtIntervalMovements.Text = de["InventoryMovements"]?["IntervalMinutes"]?.ToString() ?? "10";

                chkAutoProducts.Checked = de["Products"]?["Enabled"]?.GetValue<bool>() ?? false;
                txtIntervalProducts.Text = de["Products"]?["IntervalMinutes"]?.ToString() ?? "60";

                chkAutoBarcodes.Checked = de["ProductBarcodes"]?["Enabled"]?.GetValue<bool>() ?? false;
                txtIntervalBarcodes.Text = de["ProductBarcodes"]?["IntervalMinutes"]?.ToString() ?? "60";

                chkAutoSuppliers.Checked = de["Suppliers"]?["Enabled"]?.GetValue<bool>() ?? false;
                txtIntervalSuppliers.Text = de["Suppliers"]?["IntervalMinutes"]?.ToString() ?? "60";

                if (de["InventoryBaseline"] != null)
                {
                    string savedCutoff = de["InventoryBaseline"]?["BaselineCutoffDate"]?.ToString() ?? "now";
                    if (string.IsNullOrWhiteSpace(savedCutoff) ||
                        string.Equals(savedCutoff, "now", StringComparison.OrdinalIgnoreCase) ||
                        string.Equals(savedCutoff, "today", StringComparison.OrdinalIgnoreCase) ||
                        string.Equals(savedCutoff, "hoy", StringComparison.OrdinalIgnoreCase))
                    {
                        rbBaselineToday.Checked = true;
                        rbBaselineCustom.Checked = false;
                        txtBaselineDate.Text = DateTime.Today.ToString("yyyy-MM-dd");
                        txtBaselineDate.Enabled = false;
                        txtBaselineDate.ForeColor = Color.Gray;
                    }
                    else
                    {
                        rbBaselineCustom.Checked = true;
                        rbBaselineToday.Checked = false;
                        txtBaselineDate.Text = savedCutoff;
                        txtBaselineDate.Enabled = true;
                        txtBaselineDate.ForeColor = Color.White;
                    }
                }
                else
                {
                    rbBaselineToday.Checked = true;
                    rbBaselineCustom.Checked = false;
                    txtBaselineDate.Text = DateTime.Today.ToString("yyyy-MM-dd");
                    txtBaselineDate.Enabled = false;
                    txtBaselineDate.ForeColor = Color.Gray;
                }
            }
        }
        catch (Exception ex)
        {
            lblStatusText.Text = $"Error cargando appsettings.json: {ex.Message}";
        }
    }

    private void BtnSaveAll_Click(object? sender, EventArgs e)
    {
        try
        {
            JsonNode doc = File.Exists(_appSettingsPath) 
                ? (JsonNode.Parse(File.ReadAllText(_appSettingsPath)) ?? new JsonObject())
                : new JsonObject();

            doc["ConnectionStrings"] ??= new JsonObject();
            doc["ConnectionStrings"]!["LocalSqlServer"] = $"Server={txtSqlServer.Text.Trim()};Database={txtSqlDb.Text.Trim()};User Id={txtSqlUser.Text.Trim()};Password={txtSqlPass.Text.Trim()};TrustServerCertificate=True;";

            int storeId = 1;
            string storeCode = "";
            if (cmbStores.SelectedItem is FacilityOption opt)
            {
                storeId = opt.Id;
                storeCode = opt.Code;
            }
            else if (cmbStores.SelectedIndex == cmbStores.Items.Count - 1)
            {
                if (int.TryParse(txtCustomStoreId.Text.Trim(), out var parsedId)) storeId = parsedId;
            }
            doc["StoreFacilityId"] = storeId;
            if (!string.IsNullOrEmpty(storeCode))
            {
                doc["StoreFacilityCode"] = storeCode;
            }

            string baseUrl = txtCloudUrl.Text.TrimEnd('/');
            doc["DirectExtractors"] ??= new JsonObject();
            var de = doc["DirectExtractors"]!;

            void SetExt(string name, bool enabled, string intervalStr, string endpoint)
            {
                de[name] ??= new JsonObject();
                de[name]!["Enabled"] = enabled;
                if (int.TryParse(intervalStr, out int min)) de[name]!["IntervalMinutes"] = min;
                de[name]!["TargetApiUrl"] = $"{baseUrl}/api/v1/import/{endpoint}";
            }

            SetExt("Categories", true, "1440", "categories-legacy");
            SetExt("Sales", chkAutoSales.Checked, txtIntervalSales.Text, "sales-legacy");
            SetExt("InventoryMovements", chkAutoMovements.Checked, txtIntervalMovements.Text, "inventory-movements-legacy");
            SetExt("Products", chkAutoProducts.Checked, txtIntervalProducts.Text, "products-legacy");
            SetExt("ProductBarcodes", chkAutoBarcodes.Checked, txtIntervalBarcodes.Text, "products-barcodes-legacy");
            SetExt("Suppliers", chkAutoSuppliers.Checked, txtIntervalSuppliers.Text, "suppliers-legacy");
            SetExt("SupplierProducts", chkAutoSuppliers.Checked, txtIntervalSuppliers.Text, "supplier-products-legacy");
            
            de["InventoryBaseline"] ??= new JsonObject();
            de["InventoryBaseline"]!["BaselineCutoffDate"] = rbBaselineToday.Checked ? "now" : txtBaselineDate.Text.Trim();
            de["InventoryBaseline"]!["TargetApiUrl"] = $"{baseUrl}/api/v1/import/inventory-baseline-legacy";

            File.WriteAllText(_appSettingsPath, doc.ToJsonString(new JsonSerializerOptions { WriteIndented = true }));
            MessageBox.Show("Configuracion guardada exitosamente en appsettings.json", "Guardado", MessageBoxButtons.OK, MessageBoxIcon.Information);
            lblStatusText.Text = "Configuracion guardada.";
        }
        catch (Exception ex)
        {
            MessageBox.Show($"Error guardando appsettings.json:\n{ex.Message}", "Error al Guardar", MessageBoxButtons.OK, MessageBoxIcon.Error);
        }
    }

    private void InstallService()
    {
        try
        {
            // Detener y eliminar servicio anterior si existia bajo el nombre viejo MorpheusSyncAgent
            try
            {
                var psiCleanup = new ProcessStartInfo { FileName = "sc.exe", Arguments = "stop MorpheusSyncAgent", Verb = "runas", UseShellExecute = true, WindowStyle = ProcessWindowStyle.Hidden };
                var pClean = Process.Start(psiCleanup);
                pClean?.WaitForExit();

                var psiDelOld = new ProcessStartInfo { FileName = "sc.exe", Arguments = "delete MorpheusSyncAgent", Verb = "runas", UseShellExecute = true, WindowStyle = ProcessWindowStyle.Hidden };
                var pDelOld = Process.Start(psiDelOld);
                pDelOld?.WaitForExit();
            }
            catch {}

            var psi = new ProcessStartInfo
            {
                FileName = "sc.exe",
                Arguments = $"create \"NEO\" binPath= \"\"{_agentExePath}\"\" start= auto DisplayName= \"NEO\"",
                Verb = "runas",
                UseShellExecute = true,
                WindowStyle = ProcessWindowStyle.Hidden
            };
            var p = Process.Start(psi);
            p?.WaitForExit();

            // Configurar descripcion del servicio
            var psiDesc = new ProcessStartInfo
            {
                FileName = "sc.exe",
                Arguments = "description \"NEO\" \"integrador con Stellar\"",
                Verb = "runas",
                UseShellExecute = true,
                WindowStyle = ProcessWindowStyle.Hidden
            };
            var pDesc = Process.Start(psiDesc);
            pDesc?.WaitForExit();

            UpdateServiceStatus();
            MessageBox.Show("Servicio 'NEO' registrado exitosamente en Windows con la descripcion 'integrador con Stellar'.", "Servicio Registrado", MessageBoxButtons.OK, MessageBoxIcon.Information);
        }
        catch (Exception ex)
        {
            MessageBox.Show($"Error registrando servicio:\n{ex.Message}", "Error", MessageBoxButtons.OK, MessageBoxIcon.Error);
        }
    }

    private void UninstallService()
    {
        var res = MessageBox.Show("¿Deseas desinstalar y eliminar el servicio 'NEO' de Windows?", "Confirmar Desinstalacion", MessageBoxButtons.YesNo, MessageBoxIcon.Warning);
        if (res != DialogResult.Yes) return;

        try
        {
            var psiStop = new ProcessStartInfo { FileName = "sc.exe", Arguments = "stop NEO", Verb = "runas", UseShellExecute = true, WindowStyle = ProcessWindowStyle.Hidden };
            var p1 = Process.Start(psiStop);
            p1?.WaitForExit();

            var psiDel = new ProcessStartInfo { FileName = "sc.exe", Arguments = "delete NEO", Verb = "runas", UseShellExecute = true, WindowStyle = ProcessWindowStyle.Hidden };
            var p2 = Process.Start(psiDel);
            p2?.WaitForExit();

            // Limpiar tambien nombre anterior si existiera
            try
            {
                var psiStopOld = new ProcessStartInfo { FileName = "sc.exe", Arguments = "stop MorpheusSyncAgent", Verb = "runas", UseShellExecute = true, WindowStyle = ProcessWindowStyle.Hidden };
                var pOld1 = Process.Start(psiStopOld);
                pOld1?.WaitForExit();
                var psiDelOld = new ProcessStartInfo { FileName = "sc.exe", Arguments = "delete MorpheusSyncAgent", Verb = "runas", UseShellExecute = true, WindowStyle = ProcessWindowStyle.Hidden };
                var pOld2 = Process.Start(psiDelOld);
                pOld2?.WaitForExit();
            }
            catch {}

            UpdateServiceStatus();
            MessageBox.Show("Servicio desinstalado exitosamente.", "Desinstalado", MessageBoxButtons.OK, MessageBoxIcon.Information);
        }
        catch (Exception ex)
        {
            MessageBox.Show($"Error desinstalando servicio:\n{ex.Message}", "Error", MessageBoxButtons.OK, MessageBoxIcon.Error);
        }
    }

    private void CreateDesktopShortcut()
    {
        try
        {
            string desktop = Environment.GetFolderPath(Environment.SpecialFolder.DesktopDirectory);
            string shortcutPath = Path.Combine(desktop, "Morpheus - Panel de Control.lnk");
            Type? shellType = Type.GetTypeFromProgID("WScript.Shell");
            if (shellType != null)
            {
                dynamic shell = Activator.CreateInstance(shellType)!;
                dynamic shortcut = shell.CreateShortcut(shortcutPath);
                shortcut.TargetPath = Application.ExecutablePath;
                shortcut.WorkingDirectory = _baseDir;
                shortcut.Description = "Morpheus Sync Agent - Panel de Control";
                shortcut.Save();
                MessageBox.Show("Acceso directo creado en el Escritorio exitosamente.", "Acceso Directo", MessageBoxButtons.OK, MessageBoxIcon.Information);
            }
        }
        catch (Exception ex)
        {
            MessageBox.Show($"Error creando acceso directo:\n{ex.Message}", "Error", MessageBoxButtons.OK, MessageBoxIcon.Error);
        }
    }
}

public class FacilityOption
{
    public int Id { get; set; }
    public string Code { get; set; } = string.Empty;
    public string Name { get; set; } = string.Empty;

    public override string ToString() => $"[{Code}] {Name} (ID: {Id})";
}

