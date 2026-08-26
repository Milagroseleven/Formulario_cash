/**
 * Registro de movimientos de caja - Sanchoyjote S.L.
 *
 * Formulario web para que cada sede registre los movimientos de efectivo
 * (ingresos y salidas) desde el móvil o el ordenador. Cada envío deja una
 * fila en el Sheet y sube la imagen del justificante a Drive.
 *
 * Los conceptos y sus reglas viven en CONCEPTOS: es la única fuente de
 * verdad. El formulario la lee de aquí para dibujar los campos, y el
 * servidor la usa de nuevo para validar y para decidir en qué carpeta de
 * Drive y con qué nombre se guarda la imagen.
 */

// ---------------------------------------------------------------------
// CONFIGURACIÓN POR SEDE
//
// Cada jefe solo debe ver lo suyo, y en Drive y en Sheets los permisos se
// dan por carpeta y por archivo. Por eso cada sede tiene su propia carpeta
// y su propia hoja, que se comparten solo con quien corresponda.
//
//   carpetaId : ID de la carpeta de esa sede. Dentro se crean solas
//               "Ingreso Caja" y "Salida Caja" con sus subcarpetas.
//               Si se deja vacío, se busca (o se crea) una carpeta llamada
//               "Caja <Sede>" en la unidad de la cuenta que despliega.
//   hojaId    : ID del Google Sheet propio de esa sede. Si se deja vacío,
//               solo se escribe en la hoja maestra.
//
// El ID es el trozo largo de la URL:
//   carpeta -> drive.google.com/drive/folders/ESTO_ES_EL_ID
//   hoja    -> docs.google.com/spreadsheets/d/ESTO_ES_EL_ID/edit
//
// La hoja maestra es esta misma en la que vive el script, y contiene todos
// los movimientos de todas las sedes: se comparte solo con contabilidad y
// dirección.
// ---------------------------------------------------------------------
const SEDES_CONFIG = {
  'Barcelona': {
    carpetaId: '1iOV6tVk8k6AsTkP9hHnhogZcY6OtYHx8',
    hojaId: '1B6Qc9AWnndZ1ZvKG-nnJqthGbGtC01cdAYnN4HM7ndE',
  },
  'Madrid': {
    carpetaId: '1WBhvJ79EK9VVX59RnK0OAde1lCdCOXqY',
    hojaId: '1jIEODAEg_dqvdVR7PX2-ZyX3Zkhj-2rtEwPh26cgtcs',
  },
  'Sevilla': {
    carpetaId: '1GS9WudgqkOYklz4PN98Q6MsYrLmJzLWg',
    hojaId: '1hoHKdVb-XExvVg1weKQ899cmBhusqWXdxfsKViLLCYg',
  },
  'Valencia': {
    carpetaId: '120bJqksHlFMlof0X_TvrFd2UiFfIFQd7',
    hojaId: '1LzJkwlsRzv0xHotY0beeyQgLdn1K7PBWoMMir6ING68',
  },
};

// ---------------------------------------------------------------------
// SEDE HABITUAL DE CADA CUENTA
//
// Solo sirve para dos cosas: dejar la sede ya elegida al abrir el
// formulario, y avisar si se registra un movimiento en otra sede. NO
// restringe nada: cualquiera puede registrar en cualquier sede.
//
// Quien no esté en esta lista abre el formulario con la sede sin elegir y
// no ve ningún aviso.
// ---------------------------------------------------------------------
const USUARIOS = {
  'diego.seminario@motickfamily.com': 'Madrid',
  'carlos@motickfamily.com': 'Madrid',
  'gonzalo.peralta@motickfamily.com': 'Barcelona',
  'josemanuel@motickfamily.com': 'Sevilla',
  'motick.barcelona@motickfamily.com': 'Barcelona',
  'nacho.carrion@motickfamily.com': 'Valencia',
  'sergio.garcia@motickfamily.com': 'Madrid',
};

const SHEET_NAME = 'Registro';
const RESUMEN_NAME = 'Resumen';

// Posición de las columnas de "Registro" que usan el orden y el resumen.
const COL_TIPO = 5;            // E - Tipo de movimiento
const COL_CONCEPTO = 6;        // F - Concepto
const COL_IMPORTE_SIGNO = 13;  // M - Importe con signo
const COL_FECHA_MOV = 14;      // N - Fecha del movimiento

const EMPRESA = 'Sanchoyjote S.L.';
const NIF = 'B72770191';

const SEDES = Object.keys(SEDES_CONFIG);

const INGRESO = 'Ingreso de efectivo';
const SALIDA = 'Salida de efectivo';

const AYUDA_OPCIONAL = 'Opcional';
const AYUDA_AJUSTE = 'Especificar ajuste contable de caja';
const AYUDA_OTROS = 'Especificar "otros"';

// Opciones del campo 13 en una salida de efectivo.
const JUSTIFICANTE_FACTURA = 'Factura / ticket de gasto a nombre de ' + EMPRESA + ' - NIF ' + NIF;
const JUSTIFICANTE_OTROS = 'Proforma, albarán, imagen del cash, sin justificante, otros';
// Lo que se guarda en la columna cuando el movimiento es un ingreso.
const JUSTIFICANTE_INGRESO = 'Imagen de cash';

/**
 * Para cada concepto:
 *   matricula / detalle : 'obligatorio' | 'opcional' | null (no se muestra)
 *   detalleAyuda        : texto de ayuda debajo del campo Detalle
 *   extra               : 'sedeOrigen' | 'sedeDestino' | 'empleado' | null
 *   archivo             : base del nombre del archivo en Drive
 *   carpeta             : subcarpeta de destino (ingresos)
 *   carpetaSinFactura   : subcarpeta cuando la salida no lleva factura
 *                         (con factura siempre va a "Gastos con factura")
 *   sufijoFactura       : true si el nombre del archivo lleva siempre
 *                         "con factura" / "sin factura"
 */
const CONCEPTOS = {};

CONCEPTOS[INGRESO] = [
  {
    nombre: 'Reserva de moto', matricula: 'obligatorio', detalle: 'opcional',
    detalleAyuda: AYUDA_OPCIONAL, extra: null,
    carpeta: 'Reserva - Venta de moto', archivo: 'Cash reserva moto',
  },
  {
    nombre: 'Venta de moto', matricula: 'obligatorio', detalle: 'opcional',
    detalleAyuda: AYUDA_OPCIONAL, extra: null,
    carpeta: 'Reserva - Venta de moto', archivo: 'Cash venta moto',
  },
  {
    nombre: 'Mantenimiento', matricula: 'obligatorio', detalle: 'opcional',
    detalleAyuda: AYUDA_OPCIONAL, extra: null,
    carpeta: 'Mantenimiento', archivo: 'Cash mantenimiento moto',
  },
  {
    nombre: 'Ingreso de cash de otra sede', matricula: null, detalle: 'opcional',
    detalleAyuda: AYUDA_OPCIONAL, extra: 'sedeOrigen',
    carpeta: 'Otros', archivo: 'Cash ingreso de sede',
  },
  {
    nombre: 'Ajuste contable de caja', matricula: null, detalle: 'obligatorio',
    detalleAyuda: AYUDA_AJUSTE, extra: null,
    carpeta: 'Otros', archivo: 'Cash ajuste contable caja ingreso',
  },
  {
    nombre: 'Otros', matricula: 'opcional', detalle: 'obligatorio',
    detalleAyuda: AYUDA_OTROS, extra: null,
    carpeta: 'Otros', archivo: 'Cash otros ingresos',
  },
];

CONCEPTOS[SALIDA] = [
  {
    nombre: 'Gastos operativos / Servicios', matricula: null, detalle: 'obligatorio',
    detalleAyuda: '', extra: null, archivo: 'Cash Gasto operativo',
    carpetaSinFactura: 'Gastos sin factura', sufijoFactura: true,
  },
  {
    nombre: 'Compra de moto', matricula: 'obligatorio', detalle: 'opcional',
    detalleAyuda: AYUDA_OPCIONAL, extra: null, archivo: 'Cash compra moto',
    carpetaSinFactura: 'Gastos sin factura', sufijoFactura: true,
  },
  {
    nombre: 'Devolución a cliente - reserva', matricula: 'obligatorio', detalle: 'opcional',
    detalleAyuda: AYUDA_OPCIONAL, extra: null,
    archivo: 'Cash devolución de reserva cliente', carpetaSinFactura: 'Otros',
  },
  {
    nombre: 'Devolución a cliente - venta cancelada', matricula: 'obligatorio', detalle: 'opcional',
    detalleAyuda: AYUDA_OPCIONAL, extra: null,
    archivo: 'Cash devolución de venta cliente', carpetaSinFactura: 'Otros',
  },
  {
    nombre: 'Devolución a cliente - pago en exceso', matricula: 'obligatorio', detalle: 'opcional',
    detalleAyuda: AYUDA_OPCIONAL, extra: null,
    archivo: 'Cash devolución pago en exceso cliente', carpetaSinFactura: 'Otros',
  },
  {
    nombre: 'Envío de cash a otra sede', matricula: null, detalle: 'opcional',
    detalleAyuda: AYUDA_OPCIONAL, extra: 'sedeDestino',
    archivo: 'Cash envío a sede', carpetaSinFactura: 'Otros',
  },
  {
    nombre: 'Ajuste contable de caja', matricula: null, detalle: 'obligatorio',
    detalleAyuda: AYUDA_AJUSTE, extra: null,
    archivo: 'Cash ajuste contable caja salida', carpetaSinFactura: 'Otros',
  },
  {
    nombre: 'Pago al personal interno', matricula: null, detalle: 'opcional',
    detalleAyuda: AYUDA_OPCIONAL, extra: 'empleado',
    archivo: 'Cash pago a personal interno', carpetaSinFactura: 'Otros',
  },
  {
    nombre: 'Otros', matricula: 'opcional', detalle: 'obligatorio',
    detalleAyuda: AYUDA_OTROS, extra: null, archivo: 'Cash otras salidas',
    carpetaSinFactura: 'Otros', sufijoFactura: true,
  },
];

const CARPETA_CON_FACTURA = 'Gastos con factura';

const HEADERS = [
  'Fecha registro',
  'ID movimiento',
  'Sede',
  'Responsable',
  'Tipo de movimiento',
  'Concepto',
  'Matrícula',
  'Detalle',
  'Sede origen / destino',
  'Código de envío',
  'Nombre de empleado',
  'Importe (EUR)',
  'Importe con signo',
  'Fecha del movimiento',
  'Tipo de justificante',
  'Justificante (Drive)',
];

function doGet() {
  // Google solo entrega el correo de quien abre la página cuando está en el
  // mismo dominio que la cuenta que despliega. Si no se puede, se sigue
  // adelante sin sede sugerida.
  let correo = '';
  try {
    correo = (Session.getActiveUser().getEmail() || '').toLowerCase();
  } catch (err) {
    correo = '';
  }

  const t = HtmlService.createTemplateFromFile('Index');
  t.config = JSON.stringify({
    correo: correo,
    sedeHabitual: USUARIOS[correo] || '',
    empresa: EMPRESA,
    nif: NIF,
    sedes: SEDES,
    ingreso: INGRESO,
    salida: SALIDA,
    conceptos: CONCEPTOS,
    justificanteFactura: JUSTIFICANTE_FACTURA,
    justificanteOtros: JUSTIFICANTE_OTROS,
  });
  return t.evaluate()
    .setTitle('Registro de movimientos de caja')
    .addMetaTag('viewport', 'width=device-width, initial-scale=1, maximum-scale=1');
}

function getConcepto_(tipoMovimiento, nombre) {
  const lista = CONCEPTOS[tipoMovimiento];
  if (!lista) return null;
  for (let i = 0; i < lista.length; i++) {
    if (lista[i].nombre === nombre) return lista[i];
  }
  return null;
}

/**
 * Carpeta raíz de la sede. Si hay ID configurado se usa esa carpeta, esté
 * donde esté (incluida una unidad compartida). Si no, se busca por nombre
 * y, como último recurso, se crea.
 */
function getCarpetaSede_(sede) {
  const conf = SEDES_CONFIG[sede] || {};
  if (conf.carpetaId) {
    try {
      return DriveApp.getFolderById(conf.carpetaId);
    } catch (err) {
      throw new Error('No se pudo abrir la carpeta configurada para ' + sede +
        '. Revisa el carpetaId en SEDES_CONFIG.');
    }
  }
  const nombre = 'Caja ' + sede;
  const it = DriveApp.getFoldersByName(nombre);
  if (it.hasNext()) return it.next();
  return DriveApp.createFolder(nombre);
}

function getSubCarpeta_(parent, nombre) {
  const it = parent.getFoldersByName(nombre);
  if (it.hasNext()) return it.next();
  return parent.createFolder(nombre);
}

/** Devuelve la pestaña "Registro" del libro, creándola con cabeceras. */
function getHojaRegistro_(spreadsheet) {
  let sheet = spreadsheet.getSheetByName(SHEET_NAME);
  if (!sheet) {
    sheet = spreadsheet.insertSheet(SHEET_NAME);
  }
  if (sheet.getLastRow() === 0) {
    sheet.appendRow(HEADERS);
    sheet.setFrozenRows(1);
    sheet.autoResizeColumns(1, HEADERS.length);
  }
  return sheet;
}

/**
 * Pasa 'yyyy-MM-dd' (lo que envía el campo de fecha) a una fecha de verdad.
 * Guardarla como texto haría que el resumen no pudiera compararla con las
 * fechas de corte, y que el orden fuera alfabético en vez de cronológico.
 */
function aFecha_(texto) {
  const partes = String(texto).split('-');
  if (partes.length !== 3) return texto;
  return new Date(Number(partes[0]), Number(partes[1]) - 1, Number(partes[2]));
}

/** Deja las filas ordenadas de la fecha más antigua a la más reciente. */
function ordenarPorFecha_(sheet) {
  const ultima = sheet.getLastRow();
  if (ultima < 3) return;
  sheet.getRange(2, 1, ultima - 1, HEADERS.length)
    .sort({ column: COL_FECHA_MOV, ascending: true });
}

function sanitize_(s) {
  return String(s || '').replace(/[\\/:*?"<>|]/g, '-').trim();
}

function nuevoId_(fechaRegistro) {
  const dia = Utilities.formatDate(fechaRegistro, Session.getScriptTimeZone(), 'yyyyMMdd');
  const sufijo = Utilities.getUuid().replace(/[^A-Za-z0-9]/g, '').substring(0, 4).toUpperCase();
  return 'MOV-' + dia + '-' + sufijo;
}

/**
 * data: {sede, responsable, tipoMovimiento, concepto, matricula, detalle,
 *        sedeContraparte, codigoEnvio, empleado, importe, fecha,
 *        tipoJustificante, photoBase64, photoMimeType}
 */
function submitMovimiento(data) {
  data = data || {};

  if (SEDES.indexOf(data.sede) === -1) {
    throw new Error('Falta indicar la sede.');
  }
  if (!data.responsable) {
    throw new Error('Falta indicar el responsable.');
  }
  if (data.tipoMovimiento !== INGRESO && data.tipoMovimiento !== SALIDA) {
    throw new Error('Falta indicar el tipo de movimiento.');
  }

  const concepto = getConcepto_(data.tipoMovimiento, data.concepto);
  if (!concepto) {
    throw new Error('Falta indicar el concepto del movimiento.');
  }

  if (concepto.matricula === 'obligatorio' && !data.matricula) {
    throw new Error('La matrícula es obligatoria para "' + concepto.nombre + '".');
  }
  if (concepto.detalle === 'obligatorio' && !data.detalle) {
    throw new Error('El detalle es obligatorio para "' + concepto.nombre + '".');
  }
  if (concepto.extra === 'sedeOrigen' || concepto.extra === 'sedeDestino') {
    if (SEDES.indexOf(data.sedeContraparte) === -1) {
      throw new Error('Falta indicar la sede de origen o destino del cash.');
    }
    if (data.sedeContraparte === data.sede) {
      throw new Error('La sede de origen o destino tiene que ser distinta de la sede que registra.');
    }
  }
  if (concepto.extra === 'empleado' && !data.empleado) {
    throw new Error('Falta indicar el nombre del empleado.');
  }

  const importe = Number(data.importe);
  if (!importe || importe <= 0) {
    throw new Error('El importe tiene que ser mayor que cero.');
  }
  if (!data.fecha) {
    throw new Error('Falta la fecha del movimiento.');
  }

  const esIngreso = data.tipoMovimiento === INGRESO;

  if (esIngreso && !data.photoBase64) {
    throw new Error('La imagen del justificante es obligatoria para un ingreso de efectivo.');
  }

  // Tipo de justificante y subcarpeta de destino.
  let tipoJustificante;
  let subCarpeta;
  let conFactura = false;

  if (esIngreso) {
    tipoJustificante = JUSTIFICANTE_INGRESO;
    subCarpeta = concepto.carpeta;
  } else {
    tipoJustificante = data.tipoJustificante;
    if (tipoJustificante !== JUSTIFICANTE_FACTURA && tipoJustificante !== JUSTIFICANTE_OTROS) {
      throw new Error('Falta indicar qué tipo de justificante se adjunta.');
    }
    conFactura = tipoJustificante === JUSTIFICANTE_FACTURA;
    if (conFactura && !data.photoBase64) {
      throw new Error('Para marcar "factura / ticket" hay que adjuntar la imagen.');
    }
    subCarpeta = conFactura ? CARPETA_CON_FACTURA : concepto.carpetaSinFactura;
  }

  const ahora = new Date();
  const id = nuevoId_(ahora);

  let fileUrl = '';
  if (data.photoBase64) {
    // Ruta: <carpeta de la sede> / Ingreso Caja | Salida Caja / <subcarpeta>
    const raiz = getCarpetaSede_(data.sede);
    const nivel = getSubCarpeta_(raiz, esIngreso ? 'Ingreso Caja' : 'Salida Caja');
    const carpeta = getSubCarpeta_(nivel, subCarpeta);

    const partes = [];
    if (data.matricula) partes.push(data.matricula);
    partes.push(concepto.archivo);
    if (concepto.extra === 'sedeOrigen' || concepto.extra === 'sedeDestino') {
      partes.push(data.sedeContraparte);
    }
    if (concepto.extra === 'empleado') partes.push(data.empleado);
    // El sufijo va siempre en los conceptos que lo llevan en el esquema; en
    // el resto, solo cuando hay factura, para que no quede un archivo en
    // "Gastos con factura" sin que el nombre lo diga.
    if (concepto.sufijoFactura) partes.push(conFactura ? 'con factura' : 'sin factura');
    else if (conFactura) partes.push('con factura');
    partes.push(Utilities.formatDate(ahora, Session.getScriptTimeZone(), 'yyyy-MM-dd HH.mm'));

    const nombreArchivo = sanitize_(partes.join(' - ')) + '.jpg';
    const decoded = Utilities.base64Decode(data.photoBase64);
    const blob = Utilities.newBlob(decoded, data.photoMimeType || 'image/jpeg', nombreArchivo);
    fileUrl = carpeta.createFile(blob).getUrl();
  }

  const fila = [
    ahora,
    id,
    data.sede,
    data.responsable,
    data.tipoMovimiento,
    concepto.nombre,
    data.matricula || '',
    data.detalle || '',
    data.sedeContraparte || '',
    data.codigoEnvio || '',
    data.empleado || '',
    importe,
    esIngreso ? importe : -importe,
    aFecha_(data.fecha),
    tipoJustificante,
    fileUrl,
  ];

  // Hoja propia de la sede (la que ve su jefe), si está configurada.
  const hojaId = (SEDES_CONFIG[data.sede] || {}).hojaId;
  if (hojaId) {
    let libroSede;
    try {
      libroSede = SpreadsheetApp.openById(hojaId);
    } catch (err) {
      throw new Error('No se pudo abrir la hoja configurada para ' + data.sede +
        '. Revisa el hojaId en SEDES_CONFIG.');
    }
    const hojaSede = getHojaRegistro_(libroSede);
    hojaSede.appendRow(fila);
    ordenarPorFecha_(hojaSede);
    asegurarResumen_(libroSede);
  }

  // Hoja maestra: la que contiene todas las sedes.
  const maestra = SpreadsheetApp.getActiveSpreadsheet();
  const hojaMaestra = getHojaRegistro_(maestra);
  hojaMaestra.appendRow(fila);
  ordenarPorFecha_(hojaMaestra);
  asegurarResumen_(maestra);

  return {
    id: id,
    fileUrl: fileUrl,
    esEnvioEntreSedes: concepto.extra === 'sedeDestino',
    sedeContraparte: data.sedeContraparte || '',
  };
}


// ---------------------------------------------------------------------
// PESTAÑA "RESUMEN"
//
// Un resumen por conceptos con dos fechas de corte. Está hecho con
// fórmulas, no con valores: se actualiza solo según entran movimientos, y
// basta con cambiar las fechas de arriba para ver otro periodo.
//
// Para crearlo (o rehacerlo) en la hoja maestra y en las cuatro hojas de
// sede, ejecuta crearResumenes() desde el editor.
// ---------------------------------------------------------------------

/** Número de columna -> letra (1 -> A, 13 -> M). */
function colLetra_(n) {
  let letra = '';
  while (n > 0) {
    const resto = (n - 1) % 26;
    letra = String.fromCharCode(65 + resto) + letra;
    n = Math.floor((n - 1) / 26);
  }
  return letra;
}

/**
 * Convierte a fecha de verdad las que quedaron guardadas como texto por
 * versiones anteriores del formulario. Sin esto, esas filas no entrarían en
 * el resumen ni se ordenarían bien.
 */
function normalizarFechas_(sheet) {
  const ultima = sheet.getLastRow();
  if (ultima < 2) return;
  const rango = sheet.getRange(2, COL_FECHA_MOV, ultima - 1, 1);
  const valores = rango.getValues();
  let cambios = false;
  for (let i = 0; i < valores.length; i++) {
    const v = valores[i][0];
    if (typeof v === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(v)) {
      valores[i][0] = aFecha_(v);
      cambios = true;
    }
  }
  if (cambios) rango.setValues(valores);
  rango.setNumberFormat('dd/mm/yyyy');
}

function construirResumen_(ss) {
  getHojaRegistro_(ss); // asegura que exista la pestaña Registro

  let sheet = ss.getSheetByName(RESUMEN_NAME);
  if (!sheet) sheet = ss.insertSheet(RESUMEN_NAME);

  // Se conservan las fechas de corte que hubiera puestas.
  const desdeAntes = sheet.getRange('C1').getValue();
  const hastaAntes = sheet.getRange('C2').getValue();

  sheet.getRange(1, 1, sheet.getMaxRows(), sheet.getMaxColumns()).breakApart();
  sheet.clear();

  const reg = "'" + SHEET_NAME + "'";
  const colImporte = colLetra_(COL_IMPORTE_SIGNO);
  const colTipo = colLetra_(COL_TIPO);
  const colConcepto = colLetra_(COL_CONCEPTO);
  const colFecha = colLetra_(COL_FECHA_MOV);
  // Sin fecha de corte no se filtra por ese extremo.
  const desde = 'IF($C$1="",DATE(1900,1,1),$C$1)';
  const hasta = 'IF($C$2="",DATE(2200,1,1),$C$2)';

  function formulaConcepto(tipo, fila) {
    return '=SUMIFS(' + reg + '!$' + colImporte + ':$' + colImporte +
      ',' + reg + '!$' + colTipo + ':$' + colTipo + ',"' + tipo + '"' +
      ',' + reg + '!$' + colConcepto + ':$' + colConcepto + ',$B' + fila +
      ',' + reg + '!$' + colFecha + ':$' + colFecha + ',">="&' + desde +
      ',' + reg + '!$' + colFecha + ':$' + colFecha + ',"<="&' + hasta + ')';
  }

  const AZUL = '#dce6f1';
  const AMARILLO = '#ffffcc';

  // Fechas de corte.
  sheet.getRange('B1').setValue('FECHA DE INICIO');
  sheet.getRange('B2').setValue('FECHA DE FIN');
  sheet.getRange('B1:B2').setFontWeight('bold').setHorizontalAlignment('right');
  const corte = sheet.getRange('C1:C2');
  corte.setBackground(AMARILLO).setNumberFormat('dd/mm/yyyy')
    .setBorder(true, true, true, true, false, true);
  if (desdeAntes) sheet.getRange('C1').setValue(desdeAntes);
  if (hastaAntes) sheet.getRange('C2').setValue(hastaAntes);

  // Devuelve la fila del total.
  function bloque(titulo, tipo, primeraFila) {
    const lista = CONCEPTOS[tipo];
    const nombres = lista.map(function(c) { return [c.nombre]; });
    sheet.getRange(primeraFila, 2, lista.length, 1).setValues(nombres)
      .setNumberFormat('"* "@');
    for (let i = 0; i < lista.length; i++) {
      sheet.getRange(primeraFila + i, 3)
        .setFormula(formulaConcepto(tipo, primeraFila + i));
    }
    sheet.getRange(primeraFila, 1, lista.length, 1).merge()
      .setValue(titulo)
      .setFontWeight('bold')
      .setBackground(AZUL)
      .setHorizontalAlignment('center')
      .setVerticalAlignment('middle')
      .setWrap(true);

    const filaTotal = primeraFila + lista.length;
    sheet.getRange(filaTotal, 1, 1, 2).merge()
      .setValue('TOTAL ' + (tipo === INGRESO ? 'INGRESOS' : 'SALIDAS'));
    sheet.getRange(filaTotal, 3)
      .setFormula('=SUM(C' + primeraFila + ':C' + (filaTotal - 1) + ')');
    sheet.getRange(filaTotal, 1, 1, 3).setFontWeight('bold').setBackground(AZUL);
    return filaTotal;
  }

  const totalIngresos = bloque('INGRESOS EFECTIVO', INGRESO, 4);
  const totalSalidas = bloque('SALIDAS EFECTIVO', SALIDA, totalIngresos + 2);

  const filaSaldo = totalSalidas + 2;
  sheet.getRange(filaSaldo, 1, 1, 2).merge().setValue('SALDO');
  sheet.getRange(filaSaldo, 3)
    .setFormula('=C' + totalIngresos + '+C' + totalSalidas);
  sheet.getRange(filaSaldo, 1, 1, 3).setFontWeight('bold').setBackground(AZUL);

  sheet.getRange(4, 3, filaSaldo - 3, 1).setNumberFormat('#,##0.00');
  sheet.getRange(1, 1, filaSaldo, 3)
    .setBorder(true, true, true, true, true, true, '#9fb8d4', null);
  sheet.setColumnWidth(1, 150);
  sheet.setColumnWidth(2, 260);
  sheet.setColumnWidth(3, 120);

  return sheet;
}

/**
 * Crea la pestaña "Resumen" si ese libro todavía no la tiene. Se llama en
 * cada envío, pero solo hace trabajo la primera vez: así el resumen aparece
 * solo, sin tener que ejecutar nada a mano desde el editor.
 */
function asegurarResumen_(ss) {
  if (ss.getSheetByName(RESUMEN_NAME)) return;
  normalizarFechas_(getHojaRegistro_(ss));
  construirResumen_(ss);
}

function prepararLibro_(ss) {
  const registro = getHojaRegistro_(ss);
  normalizarFechas_(registro);
  ordenarPorFecha_(registro);
  construirResumen_(ss);
}

/**
 * Crea o rehace la pestaña "Resumen" en la hoja maestra y en la de cada
 * sede, y deja los registros ordenados por fecha. Se ejecuta a mano desde
 * el editor cuando haga falta; el resumen en sí se actualiza solo.
 */
function crearResumenes() {
  prepararLibro_(SpreadsheetApp.getActiveSpreadsheet());
  SEDES.forEach(function(sede) {
    const id = (SEDES_CONFIG[sede] || {}).hojaId;
    if (!id) return;
    prepararLibro_(SpreadsheetApp.openById(id));
  });
}
