# Sistema de tickets de servicio técnico – BNH Medical

Versión para **Vercel** del sistema que antes vivía en Google Apps Script. Los datos siguen en tu Google Sheet
(`Sistema_Tickets_Servicio_Tecnico`): Vercel lo lee y lo escribe con una cuenta de servicio de Google.

| Dirección | Qué es |
|---|---|
| `/` | Formulario del cliente (reportar falla) |
| `/panel` | Panel de casos (pide la clave) |
| `/dashboard` | Dashboard (misma clave) |
| `/tecnico?id=…&t=…` | Página del técnico; se abre desde el botón "Abrir Ticket" del correo |

## Estructura

```
public/        index.html, dashboard.html, tecnico.html  (las páginas)
api/rpc.js     las páginas llaman aquí
api/cron-alertas.js   revisión automática de casos sin respuesta (Vercel Cron)
lib/           core.js (reglas del sistema), sheets.js, mail.js, util.js
test/prueba.js prueba con un libro simulado:  npm test
```

## 1. Cuenta de servicio de Google (una sola vez)

1. En https://console.cloud.google.com crea un proyecto y activa **Google Sheets API**.
2. IAM y administración > Cuentas de servicio > **Crear cuenta de servicio**. Luego, en la pestaña **Claves**, crea una clave **JSON** y descárgala.
3. Abre tu Google Sheet > **Compartir** > agrega el correo de la cuenta de servicio (`...@...iam.gserviceaccount.com`) como **Editor**.
4. Zona horaria del libro: Archivo > Configuración > **(GMT-04:00) Caracas**.
5. El ID del libro es lo que está entre `/d/` y `/edit` en la URL del Sheet.

El libro debe tener las hojas `TICKETS`, `TECNICOS`, `ESTADOS`, `DATA CLIENTE` y `Sales` con los mismos encabezados de siempre.
Si falta la columna **Última alerta** en TICKETS, el sistema la crea solo.

## 2. Subir a GitHub

```bash
git init
git add .
git commit -m "Sistema de tickets de servicio técnico"
git branch -M main
git remote add origin https://github.com/TU_USUARIO/NOMBRE_DEL_REPO.git
git push -u origin main
```

(Crea antes el repositorio vacío en github.com > New repository. El archivo `.env` está en `.gitignore`: las claves nunca se suben.)

## 3. Desplegar en Vercel

1. vercel.com > **Add New > Project** > importa el repositorio. Framework: **Other**. No hace falta comando de build.
2. En **Settings > Environment Variables** crea las variables de `.env.example`:
   `SPREADSHEET_ID`, `GOOGLE_SERVICE_ACCOUNT_JSON` (pega todo el JSON), `CLAVE_PANEL`, `TOKEN_SECRET`, `CRON_SECRET`,
   `SMTP_USER`, `SMTP_PASS`, `MAIL_FROM` y, si quieres, `CORREO_ADMIN`.
3. **Deploy**. Después de cambiar variables, haz Redeploy.

Correo: con Gmail usa una *contraseña de aplicación* (cuenta de Google con verificación en dos pasos) en `SMTP_PASS`.

## Alertas automáticas

`vercel.json` programa una revisión **una vez al día (8:00 a. m. hora de Caracas)**. Avisa por correo de los casos sin
fecha de atención con más de 72 h y repite cada 24 h. El plan gratuito de Vercel solo permite una ejecución diaria;
con el plan Pro puedes cambiar `"0 12 * * *"` por `"*/15 * * * *"` (y poner `ALERTAS_CADA_MINUTOS=15`).
El botón "Enviar alertas ahora" del dashboard sigue funcionando.

## Diferencias respecto a Apps Script

- Las fechas nuevas se guardan como **texto** `dd/MM/yyyy HH:mm`. Las fechas reales que ya tengas en la hoja se siguen leyendo bien.
- La caché de clientes y equipos dura 30 minutos por instancia (no existe el menú "Actualizar datos").
- No hay bloqueo entre envíos simultáneos: si dos clientes reportan en el mismo segundo podría repetirse un número de ticket (poco probable con este volumen).
- Los enlaces "Abrir Ticket" enviados desde Apps Script dejarán de funcionar: el token ahora se firma con `TOKEN_SECRET`.
