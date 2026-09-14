using System;
using System.Collections.Generic;
using System.Diagnostics;
using System.Drawing;
using System.IO;
using System.Linq;
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
    private TabControl tabControl = null!;

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
    private Button btnGoToDeposits = null!;
    
    private Label lblLastSuppliers = null!;
    private Label lblLastBarcodes = null!;
    private Label lblLastCosts = null!;
    private Label lblLastBaseline = null!;
    private Label lblLastSales = null!;

    // Tab 2: Mapeo de Depósitos (Stellar -> Neo)
    private TabPage tabDeposits = null!;
    private DataGridView dgvDeposits = null!;
    private Button btnDetectDeposits = null!;
    private Button btnFetchCloudDeposits = null!;
    private Button btnAddDepositRow = null!;
    private Button btnRemoveDepositRow = null!;
    private Button btnSaveDepositsToCloud = null!;
    private Label lblDepositStatus = null!;
    private List<WarehouseOption> _availableWarehouses = new();
    private bool _depositsConfigured = false;

    // Tab 2: Ventas y Movimientos
    private RadioButton rbSales30Days = null!;
    private RadioButton rbSales3Months = null!;
    private RadioButton rbSales6Months = null!;
    private RadioButton rbSalesAll = null!;
    private RadioButton rbSalesCustom = null!;
    private TextBox txtSalesCustomDate = null!;
    private TextBox txtSalesBatchSize = null!;
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
        this.Text = "Neo Sync Agent - Panel de Control Oficial";
        this.Size = new Size(920, 740);
        this.MinimumSize = new Size(860, 700);
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
            Text = "N",
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
            Text = "Neo Sync Agent",
            Font = new Font("Segoe UI", 13f, FontStyle.Bold),
            ForeColor = Color.White,
            AutoSize = true,
            Location = new Point(62, 12)
        };
        pnlHeader.Controls.Add(lblTitle);

        var lblSubTitle = new Label
        {
            Text = "Panel de Control y Enlace POS Tienda a Neo ERP",
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
            Location = new Point(720, 18),
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
        tabControl = new TabControl
        {
            Dock = DockStyle.Fill,
            Padding = new Point(12, 8),
            Font = new Font("Segoe UI", 9.5f, FontStyle.Bold)
        };

        // Tab 1: Puesta a Punto
        var tab1 = new TabPage("1. Puesta a Punto");
        tab1.BackColor = Color.FromArgb(15, 23, 42);
        BuildTab1(tab1);
        tabControl.TabPages.Add(tab1);

        // Tab 2: Mapeo de Depósitos (Stellar -> Neo)
        tabDeposits = new TabPage("2. Mapeo de Depósitos");
        tabDeposits.BackColor = Color.FromArgb(15, 23, 42);
        BuildTabDeposits(tabDeposits);
        tabControl.TabPages.Add(tabDeposits);

        // Tab 3: Sincronizar a Voluntad
        var tab3 = new TabPage("3. Sincronizar a Voluntad");
        tab3.BackColor = Color.FromArgb(15, 23, 42);
        BuildTab2(tab3);
        tabControl.TabPages.Add(tab3);

        // Tab 4: Servicio Segundo Plano
        var tab4 = new TabPage("4. Servicio en Fondo");
        tab4.BackColor = Color.FromArgb(15, 23, 42);
        BuildTab3(tab4);
        tabControl.TabPages.Add(tab4);

        // Tab 5: Conexiones & Tienda
        var tab5 = new TabPage("5. Conexiones & Tienda");
        tab5.BackColor = Color.FromArgb(15, 23, 42);
        BuildTab4(tab5);
        tabControl.TabPages.Add(tab5);

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
            Text = "Hoy (Vivo)", 
            Checked = true, 
            Location = new Point(14, 34), 
            AutoSize = true, 
            ForeColor = Color.White,
            Cursor = Cursors.Hand
        };
        pnlBaseline.Controls.Add(rbBaselineToday);

        rbBaselineCustom = new RadioButton 
        { 
            Text = "Fecha:", 
            Location = new Point(125, 34), 
            AutoSize = true, 
            ForeColor = Color.White,
            Cursor = Cursors.Hand
        };
        pnlBaseline.Controls.Add(rbBaselineCustom);

        txtBaselineDate = new TextBox 
        { 
            Text = DateTime.Today.ToString("yyyy-MM-dd"), 
            Location = new Point(190, 32), 
            Width = 95, 
            BackColor = Color.FromArgb(15, 23, 42), 
            ForeColor = Color.White,
            TextAlign = HorizontalAlignment.Center
        };
        pnlBaseline.Controls.Add(txtBaselineDate);

        btnGoToDeposits = CreateButton("⚙ Mapeo Depósitos", 300, 26, 175, 36, Color.FromArgb(99, 102, 241));
        btnGoToDeposits.Click += (s, e) => { tabControl.SelectedTab = tabDeposits; };
        pnlBaseline.Controls.Add(btnGoToDeposits);

        btnSyncBaseline = CreateButton("Sincronizar Inventario (Baseline)", 490, 26, 265, 36, Color.FromArgb(16, 185, 129));
        btnSyncBaseline.Click += BtnSyncBaseline_Click;
        pnlBaseline.Controls.Add(btnSyncBaseline);

        void UpdateBaselineLayout()
        {
            rbBaselineToday.Location = new Point(14, 34);
            rbBaselineCustom.Location = new Point(rbBaselineToday.Right + 12, 34);
            txtBaselineDate.Location = new Point(rbBaselineCustom.Right + 6, 31);
            btnGoToDeposits.Location = new Point(txtBaselineDate.Right + 12, 26);
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

    private void BuildTabDeposits(TabPage page)
    {
        var panel = new Panel { AutoScroll = true, Dock = DockStyle.Fill, Padding = new Padding(16) };

        var gbDeposits = CreateGroupBox("Mapeo de Depósitos de Tienda (Stellar POS -> Neo ERP)", 16, 12, 850, 600, Color.FromArgb(56, 189, 248));
        gbDeposits.Anchor = AnchorStyles.Top | AnchorStyles.Left | AnchorStyles.Right | AnchorStyles.Bottom;

        var lblDesc = new Label
        {
            Text = "Asocia cada depósito de tu base de datos local (Stellar POS) con su Almacén y Ubicación física en Neo ERP antes de sincronizar el Inventario Inicial (Baseline) o las ventas. Define si las operaciones de cada depósito descuentan existencias físicas en el Kardex.",
            Font = new Font("Segoe UI", 9f),
            ForeColor = Color.FromArgb(148, 163, 184),
            Location = new Point(16, 26),
            Size = new Size(818, 36),
            Anchor = AnchorStyles.Top | AnchorStyles.Left | AnchorStyles.Right
        };
        gbDeposits.Controls.Add(lblDesc);

        // Botones de acción
        btnDetectDeposits = CreateButton("1. Detectar Depósitos (Stellar)", 16, 68, 220, 36, Color.FromArgb(217, 119, 6));
        btnDetectDeposits.Click += async (s, e) => await DetectDepositsFromSqlAsync();
        gbDeposits.Controls.Add(btnDetectDeposits);

        btnFetchCloudDeposits = CreateButton("2. Consultar Neo ERP", 244, 68, 180, 36, Color.FromArgb(2, 132, 199));
        btnFetchCloudDeposits.Click += async (s, e) => await FetchDepositsFromCloudAsync(showMessages: true);
        gbDeposits.Controls.Add(btnFetchCloudDeposits);

        btnAddDepositRow = CreateButton("➕ Agregar Fila", 432, 68, 115, 36, Color.FromArgb(51, 65, 85));
        btnAddDepositRow.Click += (s, e) => AddManualDepositRow();
        gbDeposits.Controls.Add(btnAddDepositRow);

        btnRemoveDepositRow = CreateButton("🗑 Eliminar Fila", 555, 68, 115, 36, Color.FromArgb(71, 85, 105));
        btnRemoveDepositRow.Click += (s, e) => RemoveSelectedDepositRow();
        gbDeposits.Controls.Add(btnRemoveDepositRow);

        btnSaveDepositsToCloud = CreateButton("💾 3. Guardar en Neo ERP", 678, 68, 156, 36, Color.FromArgb(16, 185, 129));
        btnSaveDepositsToCloud.Anchor = AnchorStyles.Top | AnchorStyles.Right;
        btnSaveDepositsToCloud.Click += async (s, e) => await SaveDepositsToCloudAsync();
        gbDeposits.Controls.Add(btnSaveDepositsToCloud);

        // Status Label
        lblDepositStatus = new Label
        {
            Text = "Estado: Presiona '2. Consultar Neo ERP' para cargar almacenes o '1. Detectar Depósitos' desde Stellar.",
            Location = new Point(18, 112),
            Size = new Size(818, 22),
            Font = new Font("Segoe UI", 9f, FontStyle.Bold),
            ForeColor = Color.FromArgb(203, 213, 225),
            Anchor = AnchorStyles.Top | AnchorStyles.Left | AnchorStyles.Right
        };
        gbDeposits.Controls.Add(lblDepositStatus);

        // DataGridView
        dgvDeposits = new DataGridView
        {
            Location = new Point(16, 140),
            Size = new Size(818, 390),
            Anchor = AnchorStyles.Top | AnchorStyles.Left | AnchorStyles.Right | AnchorStyles.Bottom,
            BackgroundColor = Color.FromArgb(15, 23, 42),
            ForeColor = Color.White,
            GridColor = Color.FromArgb(51, 65, 85),
            BorderStyle = BorderStyle.FixedSingle,
            CellBorderStyle = DataGridViewCellBorderStyle.SingleHorizontal,
            RowHeadersVisible = false,
            AllowUserToAddRows = false,
            AllowUserToDeleteRows = true,
            AutoGenerateColumns = false,
            SelectionMode = DataGridViewSelectionMode.FullRowSelect,
            MultiSelect = false,
            Font = new Font("Segoe UI", 9f),
            AutoSizeColumnsMode = DataGridViewAutoSizeColumnsMode.Fill
        };

        dgvDeposits.EnableHeadersVisualStyles = false;
        dgvDeposits.ColumnHeadersDefaultCellStyle.BackColor = Color.FromArgb(30, 41, 59);
        dgvDeposits.ColumnHeadersDefaultCellStyle.ForeColor = Color.White;
        dgvDeposits.ColumnHeadersDefaultCellStyle.Font = new Font("Segoe UI", 9f, FontStyle.Bold);
        dgvDeposits.ColumnHeadersHeight = 34;

        dgvDeposits.DefaultCellStyle.BackColor = Color.FromArgb(15, 23, 42);
        dgvDeposits.DefaultCellStyle.ForeColor = Color.FromArgb(241, 245, 249);
        dgvDeposits.DefaultCellStyle.SelectionBackColor = Color.FromArgb(99, 102, 241);
        dgvDeposits.DefaultCellStyle.SelectionForeColor = Color.White;
        dgvDeposits.RowTemplate.Height = 30;

        // Columnas
        var colCode = new DataGridViewTextBoxColumn
        {
            Name = "colExternalCode",
            HeaderText = "Cód. Stellar",
            FillWeight = 12,
            MinimumWidth = 85,
            ReadOnly = false
        };

        var colName = new DataGridViewTextBoxColumn
        {
            Name = "colExternalName",
            HeaderText = "Descripción Local (Stellar)",
            FillWeight = 23,
            MinimumWidth = 140,
            ReadOnly = false
        };

        var colWh = new DataGridViewComboBoxColumn
        {
            Name = "colWarehouse",
            HeaderText = "Almacén en Neo ERP",
            FillWeight = 25,
            MinimumWidth = 150,
            FlatStyle = FlatStyle.Flat
        };
        colWh.DefaultCellStyle.BackColor = Color.FromArgb(30, 41, 59);
        colWh.DefaultCellStyle.ForeColor = Color.White;

        var colLoc = new DataGridViewComboBoxColumn
        {
            Name = "colLocation",
            HeaderText = "Ubicación en Neo ERP",
            FillWeight = 25,
            MinimumWidth = 150,
            FlatStyle = FlatStyle.Flat
        };
        colLoc.DefaultCellStyle.BackColor = Color.FromArgb(30, 41, 59);
        colLoc.DefaultCellStyle.ForeColor = Color.White;

        var colAffects = new DataGridViewCheckBoxColumn
        {
            Name = "colAffectsInventory",
            HeaderText = "¿Afecta Kardex?",
            FillWeight = 12,
            MinimumWidth = 85,
            FlatStyle = FlatStyle.Flat
        };

        var colStat = new DataGridViewTextBoxColumn
        {
            Name = "colStatus",
            HeaderText = "Estado en Nube",
            FillWeight = 15,
            MinimumWidth = 110,
            ReadOnly = true
        };

        dgvDeposits.Columns.AddRange(new DataGridViewColumn[] { colCode, colName, colWh, colLoc, colAffects, colStat });

        dgvDeposits.DataError += (s, e) => { e.Cancel = true; };

        dgvDeposits.CurrentCellDirtyStateChanged += (s, e) =>
        {
            if (dgvDeposits.IsCurrentCellDirty)
            {
                dgvDeposits.CommitEdit(DataGridViewDataErrorContexts.Commit);
            }
        };

        dgvDeposits.CellValueChanged += DgvDeposits_CellValueChanged;

        dgvDeposits.CellBeginEdit += (s, e) =>
        {
            if (e.ColumnIndex == dgvDeposits.Columns["colLocation"]!.Index && e.RowIndex >= 0)
            {
                var row = dgvDeposits.Rows[e.RowIndex];
                var wh = row.Cells["colWarehouse"].Value as WarehouseOption;
                if (wh != null && wh.Locations.Count > 0)
                {
                    var locCell = (DataGridViewComboBoxCell)row.Cells["colLocation"];
                    locCell.Items.Clear();
                    foreach (var l in wh.Locations) locCell.Items.Add(l);
                }
            }
        };

        dgvDeposits.CellEndEdit += (s, e) =>
        {
            if (e.ColumnIndex == dgvDeposits.Columns["colLocation"]!.Index && e.RowIndex >= 0)
            {
                var row = dgvDeposits.Rows[e.RowIndex];
                var locCell = (DataGridViewComboBoxCell)row.Cells["colLocation"];
                var currentVal = locCell.Value;
                locCell.Items.Clear();
                foreach (var w in _availableWarehouses)
                {
                    foreach (var l in w.Locations) locCell.Items.Add(l);
                }
                locCell.Value = currentVal;
            }
        };

        gbDeposits.Controls.Add(dgvDeposits);

        // Nota al pie
        var lblTip = new Label
        {
            Text = "💡 Tip: Marca '¿Afecta Kardex?' para depósitos donde las ventas descuentan existencia física real. Si un depósito es de servicios o merma no inventariable, desmárcalo para registrar la venta solo documentalmente.",
            Font = new Font("Segoe UI", 8.5f),
            ForeColor = Color.FromArgb(148, 163, 184),
            Location = new Point(16, 540),
            Size = new Size(818, 48),
            Anchor = AnchorStyles.Bottom | AnchorStyles.Left | AnchorStyles.Right
        };
        gbDeposits.Controls.Add(lblTip);

        panel.Controls.Add(gbDeposits);
        page.Controls.Add(panel);
    }

    private void DgvDeposits_CellValueChanged(object? sender, DataGridViewCellEventArgs e)
    {
        if (e.RowIndex < 0 || e.RowIndex >= dgvDeposits.Rows.Count) return;
        var row = dgvDeposits.Rows[e.RowIndex];

        int colWhIndex = dgvDeposits.Columns["colWarehouse"]!.Index;
        int colLocIndex = dgvDeposits.Columns["colLocation"]!.Index;

        if (e.ColumnIndex == colWhIndex)
        {
            var selectedWh = row.Cells[colWhIndex].Value as WarehouseOption;
            if (selectedWh == null && row.Cells[colWhIndex].Value is string whStr)
            {
                selectedWh = _availableWarehouses.FirstOrDefault(w => w.ToString() == whStr || w.Name == whStr);
            }

            if (selectedWh != null)
            {
                var locCell = (DataGridViewComboBoxCell)row.Cells[colLocIndex];
                locCell.Items.Clear();
                foreach (var loc in selectedWh.Locations)
                {
                    locCell.Items.Add(loc);
                }

                var currentLoc = locCell.Value as LocationOption;
                if (currentLoc == null || currentLoc.WarehouseId != selectedWh.Id)
                {
                    locCell.Value = selectedWh.Locations.FirstOrDefault();
                }
            }
        }
        else if (e.ColumnIndex == dgvDeposits.Columns["colExternalCode"]!.Index || 
                 e.ColumnIndex == dgvDeposits.Columns["colExternalName"]!.Index ||
                 e.ColumnIndex == dgvDeposits.Columns["colAffectsInventory"]!.Index)
        {
            int colStatIndex = dgvDeposits.Columns["colStatus"]!.Index;
            string currentStatus = row.Cells[colStatIndex].Value?.ToString() ?? "";
            if (currentStatus.StartsWith("✔"))
            {
                row.Cells[colStatIndex].Value = "Modificado (Sin guardar)";
            }
        }
    }

    private async Task DetectDepositsFromSqlAsync()
    {
        try
        {
            lblDepositStatus.Text = "Detectando depósitos en SQL Server local...";
            lblDepositStatus.ForeColor = Color.FromArgb(245, 158, 11);
            lblStatusText.Text = "Consultando MA_DEPOSITOS en SQL Server...";

            if (string.IsNullOrWhiteSpace(txtSqlServer.Text) || string.IsNullOrWhiteSpace(txtSqlDb.Text))
            {
                MessageBox.Show("Por favor configura primero los datos del servidor SQL en la pestaña '5. Conexiones & Tienda'.", "Configuración Requerida", MessageBoxButtons.OK, MessageBoxIcon.Warning);
                return;
            }

            if (_availableWarehouses.Count == 0)
            {
                await FetchDepositsFromCloudAsync(showMessages: false);
            }

            string connStr = $"Server={txtSqlServer.Text.Trim()};Database={txtSqlDb.Text.Trim()};User Id={txtSqlUser.Text.Trim()};Password={txtSqlPass.Text.Trim()};TrustServerCertificate=True;Connect Timeout=8;";

            var detected = new List<(string Code, string Name)>();

            await Task.Run(() =>
            {
                using var conn = new SqlConnection(connStr);
                conn.Open();

                string sql = @"
IF OBJECT_ID('MA_DEPOSITOS', 'U') IS NOT NULL
BEGIN
    SELECT DISTINCT RTRIM(c_CodArma) AS c_deposito, RTRIM(ISNULL(c_DesArma, 'Depósito ' + c_CodArma)) AS descripcion
    FROM MA_DEPOSITOS WITH (NOLOCK)
    WHERE c_CodArma IS NOT NULL AND RTRIM(c_CodArma) <> ''
    ORDER BY c_deposito;
END
ELSE IF OBJECT_ID('tr_inventario', 'U') IS NOT NULL
BEGIN
    SELECT DISTINCT RTRIM(c_deposito) AS c_deposito, ('Depósito ' + RTRIM(c_deposito)) AS descripcion
    FROM tr_inventario WITH (NOLOCK)
    WHERE c_deposito IS NOT NULL AND RTRIM(c_deposito) <> ''
    ORDER BY c_deposito;
END
";
                using var cmd = new SqlCommand(sql, conn);
                using var rdr = cmd.ExecuteReader();
                while (rdr.Read())
                {
                    string c = rdr["c_deposito"]?.ToString()?.Trim() ?? "";
                    string d = rdr["descripcion"]?.ToString()?.Trim() ?? "";
                    if (!string.IsNullOrEmpty(c))
                    {
                        detected.Add((c, string.IsNullOrEmpty(d) ? $"Depósito {c}" : d));
                    }
                }
            });

            if (detected.Count == 0)
            {
                lblDepositStatus.Text = "No se encontraron depósitos en la base de datos SQL Server.";
                lblDepositStatus.ForeColor = Color.FromArgb(245, 158, 11);
                MessageBox.Show("No se encontraron registros en MA_DEPOSITOS ni en tr_inventario en el servidor SQL.", "Sin Resultados", MessageBoxButtons.OK, MessageBoxIcon.Information);
                return;
            }

            int addedCount = 0;
            var defaultWh = _availableWarehouses.FirstOrDefault();
            var defaultLoc = defaultWh?.Locations.FirstOrDefault();

            foreach (var item in detected)
            {
                DataGridViewRow? existingRow = null;
                foreach (DataGridViewRow r in dgvDeposits.Rows)
                {
                    if (string.Equals(r.Cells["colExternalCode"].Value?.ToString()?.Trim(), item.Code, StringComparison.OrdinalIgnoreCase))
                    {
                        existingRow = r;
                        break;
                    }
                }

                if (existingRow == null)
                {
                    int rowIndex = dgvDeposits.Rows.Add();
                    var newRow = dgvDeposits.Rows[rowIndex];
                    newRow.Cells["colExternalCode"].Value = item.Code;
                    newRow.Cells["colExternalName"].Value = item.Name;

                    if (defaultWh != null)
                    {
                        newRow.Cells["colWarehouse"].Value = defaultWh;
                        newRow.Cells["colLocation"].Value = defaultLoc;
                    }

                    newRow.Cells["colAffectsInventory"].Value = true;
                    newRow.Cells["colStatus"].Value = "Detectado Local (Pendiente)";
                    addedCount++;
                }
                else
                {
                    if (string.IsNullOrEmpty(existingRow.Cells["colExternalName"].Value?.ToString()))
                    {
                        existingRow.Cells["colExternalName"].Value = item.Name;
                    }
                }
            }

            lblDepositStatus.Text = $"[OK] Se detectaron {detected.Count} depósitos locales ({addedCount} nuevos añadidos a la grilla).";
            lblDepositStatus.ForeColor = Color.FromArgb(16, 185, 129);
            lblStatusText.Text = $"Detección de depósitos completada: {detected.Count} encontrados.";
        }
        catch (Exception ex)
        {
            lblDepositStatus.Text = $"Error al detectar depósitos: {ex.Message}";
            lblDepositStatus.ForeColor = Color.FromArgb(239, 68, 68);
            MessageBox.Show($"Error conectando a SQL Server para detectar depósitos:\n{ex.Message}", "Error de Detección", MessageBoxButtons.OK, MessageBoxIcon.Error);
        }
    }

    private async Task FetchDepositsFromCloudAsync(bool showMessages = true)
    {
        try
        {
            lblDepositStatus.Text = "Consultando depósitos y almacenes en Neo ERP...";
            lblDepositStatus.ForeColor = Color.FromArgb(245, 158, 11);
            lblStatusText.Text = "Consultando API de depósitos en Neo ERP...";

            string baseUrl = txtCloudUrl.Text.TrimEnd('/');
            int facId = GetSelectedFacilityId();

            using var http = new HttpClient { Timeout = TimeSpan.FromSeconds(10) };
            string url = $"{baseUrl}/api/v1/store-agent/{facId}/deposits";
            var resp = await http.GetAsync(url);

            if (!resp.IsSuccessStatusCode)
            {
                lblDepositStatus.Text = $"Error consultando Neo ERP (HTTP {(int)resp.StatusCode}).";
                lblDepositStatus.ForeColor = Color.FromArgb(239, 68, 68);
                if (showMessages)
                {
                    MessageBox.Show($"No se pudo obtener la configuración de depósitos desde Neo ERP.\nCódigo HTTP: {resp.StatusCode}", "Error Nube", MessageBoxButtons.OK, MessageBoxIcon.Warning);
                }
                return;
            }

            var json = await resp.Content.ReadAsStringAsync();
            var options = new JsonSerializerOptions { PropertyNameCaseInsensitive = true };
            var data = JsonSerializer.Deserialize<FacilityDepositResponse>(json, options);

            if (data == null) return;

            _availableWarehouses = data.AvailableWarehouses ?? new();

            var colWh = (DataGridViewComboBoxColumn)dgvDeposits.Columns["colWarehouse"]!;
            var colLoc = (DataGridViewComboBoxColumn)dgvDeposits.Columns["colLocation"]!;

            colWh.Items.Clear();
            colLoc.Items.Clear();

            foreach (var w in _availableWarehouses)
            {
                colWh.Items.Add(w);
                foreach (var l in w.Locations)
                {
                    l.WarehouseId = w.Id;
                    colLoc.Items.Add(l);
                }
            }

            dgvDeposits.Rows.Clear();

            if (data.Mappings != null && data.Mappings.Count > 0)
            {
                foreach (var m in data.Mappings)
                {
                    int rIdx = dgvDeposits.Rows.Add();
                    var row = dgvDeposits.Rows[rIdx];

                    row.Cells["colExternalCode"].Value = m.ExternalDepositCode;
                    row.Cells["colExternalName"].Value = m.ExternalDepositName;

                    var matchedWh = _availableWarehouses.FirstOrDefault(w => w.Id == m.WarehouseId);
                    if (matchedWh != null)
                    {
                        row.Cells["colWarehouse"].Value = matchedWh;
                        var matchedLoc = matchedWh.Locations.FirstOrDefault(l => l.Id == m.LocationId);
                        row.Cells["colLocation"].Value = matchedLoc ?? matchedWh.Locations.FirstOrDefault();
                    }

                    row.Cells["colAffectsInventory"].Value = m.AffectsInventory;
                    row.Cells["colStatus"].Value = m.AutoDiscovered ? "⚡ Auto-detectado" : "✔ Guardado en Nube";
                }

                _depositsConfigured = true;
                lblDepositStatus.Text = $"[OK] {data.Mappings.Count} depósitos cargados desde Neo ERP para sede {data.FacilityName}.";
                lblDepositStatus.ForeColor = Color.FromArgb(16, 185, 129);
                lblStatusText.Text = $"Mapeo de depósitos sincronizado desde Neo ERP ({data.Mappings.Count} depósitos).";
            }
            else
            {
                _depositsConfigured = false;
                lblDepositStatus.Text = $"La sede '{data.FacilityName}' no tiene depósitos configurados aún en Neo ERP. Haz clic en '1. Detectar Depósitos (Stellar)'.";
                lblDepositStatus.ForeColor = Color.FromArgb(245, 158, 11);
                lblStatusText.Text = "Sin depósitos configurados en la nube.";
            }

            if (showMessages)
            {
                MessageBox.Show($"Se consultaron con éxito los almacenes de Neo ERP.\n\nSede: {data.FacilityName}\nAlmacenes disponibles: {_availableWarehouses.Count}\nDepósitos mapeados: {data.Mappings?.Count ?? 0}", "Neo ERP Conectado", MessageBoxButtons.OK, MessageBoxIcon.Information);
            }
        }
        catch (Exception ex)
        {
            lblDepositStatus.Text = $"Error al consultar Neo ERP: {ex.Message}";
            lblDepositStatus.ForeColor = Color.FromArgb(239, 68, 68);
            if (showMessages)
            {
                MessageBox.Show($"Error conectando con la API de Neo ERP:\n{ex.Message}", "Error de Conexión Nube", MessageBoxButtons.OK, MessageBoxIcon.Error);
            }
        }
    }

    private async Task SaveDepositsToCloudAsync()
    {
        if (dgvDeposits.Rows.Count == 0)
        {
            MessageBox.Show("No hay depósitos en la grilla para guardar.\nUsa '1. Detectar Depósitos (Stellar)' o '➕ Agregar Fila' primero.", "Sin Datos", MessageBoxButtons.OK, MessageBoxIcon.Warning);
            return;
        }

        string baseUrl = txtCloudUrl.Text.TrimEnd('/');
        int facId = GetSelectedFacilityId();

        lblDepositStatus.Text = "Guardando mapeo de depósitos en Neo ERP...";
        lblDepositStatus.ForeColor = Color.FromArgb(245, 158, 11);
        lblStatusText.Text = "Enviando mapeo de depósitos a Neo ERP...";

        int saved = 0;
        using var http = new HttpClient { Timeout = TimeSpan.FromSeconds(15) };

        try
        {
            foreach (DataGridViewRow row in dgvDeposits.Rows)
            {
                string code = row.Cells["colExternalCode"].Value?.ToString()?.Trim() ?? "";
                string name = row.Cells["colExternalName"].Value?.ToString()?.Trim() ?? "";
                var wh = row.Cells["colWarehouse"].Value as WarehouseOption;
                var loc = row.Cells["colLocation"].Value as LocationOption;
                bool affects = (bool)(row.Cells["colAffectsInventory"].Value ?? true);

                if (string.IsNullOrEmpty(code))
                {
                    MessageBox.Show("Hay filas con el código de depósito vacío. Por favor complétalo o elimínalo.", "Validación", MessageBoxButtons.OK, MessageBoxIcon.Warning);
                    return;
                }

                if (wh == null)
                {
                    MessageBox.Show($"El depósito '{code}' no tiene un Almacén de Neo ERP seleccionado.", "Validación", MessageBoxButtons.OK, MessageBoxIcon.Warning);
                    return;
                }

                if (loc == null)
                {
                    MessageBox.Show($"El depósito '{code}' no tiene una Ubicación de Neo ERP seleccionada.", "Validación", MessageBoxButtons.OK, MessageBoxIcon.Warning);
                    return;
                }

                var payload = new
                {
                    external_deposit_code = code,
                    external_deposit_name = name,
                    warehouse_id = wh.Id,
                    location_id = loc.Id,
                    affects_inventory = affects
                };

                string json = JsonSerializer.Serialize(payload);
                var content = new StringContent(json, System.Text.Encoding.UTF8, "application/json");

                string url = $"{baseUrl}/api/v1/store-agent/{facId}/deposits";
                var resp = await http.PostAsync(url, content);

                if (resp.IsSuccessStatusCode)
                {
                    row.Cells["colStatus"].Value = "✔ Guardado en Nube";
                    saved++;
                }
                else
                {
                    string err = await resp.Content.ReadAsStringAsync();
                    row.Cells["colStatus"].Value = $"❌ Error ({resp.StatusCode})";
                    MessageBox.Show($"Error guardando depósito '{code}':\nHTTP {resp.StatusCode}\n{err}", "Error al Guardar", MessageBoxButtons.OK, MessageBoxIcon.Error);
                    return;
                }
            }

            _depositsConfigured = true;
            lblDepositStatus.Text = $"[OK] ¡Éxito! Se guardaron {saved} depósitos en Neo ERP.";
            lblDepositStatus.ForeColor = Color.FromArgb(16, 185, 129);
            lblStatusText.Text = $"Mapeo de depósitos guardado ({saved} depósitos).";

            MessageBox.Show($"¡Mapeo de depósitos guardado exitosamente en Neo ERP!\n\nSe configuraron {saved} depósitos para la sede seleccionada.\nAhora la tienda puede sincronizar el Inventario Inicial (Baseline) y las Ventas con total precisión.", "Depósitos Guardados", MessageBoxButtons.OK, MessageBoxIcon.Information);
        }
        catch (Exception ex)
        {
            lblDepositStatus.Text = $"Error guardando depósitos: {ex.Message}";
            lblDepositStatus.ForeColor = Color.FromArgb(239, 68, 68);
            MessageBox.Show($"Error de red o servidor guardando depósitos:\n{ex.Message}", "Error de Conexión", MessageBoxButtons.OK, MessageBoxIcon.Error);
        }
    }

    private void AddManualDepositRow()
    {
        if (_availableWarehouses.Count == 0)
        {
            MessageBox.Show("Por favor haz clic en '2. Consultar Neo ERP' primero para cargar los almacenes disponibles.", "Almacenes Requeridos", MessageBoxButtons.OK, MessageBoxIcon.Information);
            return;
        }

        var defaultWh = _availableWarehouses.FirstOrDefault();
        var defaultLoc = defaultWh?.Locations.FirstOrDefault();

        int idx = dgvDeposits.Rows.Add();
        var row = dgvDeposits.Rows[idx];
        row.Cells["colExternalCode"].Value = "";
        row.Cells["colExternalName"].Value = "Nuevo Depósito";

        if (defaultWh != null)
        {
            row.Cells["colWarehouse"].Value = defaultWh;
            row.Cells["colLocation"].Value = defaultLoc;
        }

        row.Cells["colAffectsInventory"].Value = true;
        row.Cells["colStatus"].Value = "Nuevo (Sin Guardar)";

        dgvDeposits.CurrentCell = row.Cells["colExternalCode"];
        dgvDeposits.BeginEdit(true);
    }

    private void RemoveSelectedDepositRow()
    {
        if (dgvDeposits.SelectedRows.Count > 0)
        {
            var row = dgvDeposits.SelectedRows[0];
            string code = row.Cells["colExternalCode"].Value?.ToString() ?? "";
            var res = MessageBox.Show($"¿Deseas remover la fila del depósito '{code}' de la lista?", "Confirmar", MessageBoxButtons.YesNo, MessageBoxIcon.Question);
            if (res == DialogResult.Yes)
            {
                dgvDeposits.Rows.Remove(row);
            }
        }
        else if (dgvDeposits.CurrentCell != null)
        {
            int rIdx = dgvDeposits.CurrentCell.RowIndex;
            dgvDeposits.Rows.RemoveAt(rIdx);
        }
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

        var lblBatch = new Label { Text = "Lote HTTP:", Location = new Point(310, 168), AutoSize = true, ForeColor = Color.FromArgb(148, 163, 184) };
        txtSalesBatchSize = new TextBox { Text = "500", Location = new Point(380, 166), Width = 60, BackColor = Color.FromArgb(15, 23, 42), ForeColor = Color.White };

        gbSales.Controls.Add(rbSales30Days);
        gbSales.Controls.Add(rbSales3Months);
        gbSales.Controls.Add(rbSales6Months);
        gbSales.Controls.Add(rbSalesAll);
        gbSales.Controls.Add(rbSalesCustom);
        gbSales.Controls.Add(txtSalesCustomDate);
        gbSales.Controls.Add(lblBatch);
        gbSales.Controls.Add(txtSalesBatchSize);

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

        var gbControl = CreateGroupBox("Control del Servicio de Windows (NEO Agent Sync)", 16, 12, 810, 140, Color.FromArgb(203, 213, 225));
        
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
        _depositsConfigured = false;
        _ = FetchDepositsFromCloudAsync(showMessages: false);
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
            var sc = new ServiceController("NeoAgentSync");
            var _ = sc.Status;
            detectedServiceName = "NEO Agent Sync";
            return sc;
        }
        catch
        {
            try
            {
                var scNeo = new ServiceController("NEO");
                var _ = scNeo.Status;
                detectedServiceName = "NEO";
                return scNeo;
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
                    detectedServiceName = "NEO Agent Sync";
                    return null;
                }
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
                    lblServiceTabStatus.Text = "⚠ Estado del servicio: NO INSTALADO en este equipo (Registralo abajo como 'NEO Agent Sync')";
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
                MessageBox.Show("El servicio de Windows 'NEO Agent Sync' no esta instalado.\n\nPor favor haz clic en 'Registrar Servicio Windows' abajo para registrarlo.", "Servicio No Instalado", MessageBoxButtons.OK, MessageBoxIcon.Warning);
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

    private async void BtnSyncBaseline_Click(object? sender, EventArgs e)
    {
        int facId = GetSelectedFacilityId();
        string baseUrl = txtCloudUrl.Text.TrimEnd('/');

        if (!_depositsConfigured)
        {
            try
            {
                using var http = new HttpClient { Timeout = TimeSpan.FromSeconds(5) };
                var resp = await http.GetAsync($"{baseUrl}/api/v1/store-agent/{facId}/deposits");
                if (resp.IsSuccessStatusCode)
                {
                    var json = await resp.Content.ReadAsStringAsync();
                    var options = new JsonSerializerOptions { PropertyNameCaseInsensitive = true };
                    var data = JsonSerializer.Deserialize<FacilityDepositResponse>(json, options);
                    if (data != null && data.Mappings != null && data.Mappings.Count > 0)
                    {
                        _depositsConfigured = true;
                    }
                }
            }
            catch {}
        }

        if (!_depositsConfigured)
        {
            var dlg = MessageBox.Show(
                "⚠ ADVERTENCIA: Esta tienda aún no tiene configurado el Mapeo de Depósitos en Neo ERP.\n\n" +
                "Para garantizar que el Inventario Inicial (Baseline) ingrese al Almacén y Ubicación correctos en Kardex, " +
                "se recomienda configurar y guardar el mapeo de depósitos antes de continuar.\n\n" +
                "¿Deseas ir ahora a la pestaña '2. Mapeo de Depósitos' para revisarlo?",
                "Mapeo de Depósitos Pendiente",
                MessageBoxButtons.YesNoCancel,
                MessageBoxIcon.Warning
            );

            if (dlg == DialogResult.Yes)
            {
                tabControl.SelectedTab = tabDeposits;
                return;
            }
            else if (dlg == DialogResult.Cancel)
            {
                return;
            }
        }

        string date = rbBaselineToday.Checked ? "now" : txtBaselineDate.Text.Trim();
        RunExtractor("baseline", $"--date {date}");
    }

    private void BtnSyncSales_Click(object? sender, EventArgs e)
    {
        DateTime start = DateTime.Today.AddMonths(-3);
        if (rbSales30Days.Checked) start = DateTime.Today.AddDays(-30);
        else if (rbSales3Months.Checked) start = DateTime.Today.AddMonths(-3);
        else if (rbSales6Months.Checked) start = DateTime.Today.AddMonths(-6);
        else if (rbSalesAll.Checked) start = new DateTime(2020, 1, 1);
        else if (rbSalesCustom.Checked)
        {
            if (!DateTime.TryParse(txtSalesCustomDate.Text.Trim(), out start))
            {
                MessageBox.Show("Formato de fecha invalido. Usa AAAA-MM-DD.", "Fecha Invalida", MessageBoxButtons.OK, MessageBoxIcon.Error);
                return;
            }
        }

        int batchSize = 500;
        if (int.TryParse(txtSalesBatchSize.Text.Trim(), out int b) && b > 0)
        {
            batchSize = b;
        }

        DateTime end = DateTime.Now;
        RunExtractor("sales", $"--from {start:yyyy-MM-dd} --to {end:yyyy-MM-dd} --batch-size {batchSize}");
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

            // Cargar sedes dinámicamente en segundo plano y luego consultar depósitos
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

                await Task.Delay(200);
                this.Invoke(new Action(async () =>
                {
                    await FetchDepositsFromCloudAsync(showMessages: false);
                }));
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
            // Detener y eliminar versiones/nombres previos si existian
            try
            {
                foreach (var oldSvc in new[] { "NEO", "MorpheusSyncAgent" })
                {
                    var psiCleanup = new ProcessStartInfo { FileName = "sc.exe", Arguments = $"stop {oldSvc}", Verb = "runas", UseShellExecute = true, WindowStyle = ProcessWindowStyle.Hidden };
                    var pClean = Process.Start(psiCleanup);
                    pClean?.WaitForExit();

                    var psiDelOld = new ProcessStartInfo { FileName = "sc.exe", Arguments = $"delete {oldSvc}", Verb = "runas", UseShellExecute = true, WindowStyle = ProcessWindowStyle.Hidden };
                    var pDelOld = Process.Start(psiDelOld);
                    pDelOld?.WaitForExit();
                }
            }
            catch {}

            var psi = new ProcessStartInfo
            {
                FileName = "sc.exe",
                Arguments = $"create \"NeoAgentSync\" binPath= \"\"{_agentExePath}\"\" start= auto DisplayName= \"NEO Agent Sync\"",
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
                Arguments = "description \"NeoAgentSync\" \"Integrador con Stellar\"",
                Verb = "runas",
                UseShellExecute = true,
                WindowStyle = ProcessWindowStyle.Hidden
            };
            var pDesc = Process.Start(psiDesc);
            pDesc?.WaitForExit();

            UpdateServiceStatus();
            MessageBox.Show("Servicio 'NEO Agent Sync' registrado exitosamente en Windows con la descripcion 'Integrador con Stellar'.", "Servicio Registrado", MessageBoxButtons.OK, MessageBoxIcon.Information);
        }
        catch (Exception ex)
        {
            MessageBox.Show($"Error registrando servicio:\n{ex.Message}", "Error", MessageBoxButtons.OK, MessageBoxIcon.Error);
        }
    }

    private void UninstallService()
    {
        var res = MessageBox.Show("¿Deseas desinstalar y eliminar el servicio 'NEO Agent Sync' de Windows?", "Confirmar Desinstalacion", MessageBoxButtons.YesNo, MessageBoxIcon.Warning);
        if (res != DialogResult.Yes) return;

        try
        {
            foreach (var svc in new[] { "NeoAgentSync", "NEO", "MorpheusSyncAgent" })
            {
                try
                {
                    var psiStop = new ProcessStartInfo { FileName = "sc.exe", Arguments = $"stop {svc}", Verb = "runas", UseShellExecute = true, WindowStyle = ProcessWindowStyle.Hidden };
                    var p1 = Process.Start(psiStop);
                    p1?.WaitForExit();

                    var psiDel = new ProcessStartInfo { FileName = "sc.exe", Arguments = $"delete {svc}", Verb = "runas", UseShellExecute = true, WindowStyle = ProcessWindowStyle.Hidden };
                    var p2 = Process.Start(psiDel);
                    p2?.WaitForExit();
                }
                catch {}
            }

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

public class FacilityDepositResponse
{
    public int FacilityId { get; set; }
    public string FacilityName { get; set; } = string.Empty;
    public List<CloudDepositItem> Mappings { get; set; } = new();
    public List<WarehouseOption> AvailableWarehouses { get; set; } = new();
}

public class CloudDepositItem
{
    public int Id { get; set; }
    public int FacilityId { get; set; }
    public string ExternalDepositCode { get; set; } = string.Empty;
    public string ExternalDepositName { get; set; } = string.Empty;
    public int WarehouseId { get; set; }
    public string WarehouseName { get; set; } = string.Empty;
    public string WarehouseCode { get; set; } = string.Empty;
    public int LocationId { get; set; }
    public string LocationName { get; set; } = string.Empty;
    public string LocationCode { get; set; } = string.Empty;
    public bool AffectsInventory { get; set; } = true;
    public bool IsActive { get; set; } = true;
    public bool AutoDiscovered { get; set; } = false;
}

public class WarehouseOption
{
    public int Id { get; set; }
    public string Name { get; set; } = string.Empty;
    public string Code { get; set; } = string.Empty;
    public List<LocationOption> Locations { get; set; } = new();

    public override string ToString() => string.IsNullOrWhiteSpace(Code) ? Name : $"[{Code}] {Name}";
}

public class LocationOption
{
    public int Id { get; set; }
    public int WarehouseId { get; set; }
    public string Name { get; set; } = string.Empty;
    public string Code { get; set; } = string.Empty;
    public string? Usage { get; set; }

    public override string ToString() => string.IsNullOrWhiteSpace(Code) ? Name : $"[{Code}] {Name}";
}

