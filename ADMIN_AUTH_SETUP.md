# Configuracion de acceso administrativo

La dashboard valida la cuenta en el servidor. Google Sheets guarda el usuario, una sal aleatoria y un hash scrypt de la contrasena; nunca conserva la contrasena legible. La sesion queda en una cookie `HttpOnly` firmada por el servidor.

## Google Apps Script

1. Crea o selecciona el Google Sheet que usara el sitio.
2. Crea un proyecto de Apps Script y pega `apps-script/Code.gs`.
3. En **Configuracion del proyecto > Propiedades del script**, agrega:
   - `SPREADSHEET_ID`: ID del Sheet (el script tambien acepta la URL completa).
   - `GAS_SHARED_SECRET`: secreto aleatorio de al menos 32 caracteres.
4. Despliega como **Aplicacion web**, ejecutar como tu cuenta y acceso **Cualquier usuario**. El endpoint solo permite leer/escribir la hoja `Admin` cuando recibe el secreto del servidor; no configures el secreto en React ni lo copies a una hoja.
5. Copia la URL terminada en `/exec`.

## Servidor

1. Copia `.env.example` como `.env` (no subas `.env` a Git ni lo publiques).
2. Configura `GAS_WEB_APP_URL`, `GAS_SHARED_SECRET` (igual al de Apps Script) y un `SESSION_SECRET` diferente, aleatorio y de 32 caracteres o mas.
3. En el primer inicio, `INITIAL_ADMIN_USERNAME` y `INITIAL_ADMIN_PASSWORD` crean el administrador si la hoja `Admin` esta vacia. El ejemplo contiene `admin / admin123` solo para respetar la cuenta inicial solicitada; cambia esa clave por una fuerte antes de usarlo y elimina las variables iniciales del servidor despues de crear la fila.
4. Inicia el servidor y Vite con `npm run dev:all`. Para produccion, publica el frontend y el servidor bajo el mismo origen HTTPS, con `/api` dirigido al servidor Node.
5. Entra a `/#admin` y usa **Acceso y seguridad** para cambiar usuario y contrasena. Se solicita la contrasena actual y la nueva debe tener al menos 12 caracteres.

La cuenta no queda disponible hasta desplegar Apps Script y configurar las variables del backend. El servidor Node es obligatorio: no conectes React directamente al Apps Script ni pongas el secreto en variables `VITE_*`.

## Configuracion compartida del fondo de Invitados

El nuevo endpoint de Apps Script guarda el enlace de la imagen en la hoja `Configuracion` y el archivo en Drive. Despues de pegar el archivo actualizado, ejecuta `authorizeDriveAccess` una vez desde el editor de Apps Script y acepta el permiso de Drive; luego despliega una nueva version del Web App. Las imagenes subidas se comparten como **cualquiera con el enlace puede verlas**, porque deben ser visibles para los visitantes. Sube solo imagenes que quieras hacer publicas.

## Si aparece `output is not defined`

La URL activa esta ejecutando una version de Apps Script distinta o incompleta. Abre el proyecto asociado a `GAS_WEB_APP_URL`, reemplaza todo el contenido del archivo `.gs` por `apps-script/Code.gs`, guarda, y actualiza la implementacion existente con **Nueva version**. Confirma que el ID de la URL `/exec` siga siendo el mismo que esta en `.env`. La funcion `output` local debe aparecer al inicio de `doPost`; no cambies los secretos ni el ID del Sheet para corregir este error.

Si luego el endpoint devuelve `Unauthorized` como JSON, el codigo ya esta actualizado pero `GAS_SHARED_SECRET` no coincide exactamente entre `.env` y las propiedades del script.
