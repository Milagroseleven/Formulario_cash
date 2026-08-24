# Registro de movimientos de caja

Formulario web para que cada sede de **Sanchoyjote S.L.** (NIF B72770191)
registre los movimientos de efectivo —ingresos y salidas— desde el móvil o el
ordenador. Cada envío deja una fila en un Google Sheet y sube la imagen del
justificante a Drive, en la carpeta que corresponde según el concepto.

Está construido sobre Google Apps Script, igual que el formulario de vouchers
de TPV del repositorio `conciliacion-ventas`.

## Archivos

| Archivo | Qué es |
| --- | --- |
| [`Code.gs`](Code.gs) | Lógica del servidor: validaciones, escritura en el Sheet, rutas y nombres de archivo en Drive. La tabla de conceptos está aquí, en `CONCEPTOS`. |
| [`Index.html`](Index.html) | El formulario que ve el usuario. Lee los conceptos desde `Code.gs`, así que un concepto nuevo se agrega en un solo sitio. |
| [`appsscript.json`](appsscript.json) | Configuración del proyecto de Apps Script (zona horaria y permisos). |

Cuidado con `Index.html`: si le haces clic desde aquí, el navegador **lo
muestra como página web** en vez del código, porque es un archivo HTML. Para
ver el código, ábrelo desde el Explorador con clic derecho → **Abrir con →
Bloc de notas**.

## Campos del formulario

| Nº | Campo | Cuándo aparece | Obligatorio |
| --- | --- | --- | --- |
| 1 | Sede (Barcelona, Madrid, Sevilla, Valencia) | Siempre | Sí |
| 2 | Responsable | Siempre | Sí |
| 3 | Tipo de movimiento (Ingreso / Salida de efectivo) | Siempre | Sí |
| 4 | Tipo de ingreso / Tipo de salida de efectivo | Al elegir el campo 3 | Sí |
| 5 | Matrícula | Según el concepto | Según el concepto |
| 6 | Detalle | Según el concepto | Según el concepto |
| 7 | Sede de origen del cash | "Ingreso de cash de otra sede" | Sí |
| — | Código del envío | "Ingreso de cash de otra sede" | No |
| 8 | Sede de destino del cash | "Envío de cash a otra sede" | Sí |
| 9 | Nombre de empleado | "Pago al personal interno" | Sí |
| 10 | Importe (€) | Siempre | Sí |
| 11 | Fecha | Siempre | Sí |
| 12 | Imagen del justificante | Siempre | Sí en ingresos, opcional en salidas |
| 13 | Tipo de justificante | Solo en salidas (en ingresos es una nota) | Sí |

Los campos 7 y 8 solo ofrecen las **otras tres sedes**, nunca la elegida en el
campo 1.

### Conceptos, campos derivados y destino en Drive

**Ingreso de efectivo** — el justificante siempre es "Imagen de cash" y la
imagen es obligatoria.

| Concepto | Matrícula | Detalle | Campo extra | Carpeta | Nombre del archivo |
| --- | --- | --- | --- | --- | --- |
| Reserva de moto | Obligatoria | Opcional | — | Reserva - Venta de moto | `4321 XYZ - Cash reserva moto - fecha y hora` |
| Venta de moto | Obligatoria | Opcional | — | Reserva - Venta de moto | `4321 XYZ - Cash venta moto - fecha y hora` |
| Mantenimiento | Obligatoria | Opcional | — | Reserva - Venta de moto | `4321 XYZ - Cash mantenimiento moto - fecha y hora` |
| Ingreso de cash de otra sede | — | Opcional | Sede de origen | Otros | `Cash ingreso de sede - Sede - fecha y hora` |
| Ajuste contable de caja | — | Obligatorio | — | Otros | `Cash ajuste contable caja ingreso - fecha y hora` |
| Otros | Opcional | Obligatorio | — | Otros | `Cash otros ingresos - fecha y hora` |

**Salida de efectivo** — la carpeta depende de si el justificante es factura.

| Concepto | Matrícula | Detalle | Campo extra | ¿Admite factura? | Carpeta | Nombre del archivo |
| --- | --- | --- | --- | --- | --- | --- |
| Gastos operativos / Servicios | — | Obligatorio | — | Sí | Gastos con factura / Gastos sin factura | `Cash Gasto operativo - con o sin factura - fecha y hora` |
| Compra de moto | Obligatoria | Opcional | — | Sí | Gastos con factura / Gastos sin factura | `4321 XYZ - Cash compra moto - con o sin factura - fecha y hora` |
| Devolución a cliente - reserva | Obligatoria | Opcional | — | No | Otros | `4321 XYZ - Cash devolución de reserva cliente - fecha y hora` |
| Devolución a cliente - venta cancelada | Obligatoria | Opcional | — | No | Otros | `4321 XYZ - Cash devolución de venta cliente - fecha y hora` |
| Devolución a cliente - pago en exceso | Obligatoria | Opcional | — | No | Otros | `4321 XYZ - Cash devolución pago en exceso cliente - fecha y hora` |
| Envío de cash a otra sede | — | Opcional | Sede de destino | No | Otros | `Cash envío a sede - Sede - fecha y hora` |
| Ajuste contable de caja | — | Obligatorio | — | No | Otros | `Cash ajuste contable caja salida - fecha y hora` |
| Pago al personal interno | — | Opcional | Nombre de empleado | No | Otros | `Cash pago a personal interno - Nombre empleado - fecha y hora` |
| Otros | Opcional | Obligatorio | — | Sí | Gastos con factura / Otros | `Cash otras salidas - con o sin factura - fecha y hora` |

La ruta completa es:

```
Caja <Sede> / Ingreso Caja / <carpeta>
Caja <Sede> / Salida Caja / <carpeta>
```

Por ejemplo: `Caja Valencia / Salida Caja / Gastos con factura`.

**Las carpetas se crean solas** la primera vez que hace falta cada una. Si
prefieres que vivan en un sitio concreto (por ejemplo dentro de una unidad
compartida), crea antes las carpetas `Caja Barcelona`, `Caja Madrid`,
`Caja Sevilla` y `Caja Valencia` donde quieras: el formulario busca por
nombre y usa las que ya existan.

### Tipo de justificante (campo 13)

- **En un ingreso** no hay nada que elegir: aparece la nota "Subir imagen de
  cash" y la imagen pasa a ser obligatoria. En el Sheet se guarda
  "Imagen de cash".
- **En una salida de las que admiten factura** (gastos operativos, compra de
  moto y otras salidas) hay que elegir entre:
  1. Factura / ticket de gasto a nombre de Sanchoyjote S.L. - NIF B72770191
  2. Proforma, albarán, imagen del cash, sin justificante, otros

  Sin imagen subida, la opción 1 está deshabilitada y queda marcada la 2. Al
  subir la imagen se habilita la 1 y **se libera la selección**, para que
  elija a conciencia.
- **En el resto de las salidas** (devoluciones, envíos entre sedes, ajustes y
  pagos al personal) no se elige nada: el justificante siempre es el tipo 2 y
  el formulario lo muestra como una nota.

## Columnas del Sheet

Cada envío agrega una fila en la pestaña **Registro**:

`Fecha registro` · `ID movimiento` · `Sede` · `Responsable` ·
`Tipo de movimiento` · `Concepto` · `Matrícula` · `Detalle` ·
`Sede origen / destino` · `Código de envío` · `Nombre de empleado` ·
`Importe (EUR)` · `Importe con signo` · `Fecha del movimiento` ·
`Tipo de justificante` · `Justificante (Drive)`

- **Importe (EUR)** siempre va en positivo. **Importe con signo** repite el
  valor en negativo cuando es una salida, para poder sumar la columna directo
  y obtener el saldo de caja.
- **ID movimiento** (`MOV-20260824-A1B2`) se le muestra al usuario al
  terminar, con un botón para copiarlo. En un envío de cash a otra sede, el
  formulario le pide expresamente que se lo pase al responsable de la sede
  que recibe el dinero; esa sede lo escribe en **Código del envío** al
  registrar su ingreso, y así las dos filas quedan emparejadas.

## Despliegue (una sola vez)

1. Crea un Google Sheet nuevo en blanco y nómbralo, por ejemplo,
   **"Movimientos de caja"**.
2. Dentro del Sheet: menú **Extensiones → Apps Script**.
3. Borra el contenido del archivo `Código.gs` y pega el de `Code.gs`.
4. Botón **+** junto a "Archivos" → **HTML** → nómbralo exactamente `Index`
   (sin extensión) y pega el contenido de `Index.html`.
5. Engranaje ⚙️ (Configuración del proyecto) → marca **"Mostrar archivo de
   manifiesto 'appsscript.json' en el editor"**. Vuelve al Editor, abre el
   `appsscript.json` que aparece en la lista y reemplaza su contenido por el
   de este repositorio.
6. Guarda todo (Ctrl+S).
7. **Implementar → Nueva implementación** → Tipo: **Aplicación web** →
   Ejecutar como: **Yo** → Quién tiene acceso: **Cualquier usuario**.
   Autoriza los permisos de Sheets y Drive cuando Google los pida.
8. Copia el enlace que termina en `/exec`: ese es el que se comparte.

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
  movimiento (que queda en el Sheet).
