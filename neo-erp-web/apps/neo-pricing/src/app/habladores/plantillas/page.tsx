'use client';
import { useState, useEffect, useRef } from 'react';
import { Dropdown } from 'primereact/dropdown';
import { InputText } from 'primereact/inputtext';
import { InputNumber } from 'primereact/inputnumber';
import { Checkbox } from 'primereact/checkbox';
import { Button } from 'primereact/button';
import { Toast } from 'primereact/toast';
import { useRouter } from 'next/navigation';
import { PrintTemplate, PrintTemplateService } from '@/services/print-template.service';

const defaultLayout = {
  brand: { x: 5, y: 6, fontSize: 8, bold: true, visible: true, prefix: '', fontFamily: 'system-ui, sans-serif' },
  sku: { x: 55, y: 6, fontSize: 8, bold: false, visible: true, prefix: 'SKU: ', fontFamily: 'system-ui, sans-serif' },
  name: { x: 5, y: 15, fontSize: 10, bold: true, visible: true, prefix: '', fontFamily: 'system-ui, sans-serif' },
  model: { x: 5, y: 25, fontSize: 8, bold: false, visible: false, prefix: 'Mod: ', fontFamily: 'system-ui, sans-serif' },
  uom: { x: 5, y: 30, fontSize: 8, bold: false, visible: true, prefix: 'Unidad: ', fontFamily: 'system-ui, sans-serif' },
  price_ves: { x: 5, y: 38, fontSize: 12, bold: true, visible: true, prefix: 'Bs. ', fontFamily: 'system-ui, sans-serif' },
  price_usd: { x: 55, y: 38, fontSize: 14, bold: true, visible: true, prefix: '$', fontFamily: 'system-ui, sans-serif' },
  price_ves_iva: { x: 5, y: 46, fontSize: 10, bold: true, visible: false, prefix: 'Bs. c/IVA: ', fontFamily: 'system-ui, sans-serif' },
  price_usd_iva: { x: 55, y: 46, fontSize: 10, bold: true, visible: false, prefix: '$ c/IVA: ', fontFamily: 'system-ui, sans-serif' },
  barcode: { x: 15, y: 41, width: 50, height: 8, visible: true },
  company_logo: { x: 5, y: 41, width: 8, height: 8, visible: false },
  promo_text: { x: 5, y: 22, fontSize: 8, bold: true, visible: false, prefix: '', fontFamily: 'system-ui, sans-serif' }
};

const fontFamilyOptions = [
  { label: 'Predeterminada (Sans)', value: 'system-ui, sans-serif' },
  { label: 'Arial / Helvetica', value: 'Arial, sans-serif' },
  { label: 'Times New Roman', value: '"Times New Roman", serif' },
  { label: 'Courier New (Monospace)', value: '"Courier New", monospace' },
  { label: 'Impact (Gruesa/Poster)', value: 'Impact, sans-serif' },
  { label: 'Georgia', value: 'Georgia, serif' },
  { label: 'Trebuchet MS', value: '"Trebuchet MS", sans-serif' },
  { label: 'Comic Sans', value: '"Comic Sans MS", cursive' }
];

const blockLabels: Record<string, string> = {
  brand: 'Marca',
  sku: 'Código SKU',
  name: 'Nombre Producto',
  model: 'Modelo',
  uom: 'UoM (Presentación)',
  price_ves: 'Precio VES',
  price_usd: 'Precio USD',
  price_ves_iva: 'Precio VES + IVA',
  price_usd_iva: 'Precio USD + IVA',
  barcode: 'Código de Barras',
  company_logo: 'Logo de la Empresa',
  promo_text: 'Texto Promocional'
};

const sampleValues: Record<string, string> = {
  brand: 'DIAGEO / GENÉRICO',
  sku: 'PRD-102941',
  name: 'Caraotas Negras Pantera 900gr',
  model: 'Modelo E-900',
  uom: 'PAQUETE (PZA)',
  price_ves: 'Bs. 149.07',
  price_usd: '$3.05',
  price_ves_iva: 'Bs. 172.92',
  price_usd_iva: '$3.54',
  promo_text: '¡OFERTA ESPECIAL!'
};

export default function TemplateDesignerPage() {
  const toast = useRef<Toast>(null);
  const router = useRouter();
  const [templates, setTemplates] = useState<PrintTemplate[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedTemplate, setSelectedTemplate] = useState<PrintTemplate | null>(null);

  // Form State
  const [name, setName] = useState('');
  const [paperType, setPaperType] = useState<'GRID' | 'CONTINUOUS' | 'INDIVIDUAL'>('GRID');
  const [widthMm, setWidthMm] = useState<number>(80);
  const [heightMm, setHeightMm] = useState<number>(50);
  const [marginTopMm, setMarginTopMm] = useState<number>(0);
  const [marginBottomMm, setMarginBottomMm] = useState<number>(0);
  const [marginLeftMm, setMarginLeftMm] = useState<number>(0);
  const [marginRightMm, setMarginRightMm] = useState<number>(0);
  const [rows, setRows] = useState<number>(1);
  const [cols, setCols] = useState<number>(1);
  const [showSku, setShowSku] = useState<boolean>(true);
  const [showBarcode, setShowBarcode] = useState<boolean>(true);
  const [showPriceUsd, setShowPriceUsd] = useState<boolean>(true);
  const [showPriceVes, setShowPriceVes] = useState<boolean>(true);
  const [showPriceIva, setShowPriceIva] = useState<boolean>(true);
  const [showUom, setShowUom] = useState<boolean>(true);
  const [showBrand, setShowBrand] = useState<boolean>(true);
  const [showLogo, setShowLogo] = useState<boolean>(false);
  const [promoText, setPromoText] = useState<string>('');
  const [fontSizePt, setFontSizePt] = useState<number>(10);
  
  // Drag & Drop State
  const [layoutConfig, setLayoutConfig] = useState<any>(defaultLayout);
  const [selectedBlock, setSelectedBlock] = useState<string | null>(null);

  const paperTypeOptions = [
    { label: 'Cuadrícula (A4 / Carta)', value: 'GRID' },
    { label: 'Rollo Continuo', value: 'CONTINUOUS' },
    { label: 'Individual (Etiquetas)', value: 'INDIVIDUAL' }
  ];

  const fetchTemplates = async () => {
    try {
      setLoading(true);
      const data = await PrintTemplateService.getTemplates();
      setTemplates(data);
      if (data.length > 0 && !selectedTemplate) {
        loadTemplateIntoForm(data[0]);
      }
    } catch (err) {
      console.error(err);
      toast.current?.show({
        severity: 'error',
        summary: 'Error',
        detail: 'No se pudieron cargar las plantillas.'
      });
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchTemplates();
  }, []);

  const loadTemplateIntoForm = (template: PrintTemplate) => {
    setSelectedTemplate(template);
    setName(template.name);
    setPaperType(template.paper_type);
    setWidthMm(template.width_mm);
    setHeightMm(template.height_mm);
    setMarginTopMm(template.margin_top_mm);
    setMarginBottomMm(template.margin_bottom_mm);
    setMarginLeftMm(template.margin_left_mm);
    setMarginRightMm(template.margin_right_mm);
    setRows(template.rows);
    setCols(template.cols);
    setShowSku(template.show_sku);
    setShowBarcode(template.show_barcode);
    setShowPriceUsd(template.show_price_usd);
    setShowPriceVes(template.show_price_ves);
    setShowPriceIva(template.show_price_iva);
    setShowUom(template.show_uom);
    setShowBrand(template.show_brand);
    setShowLogo(template.layout_config?.company_logo?.visible || false);
    setPromoText(template.promo_text || '');
    setFontSizePt(template.font_size_pt);
    setLayoutConfig(template.layout_config || defaultLayout);
    setSelectedBlock(null);
  };

  const handleNewTemplate = () => {
    setSelectedTemplate(null);
    setName('Nueva Plantilla Drag & Drop');
    setPaperType('GRID');
    setWidthMm(80);
    setHeightMm(50);
    setMarginTopMm(5);
    setMarginBottomMm(5);
    setMarginLeftMm(5);
    setMarginRightMm(5);
    setRows(4);
    setCols(2);
    setShowSku(true);
    setShowBarcode(true);
    setShowPriceUsd(true);
    setShowPriceVes(true);
    setShowPriceIva(true);
    setShowUom(true);
    setShowBrand(true);
    setShowLogo(false);
    setPromoText('');
    setFontSizePt(10);
    setLayoutConfig(JSON.parse(JSON.stringify(defaultLayout)));
    setSelectedBlock(null);
  };

  // Add a new Free Text box (Report Builder style)
  const handleAddFreeText = () => {
    const customKeys = Object.keys(layoutConfig).filter(k => k.startsWith('custom_text_'));
    const nextIndex = customKeys.length + 1;
    const newKey = `custom_text_${nextIndex}`;

    setLayoutConfig((prev: any) => ({
      ...prev,
      [newKey]: {
        x: 10,
        y: 10,
        fontSize: 10,
        bold: false,
        visible: true,
        prefix: '',
        textValue: 'Texto Libre...',
        isCustomText: true,
        fontFamily: 'system-ui, sans-serif'
      }
    }));
    setSelectedBlock(newKey);
    toast.current?.show({
      severity: 'success',
      summary: 'Agregado',
      detail: 'Se agregó un nuevo cuadro de texto libre al lienzo.'
    });
  };

  const handleDeleteBlock = (key: string) => {
    setLayoutConfig((prev: any) => {
      const copy = { ...prev };
      delete copy[key];
      return copy;
    });
    setSelectedBlock(null);
    toast.current?.show({
      severity: 'info',
      summary: 'Eliminado',
      detail: 'Se eliminó el cuadro de texto del lienzo.'
    });
  };

  // Synchronise form toggles with layoutConfig visibilities for core items
  useEffect(() => {
    setLayoutConfig((prev: any) => {
      if (!prev) return prev;
      const copy = { ...prev };
      if (copy.brand) copy.brand.visible = showBrand;
      if (copy.sku) copy.sku.visible = showSku;
      if (copy.uom) copy.uom.visible = showUom;
      if (copy.barcode) copy.barcode.visible = showBarcode;
      if (copy.company_logo) copy.company_logo.visible = showLogo;
      if (copy.price_usd) copy.price_usd.visible = showPriceUsd;
      if (copy.price_ves) copy.price_ves.visible = showPriceVes;
      if (copy.price_ves_iva) copy.price_ves_iva.visible = showPriceIva;
      if (copy.price_usd_iva) copy.price_usd_iva.visible = showPriceIva;
      if (copy.promo_text) copy.promo_text.visible = !!promoText;
      return copy;
    });
  }, [showBrand, showSku, showUom, showBarcode, showLogo, showPriceUsd, showPriceVes, showPriceIva, promoText]);

  const handleSave = async () => {
    if (!name.trim()) {
      toast.current?.show({
        severity: 'warn',
        summary: 'Validación',
        detail: 'El nombre de la plantilla es obligatorio.'
      });
      return;
    }

    const payload: Omit<PrintTemplate, 'id'> = {
      name,
      paper_type: paperType,
      width_mm: widthMm,
      height_mm: heightMm,
      margin_top_mm: marginTopMm,
      margin_bottom_mm: marginBottomMm,
      margin_left_mm: marginLeftMm,
      margin_right_mm: marginRightMm,
      rows,
      cols,
      show_sku: showSku,
      show_barcode: showBarcode,
      show_price_usd: showPriceUsd,
      show_price_ves: showPriceVes,
      show_price_iva: showPriceIva,
      show_uom: showUom,
      show_brand: showBrand,
      promo_text: promoText || undefined,
      font_size_pt: fontSizePt,
      layout_config: layoutConfig
    };

    try {
      if (selectedTemplate) {
        const updated = await PrintTemplateService.updateTemplate(selectedTemplate.id, payload);
        toast.current?.show({
          severity: 'success',
          summary: 'Guardado',
          detail: 'Plantilla Drag & Drop guardada correctamente.'
        });
        setSelectedTemplate(updated);
      } else {
        const created = await PrintTemplateService.createTemplate(payload);
        toast.current?.show({
          severity: 'success',
          summary: 'Creado',
          detail: 'Plantilla creada con éxito.'
        });
        setSelectedTemplate(created);
      }
      fetchTemplates();
    } catch (err) {
      console.error(err);
      toast.current?.show({
        severity: 'error',
        summary: 'Error',
        detail: 'No se pudo guardar la plantilla.'
      });
    }
  };

  const handleDelete = async () => {
    if (!selectedTemplate) return;
    try {
      await PrintTemplateService.deleteTemplate(selectedTemplate.id);
      toast.current?.show({
        severity: 'success',
        summary: 'Eliminado',
        detail: 'Plantilla eliminada.'
      });
      setSelectedTemplate(null);
      handleNewTemplate();
      fetchTemplates();
    } catch (err) {
      console.error(err);
      toast.current?.show({
        severity: 'error',
        summary: 'Error',
        detail: 'No se pudo eliminar la plantilla.'
      });
    }
  };

  // Drag handler
  const handleMouseDown = (e: React.MouseEvent, key: string, scale: number) => {
    e.preventDefault();
    setSelectedBlock(key);
    const block = layoutConfig[key];
    if (!block) return;
    const startX = e.clientX;
    const startY = e.clientY;
    const startBlockX = block.x;
    const startBlockY = block.y;

    const handleMouseMove = (moveEvent: MouseEvent) => {
      const deltaX = (moveEvent.clientX - startX) / scale;
      const deltaY = (moveEvent.clientY - startY) / scale;
      
      const targetX = startBlockX + deltaX;
      const targetY = startBlockY + deltaY;

      // Keep coordinates within bounds of card (with margins)
      const newX = Math.max(0, Math.min(widthMm - 5, targetX));
      const newY = Math.max(0, Math.min(heightMm - 2, targetY));

      setLayoutConfig((prev: any) => ({
        ...prev,
        [key]: {
          ...prev[key],
          x: Math.round(newX * 10) / 10,
          y: Math.round(newY * 10) / 10
        }
      }));
    };

    const handleMouseUp = () => {
      document.removeEventListener('mousemove', handleMouseMove);
      document.removeEventListener('mouseup', handleMouseUp);
    };

    document.addEventListener('mousemove', handleMouseMove);
    document.addEventListener('mouseup', handleMouseUp);
  };

  // Visual Corner Resizing handler for Barcode and Custom Text Box width
  const handleResizeMouseDown = (e: React.MouseEvent, key: string, scale: number) => {
    e.stopPropagation();
    e.preventDefault();
    const block = layoutConfig[key];
    if (!block) return;
    const startX = e.clientX;
    const startY = e.clientY;
    const startWidth = block.width || (block.fontSize ? block.fontSize * 5 : 40);
    const startHeight = block.height || 10;

    const handleMouseMove = (moveEvent: MouseEvent) => {
      const deltaX = (moveEvent.clientX - startX) / scale;
      const deltaY = (moveEvent.clientY - startY) / scale;

      const newWidth = Math.max(10, startWidth + deltaX);
      const newHeight = Math.max(4, startHeight + deltaY);

      setLayoutConfig((prev: any) => ({
        ...prev,
        [key]: {
          ...prev[key],
          width: Math.round(newWidth * 10) / 10,
          height: Math.round(newHeight * 10) / 10
        }
      }));
    };

    const handleMouseUp = () => {
      document.removeEventListener('mousemove', handleMouseMove);
      document.removeEventListener('mouseup', handleMouseUp);
    };

    document.addEventListener('mousemove', handleMouseMove);
    document.addEventListener('mouseup', handleMouseUp);
  };

  const handleUpdateBlockProp = (key: string, property: string, value: any) => {
    setLayoutConfig((prev: any) => ({
      ...prev,
      [key]: {
        ...prev[key],
        [property]: value
      }
    }));
  };

  // Expanded Preview sizing for comfortable design layout
  const maxPreviewWidth = 480;
  const ratio = heightMm / widthMm;
  const previewWidth = maxPreviewWidth;
  const previewHeight = maxPreviewWidth * ratio;
  const scale = previewWidth / widthMm; // pixels per mm

  return (
    <div className="w-full max-w-[1500px] mx-auto py-6 px-4">
      <Toast ref={toast} />

      {/* Header */}
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4 mb-6">
        <div>
          <h1 className="text-3xl font-extrabold text-slate-800 tracking-tight flex items-center gap-2">
            <Button
              icon="pi pi-arrow-left"
              rounded
              text
              severity="secondary"
              className="p-button-sm text-slate-500 hover:bg-slate-100"
              onClick={() => router.push('/habladores')}
            />
            <span className="text-2xl">🏷️</span> Diseñador de Plantillas Drag & Drop
          </h1>
          <p className="text-slate-500 mt-1 font-medium">Configura dimensiones reales, agrega cuadros de texto libre y arrastra elementos con total libertad sobre el lienzo ampliado.</p>
        </div>
        <div className="flex gap-2">
          <Button
            label="Texto Libre"
            icon="pi pi-plus-circle"
            severity="success"
            className="!rounded-xl !shadow-sm font-semibold transition-all duration-200"
            onClick={handleAddFreeText}
          />
          <Button
            label="Nueva Plantilla"
            icon="pi pi-plus"
            className="!bg-indigo-600 hover:!bg-indigo-700 !border-none !rounded-xl !shadow-sm font-semibold transition-all duration-200"
            onClick={handleNewTemplate}
          />
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-12 gap-8">
        {/* Templates Sidebar */}
        <div className="lg:col-span-2 bg-white p-4 rounded-2xl border border-slate-100 shadow-sm flex flex-col gap-4 max-h-[75vh] overflow-y-auto">
          <h3 className="text-[10px] font-extrabold text-slate-400 uppercase tracking-widest border-b border-slate-100 pb-2">Plantillas</h3>
          {loading ? (
            <div className="text-center py-8">
              <i className="pi pi-spin pi-spinner text-indigo-600 text-2xl"></i>
            </div>
          ) : templates.length === 0 ? (
            <p className="text-slate-400 text-xs text-center py-4">No hay plantillas.</p>
          ) : (
            <div className="flex flex-col gap-2">
              {templates.map((tpl) => (
                <button
                  key={tpl.id}
                  onClick={() => loadTemplateIntoForm(tpl)}
                  className={`w-full text-left p-3 rounded-xl border text-xs font-semibold transition-all duration-200 ${
                    selectedTemplate?.id === tpl.id
                      ? 'border-indigo-600 bg-indigo-50/50 text-indigo-700 shadow-sm'
                      : 'border-slate-100 hover:border-slate-200 text-slate-600 hover:bg-slate-50/50'
                  }`}
                >
                  <div className="font-bold block truncate">{tpl.name}</div>
                  <span className="text-[9px] text-slate-400 font-bold block mt-1 uppercase tracking-wide">
                    {tpl.paper_type} • {tpl.width_mm}x{tpl.height_mm}mm
                  </span>
                </button>
              ))}
            </div>
          )}
        </div>

        {/* Configuration Form */}
        <div className="lg:col-span-4 bg-white p-5 rounded-2xl border border-slate-100 shadow-sm flex flex-col gap-4">
          <h3 className="text-xs font-extrabold text-slate-400 uppercase tracking-widest border-b border-slate-100 pb-2">
            {selectedTemplate ? `Editar: ${selectedTemplate.name}` : 'Crear Nueva Plantilla'}
          </h3>

          <div className="flex flex-col gap-3">
            {/* General */}
            <div>
              <label className="block text-[9px] font-extrabold text-slate-500 mb-1 uppercase tracking-wider">Nombre de la Plantilla</label>
              <InputText
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="Ej. Gondola 80x50mm"
                className="w-full p-2 bg-slate-50 border-slate-200 rounded-xl text-xs font-semibold"
              />
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="block text-[9px] font-extrabold text-slate-500 mb-1 uppercase tracking-wider">Tipo de Papel</label>
                <Dropdown
                  value={paperType}
                  options={paperTypeOptions}
                  onChange={(e) => setPaperType(e.value)}
                  className="w-full border-slate-200 bg-slate-50 rounded-xl text-xs"
                />
              </div>
              <div>
                <label className="block text-[9px] font-extrabold text-slate-500 mb-1 uppercase tracking-wider">Fuente Base (pt)</label>
                <InputNumber
                  value={fontSizePt}
                  onValueChange={(e) => setFontSizePt(e.value || 10)}
                  min={6}
                  max={36}
                  className="w-full text-xs rounded-xl overflow-hidden"
                  inputClassName="text-center p-2 bg-slate-50 border-slate-200 w-full font-bold"
                />
              </div>
            </div>

            {/* Dimensions */}
            <div className="grid grid-cols-2 gap-3 border-t border-slate-50 pt-3">
              <div>
                <label className="block text-[9px] font-extrabold text-slate-500 mb-1 uppercase tracking-wider">Ancho Hablador (mm)</label>
                <InputNumber
                  value={widthMm}
                  onValueChange={(e) => setWidthMm(e.value || 80)}
                  min={20}
                  max={500}
                  suffix=" mm"
                  className="w-full text-xs"
                  inputClassName="p-2 bg-slate-50 border-slate-200 rounded-xl w-full font-bold"
                />
              </div>
              <div>
                <label className="block text-[9px] font-extrabold text-slate-500 mb-1 uppercase tracking-wider">Alto Hablador (mm)</label>
                <InputNumber
                  value={heightMm}
                  onValueChange={(e) => setHeightMm(e.value || 50)}
                  min={20}
                  max={500}
                  suffix=" mm"
                  className="w-full text-xs"
                  inputClassName="p-2 bg-slate-50 border-slate-200 rounded-xl w-full font-bold"
                />
              </div>
            </div>

            {/* Grid Layout */}
            {paperType === 'GRID' && (
              <div className="grid grid-cols-2 gap-3 bg-slate-50 p-3 rounded-xl border border-slate-100">
                <div className="col-span-2 flex justify-between items-center">
                  <span className="text-[9px] font-bold text-slate-400 uppercase tracking-widest block">Maquetación por Hoja</span>
                </div>
                <div>
                  <label className="block text-[9px] font-extrabold text-slate-500 mb-1 uppercase">Filas</label>
                  <InputNumber
                    value={rows}
                    onValueChange={(e) => setRows(e.value || 1)}
                    min={1}
                    max={30}
                    className="w-full text-xs"
                    inputClassName="p-1.5 bg-white border-slate-200 rounded-xl w-full font-bold"
                  />
                </div>
                <div>
                  <label className="block text-[9px] font-extrabold text-slate-500 mb-1 uppercase">Columnas</label>
                  <InputNumber
                    value={cols}
                    onValueChange={(e) => setCols(e.value || 1)}
                    min={1}
                    max={20}
                    className="w-full text-xs"
                    inputClassName="p-1.5 bg-white border-slate-200 rounded-xl w-full font-bold"
                  />
                </div>
              </div>
            )}

            {/* Margins */}
            <div className="border-t border-slate-50 pt-3">
              <span className="text-[9px] font-bold text-slate-400 uppercase tracking-widest block mb-2">Márgenes de Hoja (mm)</span>
              <div className="grid grid-cols-4 gap-2">
                <div>
                  <label className="block text-[9px] font-extrabold text-slate-400 mb-1 uppercase text-center">Sup</label>
                  <InputNumber
                    value={marginTopMm}
                    onValueChange={(e) => setMarginTopMm(e.value ?? 0)}
                    className="w-full text-xs"
                    inputClassName="p-1 text-center bg-slate-50 border-slate-200 rounded-lg w-full font-bold"
                  />
                </div>
                <div>
                  <label className="block text-[9px] font-extrabold text-slate-400 mb-1 uppercase text-center">Inf</label>
                  <InputNumber
                    value={marginBottomMm}
                    onValueChange={(e) => setMarginBottomMm(e.value ?? 0)}
                    className="w-full text-xs"
                    inputClassName="p-1 text-center bg-slate-50 border-slate-200 rounded-lg w-full font-bold"
                  />
                </div>
                <div>
                  <label className="block text-[9px] font-extrabold text-slate-400 mb-1 uppercase text-center">Izq</label>
                  <InputNumber
                    value={marginLeftMm}
                    onValueChange={(e) => setMarginLeftMm(e.value ?? 0)}
                    className="w-full text-xs"
                    inputClassName="p-1 text-center bg-slate-50 border-slate-200 rounded-lg w-full font-bold"
                  />
                </div>
                <div>
                  <label className="block text-[9px] font-extrabold text-slate-400 mb-1 uppercase text-center">Der</label>
                  <InputNumber
                    value={marginRightMm}
                    onValueChange={(e) => setMarginRightMm(e.value ?? 0)}
                    className="w-full text-xs"
                    inputClassName="p-1 text-center bg-slate-50 border-slate-200 rounded-lg w-full font-bold"
                  />
                </div>
              </div>
            </div>

            {/* Visibility Toggles */}
            <div className="border-t border-slate-50 pt-3 flex flex-col gap-2">
              <span className="text-[9px] font-bold text-slate-400 uppercase tracking-widest block">Campos Predeterminados</span>
              <div className="grid grid-cols-2 gap-x-4 gap-y-1">
                <div className="flex items-center gap-2">
                  <Checkbox inputId="show_brand" checked={showBrand} onChange={(e) => setShowBrand(!!e.checked)} />
                  <label htmlFor="show_brand" className="text-xs font-semibold text-slate-600 cursor-pointer">Marca</label>
                </div>
                <div className="flex items-center gap-2">
                  <Checkbox inputId="show_sku" checked={showSku} onChange={(e) => setShowSku(!!e.checked)} />
                  <label htmlFor="show_sku" className="text-xs font-semibold text-slate-600 cursor-pointer">SKU</label>
                </div>
                <div className="flex items-center gap-2">
                  <Checkbox inputId="show_uom" checked={showUom} onChange={(e) => setShowUom(!!e.checked)} />
                  <label htmlFor="show_uom" className="text-xs font-semibold text-slate-600 cursor-pointer">Unidad (UoM)</label>
                </div>
                <div className="flex items-center gap-2">
                  <Checkbox inputId="show_barcode" checked={showBarcode} onChange={(e) => setShowBarcode(!!e.checked)} />
                  <label htmlFor="show_barcode" className="text-xs font-semibold text-slate-600 cursor-pointer">Código Barras</label>
                </div>
                <div className="flex items-center gap-2">
                  <Checkbox inputId="show_price_usd" checked={showPriceUsd} onChange={(e) => setShowPriceUsd(!!e.checked)} />
                  <label htmlFor="show_price_usd" className="text-xs font-semibold text-slate-600 cursor-pointer">Precio USD</label>
                </div>
                <div className="flex items-center gap-2">
                  <Checkbox inputId="show_price_ves" checked={showPriceVes} onChange={(e) => setShowPriceVes(!!e.checked)} />
                  <label htmlFor="show_price_ves" className="text-xs font-semibold text-slate-600 cursor-pointer">Precio VES</label>
                </div>
                <div className="flex items-center gap-2">
                  <Checkbox inputId="show_logo" checked={showLogo} onChange={(e) => setShowLogo(!!e.checked)} />
                  <label htmlFor="show_logo" className="text-xs font-semibold text-slate-600 cursor-pointer">Logo Empresa</label>
                </div>
                <div className="flex items-center gap-2">
                  <Checkbox inputId="show_price_iva" checked={showPriceIva} onChange={(e) => setShowPriceIva(!!e.checked)} />
                  <label htmlFor="show_price_iva" className="text-xs font-semibold text-slate-600 cursor-pointer">Precio con IVA</label>
                </div>
              </div>
            </div>

            {/* Promo text */}
            <div className="border-t border-slate-50 pt-3">
              <label className="block text-[9px] font-extrabold text-slate-500 mb-1 uppercase tracking-wider">Texto Promocional por Defecto</label>
              <InputText
                value={promoText}
                onChange={(e) => setPromoText(e.target.value)}
                placeholder="Ej. Oferta Especial"
                className="w-full p-2 bg-slate-50 border-slate-200 rounded-xl text-xs font-bold text-red-600"
              />
            </div>
          </div>

          {/* Form Actions */}
          <div className="flex justify-between items-center gap-3 border-t border-slate-100 pt-4 mt-2">
            {selectedTemplate && (
              <Button
                label="Eliminar"
                icon="pi pi-trash"
                className="!bg-rose-50 hover:!bg-rose-100 !text-rose-600 !border-rose-100 !rounded-xl !px-3 font-bold text-xs"
                onClick={handleDelete}
              />
            )}
            <div className="flex gap-2 ml-auto">
              <Button
                label="Guardar Plantilla"
                icon="pi pi-check"
                className="!bg-slate-900 !border-slate-900 hover:!bg-slate-800 !rounded-xl !px-5 font-bold shadow-sm text-xs"
                onClick={handleSave}
              />
            </div>
          </div>
        </div>

        {/* Live Drag & Drop Canvas Preview (Ampliado: lg:col-span-6) */}
        <div className="lg:col-span-6 bg-slate-950 p-6 rounded-2xl flex flex-col items-center justify-center min-h-[60vh] relative overflow-hidden">
          <div className="absolute top-4 left-4 bg-indigo-600 text-white text-[10px] font-extrabold px-3 py-1 rounded-full uppercase tracking-wider shadow-md">
            Lienzo Drag & Drop (Canva-mode)
          </div>

          <div className="absolute top-4 right-4 text-[10px] text-slate-400 font-semibold select-none">
            {widthMm}x{heightMm} mm (Zoom x{scale.toFixed(1)})
          </div>

          <div
            className="bg-white border-2 border-indigo-500 rounded shadow-2xl relative select-none overflow-hidden"
            style={{
              width: `${previewWidth}px`,
              height: `${previewHeight}px`,
              fontFamily: 'system-ui, sans-serif'
            }}
          >
            {/* Margins Indication Lines */}
            <div
              className="absolute pointer-events-none border border-rose-300/30"
              style={{
                top: `${marginTopMm * scale}px`,
                bottom: `${marginBottomMm * scale}px`,
                left: `${marginLeftMm * scale}px`,
                right: `${marginRightMm * scale}px`
              }}
            ></div>

            {/* Render dynamically positioned blocks based on layoutConfig */}
            {layoutConfig &&
              Object.keys(layoutConfig).map((key) => {
                const block = layoutConfig[key];
                if (!block || !block.visible) return null;

                const isSelected = selectedBlock === key;
                
                // Content compilation for previews
                let renderedText = '';
                if (block.isCustomText) {
                  renderedText = block.textValue || 'Texto libre...';
                  // Replace dynamic variables in preview for visual comfort
                  renderedText = renderedText.replace(/{{sku}}/g, sampleValues.sku);
                  renderedText = renderedText.replace(/{{modelo}}/g, sampleValues.model);
                  renderedText = renderedText.replace(/{{marca}}/g, sampleValues.brand);
                  renderedText = renderedText.replace(/{{uom}}/g, sampleValues.uom);
                  renderedText = renderedText.replace(/{{precio_usd}}/g, sampleValues.price_usd);
                  renderedText = renderedText.replace(/{{precio_ves}}/g, sampleValues.price_ves);
                  renderedText = renderedText.replace(/{{precio_usd_iva}}/g, sampleValues.price_usd_iva);
                  renderedText = renderedText.replace(/{{precio_ves_iva}}/g, sampleValues.price_ves_iva);
                } else if (key !== 'barcode' && key !== 'company_logo') {
                  const sampleVal = sampleValues[key] || '';
                  renderedText = block.prefix ? `${block.prefix}${sampleVal}` : sampleVal;
                }

                if (key === 'barcode') {
                  const barcodeWidth = block.width || 50;
                  const barcodeHeight = block.height || 8;
                  return (
                    <div
                      key={key}
                      onMouseDown={(e) => handleMouseDown(e, key, scale)}
                      className={`absolute select-none flex flex-col items-center justify-center p-0.5 rounded ${
                        isSelected ? 'ring-2 ring-indigo-500 bg-indigo-50/10' : 'border border-transparent hover:border-slate-300'
                      }`}
                      style={{
                        left: `${block.x * scale}px`,
                        top: `${block.y * scale}px`,
                        width: `${barcodeWidth * scale}px`,
                        height: `${barcodeHeight * scale}px`,
                        cursor: 'move'
                      }}
                      title="Arrastra para mover. Usa la esquina inferior derecha para cambiar tamaño."
                    >
                      <div className="flex items-end justify-center w-full h-[75%] gap-[1.5px] bg-white overflow-hidden">
                        {[2, 1, 3, 1, 2, 4, 1, 2, 3, 1, 2, 1, 4, 2, 1, 3, 1, 2].map((w, i) => (
                          <span key={i} className="bg-slate-800 inline-block h-full" style={{ width: `${w * 0.7}px` }}></span>
                        ))}
                      </div>
                      <span className="text-[7px] font-mono tracking-widest mt-0.5 text-slate-500 leading-none bg-white px-1">
                        7591794090139
                      </span>

                      {/* Resize Handle */}
                      {isSelected && (
                        <div
                          onMouseDown={(e) => handleResizeMouseDown(e, key, scale)}
                          className="absolute right-0 bottom-0 w-3.5 h-3.5 bg-indigo-600 border-2 border-white rounded-full cursor-se-resize z-30 flex items-center justify-center shadow-md"
                          style={{ transform: 'translate(40%, 40%)' }}
                          title="Arrastra para redimensionar"
                        />
                      )}
                    </div>
                  );
                }

                if (key === 'company_logo') {
                  const logoWidth = block.width || 10;
                  const logoHeight = block.height || 10;
                  return (
                    <div
                      key={key}
                      onMouseDown={(e) => handleMouseDown(e, key, scale)}
                      className={`absolute select-none flex items-center justify-center p-0.5 rounded ${
                        isSelected ? 'ring-2 ring-indigo-500 bg-indigo-50/10' : 'border border-transparent hover:border-slate-300'
                      }`}
                      style={{
                        left: `${block.x * scale}px`,
                        top: `${block.y * scale}px`,
                        width: `${logoWidth * scale}px`,
                        height: `${logoHeight * scale}px`,
                        cursor: 'move'
                      }}
                      title="Logo de la empresa. Arrastra para mover o redimensionar."
                    >
                      <svg viewBox="0 0 100 100" className="w-full h-full text-slate-800 fill-current opacity-85">
                        <path d="M50,10 L90,30 L90,70 L50,90 L10,70 L10,30 Z M50,25 A 25 25 0 1 0 50,75 A 25 25 0 1 0 50,25 Z M50,38 L62,50 L50,62 L38,50 Z" />
                      </svg>
                      {isSelected && (
                        <div
                          onMouseDown={(e) => handleResizeMouseDown(e, key, scale)}
                          className="absolute right-0 bottom-0 w-3.5 h-3.5 bg-indigo-600 border-2 border-white rounded-full cursor-se-resize z-30 shadow-md"
                          style={{ transform: 'translate(40%, 40%)' }}
                        />
                      )}
                    </div>
                  );
                }

                return (
                  <div
                    key={key}
                    onMouseDown={(e) => handleMouseDown(e, key, scale)}
                    className={`absolute select-none px-1 rounded whitespace-nowrap leading-tight ${
                      isSelected ? 'ring-2 ring-indigo-500 bg-indigo-50/40 text-indigo-950 font-medium' : 'border border-transparent hover:border-slate-300 text-slate-800'
                    }`}
                    style={{
                      left: `${block.x * scale}px`,
                      top: `${block.y * scale}px`,
                      fontSize: `${block.fontSize}pt`,
                      fontWeight: block.bold ? 'bold' : 'normal',
                      fontFamily: block.fontFamily || 'system-ui, sans-serif',
                      cursor: 'move'
                    }}
                    title="Arrastrar bloque"
                  >
                    {renderedText}

                    {/* Resize handle (supports visual sizing of texts or blocks) */}
                    {isSelected && (
                      <div
                        onMouseDown={(e) => handleResizeMouseDown(e, key, scale)}
                        className="absolute right-0 bottom-0 w-3 h-3 bg-indigo-600 border border-white rounded-full cursor-se-resize z-30"
                        style={{ transform: 'translate(40%, 40%)' }}
                      />
                    )}
                  </div>
                );
              })}
          </div>

          {/* Properties Panel of Selected Block */}
          {selectedBlock && layoutConfig[selectedBlock] ? (
            <div className="w-full bg-slate-900 p-4 mt-6 rounded-xl border border-slate-800 text-slate-300 flex flex-col gap-3">
              <div className="flex justify-between items-center border-b border-slate-800 pb-2">
                <span className="text-xs font-extrabold text-indigo-400 uppercase tracking-wider">
                  Bloque: {layoutConfig[selectedBlock].isCustomText ? `Texto Libre (${selectedBlock})` : blockLabels[selectedBlock]}
                </span>
                <div className="flex gap-2 items-center">
                  {layoutConfig[selectedBlock].isCustomText && (
                    <Button
                      icon="pi pi-trash"
                      severity="danger"
                      rounded
                      text
                      className="p-button-sm !text-rose-500 hover:!bg-rose-950/30 p-0 m-0 w-6 h-6"
                      onClick={() => handleDeleteBlock(selectedBlock)}
                      title="Eliminar este cuadro de texto libre"
                    />
                  )}
                  <Button
                    icon="pi pi-times"
                    className="p-button-text p-button-sm !text-slate-500 hover:!text-slate-200 p-0 m-0 w-6 h-6"
                    onClick={() => setSelectedBlock(null)}
                  />
                </div>
              </div>

              <div className="grid grid-cols-2 md:grid-cols-4 gap-3 text-xs">
                <div>
                  <label className="block text-[9px] font-bold text-slate-500 uppercase mb-1">Posición X (mm)</label>
                  <InputNumber
                    value={layoutConfig[selectedBlock].x}
                    onValueChange={(e) => handleUpdateBlockProp(selectedBlock, 'x', e.value ?? 0)}
                    min={0}
                    max={widthMm}
                    step={0.5}
                    className="w-full text-xs"
                    inputClassName="p-1.5 bg-slate-800 border-slate-700 text-white w-full rounded"
                  />
                </div>
                <div>
                  <label className="block text-[9px] font-bold text-slate-500 uppercase mb-1">Posición Y (mm)</label>
                  <InputNumber
                    value={layoutConfig[selectedBlock].y}
                    onValueChange={(e) => handleUpdateBlockProp(selectedBlock, 'y', e.value ?? 0)}
                    min={0}
                    max={heightMm}
                    step={0.5}
                    className="w-full text-xs"
                  />
                </div>
                {selectedBlock !== 'barcode' && selectedBlock !== 'company_logo' ? (
                  <>
                    <div>
                      <label className="block text-[9px] font-bold text-slate-500 uppercase mb-1">Tamaño Letra (pt)</label>
                      <InputNumber
                        value={layoutConfig[selectedBlock].fontSize}
                        onValueChange={(e) => handleUpdateBlockProp(selectedBlock, 'fontSize', e.value ?? 8)}
                        min={5}
                        max={36}
                        className="w-full text-xs"
                        inputClassName="p-1.5 bg-slate-800 border-slate-700 text-white w-full rounded"
                      />
                    </div>
                    <div>
                      <label className="block text-[9px] font-bold text-slate-500 uppercase mb-1">Tipografía (Fuente)</label>
                      <Dropdown
                        value={layoutConfig[selectedBlock].fontFamily || 'system-ui, sans-serif'}
                        options={fontFamilyOptions}
                        onChange={(e) => handleUpdateBlockProp(selectedBlock, 'fontFamily', e.value)}
                        className="w-full bg-slate-800 border-slate-700 text-white text-xs rounded"
                      />
                    </div>
                    <div className="flex items-end justify-center pb-2 col-span-2 md:col-span-1">
                      <div className="flex items-center gap-2">
                        <Checkbox
                          inputId="block_bold"
                          checked={layoutConfig[selectedBlock].bold}
                          onChange={(e) => handleUpdateBlockProp(selectedBlock, 'bold', !!e.checked)}
                        />
                        <label htmlFor="block_bold" className="font-semibold text-slate-400 cursor-pointer">Negrita</label>
                      </div>
                    </div>
                  </>
                ) : (
                  <>
                    <div>
                      <label className="block text-[9px] font-bold text-slate-500 uppercase mb-1">Ancho (mm)</label>
                      <InputNumber
                        value={layoutConfig[selectedBlock].width}
                        onValueChange={(e) => handleUpdateBlockProp(selectedBlock, 'width', e.value ?? 40)}
                        min={10}
                        max={widthMm}
                        className="w-full text-xs"
                        inputClassName="p-1.5 bg-slate-800 border-slate-700 text-white w-full rounded font-bold"
                      />
                    </div>
                    <div>
                      <label className="block text-[9px] font-bold text-slate-500 uppercase mb-1">Alto (mm)</label>
                      <InputNumber
                        value={layoutConfig[selectedBlock].height}
                        onValueChange={(e) => handleUpdateBlockProp(selectedBlock, 'height', e.value ?? 8)}
                        min={4}
                        max={heightMm}
                        className="w-full text-xs"
                        inputClassName="p-1.5 bg-slate-800 border-slate-700 text-white w-full rounded font-bold"
                      />
                    </div>
                  </>
                )}

                {/* Edit Text Content of custom free-text blocks */}
                {layoutConfig[selectedBlock].isCustomText && (
                  <div className="col-span-2 md:col-span-4 mt-1">
                    <label className="block text-[9px] font-bold text-slate-500 uppercase mb-1">
                      Contenido de Texto (Usa variables como {"{{precio_ves_iva}}"}, {"{{sku}}"}, etc.)
                    </label>
                    <InputText
                      value={layoutConfig[selectedBlock].textValue || ''}
                      onChange={(e) => handleUpdateBlockProp(selectedBlock, 'textValue', e.target.value)}
                      placeholder="Ej. Precio con IVA: {{precio_ves_iva}}"
                      className="w-full p-2 bg-slate-800 border-slate-700 text-white text-xs rounded font-medium"
                    />
                    <div className="text-[9px] text-slate-500 mt-1 font-semibold leading-tight">
                      Variables: <code className="text-indigo-400">{"{{precio_ves_iva}}"}</code>, <code className="text-indigo-400">{"{{precio_usd}}"}</code>, <code className="text-indigo-400">{"{{precio_ves}}"}</code>, <code className="text-indigo-400">{"{{sku}}"}</code>, <code className="text-indigo-400">{"{{modelo}}"}</code>, <code className="text-indigo-400">{"{{marca}}"}</code>
                    </div>
                  </div>
                )}

                {!layoutConfig[selectedBlock].isCustomText && selectedBlock !== 'barcode' && selectedBlock !== 'name' && (
                  <div className="col-span-2 md:col-span-4 mt-1">
                    <label className="block text-[9px] font-bold text-slate-500 uppercase mb-1">Prefijo / Etiqueta de texto</label>
                    <InputText
                      value={layoutConfig[selectedBlock].prefix || ''}
                      onChange={(e) => handleUpdateBlockProp(selectedBlock, 'prefix', e.target.value)}
                      placeholder="Ej: Precio con IVA: "
                      className="w-full p-2 bg-slate-800 border-slate-700 text-white text-xs rounded"
                    />
                  </div>
                )}
              </div>
            </div>
          ) : (
            <div className="mt-4 text-center text-xs text-slate-500 font-semibold select-none">
              Haz clic y arrastra cualquier elemento sobre el lienzo para moverlo. <br />
              Para el **código de barra**, arrastra el tirador azul de la esquina para hacerlo más grande, pequeño, ancho o angosto. <br />
              Haz clic en **Texto Libre** en la barra superior para agregar tus propias etiquetas de texto personalizadas.
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
