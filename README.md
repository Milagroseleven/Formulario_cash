# Registro de movimientos de caja

Formulario web para que cada sede registre los movimientos de efectivo
—ingresos y salidas— desde el móvil o el ordenador. Cada envío deja una fila
en un Google Sheet y sube la imagen del justificante a Drive.

Está construido sobre Google Apps Script, igual que el formulario de vouchers
de TPV y el de pagos en efectivo del repositorio `conciliacion-ventas`.

## Archivos

| Archivo | Qué es |
| --- | --- |
| [`Code.gs`](Code.gs) | Lógica del servidor: validaciones, escritura en el Sheet y subida a Drive. La lista de conceptos y sus campos derivados está aquí, en `CONCEPTOS`. |
| [`Index.html`](Index.html) | El formulario que ve el usuario. Lee los conceptos desde `Code.gs`, así que no hay que tocar dos sitios para cambiar un concepto. |
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
| 8 | Sede de destino del cash | "Envío de cash a otra sede" | Sí |
| 9 | Nombre de empleado | "Pago al personal interno" | Sí |
| 10 | Importe (€) | Siempre | Sí |
| 11 | Fecha | Siempre | Sí |
| 12 | Imagen del justificante | Siempre | Sí en ingresos, opcional en salidas |
| 13 | Tipo de justificante | Solo en salidas (en ingresos es una nota) | Sí |

Los campos 7 y 8 solo ofrecen las **otras tres sedes**, nunca la elegida en
el campo 1.

### Conceptos y campos derivados

**Ingreso de efectivo**

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

### Tipo de justificante (campo 13)

- **En un ingreso** no hay nada que elegir: aparece la nota "Subir imagen de
  cash" y la imagen del campo 12 pasa a ser obligatoria. En el Sheet se
  guarda "Imagen de cash".
- **En una salida** hay que elegir una de las dos opciones:
  1. Factura / ticket de gasto a nombre de Sanchoyjote SL
  2. Proforma, albarán, imagen del cash, sin justificante, otros

  Mientras no se haya subido una imagen en el campo 12, la opción 1 está
  deshabilitada y la 2 queda marcada. Al subir la imagen se habilita la
  opción 1 y se puede cambiar.

## Columnas del Sheet

Cada envío agrega una fila en la pestaña **Registro**:

`Fecha registro` · `ID movimiento` · `Sede` · `Responsable` ·
`Tipo de movimiento` · `Concepto` · `Matrícula` · `Detalle` ·
`Sede origen / destino` · `Nombre de empleado` · `Importe (EUR)` ·
`Importe con signo` · `Fecha del movimiento` · `Tipo de justificante` ·
`Justificante (Drive)`

- **Importe (EUR)** siempre va en positivo. **Importe con signo** repite el
  valor en negativo cuando es una salida, para poder sumar la columna directo
  y obtener el saldo de caja.
- **ID movimiento** es una referencia única (`MOV-fecha-hora-XXXX`) que se le
  muestra al usuario al terminar. Sirve para emparejar a mano los envíos de
  cash entre sedes, que hoy se cargan como dos movimientos separados.

Las imágenes quedan en Drive en `Movimientos de Caja / <Sede> / <año-mes>`,
con el nombre `fecha - concepto - matrícula - ID`.

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

## Pendiente de confirmar

Lo siguiente está resuelto con un criterio propio y es fácil de cambiar:

- **Nombre del formulario**: "Registro de movimientos de caja" (el esquema no
  lo indicaba).
- **CIF de la empresa**: el campo 13 menciona "(incluye CIF de la empresa)".
  Hoy el texto no muestra ningún CIF concreto; falta el número para añadirlo.
- **Responsable** y **Nombre de empleado** son campos de texto libre, tal
  como estaban en el esquema. Un desplegable evitaría variantes del mismo
  nombre.
- **Envío de cash entre sedes**: cada sede carga su movimiento por separado y
  se emparejan por el ID. No se genera automáticamente la fila de la otra
  sede.
- **Fechas futuras**: no se permiten.
- La imagen **no** se descarga al móvil de quien la sube, a diferencia del
  formulario de vouchers de TPV.
