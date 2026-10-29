# Publicar en Vercel

El proyecto queda preparado como sitio Vite estático más una función Node/Express para `/api/*`. Los datos continúan en Google Sheets mediante Apps Script; Vercel no guarda pedidos en el disco local.

## Antes de publicar

1. En Apps Script, pega y guarda el contenido actual de `apps-script/Code.gs`.
2. Confirma que las propiedades del proyecto Apps Script tengan `GAS_SHARED_SECRET` y `SPREADSHEET_ID`.
3. Publica una nueva versión como aplicación web. Conserva la URL `/exec`; será el valor de `GAS_WEB_APP_URL`.
4. Sube el proyecto a un repositorio Git privado o público. Verifica que `.env` no esté incluido. El archivo está excluido por `.gitignore`; nunca subas secretos.
5. En [Vercel](https://vercel.com/new), importa el repositorio y deja la raíz del proyecto como directorio raíz.

La configuración ya establece `npm run build`, salida `dist`, Node.js 22 y las rutas `/admin` y `/api/*`. No configures un comando de inicio para un servidor permanente: Vercel ejecuta la API como función.

## Variables de entorno en Vercel

En **Project → Settings → Environment Variables**, agrega estos valores para **Production** y también para **Preview** si quieres probar enlaces de vista previa:

| Variable | Valor |
| --- | --- |
| `GAS_WEB_APP_URL` | URL de la implementación de Apps Script que termina en `/exec` |
| `GAS_SHARED_SECRET` | El mismo secreto largo configurado en Apps Script |
| `SESSION_SECRET` | Secreto aleatorio nuevo de 32 caracteres o más; distinto al anterior |
| `INITIAL_ADMIN_USERNAME` | Usuario inicial de administración |
| `INITIAL_ADMIN_PASSWORD` | Clave inicial larga y única; la hoja ya guarda credenciales, pero déjala configurada para una instalación nueva |
| `PUBLIC_SITE_URL` | URL HTTPS de producción, por ejemplo `https://tu-proyecto.vercel.app` |
| `WOMPI_ENV` | `test` mientras pruebas; cambia a `prod` solo al activar Wompi real |
| `WOMPI_PUBLIC_KEY` | Llave pública del mismo ambiente elegido arriba |
| `WOMPI_INTEGRITY_SECRET` | Secreto de integridad del mismo ambiente |
| `WOMPI_EVENTS_SECRET` | Secreto de eventos/webhook del mismo ambiente |
| `WOMPI_REDIRECT_URL` | URL base HTTPS del sitio, sin parámetros, por ejemplo `https://tu-proyecto.vercel.app/` |

No agregues `API_PORT` en Vercel. Después de cambiar cualquier variable debes volver a desplegar.

## Primera publicación y configuración de Wompi

1. Crea el proyecto en Vercel e ingresa primero las variables de Apps Script, sesiones y administrador.
2. Haz el deploy y abre `https://tu-proyecto.vercel.app/admin`.
3. Comprueba inicio de sesión, lectura de pedidos y configuración de pagos. En **Pagos**, puedes añadir hasta diez destinatarios para las notificaciones y enviar un correo de prueba.
4. En Vercel, guarda el dominio definitivo en `PUBLIC_SITE_URL` y `WOMPI_REDIRECT_URL`, y vuelve a desplegar.
5. En el panel de Wompi del ambiente correspondiente, configura el webhook en `https://tu-proyecto.vercel.app/api/webhooks/wompi` y usa el secreto de eventos de ese ambiente en `WOMPI_EVENTS_SECRET`.
6. Prueba una compra con llaves de prueba antes de cambiar `WOMPI_ENV` y las llaves a producción.

El correo de confirmación y la URL de retorno usan el dominio de `PUBLIC_SITE_URL`. Mantén ese dominio estable una vez publiques enlaces a compradores.

## Imágenes

Las imágenes de más de 2.8 MB se optimizan en el navegador a WebP antes de enviarse. El archivo original se acepta hasta 8 MB. Esto mantiene el cuerpo enviado a Vercel bajo su límite de 4.5 MB. Los archivos extremadamente difíciles de comprimir muestran un error en la pantalla en vez de fallar con una respuesta 413.

## Prueba local

`npm run dev:all` inicia Vite y la API local. Vite pasa las llamadas `/api` a Express en el puerto 8787. Las variables locales se cargan desde `.env`; no copies ese archivo al repositorio.

## Cambios de código posteriores

Cada vez que modifiques `apps-script/Code.gs`, publica una nueva versión de la aplicación web Apps Script. Cada vez que modifiques el proyecto, sube los cambios a Git para que Vercel cree un Preview; después de revisarlo, promuévelo a Production.
