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
    carpetaId: '1QBase7tlzK2KVQ4OXSoc39JQIzfXVnAn',
    hojaId: '1B6Qc9AWnndZ1ZvKG-nnJqthGbGtC01cdAYnN4HM7ndE',
  },
  'Madrid': {
    carpetaId: '1WYnb4HayYYTKFtdCRKIViAEPhS8sl9pp',
    hojaId: '1jIEODAEg_dqvdVR7PX2-ZyX3Zkhj-2rtEwPh26cgtcs',
  },
  'Sevilla': {
    carpetaId: '1TERHkX3G6G5QveoN-lixW3jPqnTPf6Mt',
    hojaId: '1hoHKdVb-XExvVg1weKQ899cmBhusqWXdxfsKViLLCYg',
  },
  'Valencia': {
    carpetaId: '14O4ZFpmjw6XQszXggUdKPSIi3RPOuP38',
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

// La pestaña de datos no se llama igual en los dos sitios: en las hojas de
// sede es "Registro", y en la maestra "Registro actual", para distinguirla
// del histórico.
const SHEET_SEDE = 'Registro';
const SHEET_MAESTRA = 'Registro actual';
const RESUMEN_NAME = 'Resumen';
// Al subir este número, el resumen se rehace solo en el siguiente envío.
const RESUMEN_VERSION = '7';

// Filas fijas de la pestaña "Resumen": fechas de corte y la nota que
// explica qué pasa si se dejan en blanco. El título va en la fila 1.
const FILA_DESDE = 2;
const FILA_HASTA = 3;
const FILA_NOTA = 4;

// Posición de las columnas de "Registro" que usan el orden y el resumen.
const COL_TIPO = 5;            // E - Tipo de movimiento
const COL_CONCEPTO = 6;        // F - Concepto
const COL_IMPORTE = 12;        // L - Importe (EUR)
const COL_IMPORTE_SIGNO = 13;  // M - Importe con signo
const COL_FECHA_MOV = 14;      // N - Fecha del movimiento

const FORMATO_EUROS = '#,##0.00\u00a0€';

const EMPRESA = 'Sanchoyjote S.L.';
const NIF = 'B72770191';

const SEDES = Object.keys(SEDES_CONFIG);

const INGRESO = 'Ingreso de efectivo';
const SALIDA = 'Salida de efectivo';

const AYUDA_OPCIONAL = 'Opcional';
const AYUDA_AJUSTE = 'Especificar ajuste contable de caja';
const AYUDA_OTROS = 'Especificar "otros"';

// Qué documentación acompaña a una salida de efectivo.
const JUSTIFICANTE_FACTURA = 'Factura a nombre de ' + EMPRESA + ' - NIF ' + NIF;
const JUSTIFICANTE_OTROS = 'Otra documentación (no es factura a nombre de la empresa)';
const JUSTIFICANTE_SIN = 'Sin documentación';
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
 *   soloHoja            : true si el concepto no se ofrece en el
 *                         formulario y solo se usa escribiendo la fila a
 *                         mano en la hoja. Sigue contando en el resumen.
 */
const CONCEPTOS = {};

CONCEPTOS[INGRESO] = [
  {
    // Arrastre del sistema de caja anterior. Va el primero para que en el
    // resumen quede arriba, como punto de partida. No se ofrece en el
    // formulario: se escribe a mano, una sola vez por sede.
    nombre: 'Saldo de caja - sistema anterior', matricula: null, detalle: 'opcional',
    detalleAyuda: AYUDA_OPCIONAL, extra: null, soloHoja: true,
    carpeta: 'Otros', archivo: 'Cash saldo de caja sistema anterior',
  },
  {
    nombre: 'Reserva de moto', matricula: 'obligatorio', detalle: 'opcional',
    detalleAyuda: AYUDA_OPCIONAL, extra: null,
    carpeta: 'Reserva - Venta de moto', archivo: 'Cash reserva moto',
  },
  {
    nombre: 'Venta de moto', matricula: 'obligatorio', detalle: 'opcional',
    detalleAyuda: AYUDA_OPCIONAL, extra: null,
    carpeta: 'Reserva - Venta de moto', archivo: 'Cash venta moto',
    // La aclaración tiene que verse al desplegar la lista, así que va en la
    // propia opción. Dentro de un desplegable el navegador no deja poner
    // parte del texto en otro color: va toda en negro. "nombre" es lo único
    // que viaja a la hoja y lo que suma el resumen.
    etiqueta: 'Venta de moto (inc. todo lo que esté en el contrato: transporte, pack urban, etc.)',
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
    conceptos: conceptosVisibles_(),
    justificanteFactura: JUSTIFICANTE_FACTURA,
    justificanteOtros: JUSTIFICANTE_OTROS,
    justificanteSin: JUSTIFICANTE_SIN,
    reMatricula: RE_MATRICULA.source,
    avisoMatricula: AVISO_MATRICULA,
  });
  return t.evaluate()
    .setTitle('Registro de movimientos de caja')
    .addMetaTag('viewport', 'width=device-width, initial-scale=1, maximum-scale=1');
}

/** Los conceptos que sí se ofrecen en el formulario. */
function conceptosVisibles_() {
  const visibles = {};
  Object.keys(CONCEPTOS).forEach(function(tipo) {
    visibles[tipo] = CONCEPTOS[tipo].filter(function(c) { return !c.soloHoja; });
  });
  return visibles;
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

/**
 * Buscar una subcarpeta por nombre obliga a Drive a recorrer la carpeta
 * entera, y eso son varias décimas por envío. Como las subcarpetas no
 * cambian nunca, se recuerda su ID la primera vez. Si alguien la borra o la
 * mueve fuera, se detecta al fallar y se vuelve a buscar.
 */
function getSubCarpeta_(parent, nombre) {
  const props = PropertiesService.getScriptProperties();
  const clave = 'carp_' + parent.getId() + '_' + nombre;
  const guardada = props.getProperty(clave);

  if (guardada) {
    try {
      return DriveApp.getFolderById(guardada);
    } catch (err) {
      props.deleteProperty(clave);
    }
  }

  const it = parent.getFoldersByName(nombre);
  const carpeta = it.hasNext() ? it.next() : parent.createFolder(nombre);
  props.setProperty(clave, carpeta.getId());
  return carpeta;
}

/** Deja en euros las dos columnas de importe, incluidas las filas futuras. */
function formatoImportes_(sheet) {
  sheet.getRange(2, COL_IMPORTE, sheet.getMaxRows() - 1, 2)
    .setNumberFormat(FORMATO_EUROS);
}

/** Devuelve la pestaña "Registro" del libro, creándola con cabeceras. */
function nombreRegistro_(spreadsheet) {
  return (spreadsheet.getId() === SpreadsheetApp.getActiveSpreadsheet().getId())
    ? SHEET_MAESTRA : SHEET_SEDE;
}

function getHojaRegistro_(spreadsheet) {
  const nombre = nombreRegistro_(spreadsheet);
  let sheet = spreadsheet.getSheetByName(nombre);

  // Si la maestra aún tiene la pestaña con el nombre antiguo, se renombra en
  // vez de crear otra vacía al lado. Al renombrar, las fórmulas que la
  // referencian se actualizan solas.
  if (!sheet && nombre === SHEET_MAESTRA) {
    const antigua = spreadsheet.getSheetByName(SHEET_SEDE);
    if (antigua) {
      antigua.setName(SHEET_MAESTRA);
      sheet = antigua;
    }
  }

  if (!sheet) {
    sheet = spreadsheet.insertSheet(nombre);
  }
  if (sheet.getLastRow() === 0) {
    sheet.appendRow(HEADERS);
    sheet.setFrozenRows(1);
    sheet.autoResizeColumns(1, HEADERS.length);
    formatoImportes_(sheet);
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

/**
 * Añade la fila y solo reordena si hace falta. Lo normal es registrar un
 * movimiento de hoy, que ya entra al final: en ese caso no hay nada que
 * ordenar, y así se evita reescribir la tabla entera en cada envío.
 */
function insertarOrdenado_(sheet, fila) {
  const antes = sheet.getLastRow();
  sheet.appendRow(fila);
  if (antes < 2) return;

  const ultimaFecha = sheet.getRange(antes, COL_FECHA_MOV).getValue();
  const nuevaFecha = fila[COL_FECHA_MOV - 1];
  const ordenadas = ultimaFecha instanceof Date && nuevaFecha instanceof Date &&
    nuevaFecha.getTime() >= ultimaFecha.getTime();
  if (!ordenadas) ordenarPorFecha_(sheet);
}

/**
 * Formatos de matrícula admitidos:
 *   3720 KDV      actual: 4 cifras + 3 letras
 *   A 108859      antigua sin letras finales: 1-2 letras de provincia + cifras
 *   M 8214 YV     antigua: provincia + 4 cifras + 2 letras
 *   C 2107 BWM    antigua: provincia + 4 cifras + 3 letras
 *
 * Cuando la misma moto se vende más de una vez se le añade el número de la
 * operación al final: "3720 KDV 2", "A 108859 3".
 */
const RE_MATRICULA = /^(\d{4} [A-Z]{3}|[A-Z]{1,2} \d{4,6}( [A-Z]{1,3})?)( \d{1,2})?$/;

const AVISO_MATRICULA = 'Revisa la matrícula. Formatos válidos: 3720 KDV, ' +
  'M 8214 YV, C 2107 BWM o A 108859. En los casos que corresponda, agregar el ' +
  'número de venta al final de la matrícula: ejemplo 3720 KDV 2.';

/**
 * Acepta el importe escrito con coma o con punto, y con separador de miles.
 * Cuando hay dos separadores, el último es el decimal ("1.234,56" y
 * "1,234.56" valen los dos). Con uno solo seguido de tres cifras se entiende
 * que son miles ("1.500" son mil quinientos, no uno con cinco).
 */
function normalizarImporte_(valor) {
      var t = String(valor || '').replace(/[^0-9.,]/g, '');
      if (!t) return '';

      var comas = (t.match(/,/g) || []).length;
      var puntos = (t.match(/[.]/g) || []).length;
      var corte = -1;

      if (comas && puntos) {
        // Mezcla de los dos: el último es el decimal, valga "1.234,56" o
        // "1,234.56".
        corte = Math.max(t.lastIndexOf(','), t.lastIndexOf('.'));
      } else if (comas === 1) {
        // En español la coma es el decimal: "12,50".
        corte = t.lastIndexOf(',');
      } else if (puntos === 1) {
        // Un punto con tres cifras detrás son miles ("1.500" son mil
        // quinientos); con una o dos, decimales ("12.50").
        var detras = t.length - t.lastIndexOf('.') - 1;
        if (detras !== 3) corte = t.lastIndexOf('.');
      }
      // Varios separadores iguales son todos de miles: "1.234.567". Solo se
      // aceptan si están bien puestos, de tres en tres; si no, es un error de
      // tecleo ("12,,50") y se devuelve tal cual para que no pase la
      // comprobación, en vez de inventarse una cifra.
      if (corte === -1) {
        if (!/^[0-9]{1,3}([.,][0-9]{3})+$/.test(t)) return t;
        return t.replace(/[.,]/g, '');
      }
      var entera = t.slice(0, corte).replace(/[.,]/g, '');
      var decimal = t.slice(corte + 1).replace(/[.,]/g, '');
      return entera + '.' + decimal;
}

/** Mayúsculas, un solo espacio entre bloques y sin guiones ni puntos. */
function normalizarMatricula_(valor) {
  return String(valor || '')
    .toUpperCase()
    .replace(/[^A-Z0-9]+/g, ' ')
    .trim()
    .replace(/\s+/g, ' ');
}

function sanitize_(s) {
  return String(s || '').replace(/[\\/:*?"<>|]/g, '-').trim();
}

function extensionDe_(nombre, mime) {
  const conPunto = String(nombre || '').match(/\.([A-Za-z0-9]{1,5})$/);
  if (conPunto) return '.' + conPunto[1].toLowerCase();
  if (mime === 'application/pdf') return '.pdf';
  if (mime === 'image/png') return '.png';
  if (mime === 'image/heic') return '.heic';
  return '.jpg';
}

function nuevoId_(fechaRegistro) {
  const dia = Utilities.formatDate(fechaRegistro, Session.getScriptTimeZone(), 'yyyyMMdd');
  const sufijo = Utilities.getUuid().replace(/[^A-Za-z0-9]/g, '').substring(0, 4).toUpperCase();
  return 'MOV-' + dia + '-' + sufijo;
}

/**
 * data: {sede, responsable, tipoMovimiento, concepto, matricula, detalle,
 *        sedeContraparte, codigoEnvio, empleado, importe, fecha,
 *        tipoJustificante, photoBase64, photoMimeType, photoNombre}
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
  if (data.matricula) {
    data.matricula = normalizarMatricula_(data.matricula);
    if (!RE_MATRICULA.test(data.matricula)) {
      throw new Error(AVISO_MATRICULA);
    }
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

  const importeTexto = normalizarImporte_(data.importe);
  const importe = Number(importeTexto);
  if (!importe || importe <= 0) {
    throw new Error('El importe tiene que ser mayor que cero.');
  }
  if (!/^[0-9]+([.][0-9]{1,2})?$/.test(importeTexto)) {
    throw new Error('Revisa el importe: como mucho dos decimales. Puedes usar ' +
      'coma o punto (12,50 o 12.50).');
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
  } else if (data.tipoJustificante === JUSTIFICANTE_SIN) {
    if (data.photoBase64) {
      throw new Error('Has marcado que no cuentas con documentación, pero llega un archivo adjunto.');
    }
    tipoJustificante = JUSTIFICANTE_SIN;
  } else {
    tipoJustificante = data.tipoJustificante;
    if (tipoJustificante !== JUSTIFICANTE_FACTURA && tipoJustificante !== JUSTIFICANTE_OTROS) {
      throw new Error('Falta indicar si el documento adjunto es una factura a nombre de la empresa.');
    }
    if (!data.photoBase64) {
      throw new Error('Adjunta la documentación de la salida, o marca que no cuentas con ella.');
    }
    conFactura = tipoJustificante === JUSTIFICANTE_FACTURA;
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

    const nombreArchivo = sanitize_(partes.join(' - ')) +
      extensionDe_(data.photoNombre, data.photoMimeType);
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
    insertarOrdenado_(hojaSede, fila);
    asegurarResumen_(libroSede);
  }

  // Hoja maestra: la que contiene todas las sedes.
  const maestra = SpreadsheetApp.getActiveSpreadsheet();
  const hojaMaestra = getHojaRegistro_(maestra);
  insertarOrdenado_(hojaMaestra, fila);
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

/**
 * Devuelve el separador de argumentos que entiende esta hoja: coma en
 * configuración inglesa, punto y coma en española. Apps Script guarda la
 * fórmula tal cual se le pasa, así que si no coincide sale #ERROR!. En vez
 * de adivinarlo por el idioma, se prueba con una fórmula de una línea.
 */
function separadorArgumentos_(sheet) {
  const celda = sheet.getRange(1, 20);
  celda.setFormula('=SUM(1,2)');
  SpreadsheetApp.flush();
  const valor = celda.getValue();
  celda.clear();
  return valor === 3 ? ',' : ';';
}

function construirResumen_(ss) {
  getHojaRegistro_(ss); // asegura que exista la pestaña Registro

  let sheet = ss.getSheetByName(RESUMEN_NAME);
  if (!sheet) sheet = ss.insertSheet(RESUMEN_NAME);

  // Se conservan las fechas de corte que hubiera puestas.
  const desdeAntes = sheet.getRange(FILA_DESDE, 3).getValue();
  const hastaAntes = sheet.getRange(FILA_HASTA, 3).getValue();

  const todo = sheet.getRange(1, 1, sheet.getMaxRows(), sheet.getMaxColumns());
  todo.breakApart();
  todo.clearDataValidations();
  sheet.clear();
  sheet.clearNotes();
  sheet.setHiddenGridlines(true);

  const AZUL_CLARO = '#c5d9f1';
  const AZUL_FUERTE = '#4f81bd';
  const AZUL_TEXTO = '#1f3864';
  const BORDE = '#4f81bd';
  const AMARILLO = '#ffffcc';
  const SOLIDA = SpreadsheetApp.BorderStyle.SOLID;

  const listaIngresos = CONCEPTOS[INGRESO];
  const listaSalidas = CONCEPTOS[SALIDA];
  const primeraIngreso = FILA_NOTA + 2;
  const totalIngresos = primeraIngreso + listaIngresos.length;
  const primeraSalida = totalIngresos + 2;
  const totalSalidas = primeraSalida + listaSalidas.length;
  const filaSaldo = totalSalidas + 2;

  // --- Título ----------------------------------------------------------
  sheet.getRange(1, 1, 1, 2).merge()
    .setValue('RESUMEN CAJA')
    .setFontWeight('bold')
    .setFontSize(12)
    .setFontColor(AZUL_TEXTO)
    .setBackground(AZUL_CLARO)
    .setHorizontalAlignment('left')
    .setBorder(true, true, true, true, false, false, BORDE, SOLIDA);

  // --- Fechas de corte -------------------------------------------------
  sheet.getRange(FILA_DESDE, 2).setValue('FECHA DE INICIO');
  sheet.getRange(FILA_HASTA, 2).setValue('FECHA DE FIN');
  sheet.getRange(FILA_DESDE, 2, 2, 1)
    .setFontWeight('bold').setFontColor(AZUL_TEXTO).setHorizontalAlignment('right');

  sheet.getRange(FILA_DESDE, 3, 2, 1)
    .setBackground(AMARILLO)
    .setNumberFormat('dd/mm/yyyy')
    .setHorizontalAlignment('center')
    .setBorder(true, true, true, true, true, true, BORDE, SOLIDA)
    .setDataValidation(SpreadsheetApp.newDataValidation()
      .requireDate()
      .setAllowInvalid(true)
      .setHelpText('Escribe una fecha (dd/mm/aaaa). Déjala en blanco para no limitar por este lado.')
      .build());
  sheet.getRange(FILA_DESDE, 3)
    .setNote('Desde qué fecha se cuentan los movimientos.\nEn blanco: desde el primero registrado.');
  sheet.getRange(FILA_HASTA, 3)
    .setNote('Hasta qué fecha se cuentan los movimientos.\nEn blanco: hasta el último registrado.');
  if (desdeAntes) sheet.getRange(FILA_DESDE, 3).setValue(desdeAntes);
  if (hastaAntes) sheet.getRange(FILA_HASTA, 3).setValue(hastaAntes);

  sheet.getRange(FILA_NOTA, 1, 1, 3).merge()
    .setValue('Escribe las fechas de corte en las celdas amarillas. Si dejas en blanco la ' +
      'de inicio, se cuenta desde el primer movimiento; si dejas en blanco la de fin, ' +
      'hasta el último. En blanco las dos, se cuenta todo el histórico.')
    .setFontSize(9)
    .setFontStyle('italic')
    .setFontColor('#666666')
    .setWrap(true)
    .setVerticalAlignment('middle');
  sheet.setRowHeight(FILA_NOTA, 34);

  // --- Bloques ---------------------------------------------------------
  function cabecera(titulo, lista, primeraFila, filaTotal, etiquetaTotal) {
    sheet.getRange(primeraFila, 2, lista.length, 1)
      .setValues(lista.map(function(c) { return [c.nombre]; }))
      .setNumberFormat('"* "@')
      .setFontColor(AZUL_TEXTO);
    sheet.getRange(primeraFila, 1, lista.length, 1).merge()
      .setValue(titulo)
      .setFontWeight('bold')
      .setFontColor(AZUL_TEXTO)
      .setBackground(AZUL_CLARO)
      .setHorizontalAlignment('center')
      .setVerticalAlignment('middle')
      .setWrap(true);
    sheet.getRange(primeraFila, 1, lista.length, 3)
      .setBorder(true, true, true, true, true, true, BORDE, SOLIDA);

    sheet.getRange(filaTotal, 1, 1, 2).merge().setValue(etiquetaTotal);
    sheet.getRange(filaTotal, 1, 1, 3)
      .setFontWeight('bold')
      .setFontColor('#ffffff')
      .setBackground(AZUL_FUERTE)
      .setBorder(true, true, true, true, true, true, BORDE, SOLIDA);
  }

  cabecera('INGRESOS EFECTIVO', listaIngresos, primeraIngreso, totalIngresos, 'TOTAL INGRESOS');
  cabecera('SALIDAS EFECTIVO', listaSalidas, primeraSalida, totalSalidas, 'TOTAL SALIDAS');

  sheet.getRange(filaSaldo, 1, 1, 2).merge().setValue('SALDO');
  sheet.getRange(filaSaldo, 1, 1, 3)
    .setFontWeight('bold')
    .setFontColor('#ffffff')
    .setBackground(AZUL_FUERTE)
    .setBorder(true, true, true, true, true, true, BORDE, SOLIDA);

  // --- Fórmulas --------------------------------------------------------
  const reg = "'" + nombreRegistro_(ss) + "'";
  const colImporte = colLetra_(COL_IMPORTE_SIGNO);
  const colTipo = colLetra_(COL_TIPO);
  const colConcepto = colLetra_(COL_CONCEPTO);
  const colFecha = colLetra_(COL_FECHA_MOV);
  const celdaDesde = '$C$' + FILA_DESDE;
  const celdaHasta = '$C$' + FILA_HASTA;

  function escribirFormulas(sep) {
    // Sin fecha de corte no se filtra por ese extremo.
    const desde = 'IF(' + celdaDesde + '=""' + sep + 'DATE(1900' + sep + '1' + sep + '1)' + sep + celdaDesde + ')';
    const hasta = 'IF(' + celdaHasta + '=""' + sep + 'DATE(2200' + sep + '1' + sep + '1)' + sep + celdaHasta + ')';

    function bloque(tipo, lista, primeraFila, filaTotal) {
      for (let i = 0; i < lista.length; i++) {
        const fila = primeraFila + i;
        sheet.getRange(fila, 3).setFormula(
          '=SUMIFS(' + reg + '!$' + colImporte + ':$' + colImporte +
          sep + reg + '!$' + colTipo + ':$' + colTipo + sep + '"' + tipo + '"' +
          sep + reg + '!$' + colConcepto + ':$' + colConcepto + sep + '$B' + fila +
          sep + reg + '!$' + colFecha + ':$' + colFecha + sep + '">="&' + desde +
          sep + reg + '!$' + colFecha + ':$' + colFecha + sep + '"<="&' + hasta + ')');
      }
      sheet.getRange(filaTotal, 3)
        .setFormula('=SUM(C' + primeraFila + ':C' + (filaTotal - 1) + ')');
    }

    bloque(INGRESO, listaIngresos, primeraIngreso, totalIngresos);
    bloque(SALIDA, listaSalidas, primeraSalida, totalSalidas);
    sheet.getRange(filaSaldo, 3)
      .setFormula('=C' + totalIngresos + '+C' + totalSalidas);
    SpreadsheetApp.flush();
  }

  // Según la configuración regional de la hoja, los argumentos se separan
  // con coma o con punto y coma, y la que no toca da #ERROR!. En vez de
  // deducirlo, se escribe, se mira si la hoja lo aceptó, y si no se
  // reescribe con el otro.
  let sep = separadorArgumentos_(sheet);
  escribirFormulas(sep);
  if (formulasConError_(sheet, primeraIngreso)) {
    sep = (sep === ',') ? ';' : ',';
    escribirFormulas(sep);
  }

  // --- Remate ----------------------------------------------------------
  sheet.getRange(primeraIngreso, 3, filaSaldo - primeraIngreso + 1, 1)
    .setNumberFormat(FORMATO_EUROS)
    .setHorizontalAlignment('right');
  sheet.setColumnWidth(1, 150);
  sheet.setColumnWidth(2, 260);
  sheet.setColumnWidth(3, 120);

  return sheet;
}

/** ¿La hoja rechazó la fórmula que acabamos de escribir? */
function formulasConError_(sheet, fila) {
  const valor = String(sheet.getRange(fila, 3).getDisplayValue());
  return valor.indexOf('#ERROR') === 0 || valor.indexOf('#¡ERROR') === 0;
}

/**
 * Crea la pestaña "Resumen" si ese libro todavía no la tiene. Se llama en
 * cada envío, pero solo hace trabajo la primera vez: así el resumen aparece
 * solo, sin tener que ejecutar nada a mano desde el editor.
 */
function asegurarResumen_(ss) {
  const props = PropertiesService.getScriptProperties();
  const clave = 'resumen_' + ss.getId();
  if (ss.getSheetByName(RESUMEN_NAME) && props.getProperty(clave) === RESUMEN_VERSION) {
    return;
  }
  const registro = getHojaRegistro_(ss);
  normalizarFechas_(registro);
  ordenarPorFecha_(registro);
  formatoImportes_(registro);
  construirResumen_(ss);
  props.setProperty(clave, RESUMEN_VERSION);
}

function prepararLibro_(ss) {
  const registro = getHojaRegistro_(ss);
  normalizarFechas_(registro);
  ordenarPorFecha_(registro);
  formatoImportes_(registro);
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


// ---------------------------------------------------------------------
// CONSOLIDADO
//
// Cada envío escribe la fila en la hoja de su sede y en la maestra. A
// partir de ahí son dos copias independientes: si la sede corrige algo, la
// maestra se queda con lo viejo. Esta sincronización rehace la maestra a
// partir de las cuatro hojas de sede, de modo que lo que quede en la sede
// es siempre lo que vale.
//
// Consecuencia importante: la hoja maestra pasa a ser de solo lectura. Lo
// que se escriba directamente en ella se perderá en la siguiente
// sincronización. Las correcciones se hacen en la hoja de la sede.
// ---------------------------------------------------------------------

const HOJA_COPIA_PREVIA = 'Registro (copia previa)';

// ---------------------------------------------------------------------
// PESTAÑA "MOVIMIENTOS DE VENTA"
//
// Junta en una sola lista el cash de ventas y reservas de las dos épocas:
// el histórico (lista cerrada, una fila por matrícula) y el sistema nuevo
// (una fila por movimiento de caja). Sirve para poder anular operaciones
// concretas sin perder el rastro de cuál se anuló.
//
// La columna "Venta no concretada" se escribe A MANO. El proceso la
// conserva emparejando por código, nunca por posición: aunque la lista se
// reordene o entren movimientos nuevos, la marca sigue pegada a su
// movimiento.
// ---------------------------------------------------------------------
const MOVIMIENTOS_NAME = 'Revisión movimientos de venta';
// Nombre que tuvo antes: si aparece, se renombra en vez de crear otra
// pestaña al lado, para no dejar huérfanas las marcas ya escritas.
const MOVIMIENTOS_NAME_ANTERIOR = 'Movimientos de venta';
// Si alguna vez se renombra la pestaña del histórico, cambiar aquí.
const HISTORICO_NAME = 'Registro histórico';

const MOV_HEADERS = [
  'Origen',
  'Código',
  'Matrícula',
  'Fecha',
  'Sede',
  'Responsable',
  'Concepto',
  'Histórico: Cash Otros',
  'Histórico: Cash conciliación',
  'Registro actual',
  'Total Cash',
  'Venta no concretada (histórico)',
  'Venta no concretada',
  'Aviso',
];

const MOV_COL_ORIGEN = 1;
const MOV_COL_CODIGO = 2;
const MOV_COL_MATRICULA = 3;
const MOV_COL_FECHA = 4;
const MOV_COL_HIST_OTROS = 8;   // informativo: NO entra en el total
const MOV_COL_HIST_CASH = 9;
const MOV_COL_ACTUAL = 10;
const MOV_COL_TOTAL = 11;
const MOV_COL_MARCA_HIST = 12;
const MOV_COL_MARCA = 13;       // la que se escribe a mano
const MOV_COL_AVISO = 14;

const ORIGEN_HISTORICO = 'Registro histórico';
const ORIGEN_ACTUAL = 'Registro actual';
const ORIGEN_SIN = '(sin origen)';

const MARCA_NO_CONCRETADA = 'Venta no concretada';

// Columnas del histórico que se traen (1 = A).
const HIST_COL_MATRICULA = 1;
const HIST_COL_RESPONSABLE = 4;
const HIST_COL_TOTAL_CASH = 12;   // "Cash: Total conciliación", en negativo
const HIST_COL_OTROS = 14;        // "Cash: Otros - maestro"
const HIST_COL_NO_CONCRETADA = 18;
const HIST_COL_FECHA_VENTA = 19;

// Conceptos del sistema nuevo que son dinero de una venta, y con qué signo
// entran: las devoluciones restan.
const CONCEPTOS_VENTA = {};
CONCEPTOS_VENTA['Venta de moto'] = 1;
CONCEPTOS_VENTA['Reserva de moto'] = 1;
CONCEPTOS_VENTA['Devolución a cliente - reserva'] = -1;
CONCEPTOS_VENTA['Devolución a cliente - venta cancelada'] = -1;
CONCEPTOS_VENTA['Devolución a cliente - pago en exceso'] = -1;

/** Menú para forzar la actualización sin esperar al próximo repaso. */
function onOpen() {
  SpreadsheetApp.getUi()
    .createMenu('Caja')
    .addItem('Actualizar consolidado ahora', 'sincronizarDesdeMenu')
    .addToUi();
}

function sincronizarDesdeMenu() {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  try {
    const r = sincronizarMaestra();
    if (r.omitida) {
      ss.toast(r.motivo, 'No se actualizó', 10);
      return;
    }
    ss.toast(r.filas + ' movimientos recogidos de ' + r.sedes + ' sedes.',
      'Consolidado actualizado', 8);
  } catch (err) {
    ss.toast(err.message, 'No se pudo actualizar', 10);
    throw err;
  }
}

/**
 * Google corta la ejecución cuando hay demasiadas cosas tocando hojas de
 * cálculo a la vez ("Too many simultaneous invocations"). No es un fallo del
 * proceso: pasa cuando la pasada automática coincide con alguien
 * registrando un movimiento.
 */
function esErrorDeConcurrencia_(err) {
  const m = String((err && err.message) || err).toLowerCase();
  return m.indexOf('simultaneous') !== -1 ||
    m.indexOf('simultáne') !== -1 ||
    m.indexOf('too many') !== -1 ||
    m.indexOf('demasiad') !== -1 ||
    m.indexOf('try again') !== -1;
}

/** Abre la hoja de una sede, con un segundo intento si Google está ocupado. */
function abrirHojaSede_(id, sede) {
  for (let intento = 1; intento <= 2; intento++) {
    try {
      return SpreadsheetApp.openById(id);
    } catch (err) {
      if (intento === 2 || !esErrorDeConcurrencia_(err)) {
        throw new Error('No se pudo leer la hoja de ' + sede +
          '. No se ha tocado el consolidado, para no dejarlo incompleto.');
      }
      Utilities.sleep(2000);
    }
  }
}

/**
 * Rehace la pestaña "Registro" de la maestra con lo que haya ahora mismo en
 * las cuatro hojas de sede.
 *
 * Si alguna sede no se puede leer, se cancela entera sin tocar nada: es
 * preferible un consolidado desactualizado a uno al que le falte una sede
 * por un fallo pasajero.
 */
function sincronizarMaestra() {
  // Dos sincronizaciones a la vez se estorban. La segunda se salta esta
  // pasada: como cada pasada rehace el consolidado entero, no se pierde nada.
  const cerrojo = LockService.getScriptLock();
  if (!cerrojo.tryLock(2000)) {
    return { omitida: true, motivo: 'Ya había otra actualización en marcha. ' +
      'La próxima pasada lo deja al día.' };
  }
  try {
    return sincronizarAhora_();
  } catch (err) {
    if (esErrorDeConcurrencia_(err)) {
      // Se sale en silencio: si se lanzara el error, Google mandaría un
      // aviso por correo cada vez que coincide, y acabarían ignorándose.
      return { omitida: true, motivo: 'Google estaba ocupado en ese momento. ' +
        'La próxima pasada lo deja al día.' };
    }
    throw err;
  } finally {
    cerrojo.releaseLock();
  }
}

function sincronizarAhora_() {
  const filas = [];
  let sedesLeidas = 0;

  SEDES.forEach(function(sede) {
    const id = (SEDES_CONFIG[sede] || {}).hojaId;
    if (!id) return;

    const libro = abrirHojaSede_(id, sede);
    sedesLeidas++;

    const hoja = libro.getSheetByName(SHEET_SEDE);
    if (!hoja || hoja.getLastRow() < 2) return;

    const datos = hoja.getRange(2, 1, hoja.getLastRow() - 1, HEADERS.length).getValues();
    datos.forEach(function(fila) {
      if (fila[1]) filas.push(fila); // sin ID de movimiento, no es una fila válida
    });
  });

  filas.sort(function(a, b) {
    const fa = a[COL_FECHA_MOV - 1];
    const fb = b[COL_FECHA_MOV - 1];
    const va = (fa instanceof Date) ? fa.getTime() : Number.MAX_SAFE_INTEGER;
    const vb = (fb instanceof Date) ? fb.getTime() : Number.MAX_SAFE_INTEGER;
    if (va !== vb) return va - vb;
    const ra = (a[0] instanceof Date) ? a[0].getTime() : 0;
    const rb = (b[0] instanceof Date) ? b[0].getTime() : 0;
    return ra - rb;
  });

  const maestra = SpreadsheetApp.getActiveSpreadsheet();
  const registro = getHojaRegistro_(maestra);
  const props = PropertiesService.getScriptProperties();

  // Red de seguridad: la primera vez se guarda una copia de lo que hubiera
  // en la maestra, por si alguna fila antigua no estuviera en ninguna sede.
  if (!props.getProperty('copia_previa') && registro.getLastRow() > 1) {
    registro.copyTo(maestra).setName(HOJA_COPIA_PREVIA);
    props.setProperty('copia_previa', new Date().toISOString());
  }

  // Primero se escriben las filas nuevas y después se limpia lo que sobra.
  // Al revés, si Google cortara entre las dos operaciones, el consolidado se
  // quedaría vacío hasta la pasada siguiente.
  if (filas.length) {
    registro.getRange(2, 1, filas.length, HEADERS.length).setValues(filas);
  }
  const sobran = registro.getLastRow() - (filas.length + 1);
  if (sobran > 0) {
    registro.getRange(filas.length + 2, 1, sobran, HEADERS.length).clearContent();
  }
  formatoImportes_(registro);

  // El resumen también se revisa aquí: si no, una línea nueva de concepto no
  // aparecía hasta que alguien registrara un movimiento.
  asegurarResumen_(maestra);
  actualizarMovimientosVenta_(maestra);

  return { filas: filas.length, sedes: sedesLeidas };
}


/** Devuelve la pestaña de movimientos de venta, creándola si no existe. */
function getHojaMovimientos_(maestra) {
  let hoja = maestra.getSheetByName(MOVIMIENTOS_NAME);
  if (!hoja) {
    const antigua = maestra.getSheetByName(MOVIMIENTOS_NAME_ANTERIOR);
    if (antigua) {
      antigua.setName(MOVIMIENTOS_NAME);
      hoja = antigua;
    }
  }
  if (!hoja) {
    hoja = maestra.insertSheet(MOVIMIENTOS_NAME);
  }
  if (hoja.getLastRow() === 0) {
    hoja.appendRow(MOV_HEADERS);
  }
  hoja.getRange(1, 1, 1, MOV_HEADERS.length)
    .setValues([MOV_HEADERS])
    .setFontWeight('bold')
    .setFontColor('#ffffff')
    .setBackground('#4f81bd')
    .setVerticalAlignment('middle')
    .setWrap(true);
  hoja.setFrozenRows(1);
  hoja.setFrozenColumns(3);
  return hoja;
}

/**
 * Rehace la lista juntando el histórico y los movimientos de venta del
 * sistema nuevo, conservando lo que se haya escrito en la columna
 * "Venta no concretada".
 */
function actualizarMovimientosVenta_(maestra) {
  const hoja = getHojaMovimientos_(maestra);

  // 1. Lo que ya hay, para no perder las marcas escritas a mano.
  const marcas = {};
  const ultima = hoja.getLastRow();
  if (ultima > 1) {
    const previo = hoja.getRange(2, 1, ultima - 1, MOV_HEADERS.length).getValues();
    previo.forEach(function(f) {
      const codigo = String(f[MOV_COL_CODIGO - 1] || '').trim();
      const marca = String(f[MOV_COL_MARCA - 1] || '').trim();
      if (codigo && marca) marcas[codigo] = marca;
    });
  }

  const filas = [];

  function filaVacia() {
    const f = new Array(MOV_HEADERS.length);
    for (let i = 0; i < f.length; i++) f[i] = '';
    return f;
  }

  // 2. Histórico: lista cerrada, una fila por matrícula. El cash viene en
  //    negativo, así que se pasa a positivo para que sume con el nuevo.
  const hist = maestra.getSheetByName(HISTORICO_NAME);
  if (hist && hist.getLastRow() > 1) {
    const ancho = Math.max(hist.getLastColumn(), HIST_COL_FECHA_VENTA);
    const datos = hist.getRange(2, 1, hist.getLastRow() - 1, ancho).getValues();
    datos.forEach(function(f) {
      const matricula = String(f[HIST_COL_MATRICULA - 1] || '').trim();
      if (!matricula) return;
      const cash = -(Number(f[HIST_COL_TOTAL_CASH - 1]) || 0);
      const fila = filaVacia();
      fila[MOV_COL_ORIGEN - 1] = ORIGEN_HISTORICO;
      fila[MOV_COL_CODIGO - 1] = matricula;
      fila[MOV_COL_MATRICULA - 1] = matricula;
      fila[MOV_COL_FECHA - 1] = f[HIST_COL_FECHA_VENTA - 1] || '';
      fila[5] = f[HIST_COL_RESPONSABLE - 1] || '';
      fila[MOV_COL_HIST_OTROS - 1] = Number(f[HIST_COL_OTROS - 1]) || 0;
      fila[MOV_COL_HIST_CASH - 1] = cash;
      fila[MOV_COL_TOTAL - 1] = cash;   // "Cash Otros" queda fuera a propósito
      fila[MOV_COL_MARCA_HIST - 1] = String(f[HIST_COL_NO_CONCRETADA - 1] || '').trim();
      filas.push(fila);
    });
  }

  // 3. Sistema nuevo: una fila por movimiento de caja.
  const registro = getHojaRegistro_(maestra);
  if (registro.getLastRow() > 1) {
    const datos = registro.getRange(2, 1, registro.getLastRow() - 1, HEADERS.length).getValues();
    datos.forEach(function(f) {
      const concepto = String(f[COL_CONCEPTO - 1] || '').trim();
      const signo = CONCEPTOS_VENTA[concepto];
      if (!signo) return;
      const codigo = String(f[1] || '').trim();
      const matricula = String(f[6] || '').trim();
      if (!codigo || !matricula) return;
      const importe = signo * (Number(f[COL_IMPORTE - 1]) || 0);
      const fila = filaVacia();
      fila[MOV_COL_ORIGEN - 1] = ORIGEN_ACTUAL;
      fila[MOV_COL_CODIGO - 1] = codigo;
      fila[MOV_COL_MATRICULA - 1] = matricula;
      fila[MOV_COL_FECHA - 1] = f[COL_FECHA_MOV - 1] || '';
      fila[4] = f[2] || '';
      fila[5] = f[3] || '';
      fila[6] = concepto;
      fila[MOV_COL_ACTUAL - 1] = importe;
      fila[MOV_COL_TOTAL - 1] = importe;
      filas.push(fila);
    });
  }

  // 4. Se devuelve a cada fila su marca, buscándola por código.
  const vivos = {};
  filas.forEach(function(fila) {
    const codigo = String(fila[MOV_COL_CODIGO - 1]);
    vivos[codigo] = true;
    fila[MOV_COL_MARCA - 1] = marcas[codigo] || '';
  });

  // 5. Si un movimiento marcado desaparece de su sede, la fila se conserva
  //    con un aviso: borrarla en silencio escondería que alguien anuló algo.
  Object.keys(marcas).forEach(function(codigo) {
    if (vivos[codigo]) return;
    const fila = filaVacia();
    fila[MOV_COL_ORIGEN - 1] = ORIGEN_SIN;
    fila[MOV_COL_CODIGO - 1] = codigo;
    fila[MOV_COL_TOTAL - 1] = 0;
    fila[MOV_COL_MARCA - 1] = marcas[codigo];
    fila[MOV_COL_AVISO - 1] = 'Este movimiento ya no existe en su sede';
    filas.push(fila);
  });

  // 6. El histórico arriba y el sistema nuevo abajo; dentro de cada bloque,
  //    por fecha. La marca viaja dentro de la fila, así que ordenar no la
  //    descoloca.
  const orden = {};
  orden[ORIGEN_HISTORICO] = 0;
  orden[ORIGEN_ACTUAL] = 1;
  orden[ORIGEN_SIN] = 2;
  filas.sort(function(a, b) {
    const ga = orden[a[MOV_COL_ORIGEN - 1]];
    const gb = orden[b[MOV_COL_ORIGEN - 1]];
    if (ga !== gb) return ga - gb;
    const fa = a[MOV_COL_FECHA - 1];
    const fb = b[MOV_COL_FECHA - 1];
    const va = (fa instanceof Date) ? fa.getTime() : Number.MAX_SAFE_INTEGER;
    const vb = (fb instanceof Date) ? fb.getTime() : Number.MAX_SAFE_INTEGER;
    if (va !== vb) return va - vb;
    return String(a[MOV_COL_CODIGO - 1]).localeCompare(String(b[MOV_COL_CODIGO - 1]));
  });

  // 7. Escribir primero y limpiar el sobrante después, igual que en el
  //    consolidado: así la lista nunca queda vacía a medias.
  if (filas.length) {
    hoja.getRange(2, 1, filas.length, MOV_HEADERS.length).setValues(filas);
  }
  const sobran = hoja.getLastRow() - (filas.length + 1);
  if (sobran > 0) {
    hoja.getRange(filas.length + 2, 1, sobran, MOV_HEADERS.length).clearContent();
  }

  formatoMovimientos_(hoja, filas.length);
  return filas.length;
}

function formatoMovimientos_(hoja, cuantas) {
  const filas = Math.max(cuantas, 1);
  const total = filas + 1;
  // Los negativos en rojo: las devoluciones se ven de un vistazo.
  const EUROS = '#,##0.00\u00a0€;[Red]-#,##0.00\u00a0€';

  hoja.getRange(2, MOV_COL_FECHA, filas, 1).setNumberFormat('dd/mm/yyyy');
  hoja.getRange(2, MOV_COL_HIST_OTROS, filas, 4).setNumberFormat(EUROS);
  hoja.getRange(2, MOV_COL_TOTAL, filas, 1).setFontWeight('bold');

  // Desplegable en la columna que se rellena a mano, para que el texto sea
  // siempre el mismo y el consolidado pueda filtrarlo sin sorpresas.
  hoja.getRange(2, MOV_COL_MARCA, filas, 1).setDataValidation(
    SpreadsheetApp.newDataValidation()
      .requireValueInList([MARCA_NO_CONCRETADA], true)
      .setAllowInvalid(false)
      .setHelpText('Marca aquí las operaciones que no deben entrar en la conciliación de la venta.')
      .build());

  // Franjas alternas, para seguir la fila con la vista.
  const bandas = hoja.getBandings();
  const rangoTodo = hoja.getRange(1, 1, total, MOV_HEADERS.length);
  if (bandas.length) {
    bandas[0].setRange(rangoTodo);
  } else {
    rangoTodo.applyRowBanding(SpreadsheetApp.BandingTheme.LIGHT_GREY, true, false);
  }

  // Filtro, solo si no hay uno puesto: si se recreara en cada pasada, se
  // perderían los filtros que alguien estuviera usando en ese momento.
  if (!hoja.getFilter()) {
    rangoTodo.createFilter();
  }

  // --- Colores ---------------------------------------------------------
  const reglas = [];
  const marcadas = [
    hoja.getRange(2, MOV_COL_MARCA_HIST, filas, 1),
    hoja.getRange(2, MOV_COL_MARCA, filas, 1),
  ];
  reglas.push(SpreadsheetApp.newConditionalFormatRule()
    .whenTextEqualTo(MARCA_NO_CONCRETADA)
    .setBackground('#f4cccc')
    .setFontColor('#990000')
    .setBold(true)
    .setRanges(marcadas)
    .build());

  // Toda la fila en rosa cuando la operación está anulada por cualquiera de
  // las dos vías: así se ve que ese dinero no cuenta. El separador de
  // argumentos depende de la configuración regional de la hoja, igual que en
  // el resumen, así que se averigua en vez de darlo por supuesto.
  const sep = separadorArgumentos_(hoja);
  const colHist = colLetra_(MOV_COL_MARCA_HIST);
  const colMan = colLetra_(MOV_COL_MARCA);
  reglas.push(SpreadsheetApp.newConditionalFormatRule()
    .whenFormulaSatisfied('=OR($' + colHist + '2="' + MARCA_NO_CONCRETADA + '"' + sep +
      '$' + colMan + '2="' + MARCA_NO_CONCRETADA + '")')
    .setBackground('#fce8e6')
    .setRanges([hoja.getRange(2, 1, filas, MOV_COL_ACTUAL)])
    .build());

  reglas.push(SpreadsheetApp.newConditionalFormatRule()
    .whenCellNotEmpty()
    .setBackground('#fff2cc')
    .setFontColor('#7f6000')
    .setRanges([hoja.getRange(2, MOV_COL_AVISO, filas, 1)])
    .build());

  reglas.push(SpreadsheetApp.newConditionalFormatRule()
    .whenTextEqualTo(ORIGEN_HISTORICO)
    .setFontColor('#1f3864')
    .setRanges([hoja.getRange(2, MOV_COL_ORIGEN, filas, 1)])
    .build());

  reglas.push(SpreadsheetApp.newConditionalFormatRule()
    .whenTextEqualTo(ORIGEN_ACTUAL)
    .setFontColor('#0b6b3a')
    .setRanges([hoja.getRange(2, MOV_COL_ORIGEN, filas, 1)])
    .build());

  hoja.setConditionalFormatRules(reglas);

  hoja.setColumnWidth(MOV_COL_ORIGEN, 130);
  hoja.setColumnWidth(MOV_COL_CODIGO, 170);
  hoja.setColumnWidth(7, 230);
  hoja.setColumnWidth(MOV_COL_HIST_OTROS, 130);
  hoja.setColumnWidth(MOV_COL_HIST_CASH, 150);
  hoja.setColumnWidth(MOV_COL_ACTUAL, 130);
  hoja.setColumnWidth(MOV_COL_TOTAL, 120);
  hoja.setColumnWidth(MOV_COL_MARCA_HIST, 190);
  hoja.setColumnWidth(MOV_COL_MARCA, 170);
  hoja.setColumnWidth(MOV_COL_AVISO, 250);
  hoja.setRowHeight(1, 42);
}
