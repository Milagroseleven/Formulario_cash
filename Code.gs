/**
 * Registro de movimientos de caja - Sanchoyjote SL
 *
 * Formulario web para que cada sede registre los movimientos de efectivo
 * (ingresos y salidas) desde el móvil o el ordenador: sede, responsable,
 * concepto, importe, fecha y la imagen del justificante. Cada envío deja
 * una fila en este Sheet y sube la imagen a Drive.
 *
 * La estructura de conceptos vive en CONCEPTOS: es la única fuente de
 * verdad. El formulario la lee de aquí para dibujar los campos, y el
 * servidor la usa de nuevo para validar lo que llega.
 */

const SHEET_NAME = 'Registro';
const ROOT_FOLDER_NAME = 'Movimientos de Caja';

const SEDES = ['Barcelona', 'Madrid', 'Sevilla', 'Valencia'];

const INGRESO = 'Ingreso de efectivo';
const SALIDA = 'Salida de efectivo';

const AYUDA_OPCIONAL = 'Opcional';
const AYUDA_AJUSTE = 'Especificar ajuste contable de caja';
const AYUDA_OTROS = 'Especificar "otros"';

/**
 * Para cada concepto:
 *   matricula / detalle : 'obligatorio' | 'opcional' | null (no se muestra)
 *   detalleAyuda        : texto de ayuda debajo del campo Detalle
 *   extra               : 'sedeOrigen' | 'sedeDestino' | 'empleado' | null
 */
const CONCEPTOS = {};
CONCEPTOS[INGRESO] = [
  { nombre: 'Reserva de moto', matricula: 'obligatorio', detalle: 'opcional', detalleAyuda: AYUDA_OPCIONAL, extra: null },
  { nombre: 'Venta de moto', matricula: 'obligatorio', detalle: 'opcional', detalleAyuda: AYUDA_OPCIONAL, extra: null },
  { nombre: 'Mantenimiento', matricula: 'obligatorio', detalle: 'opcional', detalleAyuda: AYUDA_OPCIONAL, extra: null },
  { nombre: 'Ingreso de cash de otra sede', matricula: null, detalle: 'opcional', detalleAyuda: AYUDA_OPCIONAL, extra: 'sedeOrigen' },
  { nombre: 'Ajuste contable de caja', matricula: null, detalle: 'obligatorio', detalleAyuda: AYUDA_AJUSTE, extra: null },
  { nombre: 'Otros', matricula: 'opcional', detalle: 'obligatorio', detalleAyuda: AYUDA_OTROS, extra: null },
];
CONCEPTOS[SALIDA] = [
  { nombre: 'Gastos operativos / Servicios', matricula: null, detalle: 'obligatorio', detalleAyuda: '', extra: null },
  { nombre: 'Compra de moto', matricula: 'obligatorio', detalle: 'opcional', detalleAyuda: AYUDA_OPCIONAL, extra: null },
  { nombre: 'Devolución a cliente - reserva', matricula: 'obligatorio', detalle: 'opcional', detalleAyuda: AYUDA_OPCIONAL, extra: null },
  { nombre: 'Devolución a cliente - venta cancelada', matricula: 'obligatorio', detalle: 'opcional', detalleAyuda: AYUDA_OPCIONAL, extra: null },
  { nombre: 'Devolución a cliente - pago en exceso', matricula: 'obligatorio', detalle: 'opcional', detalleAyuda: AYUDA_OPCIONAL, extra: null },
  { nombre: 'Envío de cash a otra sede', matricula: null, detalle: 'opcional', detalleAyuda: AYUDA_OPCIONAL, extra: 'sedeDestino' },
  { nombre: 'Ajuste contable de caja', matricula: null, detalle: 'obligatorio', detalleAyuda: AYUDA_AJUSTE, extra: null },
  { nombre: 'Pago al personal interno', matricula: null, detalle: 'opcional', detalleAyuda: AYUDA_OPCIONAL, extra: 'empleado' },
  { nombre: 'Otros', matricula: 'opcional', detalle: 'obligatorio', detalleAyuda: AYUDA_OTROS, extra: null },
];

// Opciones del campo 13 cuando el movimiento es una salida de efectivo.
const JUSTIFICANTE_FACTURA = 'Factura / ticket de gasto a nombre de Sanchoyjote SL';
const JUSTIFICANTE_OTROS = 'Proforma, albarán, imagen del cash, sin justificante, otros';
// Lo que se guarda en la columna cuando el movimiento es un ingreso.
const JUSTIFICANTE_INGRESO = 'Imagen de cash';

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

function getOrCreateFolder_(parent, name) {
  const it = parent.getFoldersByName(name);
  if (it.hasNext()) return it.next();
  return parent.createFolder(name);
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
  const stamp = Utilities.formatDate(fechaRegistro, Session.getScriptTimeZone(), 'yyyyMMdd-HHmmss');
  const sufijo = Utilities.getUuid().replace(/-/g, '').substring(0, 4).toUpperCase();
  return 'MOV-' + stamp + '-' + sufijo;
}

/**
 * data: {sede, responsable, tipoMovimiento, concepto, matricula, detalle,
 *        sedeContraparte, empleado, importe, fecha, tipoJustificante,
 *        photoBase64, photoMimeType}
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

  let tipoJustificante;
  if (esIngreso) {
    tipoJustificante = JUSTIFICANTE_INGRESO;
  } else {
    tipoJustificante = data.tipoJustificante;
    if (tipoJustificante !== JUSTIFICANTE_FACTURA && tipoJustificante !== JUSTIFICANTE_OTROS) {
      throw new Error('Falta indicar qué tipo de justificante se adjunta.');
    }
    if (tipoJustificante === JUSTIFICANTE_FACTURA && !data.photoBase64) {
      throw new Error('Para marcar "factura / ticket" hay que adjuntar la imagen.');
    }
  }

  const ahora = new Date();
  const id = nuevoId_(ahora);

  let fileUrl = '';
  if (data.photoBase64) {
    const mes = String(data.fecha).substring(0, 7); // yyyy-MM
    const root = getOrCreateFolder_(DriveApp.getRootFolder(), ROOT_FOLDER_NAME);
    const folder = getOrCreateFolder_(getOrCreateFolder_(root, sanitize_(data.sede)), mes);

    const partes = [data.fecha, concepto.nombre];
    if (data.matricula) partes.push(data.matricula);
    partes.push(id);
    const nombreArchivo = sanitize_(partes.join(' - ')) + '.jpg';

    const decoded = Utilities.base64Decode(data.photoBase64);
    const blob = Utilities.newBlob(decoded, data.photoMimeType || 'image/jpeg', nombreArchivo);
    fileUrl = folder.createFile(blob).getUrl();
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
    data.empleado || '',
    importe,
    esIngreso ? importe : -importe,
    data.fecha,
    tipoJustificante,
    fileUrl,
  ]);

  return { id: id, fileUrl: fileUrl };
}
