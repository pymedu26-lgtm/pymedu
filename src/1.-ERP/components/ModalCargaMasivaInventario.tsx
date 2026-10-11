  const onDrop = (e: DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    e.stopPropagation();
    dragContador.current = 0;
    setArrastrando(false);
    const f = e.dataTransfer.files[0];
    if (f) procesar(f);
  };

  const onDragEnter = (e: DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    e.stopPropagation();
    dragContador.current++;
    setArrastrando(true);
  };

  const onDragLeave = (e: DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    e.stopPropagation();
    dragContador.current--;
    if (dragContador.current <= 0) {
      dragContador.current = 0;
      setArrastrando(false);
    }
  };

  const onFileChange = (e: ChangeEvent<HTMLInputElement>) => {
    const f = e.target.files?.[0];
    if (f) procesar(f);
    if (inputRef.current) inputRef.current.value = '';
  };

  const limpiar = () => {
    setArchivo(null);
    setPrevias([]);
    setSeleccionadas(new Set());
    setError(null);
    setCargando(false);
  };

  const toggleSeleccion = (clave: string) => {
    setSeleccionadas(prev => {
      const s = new Set(prev);
      if (s.has(clave)) s.delete(clave);
      else s.add(clave);
      return s;
    });
  };

  const seleccionarTodo = () => {
    setSeleccionadas(new Set(previas.filter(p => !p.existe && p.errores.length === 0).map(p => p.clave)));
  };

  const limpiarSeleccion = () => setSeleccionadas(new Set());

  const importarSeleccionadas = () => {
    const aImportar = previas
      .filter(p => seleccionadas.has(p.clave))
      .map(p => p.producto);
    if (aImportar.length === 0) return;
    onImport(aImportar);
    limpiar();
    onClose();
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 bg-surface/80 backdrop-blur-sm flex items-center justify-center z-50 p-4">
      <div className="bg-surface-container-lowest rounded-2xl shadow-2xl w-full max-w-6xl max-h-[90vh] overflow-hidden flex flex-col border border-outline-variant/40">
        <div className="p-6 border-b border-outline-variant/30 flex justify-between items-center">
          <div>
            <h3 className="text-2xl font-black text-primary">Carga Masiva de Inventario</h3>
            <p className="text-on-surface-variant text-sm mt-1">Importa productos y servicios desde Excel o CSV en un solo paso.</p>
          </div>
          <button onClick={() => { limpiar(); onClose(); }} className="text-on-surface-variant hover:text-error transition-colors">
            <span className="material-symbols-outlined text-3xl">close</span>
          </button>
        </div>

        <div className="flex-1 overflow-y-auto p-6 space-y-6">
          {!archivo && (
            <div
              onDrop={onDrop}
              onDragEnter={onDragEnter}
              onDragOver={(e) => { e.preventDefault(); e.stopPropagation(); }}
              onDragLeave={onDragLeave}
              className={`border-2 border-dashed rounded-2xl p-10 flex flex-col items-center justify-center text-center transition-all ${arrastrando ? 'border-primary bg-primary/5' : 'border-outline-variant/50 hover:border-primary/40'}`}
            >
              <span className="material-symbols-outlined text-6xl text-primary mb-4">cloud_upload</span>
              <h4 className="text-xl font-bold text-on-surface mb-2">Arrastra tu archivo aquí</h4>
              <p className="text-on-surface-variant mb-4">o</p>
              <button onClick={() => inputRef.current?.click()} className="px-6 py-3 bg-primary text-inverse-on-surface rounded-full font-bold shadow-lg shadow-primary/20 hover:scale-105 transition-transform">
                Seleccionar archivo
              </button>
              <input ref={inputRef} type="file" accept=".xlsx,.xls,.xlsm,.csv" onChange={onFileChange} className="hidden" />
              <p className="text-xs text-on-surface-variant mt-4">Formatos permitidos: .xlsx, .xls, .xlsm, .csv</p>
              <button onClick={descargarPlantilla} className="mt-6 flex items-center gap-2 px-5 py-2 bg-surface-container-lowest border border-outline-variant/40 rounded-full text-sm font-bold hover:bg-surface-container-low transition-all">
                <span className="material-symbols-outlined text-lg">download</span>
                Descargar Plantilla
              </button>
            </div>
          )}

          {archivo && (
            <div className="space-y-6">
              <div className="flex flex-wrap items-center justify-between gap-4 p-4 bg-surface-container-low rounded-xl border border-outline-variant/30">
                <div className="flex items-center gap-3">
                  <span className="material-symbols-outlined text-3xl text-primary">description</span>
                  <div>
                    <p className="font-bold text-on-surface">{archivo.name}</p>
                    <p className="text-xs text-on-surface-variant">{(archivo.size / 1024).toFixed(2)} KB</p>
                  </div>
                </div>
                <button onClick={limpiar} className="flex items-center gap-2 px-4 py-2 bg-surface-container-lowest border border-outline-variant/40 rounded-full text-sm font-bold hover:bg-error/10 hover:text-error transition-all">
                  <span className="material-symbols-outlined text-lg">close</span>
                  Cambiar archivo
                </button>
              </div>
