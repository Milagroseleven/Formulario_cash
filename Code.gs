/**
 * Registro de movimientos de caja - Sanchoyjote S.L.
 *
 * Formulario web para que cada sede registre los movimientos de efectivo
 * (ingresos y salidas) desde el móvil o el ordenador: sede, responsable,
 * concepto, importe, fecha y la imagen del justificante. Cada envío deja
 * una fila en este Sheet y sube la imagen a Drive.
 *
 * La estructura de conceptos vive en CONCEPTOS: es la única fuente de
 * verdad. El formulario la lee de aquí para dibujar los campos, y el
 * servidor la usa de nuevo para validar lo que llega y para decidir en qué
 * carpeta de Drive y con qué nombre se guarda la imagen.
 */

const SHEET_NAME = 'Registro';

const EMPRESA = 'Sanchoyjote S.L.';
const NIF = 'B72770191';

const SEDES = ['Barcelona', 'Madrid', 'Sevilla', 'Valencia'];

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
 *   carpeta             : subcarpeta de Drive (ingresos, y salidas sin
 *                         opción de factura)
 *   permiteFactura      : true si el justificante puede ser factura/ticket
 *                         a nombre de la empresa
 *   carpetaConFactura /
 *   carpetaSinFactura   : subcarpeta según lo que se elija (solo cuando
 *                         permiteFactura es true)
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
    carpeta: 'Reserva - Venta de moto', archivo: 'Cash mantenimiento moto',
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
    permiteFactura: true, carpetaConFactura: 'Gastos con factura', carpetaSinFactura: 'Gastos sin factura',
  },
  {
    nombre: 'Compra de moto', matricula: 'obligatorio', detalle: 'opcional',
    detalleAyuda: AYUDA_OPCIONAL, extra: null, archivo: 'Cash compra moto',
    permiteFactura: true, carpetaConFactura: 'Gastos con factura', carpetaSinFactura: 'Gastos sin factura',
  },
  {
    nombre: 'Devolución a cliente - reserva', matricula: 'obligatorio', detalle: 'opcional',
    detalleAyuda: AYUDA_OPCIONAL, extra: null,
    carpeta: 'Otros', archivo: 'Cash devolución de reserva cliente',
  },
  {
    nombre: 'Devolución a cliente - venta cancelada', matricula: 'obligatorio', detalle: 'opcional',
    detalleAyuda: AYUDA_OPCIONAL, extra: null,
    carpeta: 'Otros', archivo: 'Cash devolución de venta cliente',
  },
  {
    nombre: 'Devolución a cliente - pago en exceso', matricula: 'obligatorio', detalle: 'opcional',
    detalleAyuda: AYUDA_OPCIONAL, extra: null,
    carpeta: 'Otros', archivo: 'Cash devolución pago en exceso cliente',
  },
  {
    nombre: 'Envío de cash a otra sede', matricula: null, detalle: 'opcional',
    detalleAyuda: AYUDA_OPCIONAL, extra: 'sedeDestino',
    carpeta: 'Otros', archivo: 'Cash envío a sede',
  },
  {
    nombre: 'Ajuste contable de caja', matricula: null, detalle: 'obligatorio',
    detalleAyuda: AYUDA_AJUSTE, extra: null,
    carpeta: 'Otros', archivo: 'Cash ajuste contable caja salida',
  },
  {
    nombre: 'Pago al personal interno', matricula: null, detalle: 'opcional',
    detalleAyuda: AYUDA_OPCIONAL, extra: 'empleado',
    carpeta: 'Otros', archivo: 'Cash pago a personal interno',
  },
  {
    nombre: 'Otros', matricula: 'opcional', detalle: 'obligatorio',
    detalleAyuda: AYUDA_OTROS, extra: null, archivo: 'Cash otras salidas',
    permiteFactura: true, carpetaConFactura: 'Gastos con factura', carpetaSinFactura: 'Otros',
  },
];

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
 * Busca la carpeta por nombre en todo el Drive al que tiene acceso quien
 * despliega. Así, si las carpetas "Caja Barcelona", "Caja Madrid", etc. ya
 * existen (o se crean después en una unidad compartida), el formulario las
 * usa en vez de crear otras sueltas en la raíz.
 */
function getCarpetaRaiz_(nombre) {
  const it = DriveApp.getFoldersByName(nombre);
  if (it.hasNext()) return it.next();
  return DriveApp.createFolder(nombre);
}

function getSubCarpeta_(parent, nombre) {
  const it = parent.getFoldersByName(nombre);
  if (it.hasNext()) return it.next();
  return parent.createFolder(nombre);
}

function getSheet_() {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  let sheet = ss.getSheetByName(SHEET_NAME);
  if (!sheet) {
    sheet = ss.insertSheet(SHEET_NAME);
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
  } else if (concepto.permiteFactura) {
    tipoJustificante = data.tipoJustificante;
    if (tipoJustificante !== JUSTIFICANTE_FACTURA && tipoJustificante !== JUSTIFICANTE_OTROS) {
      throw new Error('Falta indicar qué tipo de justificante se adjunta.');
    }
    conFactura = tipoJustificante === JUSTIFICANTE_FACTURA;
    if (conFactura && !data.photoBase64) {
      throw new Error('Para marcar "factura / ticket" hay que adjuntar la imagen.');
    }
    subCarpeta = conFactura ? concepto.carpetaConFactura : concepto.carpetaSinFactura;
  } else {
    // Conceptos que nunca llevan factura a nombre de la empresa.
    tipoJustificante = JUSTIFICANTE_OTROS;
    subCarpeta = concepto.carpeta;
  }

  const ahora = new Date();
  const id = nuevoId_(ahora);

  let fileUrl = '';
  if (data.photoBase64) {
    // Ruta: Caja <Sede> / Ingreso Caja | Salida Caja / <subcarpeta>
    const raiz = getCarpetaRaiz_('Caja ' + sanitize_(data.sede));
    const nivel = getSubCarpeta_(raiz, esIngreso ? 'Ingreso Caja' : 'Salida Caja');
    const carpeta = getSubCarpeta_(nivel, subCarpeta);

    const partes = [];
    if (data.matricula) partes.push(data.matricula);
    partes.push(concepto.archivo);
    if (concepto.extra === 'sedeOrigen' || concepto.extra === 'sedeDestino') {
      partes.push(data.sedeContraparte);
    }
    if (concepto.extra === 'empleado') partes.push(data.empleado);
    if (concepto.permiteFactura) partes.push(conFactura ? 'con factura' : 'sin factura');
    partes.push(Utilities.formatDate(ahora, Session.getScriptTimeZone(), 'yyyy-MM-dd HH.mm'));

    const nombreArchivo = sanitize_(partes.join(' - ')) + '.jpg';
    const decoded = Utilities.base64Decode(data.photoBase64);
    const blob = Utilities.newBlob(decoded, data.photoMimeType || 'image/jpeg', nombreArchivo);
    fileUrl = carpeta.createFile(blob).getUrl();
  }

  const sheet = getSheet_();
  sheet.appendRow([
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
  ]);

  return {
    id: id,
    fileUrl: fileUrl,
    esEnvioEntreSedes: concepto.extra === 'sedeDestino',
    sedeContraparte: data.sedeContraparte || '',
  };
}
