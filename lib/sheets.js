// Acceso a Google Sheets por la API REST con una cuenta de servicio.
const { desdeSerie } = require('./util');

const COLUMNAS_FECHA = ['Fecha', 'Fecha límite SLA', 'Fecha de atencion', 'Fecha cierre', 'Fecha de la visita', 'Última alerta'];
let jwt = null;

function idLibro() {
  const id = process.env.SPREADSHEET_ID;
  if (!id) throw new Error('Falta la variable SPREADSHEET_ID.');
  return id;
}

function credenciales() {
  if (process.env.GOOGLE_SERVICE_ACCOUNT_JSON) {
    let j;
    try { j = JSON.parse(process.env.GOOGLE_SERVICE_ACCOUNT_JSON); }
    catch (e) { throw new Error('GOOGLE_SERVICE_ACCOUNT_JSON no es un JSON válido.'); }
    return { email: j.client_email, key: j.private_key };
  }
  if (process.env.GOOGLE_CLIENT_EMAIL && process.env.GOOGLE_PRIVATE_KEY) {
    return { email: process.env.GOOGLE_CLIENT_EMAIL, key: process.env.GOOGLE_PRIVATE_KEY.replace(/\\n/g, '\n') };
  }
  throw new Error('Falta GOOGLE_SERVICE_ACCOUNT_JSON (credenciales de la cuenta de servicio).');
}

async function token() {
  if (!jwt) {
    const { JWT } = require('google-auth-library');
    const c = credenciales();
    jwt = new JWT({ email: c.email, key: c.key, scopes: ['https://www.googleapis.com/auth/spreadsheets'] });
  }
  const t = await jwt.getAccessToken();
  return t.token || t;
}

async function llamar(metodo, ruta, cuerpo, intento) {
  intento = intento || 0;
  const r = await fetch('https://sheets.googleapis.com/v4/spreadsheets/' + idLibro() + ruta, {
    method: metodo,
    headers: { Authorization: 'Bearer ' + await token(), 'Content-Type': 'application/json' },
    body: cuerpo ? JSON.stringify(cuerpo) : undefined
  });
  if ((r.status === 429 || r.status >= 500) && intento < 2) {
    await new Promise(ok => setTimeout(ok, 800 * (intento + 1)));
    return llamar(metodo, ruta, cuerpo, intento + 1);
  }
  const j = await r.json().catch(() => ({}));
  if (!r.ok) {
    const msg = (j.error && j.error.message) || ('Error ' + r.status);
    if (r.status === 403) throw new Error('Sin permiso para el libro: comparte el Sheet con el correo de la cuenta de servicio (' + msg + ')');
    if (r.status === 400 && /Unable to parse range/i.test(msg)) throw new Error('Falta la hoja o el rango no existe: ' + msg);
    throw new Error('Google Sheets: ' + msg);
  }
  return j;
}

const q = nombre => "'" + String(nombre).replace(/'/g, "''") + "'";
function letra(n) {
  let s = '';
  while (n > 0) { const r = (n - 1) % 26; s = String.fromCharCode(65 + r) + s; n = Math.floor((n - 1) / 26); }
  return s;
}

// Valores de un rango. formateado=true devuelve el texto tal como se ve en la hoja.
async function valores(rango, formateado) {
  const p = formateado ? 'valueRenderOption=FORMATTED_VALUE' : 'valueRenderOption=UNFORMATTED_VALUE&dateTimeRenderOption=SERIAL_NUMBER';
  const j = await llamar('GET', '/values/' + encodeURIComponent(rango) + '?' + p);
  return j.values || [];
}

async function encabezados(nombre) {
  const v = await valores(q(nombre) + '!1:1');
  return (v[0] || []).map(x => String(x).trim());
}

// Filas como objetos { _fila, <encabezado>: valor }. Las columnas de fecha numéricas se convierten a Date.
async function leer(nombre) {
  const v = await valores(q(nombre));
  if (!v.length) throw new Error('Falta la hoja "' + nombre + '" o está vacía.');
  const h = v[0].map(x => String(x).trim());
  return v.slice(1).map((r, i) => {
    const o = { _fila: i + 2 };
    h.forEach((k, j) => {
      let x = r[j] === undefined ? '' : r[j];
      if (typeof x === 'number' && COLUMNAS_FECHA.indexOf(k) >= 0) x = desdeSerie(x);
      o[k] = x;
    });
    return o;
  }).filter(o => String(o[h[0]]).trim() !== '');
}

async function colDe(nombre, columna) {
  const h = await encabezados(nombre);
  const i = h.indexOf(columna);
  if (i < 0) throw new Error('Falta la columna "' + columna + '" en la hoja ' + nombre + '.');
  return i + 1;
}

// Agrega la columna al final del encabezado si la hoja no la tiene; devuelve su número
async function asegurarColumna(nombre, columna) {
  const h = await encabezados(nombre);
  const i = h.indexOf(columna);
  if (i >= 0) return i + 1;
  const n = h.length + 1;
  await celdas(nombre, [{ fila: 1, col: n, valor: columna }]);
  return n;
}

async function agregarFila(nombre, obj) {
  const h = await encabezados(nombre);
  const fila = h.map(k => obj[k] === undefined ? '' : obj[k]);
  await llamar('POST', '/values/' + encodeURIComponent(q(nombre) + '!A1') +
    ':append?valueInputOption=RAW&insertDataOption=INSERT_ROWS', { values: [fila] });
}

// cambios = [{ fila, col, valor }]
async function celdas(nombre, cambios) {
  if (!cambios.length) return;
  await llamar('POST', '/values:batchUpdate', {
    valueInputOption: 'RAW',
    data: cambios.map(c => ({ range: q(nombre) + '!' + letra(c.col) + c.fila, values: [[c.valor]] }))
  });
}

module.exports = { valores, leer, colDe, asegurarColumna, agregarFila, celdas, encabezados, letra, q };
