# Registro de movimientos de caja

Formulario web para que cada sede de **Sanchoyjote S.L.** (NIF B72770191)
registre los movimientos de efectivo —ingresos y salidas— desde el móvil o el
ordenador. Cada envío deja una fila en un Google Sheet y sube la imagen del
justificante a Drive, en la carpeta que corresponde según el concepto.

Está construido sobre Google Apps Script. Más adelante se migrará a la
intranet, junto al formulario de TPV.

**Enlace del formulario** (el que se comparte con las sedes):
https://script.google.com/macros/s/AKfycbx5xatnl1HS94_mOePUwgEFXtiAJGWzNKfp2v-1iYhtoGaCs_g8-xEvAeIcZ27IQJxpzw/exec

## Código QR

Para pegar en cada sede: [`cartel-qr.html`](cartel-qr.html) es una hoja A4
lista para imprimir, con el QR y las instrucciones básicas. El QR suelto está
en [`qr-formulario.png`](qr-formulario.png) (para WhatsApp o para meterlo en
otro documento) y en [`qr-formulario.svg`](qr-formulario.svg) (vectorial, si
hay que ampliarlo mucho sin que pierda calidad).

Los tres apuntan al enlace de arriba. **Si algún día se crea una implementación
nueva en vez de una versión nueva, el enlace cambia y hay que regenerarlos.**

## Archivos

| Archivo | Qué es |
| --- | --- |
| [`Code.gs`](Code.gs) | Lógica del servidor: configuración por sede, validaciones, escritura en las hojas, rutas y nombres de archivo en Drive. |
| [`Index.html`](Index.html) | El formulario que ve el usuario. Lee los conceptos desde `Code.gs`, así que un concepto nuevo se agrega en un solo sitio. |
| [`appsscript.json`](appsscript.json) | Configuración del proyecto de Apps Script (zona horaria y permisos). |

Cuidado con `Index.html`: si le haces clic desde aquí, el navegador **lo
muestra como página web** en vez del código, porque es un archivo HTML. Para
ver el código, ábrelo desde el Explorador con clic derecho → **Abrir con →
Bloc de notas**.

## Cada jefe ve solo su sede

En Drive y en Sheets los permisos se dan por carpeta y por archivo, no por
pestaña. Por eso el reparto es:

| Qué | Contiene | Se comparte con |
| --- | --- | --- |
| Carpeta de la sede (`Caja Barcelona`, `Caja Madrid`, …) | Las imágenes de esa sede | El jefe de esa sede |
| Hoja de la sede | Solo los movimientos de esa sede | El jefe de esa sede |
| Hoja maestra (donde vive el script) | Todos los movimientos de todas las sedes | Contabilidad y dirección |

Cada envío se escribe **dos veces**: en la hoja de su sede y en la maestra.

Todo esto se declara en `SEDES_CONFIG`, al principio de `Code.gs`:

```javascript
const SEDES_CONFIG = {
  'Barcelona': { carpetaId: '1iOV6t…', hojaId: '1B6Qc9…' },
  ...
};
```

Las cuatro sedes ya están configuradas con sus carpetas y hojas.

- **`carpetaId`**: el ID de la carpeta de esa sede, esté donde esté (incluso
  en una unidad compartida). Si se deja vacío, el formulario busca una
  carpeta llamada `Caja <Sede>` y, si no existe, la crea en la unidad de la
  cuenta que despliega.
- **`hojaId`**: el ID del Google Sheet propio de esa sede. Si se deja vacío,
  el movimiento solo se escribe en la hoja maestra.

El ID es el trozo largo de la dirección:

```
drive.google.com/drive/folders/ESTO_ES_EL_ID
docs.google.com/spreadsheets/d/ESTO_ES_EL_ID/edit
```

### Sede habitual de cada cuenta

`USUARIOS`, justo debajo, asocia correos con sedes:

```javascript
const USUARIOS = {
  'diego.seminario@motickfamily.com': 'Madrid',
  ...
};
```

Sirve para dos cosas, y **ninguna de las dos restringe nada**:

1. Al abrir el formulario, la sede viene ya elegida.
2. Si se cambia a otra sede, aparece un aviso en amarillo: "Tu cuenta es de
   la sede Valencia y estás registrando un movimiento en Madrid. Puedes
   continuar, pero comprueba que sea correcto".

Quien no esté en la lista abre el formulario con la sede sin elegir y no ve
ningún aviso. Para dar de alta a alguien, basta con añadir su línea.

Esto depende de que Google entregue el correo de quien abre la página, cosa
que solo ocurre dentro del mismo dominio de Workspace. Como todas las cuentas
son `@motickfamily.com`, funciona.

Importante: el formulario se ejecuta **con la cuenta que lo despliega**, así
que esa cuenta necesita permiso de edición sobre todas las carpetas y todas
las hojas. Los jefes no necesitan permiso sobre nada para poder registrar:
solo lo necesitan para *consultar* lo suyo.

## Campos del formulario

| Nº | Campo | Cuándo aparece | Obligatorio |
| --- | --- | --- | --- |
| 1 | Sede (Barcelona, Madrid, Sevilla, Valencia) | Siempre | Sí |
| 2 | Responsable | Siempre | Sí |
| 3 | Tipo de movimiento (Ingreso / Salida de efectivo) | Siempre | Sí |
| 4 | Tipo de ingreso / Tipo de salida de efectivo | Al elegir el campo 3 | Sí |
| 5 | Matrícula (con formato validado) | Según el concepto | Según el concepto |
| 6 | Detalle | Según el concepto | Según el concepto |
| 7 | Sede de origen del cash | "Ingreso de cash de otra sede" | Sí |
| — | Código del envío | "Ingreso de cash de otra sede" | No |
| 8 | Sede de destino del cash | "Envío de cash a otra sede" | Sí |
| 9 | Nombre de empleado | "Pago al personal interno" | Sí |
| 10 | Importe (€) | Siempre | Sí |
| 11 | Fecha | Siempre | Sí |
| 12 | Imagen del justificante / Documentación de la salida | Siempre | Sí en ingresos; en salidas, adjuntar o declarar que no hay |
| 13 | ¿Es factura a nombre de la empresa? | Solo en salidas, y solo si se adjunta algo | Sí |

Los campos 7 y 8 solo ofrecen las **otras tres sedes**, nunca la elegida en el
campo 1.

### Conceptos y campos derivados

**Ingreso de efectivo** — el justificante siempre es "Imagen de cash" y la
imagen es obligatoria.

| Concepto | Matrícula | Detalle | Campo extra |
| --- | --- | --- | --- |
| Reserva de moto | Obligatoria | Opcional | — |
| Venta de moto | Obligatoria | Opcional | — |
| Mantenimiento | Obligatoria | Opcional | — |
| Ingreso de cash de otra sede | — | Opcional | Sede de origen |
| Ajuste contable de caja | — | Obligatorio | — |
| Otros | Opcional | Obligatorio | — |

**Salida de efectivo**

| Concepto | Matrícula | Detalle | Campo extra |
| --- | --- | --- | --- |
| Gastos operativos / Servicios | — | Obligatorio | — |
| Compra de moto | Obligatoria | Opcional | — |
| Devolución a cliente - reserva | Obligatoria | Opcional | — |
| Devolución a cliente - venta cancelada | Obligatoria | Opcional | — |
| Devolución a cliente - pago en exceso | Obligatoria | Opcional | — |
| Envío de cash a otra sede | — | Opcional | Sede de destino |
| Ajuste contable de caja | — | Obligatorio | — |
| Pago al personal interno | — | Opcional | Nombre de empleado |
| Otros | Opcional | Obligatorio | — |

### Matrícula (campo 5)

Se comprueba el formato, en el navegador y otra vez en el servidor. Se
admiten los cuatro formatos que se usan en la empresa:

| Formato | Ejemplo |
| --- | --- |
| 4 cifras + 3 letras | `3720 KDV` |
| Provincia + cifras | `A 108859` |
| Provincia + 4 cifras + 2 letras | `M 8214 YV` |
| Provincia + 4 cifras + 3 letras | `C 2107 BWM` |

Cuando la misma moto se vende más de una vez, se añade el número de la
operación al final: `3720 KDV 2`, `A 108859 3`.

Antes de comprobar se normaliza lo escrito: se pasa a mayúsculas, se
sustituyen guiones y puntos por espacios, y si viene todo junto se separan
los bloques (`3720kdv` queda como `3720 KDV`). Al salir del campo se ve ya
corregido, y si no encaja en ningún formato el campo se marca en rojo con el
aviso debajo, sin esperar a que pulse Enviar. Al empezar a corregir, el aviso
desaparece.

Al elegir **Venta de moto** aparece en gris debajo del desplegable:
*Incluye transporte, pack urban, etc.* El texto vive en el campo `nota` del
concepto, aparte de `nombre`. Lo que se guarda en la hoja y lo que suma el
resumen es siempre `nombre` —"Venta de moto" a secas—, así que la aclaración
se puede cambiar sin romper nada de lo ya registrado.

Dentro de un desplegable no se puede poner parte del texto en otro color: por
eso la aclaración va debajo y no entre paréntesis en la propia opción.

### Documentación (campos 12 y 13)

**En un ingreso** el campo se llama "Foto del efectivo recibido", con el texto
"Adjunta una foto del efectivo correspondiente a este ingreso". La foto es
obligatoria y no hay nada que elegir. En la hoja se guarda "Imagen de cash".

**En una salida** el campo se llama "Documentación de la salida" y se puede
adjuntar tanto una foto como un archivo (por ejemplo un PDF). Hay dos
caminos, y uno de los dos es obligatorio:

1. **Adjuntar algo.** Entonces se pregunta: *¿El documento adjunto es una
   factura emitida a nombre de Sanchoyjote S.L. (NIF: B72770191)?* con las
   opciones **Sí** y **No**. La respuesta decide en qué carpeta de Drive se
   archiva. Al adjuntar se limpia cualquier respuesta anterior, para que
   elija a conciencia.
2. **Marcar "No se cuenta con documentación para esta salida".** Se guarda como
   "Sin documentación" y no se sube ningún archivo. Marcarlo descarta lo que
   se hubiera adjuntado antes, y adjuntar algo desmarca la casilla: las dos
   opciones son excluyentes.

Justo debajo de la etiqueta, y visible en todo momento —incluso cuando se
marca que no hay documentación, que es cuando más conviene leerlo—: *"Prioriza
siempre la factura o comprobante de pago. Si no dispones de ellos, adjunta
igualmente cualquier evidencia disponible (proforma, albarán, recibo, captura
u otro soporte)."*

Los valores que se guardan en la columna **Tipo de justificante** son:
`Imagen de cash`, `Factura a nombre de Sanchoyjote S.L. - NIF B72770191`,
`Otra documentación (no es factura a nombre de la empresa)` y
`Sin documentación`.

## Dónde se guardan las imágenes

La ruta es:

```
<carpeta de la sede> / Ingreso Caja / <subcarpeta>
<carpeta de la sede> / Salida Caja / <subcarpeta>
```

Por ejemplo: `Caja Valencia / Salida Caja / Gastos con factura`. Las
subcarpetas se crean solas la primera vez que hace falta cada una.

El archivo conserva su extensión original, así que un PDF se guarda como
PDF y se abre bien desde Drive.

**Ingresos**

| Concepto | Subcarpeta | Nombre del archivo |
| --- | --- | --- |
| Reserva de moto | Reserva - Venta de moto | `4321 XYZ - Cash reserva moto - fecha y hora` |
| Venta de moto | Reserva - Venta de moto | `4321 XYZ - Cash venta moto - fecha y hora` |
| Mantenimiento | Mantenimiento | `4321 XYZ - Cash mantenimiento moto - fecha y hora` |
| Ingreso de cash de otra sede | Otros | `Cash ingreso de sede - Sede - fecha y hora` |
| Ajuste contable de caja | Otros | `Cash ajuste contable caja ingreso - fecha y hora` |
| Otros | Otros | `Cash otros ingresos - fecha y hora` |

**Salidas** — con factura siempre van a `Gastos con factura`; sin factura,
depende del concepto:

| Concepto | Subcarpeta sin factura | Nombre del archivo |
| --- | --- | --- |
| Gastos operativos / Servicios | Gastos sin factura | `Cash Gasto operativo - con o sin factura - fecha y hora` |
| Compra de moto | Gastos sin factura | `4321 XYZ - Cash compra moto - con o sin factura - fecha y hora` |
| Devolución a cliente - reserva | Otros | `4321 XYZ - Cash devolución de reserva cliente - fecha y hora` |
| Devolución a cliente - venta cancelada | Otros | `4321 XYZ - Cash devolución de venta cliente - fecha y hora` |
| Devolución a cliente - pago en exceso | Otros | `4321 XYZ - Cash devolución pago en exceso cliente - fecha y hora` |
| Envío de cash a otra sede | Otros | `Cash envío a sede - Sede - fecha y hora` |
| Ajuste contable de caja | Otros | `Cash ajuste contable caja salida - fecha y hora` |
| Pago al personal interno | Otros | `Cash pago a personal interno - Nombre empleado - fecha y hora` |
| Otros | Otros | `Cash otras salidas - con o sin factura - fecha y hora` |

En los conceptos cuyo nombre de archivo no lleva "con o sin factura", el
sufijo `- con factura` se añade igualmente cuando se marca esa opción, para
que el archivo no acabe en `Gastos con factura` sin que el nombre lo diga.

## Pestaña "Resumen"

Cada hoja —la maestra y la de cada sede— tiene una segunda pestaña con el
resumen por conceptos:

- **Fecha de inicio** y **fecha de fin** en las dos celdas amarillas de
  arriba. Si se dejan vacías, se cuenta todo el histórico.
- Un bloque de **ingresos** y otro de **salidas**, con una línea por
  concepto, sus totales y el **saldo** final.

Está hecho con fórmulas (`SUMIFS`), no con valores copiados: se actualiza
solo según entran movimientos, y basta con cambiar las fechas de corte para
ver otro periodo. No hay que volver a ejecutar nada.

Para crearlo la primera vez, o para rehacerlo si se añaden conceptos nuevos,
se ejecuta **`crearResumenes`** desde el editor de Apps Script: seleccionar
esa función en el desplegable de arriba y pulsar **Ejecutar**. Lo crea en la
hoja maestra y en las cuatro de sede de una vez, y de paso ordena los
registros y convierte a fecha las que hubieran quedado como texto.

## Columnas de las hojas

Tanto la hoja maestra como la de cada sede tienen la pestaña **Registro** con
estas columnas:

`Fecha registro` · `ID movimiento` · `Sede` · `Responsable` ·
`Tipo de movimiento` · `Concepto` · `Matrícula` · `Detalle` ·
`Sede origen / destino` · `Código de envío` · `Nombre de empleado` ·
`Importe (EUR)` · `Importe con signo` · `Fecha del movimiento` ·
`Tipo de justificante` · `Justificante (Drive)`

- Las dos columnas de importe se muestran en euros con dos decimales
  (`1.234,56 €`), igual que las cifras del resumen.
- **Importe (EUR)** siempre va en positivo. **Importe con signo** repite el
  valor en negativo cuando es una salida, para poder sumar la columna directo
  y obtener el saldo de caja.
- **Fecha del movimiento** se guarda como fecha de verdad, no como texto, y
  las filas quedan **ordenadas de la más antigua a la más reciente** después
  de cada envío. Da igual el orden en que se registren.
- **ID movimiento** (`MOV-20260824-A1B2`) identifica cada fila. Solo se le
  muestra al usuario, con un botón para copiarlo, cuando el movimiento es un
  envío de cash a otra sede: en el resto de los casos no le sirve de nada. En un envío de cash a otra sede, el
  formulario le indica expresamente que lo copie y se lo envíe al responsable
  de la sede de destino; esa sede lo escribe en **Código del envío** al
  registrar su ingreso, y así las dos filas quedan emparejadas.

## El consolidado recoge las correcciones de las sedes

Cada envío escribe la fila en la hoja de su sede **y** en la maestra. A partir
de ahí son dos copias independientes: si la sede corrige un importe, la
maestra se quedaría con el valor viejo.

Para evitarlo, `sincronizarMaestra()` rehace la pestaña **Registro** de la
maestra con lo que haya en ese momento en las cuatro hojas de sede. Recoge
correcciones, filas borradas y filas añadidas a mano.

**La hoja maestra pasa a ser de solo lectura.** Lo que se escriba
directamente en ella se pierde en la siguiente sincronización: las
correcciones se hacen siempre en la hoja de la sede.

Dos maneras de lanzarla:

- **Automática**: un activador cada 10 minutos. Se añade una sola vez desde
  el editor de Apps Script → **Activadores** (icono del reloj) → *Añadir
  activador* → función `sincronizarMaestra`, origen *Basado en tiempo*,
  *Temporizador por minutos*, *Cada 10 minutos*.
- **A mano**: en la hoja maestra, menú **Caja → Actualizar consolidado
  ahora**. Solo funciona para quien tenga acceso a las cuatro hojas de sede.

Salvaguardas:

- Si alguna hoja de sede no se puede leer, **se cancela entera** sin tocar el
  consolidado. Es preferible tenerlo desactualizado a que le falte una sede
  por un fallo pasajero.
- La primera vez guarda una pestaña `Registro (copia previa)` con lo que
  hubiera antes, por si alguna fila antigua no estuviera en ninguna sede. Se
  puede borrar cuando se compruebe que todo cuadra.

## Velocidad de guardado

Cada envío hace unas diez operaciones contra Google (subir el archivo, buscar
las carpetas, crear el archivo, escribir en dos hojas), y cada una es una ida
y vuelta. Para que no se haga larga la espera:

- **La foto se encoge en el propio móvil** antes de subirla: se reduce a
  1600 px de lado mayor y se recomprime en JPEG. Una foto de móvil pasa de
  varios MB a unos cientos de KB, sin perder legibilidad. Los PDF y demás
  archivos se suben tal cual.
- **Las subcarpetas de Drive se recuerdan** por su ID en vez de buscarlas por
  nombre en cada envío. Si alguien las borra o las mueve fuera, se detecta al
  fallar y se vuelven a buscar.
- **Solo se reordena la hoja cuando hace falta.** Lo normal es registrar un
  movimiento de hoy, que ya entra al final; solo se reordena al registrar una
  fecha atrasada.
- Mientras se envía se explica en qué paso va, para que la espera se entienda.

Para medir cuánto tarda de verdad: en el editor de Apps Script, sección
**Ejecuciones**, sale la duración real de cada envío.

## Despliegue (una sola vez)

1. Crea el Google Sheet **maestro** en blanco y nómbralo, por ejemplo,
   "Movimientos de caja - todas las sedes". Compártelo solo con contabilidad
   y dirección.
2. Las carpetas y las hojas de cada sede ya están creadas y configuradas en
   `Code.gs`. Solo hay que comprobar que cada una esté compartida con su jefe
   y que la cuenta que despliega tenga permiso de edición sobre todas.
3. Dentro del Sheet maestro: menú **Extensiones → Apps Script**.
4. Borra el contenido del archivo `Código.gs` y pega el de `Code.gs`.
   `SEDES_CONFIG` ya trae los IDs de las cuatro sedes.
5. Botón **+** junto a "Archivos" → **HTML** → nómbralo exactamente `Index`
   (sin extensión) y pega el contenido de `Index.html`.
6. Engranaje ⚙️ (Configuración del proyecto) → marca **"Mostrar archivo de
   manifiesto 'appsscript.json' en el editor"**. Vuelve al Editor, abre el
   `appsscript.json` que aparece en la lista y reemplaza su contenido por el
   de este repositorio.
7. Guarda todo (Ctrl+S).
8. **Implementar → Nueva implementación** → Tipo: **Aplicación web** →
   Ejecutar como: **Yo** → Quién tiene acceso: **Cualquier usuario**.
   Autoriza los permisos de Sheets y Drive cuando Google los pida.
9. Copia el enlace que termina en `/exec`: ese es el que se comparte.

Para que un cambio posterior llegue al enlace ya compartido:
**Implementar → Administrar implementaciones → editar (lápiz) → Nueva
versión → Implementar**. Si creas una implementación nueva, el enlace cambia.

## Decisiones tomadas

- El importe se guarda en positivo, con una columna extra que le pone el
  signo.
- Los envíos de cash entre sedes se cargan como dos movimientos separados,
  emparejados por el código.
- La matrícula muestra el formato esperado (`1111 AAA` / `A 1111 AAA`) pero no
  se rechaza lo que se escriba: solo se pasa a mayúsculas.
- No se permiten fechas futuras.
- La imagen no se descarga al móvil de quien la sube, a diferencia del
  formulario de vouchers de TPV.
- "Responsable" y "Nombre de empleado" son campos de texto libre.
- La fecha y hora del nombre del archivo es la del **registro**, no la del
  movimiento (que queda en la hoja).
