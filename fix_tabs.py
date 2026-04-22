import re

file_path = "/home/lzambrano/Desarrollo/Morpheus/neo-erp-web/apps/neo-inventory/src/app/inventory/products/new/page.tsx"
with open(file_path, "r") as f:
    text = f.read()

# 1. Update activeTab checks
text = text.replace("activeTab === 0", "activeTab === _tabs.findIndex(t => t.label === 'Información General')")
text = text.replace("activeTab === 1", "activeTab === _tabs.findIndex(t => t.label === 'Rentabilidad y Costos')")
text = text.replace("activeTab === 2", "activeTab === _tabs.findIndex(t => t.label === 'Empaques Logísticos')")
text = text.replace("activeTab === 3", "activeTab === _tabs.findIndex(t => t.label === 'Códigos Multi-Unidad')")
text = text.replace("activeTab === 4", "activeTab === _tabs.findIndex(t => t.label === 'Matriz de Variantes')")

# 2. Add Multimedia tab to _tabs
tabs_text = """  const _tabs = [
    { label: 'Información General', icon: 'pi pi-info-circle', requiresId: false },
    { label: 'Rentabilidad y Costos', icon: 'pi pi-dollar', requiresId: false },
    { label: 'Multimedia & Fichas', icon: 'pi pi-image', requiresId: false },
    { label: 'Empaques Logísticos', icon: 'pi pi-box', requiresId: true },
    { label: 'Códigos Multi-Unidad', icon: 'pi pi-barcode', requiresId: true }
  ];"""
text = re.sub(r'const _tabs = \[\s*\{ label: \'Información General\'.*?\n\s*\];', tabs_text, text, flags=re.DOTALL)

# 3. Add the upload helper
upload_helper = """
  const handleUpload = async (e: any, fieldName: string) => {
      const file = e.target.files[0];
      if (!file) return;
      const formData = new FormData();
      formData.append('file', file);
      
      try {
          const response = await fetch('http://localhost:8000/api/v1/utils/upload/', {
              method: 'POST',
              body: formData,
          });
          const data = await response.json();
          setValue(fieldName, data.url);
      } catch(err) {
          alert('Error uploading file');
      }
  };
"""

text = text.replace("const generateCartesian = () => {", upload_helper + "\n  const generateCartesian = () => {")

# 4. Remove the inputs from General tab and Move Origin to Mermas
general_inputs = """              <div className="grid grid-cols-1 md:grid-cols-2 gap-6 mb-6">
                 <div className="flex flex-col">
                  <label className={labelClass}>UOM (Unidad Logística Base) *</label>
                  <Controller name="uom_base" control={control} render={({ field }) => (
                    <Dropdown 
                      value={field.value} 
                      onChange={(e) => field.onChange(e.value)} 
                      options={[{label: 'PZA (Pieza)', value: 'PZA'}, {label: 'PAR (Pares)', value: 'PAR'}, {label: 'KG (Kilogramo)', value: 'KG'}]}
                      optionLabel="label" 
                      optionValue="value" 
                      className="w-full !rounded-xl !border-slate-200 !bg-slate-50 hover:!bg-white focus:!bg-white shadow-none"
                      pt={{ input: { className: '!py-3 !px-4 text-slate-800 font-medium' }, trigger: { className: 'text-slate-400' } }}
                    />
                  )} />
                 </div>
                 <div className="flex flex-col">
                  <label className={labelClass}>Mermas y Pérdidas Estimadas (%)</label>
                  <Controller name="shrinkage_percent" control={control} render={({ field }) => (
                    <InputNumber value={field.value} onValueChange={(e) => field.onChange(e.value)} suffix=" %" inputClassName={inputClass} pt={{ root: { className: 'w-full' } }} />
                  )} />
                 </div>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-3 gap-6 mb-6">
                 <div className="flex flex-col">
                  <label className={labelClass}>Procedencia *</label>
                  <Controller name="origin" control={control} render={({ field }) => (
                    <Dropdown 
                      value={field.value} 
                      onChange={(e) => field.onChange(e.value)} 
                      options={[{label: 'Nacional', value: 'NACIONAL'}, {label: 'Importado', value: 'IMPORTADO'}]}
                      optionLabel="label" 
                      optionValue="value" 
                      className="w-full !rounded-xl !border-slate-200 !bg-slate-50 hover:!bg-white focus:!bg-white shadow-none"
                      pt={{ input: { className: '!py-3 !px-4 text-slate-800 font-medium' }, trigger: { className: 'text-slate-400' } }}
                    />
                  )} />
                 </div>
                 <div className="flex flex-col">
                  <label className={labelClass}>URL Imagen del Producto</label>
                  <Controller name="image_main" control={control} render={({ field }) => (
                    <InputText autoComplete="off" {...field} value={field.value || ''} className={inputClass} placeholder="Ej. https://.../img.jpg" />
                  )} />
                 </div>
                 <div className="flex flex-col">
                  <label className={labelClass}>URL de Ficha Técnica</label>
                  <Controller name="datasheet" control={control} render={({ field }) => (
                    <InputText autoComplete="off" {...field} value={field.value || ''} className={inputClass} placeholder="Ej. https://.../doc.pdf" />
                  )} />
                 </div>
              </div>"""

new_general_inputs = """              <div className="grid grid-cols-1 md:grid-cols-3 gap-6 mb-6">
                 <div className="flex flex-col">
                  <label className={labelClass}>UOM (Unidad Logística Base) *</label>
                  <Controller name="uom_base" control={control} render={({ field }) => (
                    <Dropdown 
                      value={field.value} 
                      onChange={(e) => field.onChange(e.value)} 
                      options={[{label: 'PZA (Pieza)', value: 'PZA'}, {label: 'PAR (Pares)', value: 'PAR'}, {label: 'KG (Kilogramo)', value: 'KG'}]}
                      optionLabel="label" 
                      optionValue="value" 
                      className="w-full !rounded-xl !border-slate-200 !bg-slate-50 hover:!bg-white focus:!bg-white shadow-none"
                      pt={{ input: { className: '!py-3 !px-4 text-slate-800 font-medium' }, trigger: { className: 'text-slate-400' } }}
                    />
                  )} />
                 </div>
                 <div className="flex flex-col">
                  <label className={labelClass}>Mermas y Pérdidas Estimadas (%)</label>
                  <Controller name="shrinkage_percent" control={control} render={({ field }) => (
                    <InputNumber value={field.value} onValueChange={(e) => field.onChange(e.value)} suffix=" %" inputClassName={inputClass} pt={{ root: { className: 'w-full' } }} />
                  )} />
                 </div>
                 <div className="flex flex-col">
                  <label className={labelClass}>Procedencia *</label>
                  <Controller name="origin" control={control} render={({ field }) => (
                    <Dropdown 
                      value={field.value} 
                      onChange={(e) => field.onChange(e.value)} 
                      options={[{label: 'Nacional', value: 'NACIONAL'}, {label: 'Importado', value: 'IMPORTADO'}]}
                      optionLabel="label" 
                      optionValue="value" 
                      className="w-full !rounded-xl !border-slate-200 !bg-slate-50 hover:!bg-white focus:!bg-white shadow-none"
                      pt={{ input: { className: '!py-3 !px-4 text-slate-800 font-medium' }, trigger: { className: 'text-slate-400' } }}
                    />
                  )} />
                 </div>
              </div>"""

text = text.replace(general_inputs, new_general_inputs)

multimedia_tab = """
            {/* TAB MULTIMEDIA */}
            <div className={activeTab === _tabs.findIndex(t => t.label === 'Multimedia & Fichas') ? 'block' : 'hidden animate-fade-in'}>
               <div className="bg-slate-50 border border-slate-200 p-8 rounded-3xl grid grid-cols-1 md:grid-cols-2 gap-8">
                  {/* IMAGEN */}
                  <Controller name="image_main" control={control} render={({ field }) => (
                      <div className="flex flex-col items-center justify-center p-6 bg-white rounded-2xl border border-dashed border-slate-300 shadow-sm relative overflow-hidden">
                         <h3 className="text-sm font-bold text-slate-800 uppercase tracking-widest mb-4">Fotografía / Render Principal</h3>
                         
                         {field.value ? (
                             <div className="relative group rounded-xl overflow-hidden shadow-md">
                                 <img src={`http://localhost:8000${field.value}`} alt="Product" className="w-48 h-48 object-cover" />
                                 <div className="absolute inset-0 bg-black/50 opacity-0 group-hover:opacity-100 flex items-center justify-center transition-all">
                                    <label className="cursor-pointer bg-white text-slate-800 py-2 px-4 rounded-full font-bold text-xs shadow-xl">
                                       <i className="pi pi-upload mr-2"></i> Cambiar
                                       <input type="file" className="hidden" accept="image/*" onChange={(e) => handleUpload(e, 'image_main')} />
                                    </label>
                                 </div>
                             </div>
                         ) : (
                             <label className="cursor-pointer flex flex-col items-center justify-center w-48 h-48 bg-slate-50 border border-slate-200 rounded-xl hover:bg-indigo-50 hover:border-indigo-200 transition-all">
                                 <i className="pi pi-image text-3xl text-slate-400 mb-2"></i>
                                 <span className="text-slate-500 font-medium text-xs">Cargar Imagen</span>
                                 <input type="file" className="hidden" accept="image/*" onChange={(e) => handleUpload(e, 'image_main')} />
                             </label>
                         )}
                         <p className="text-[10px] text-center text-slate-400 mt-4 leading-relaxed">Formato JPG, PNG, WEBP. <br/> Max 2MB, dimensión mínima recomendada 500x500.</p>
                      </div>
                  )} />

                  {/* FICHA TECNICA */}
                  <Controller name="datasheet" control={control} render={({ field }) => (
                      <div className="flex flex-col justify-center p-6 bg-white rounded-2xl border border-dashed border-slate-300 shadow-sm relative">
                         <h3 className="text-sm font-bold text-slate-800 uppercase tracking-widest mb-4 flex items-center gap-2">
                             <i className="pi pi-file-pdf text-red-500"></i> Ficha Técnica / Manual
                         </h3>
                         
                         {field.value ? (
                             <div className="bg-slate-50 p-4 border border-slate-200 rounded-xl flex items-center justify-between">
                                 <div className="flex items-center gap-3">
                                    <div className="w-10 h-10 bg-red-100 text-red-600 rounded-full flex items-center justify-center text-xl shrink-0"><i className="pi pi-file-pdf"></i></div>
                                    <div className="truncate text-xs font-bold text-slate-700">Documento Adjunto</div>
                                 </div>
                                 <div className="flex items-center gap-2">
                                     <a href={`http://localhost:8000${field.value}`} target="_blank" rel="noreferrer" className="text-blue-500 hover:text-blue-700 text-sm font-bold"><i className="pi pi-external-link"></i></a>
                                     <label className="cursor-pointer text-slate-500 hover:text-slate-700 font-bold ml-2">
                                         <i className="pi pi-sync"></i>
                                         <input type="file" className="hidden" accept="application/pdf" onChange={(e) => handleUpload(e, 'datasheet')} />
                                     </label>
                                 </div>
                             </div>
                         ) : (
                             <label className="cursor-pointer flex items-center justify-center py-6 px-4 bg-slate-50 border border-slate-200 rounded-xl hover:bg-red-50 hover:border-red-200 transition-all font-bold text-slate-500 text-sm w-full">
                                 <i className="pi pi-upload mr-3 text-lg"></i>
                                 Subir Archivo PDF
                                 <input type="file" className="hidden" accept="application/pdf" onChange={(e) => handleUpload(e, 'datasheet')} />
                             </label>
                         )}
                         <p className="text-[10px] text-slate-400 mt-4 leading-relaxed mt-auto">Recomendado PDF. Peso máximo 5MB. Este archivo será vital para los procesos de compras y MRP.</p>
                      </div>
                  )} />
               </div>
            </div>
"""

text = text.replace("{/* TAB 3: EMPAQUES LOGISTICOS (REQUIRES ID) */}", multimedia_tab + "\n            {/* TAB 3: EMPAQUES LOGISTICOS (REQUIRES ID) */}")

with open(file_path, "w") as f:
    f.write(text)

