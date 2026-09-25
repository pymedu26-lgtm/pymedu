import { useState, useRef, ChangeEvent } from 'react';
import { Gasto } from '../context/ERPContext';

interface ModalSincronizacionSIIComprasProps {
  isOpen: boolean;
  onClose: () => void;
  onImport: (gastos: Partial<Gasto>[]) => void;
  gastosExistentes: Gasto[];
}

export default function ModalSincronizacionSIICompras({ isOpen, onClose, onImport, gastosExistentes }: ModalSincronizacionSIIComprasProps) {
  const [activeMode, setActiveMode] = useState<'manual' | 'auto'>('manual');
  const [file, setFile] = useState<File | null>(null);
  const [preview, setPreview] = useState<any[]>([]);
  const [loading, setLoading] = useState(false);
  const [syncStatus, setSyncStatus] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const handleAutoSync = async () => {
    setLoading(true);
    setSyncStatus('Iniciando conexión segura con el SII...');
    
    // Simulating the automated sync process for PURCHASES
    await new Promise(r => setTimeout(r, 1500));
    setSyncStatus('Autenticando con Clave Tributaria...');
    await new Promise(r => setTimeout(r, 1500));
    setSyncStatus('Descargando Registro de Compras (RCV)...');
    await new Promise(r => setTimeout(r, 2000));
    
    // Simulated purchase data from SII
    const mockData = [
      { folio: '5540', fecha: '2026-05-15', proveedor: 'DISTRIBUIDORA MAYORISTA LTDA', monto: 450900, tipo: '33', rut: '76.123.456-7' },
      { folio: '9921', fecha: '2026-05-17', proveedor: 'TELECOMUNICACIONES CHILE', monto: 45000, tipo: '33', rut: '96.888.777-1' },
      { folio: '102', fecha: '2026-05-18', proveedor: 'ESTACIONAMIENTOS SPA', monto: 5500, tipo: '39', rut: '77.555.444-K' },
    ];

    const parsedData = mockData.map(d => {
      const existe = gastosExistentes.some(g => g.notas?.includes(`Folio SII: ${d.folio}`) && g.proveedor.includes(d.proveedor));
      return {
        id: `SII-C-${d.folio}`,
        fecha: d.fecha,
        proveedor: d.proveedor,
        rut: d.rut,
        monto: d.monto,
        neto: Math.round(d.monto / 1.19),
        iva: d.monto - Math.round(d.monto / 1.19),
        tipo_doc: d.tipo,
        folio: d.folio,
        existe
      };
    });

    setPreview(parsedData);
    setLoading(false);
    setSyncStatus(null);
  };

  const handleFileChange = (e: ChangeEvent<HTMLInputElement>) => {
    const selectedFile = e.target.files?.[0];
    if (selectedFile) {
      setFile(selectedFile);
      parseFile(selectedFile);
    }
  };

  const parseFile = (file: File) => {
    setLoading(true);
    const reader = new FileReader();
    reader.onload = (e) => {
      const text = e.target?.result as string;
      const lines = text.split(/\r?\n/);
      if (lines.length < 2) {
        setLoading(false);
        return;
      }

      const headers = lines[0].split(';');
      const rows = lines.slice(1).filter(line => line.trim() !== '');

      const parsedData = rows.map(row => {
        const values = row.split(';');
        const data: any = {};
        headers.forEach((header, i) => {
          data[header.trim()] = values[i]?.trim();
        });

        const folio = data['Folio'] || data['Nro. Docto'];
        const tipo = data['Tipo Doc'] || data['Tipo Docto'];
        const fecha = data['Fecha Docto'] || data['Fecha'];
        const rut = data['RUT Emisor'];
        const razonSocial = data['Razón Social Emisor'] || data['Proveedor'];
        const total = parseInt(data['Monto Total'] || '0');

        const existe = gastosExistentes.some(g => g.notas?.includes(`Folio SII: ${folio}`) && g.proveedor.includes(razonSocial));

        return {
          id: `SII-C-${folio}`,
          fecha: fecha?.split('/').reverse().join('-'),
          proveedor: razonSocial || rut || 'Proveedor SII',
          monto: total,
          neto: Math.round(total / 1.19),
          iva: total - Math.round(total / 1.19),
          tipo_doc: tipo,
          folio,
          existe
        };
      });

      setPreview(parsedData);
      setLoading(false);
    };
    reader.readAsText(file, 'ISO-8859-1');
  };

  const handleConfirm = () => {
    const toImport = preview
      .filter(p => !p.existe)
      .map(p => ({
        fecha: p.fecha,
        proveedor: p.proveedor,
        monto: p.monto,
        subtotal: p.neto,
        iva: p.iva,
        categoria: 'Insumos/Mercadería',
        estado: 'Pagado' as const,
        esFactura: p.tipo_doc === '33' || p.tipo_doc === '34',
        metodo_pago: 'transferencia' as const,
        notas: `Importado desde SII RCV Compras. Folio SII: ${p.folio}`,
      }));
    
    onImport(toImport);
    onClose();
    setFile(null);
    setPreview([]);
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 bg-slate-900/50 backdrop-blur-sm z-[60] flex items-center justify-center p-4">
      <div className="bg-white rounded-3xl w-full max-w-4xl shadow-2xl overflow-hidden flex flex-col max-h-[85vh]">
        <div className="px-6 py-4 border-b border-slate-100 flex justify-between items-center bg-slate-50">
          <div>
            <h3 className="text-xl font-bold text-red-600">Sincronización de Compras (SII)</h3>
            <p className="text-xs text-slate-500 mt-1">Registra tus gastos trayendo las facturas de proveedores desde el SII.</p>
          </div>
          <button onClick={onClose} className="text-slate-400 hover:text-red-500 transition-colors">
            <span className="material-symbols-outlined">close</span>
          </button>
        </div>

        <div className="flex bg-slate-100 p-1 m-6 mb-0 rounded-2xl w-fit shrink-0">
          <button 
            onClick={() => { setActiveMode('manual'); setPreview([]); }}
            className={`px-6 py-2 rounded-xl text-xs font-black transition-all flex items-center gap-2 ${activeMode === 'manual' ? 'bg-white text-red-600 shadow-sm' : 'text-slate-500 hover:text-slate-700'}`}
          >
            <span className="material-symbols-outlined text-sm">upload_file</span>
            CARGA MANUAL (CSV)
          </button>
          <button 
            onClick={() => { setActiveMode('auto'); setPreview([]); }}
            className={`px-6 py-2 rounded-xl text-xs font-black transition-all flex items-center gap-2 ${activeMode === 'auto' ? 'bg-white text-red-600 shadow-sm' : 'text-slate-500 hover:text-slate-700'}`}
          >
            <span className="material-symbols-outlined text-sm">robot_2</span>
            AUTOMÁTICO (BETA)
          </button>
        </div>

        <div className="p-6 overflow-y-auto flex-grow space-y-6">
          {activeMode === 'auto' && preview.length === 0 && (
            <div className="text-center py-12 space-y-6">
              <div className="bg-red-50 w-24 h-24 rounded-full flex items-center justify-center mx-auto border-4 border-red-100">
                <span className={`material-symbols-outlined text-5xl text-red-500 ${loading ? 'animate-spin' : ''}`}>
                  {loading ? 'sync' : 'shopping_cart'}
                </span>
              </div>
              
              <div className="max-w-md mx-auto">
                <h4 className="text-lg font-bold text-slate-800">Sincronización de Facturas</h4>
                <p className="text-sm text-slate-500 mt-2">
                  {loading 
                    ? syncStatus 
                    : 'Descargaremos automáticamente tus facturas de compra del mes actual desde el portal SII.'}
                </p>
              </div>

              {!loading && (
                <button 
                  onClick={handleAutoSync}
                  className="px-8 py-3 bg-red-600 text-white rounded-full font-bold shadow-lg shadow-red-600/20 hover:scale-105 transition-transform flex items-center gap-2 mx-auto"
                >
                  <span className="material-symbols-outlined">bolt</span>
                  Sincronizar Compras SII
                </button>
              )}
            </div>
          )}

          {activeMode === 'manual' && !file && preview.length === 0 && (
            <div 
              onClick={() => fileInputRef.current?.click()}
              className="border-2 border-dashed border-slate-200 rounded-3xl p-12 text-center hover:bg-red-50 hover:border-red-200 transition-all cursor-pointer group"
            >
              <span className="material-symbols-outlined text-5xl text-slate-300 group-hover:text-red-500 transition-colors">upload_file</span>
              <p className="mt-4 text-slate-600 font-medium">Sube el CSV de Compras del SII</p>
              <p className="text-xs text-slate-400 mt-2">RCV Compras -&gt; Descargar Detalle</p>
              <input 
                type="file" 
                ref={fileInputRef}
                onChange={handleFileChange}
                accept=".csv"
                className="hidden" 
              />
            </div>
          )}

          {preview.length > 0 && (
            <div className="space-y-4">
              <div className="flex justify-between items-center bg-slate-50 p-4 rounded-2xl border border-slate-200">
                <div className="flex items-center gap-3">
                  <span className="material-symbols-outlined text-red-500">
                    {activeMode === 'auto' ? 'robot_2' : 'description'}
                  </span>
                  <div>
                    <p className="text-sm font-bold text-slate-800">
                      {activeMode === 'auto' ? 'Facturas obtenidas' : file?.name}
                    </p>
                    <p className="text-xs text-slate-500">{preview.length} compras encontradas</p>
                  </div>
                </div>
                <button 
                  onClick={() => { setFile(null); setPreview([]); }} 
                  className="text-xs font-bold text-red-600 hover:underline"
                >
                  {activeMode === 'auto' ? 'Reiniciar' : 'Cambiar archivo'}
                </button>
              </div>

              <div className="border border-slate-100 rounded-2xl overflow-hidden shadow-sm">
                <table className="w-full text-sm text-left">
                  <thead className="bg-slate-50 text-slate-500 font-bold text-[10px] uppercase tracking-wider">
                    <tr>
                      <th className="px-4 py-3">Folio</th>
                      <th className="px-4 py-3">Fecha</th>
                      <th className="px-4 py-3">Proveedor</th>
                      <th className="px-4 py-3 text-right">Total</th>
                      <th className="px-4 py-3 text-center">Estado</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {preview.map((row, i) => (
                      <tr key={i} className={`hover:bg-slate-50/50 transition-colors ${row.existe ? 'bg-slate-50/30' : ''}`}>
                        <td className="px-4 py-3 font-bold text-red-600">{row.folio}</td>
                        <td className="px-4 py-3 text-slate-600">{row.fecha}</td>
                        <td className="px-4 py-3 truncate max-w-[200px] font-medium" title={row.proveedor}>{row.proveedor}</td>
                        <td className="px-4 py-3 text-right font-black text-slate-800">${row.monto.toLocaleString('es-CL')}</td>
                        <td className="px-4 py-3 text-center">
                          {row.existe ? (
                            <span className="inline-flex items-center gap-1 text-[9px] bg-slate-100 text-slate-500 px-2 py-0.5 rounded-full font-black uppercase">
                              <span className="material-symbols-outlined text-[10px]">check_circle</span> Registrado
                            </span>
                          ) : (
                            <span className="inline-flex items-center gap-1 text-[9px] bg-emerald-100 text-emerald-700 px-2 py-0.5 rounded-full font-black uppercase">
                              <span className="material-symbols-outlined text-[10px]">add_circle</span> Nuevo
                            </span>
                          )}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}
        </div>

        <div className="px-6 py-4 border-t border-slate-100 flex justify-end gap-3 bg-slate-50">
          <button onClick={onClose} className="px-6 py-2 rounded-full font-bold text-slate-600 hover:bg-slate-200 transition-colors">
            Cancelar
          </button>
          <button 
            onClick={handleConfirm}
            disabled={!preview.some(p => !p.existe)}
            className="px-6 py-2 bg-red-600 text-white rounded-full font-bold shadow-lg shadow-red-600/20 hover:scale-105 transition-transform disabled:opacity-50 disabled:hover:scale-100 disabled:cursor-not-allowed flex items-center gap-2"
          >
            <span className="material-symbols-outlined text-sm">sync</span>
            Importar {preview.filter(p => !p.existe).length} Compras
          </button>
        </div>
      </div>
    </div>
  );
}
