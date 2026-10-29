# Pagos manuales por Nequi

El checkout crea el pedido en Google Sheets con estado `PENDING`. El comprador ve el QR estatico, el numero y el titular configurados por el administrador. Despues de revisar el movimiento en Nequi, un administrador confirma el pedido desde la dashboard. Esa confirmacion genera y guarda el codigo de cuatro digitos; la pagina del comprador lo muestra junto al telefono registrado. El comprobante enviado por el cliente no cambia el estado por si solo.

## Activar la conexion

1. Copia el contenido actualizado de `apps-script/Code.gs` completo en el proyecto de Apps Script asociado a `GAS_WEB_APP_URL`.
2. Guarda el proyecto, ejecuta `authorizeDriveAccess` y acepta el permiso de Drive.
3. En **Implementar > Administrar implementaciones**, edita la aplicacion web y publica una **Nueva version**. Conserva la URL `/exec` configurada en `.env`.
4. Inicia el servidor y entra a `/#admin` con la cuenta administradora.
5. Abre la pestaña **Pagos**. Guarda el numero de Nequi y el nombre del titular, y sube el QR de la cuenta. El QR se guarda en Drive y su enlace junto con el numero y el titular se guardan en la hoja `Configuracion`.
6. Haz una compra de prueba. Verifica el ingreso en Nequi y, desde **Compradores**, pulsa **Confirmar pago** en la fila correcta. Solo entonces se genera y revela el codigo de acceso.

La imagen del QR se comparte como **cualquiera con el enlace puede ver** para que el comprador pueda escanearla. Los datos del destinatario aparecen en la pantalla de pago. Usa durante la prueba solo una cuenta autorizada para recibir ese dinero; para cambiar de titular, actualiza la configuracion de pago.

## Importante

- El pago y la confirmacion de ingreso son manuales. Un QR estatico no permite que la web detecte automaticamente una transferencia.
- Confirma el movimiento en tu app Nequi antes de marcarlo aprobado. No uses una captura del comprobante como unica verificacion.
- La aprobacion del pedido y el estado de desembolso son campos separados en `Pedidos`.
- El servidor valida los precios contra su catalogo seguro. Los cambios de precios hechos solo en la dashboard local pueden ser rechazados por el checkout; sincroniza el catalogo antes de vender productos con precios modificados.
- El sitio no integra PayPal.
