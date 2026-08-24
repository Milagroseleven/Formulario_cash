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
  'Barcelona': { carpetaId: '', hojaId: '' },
  'Madrid': { carpetaId: '', hojaId: '' },
  'Sevilla': { carpetaId: '', hojaId: '' },
  'Valencia': { carpetaId: '', hojaId: '' },
};

const SHEET_NAME = 'Registro';

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
  const t = HtmlService.createTemplateFromFile('Index');
  t.config = JSON.stringify({
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
    data.fecha,
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
    getHojaRegistro_(libroSede).appendRow(fila);
  }

  // Hoja maestra: la que contiene todas las sedes.
  getHojaRegistro_(SpreadsheetApp.getActiveSpreadsheet()).appendRow(fila);

  return {
    id: id,
    fileUrl: fileUrl,
    esEnvioEntreSedes: concepto.extra === 'sedeDestino',
    sedeContraparte: data.sedeContraparte || '',
  };
}
