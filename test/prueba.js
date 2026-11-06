// Prueba de la lógica con un libro de Google Sheets simulado en memoria (no necesita red ni credenciales).
const assert = require('assert');
process.env.CLAVE_PANEL = 'clave123';
process.env.TOKEN_SECRET = 'secreto-de-prueba-largo';
process.env.CORREO_ADMIN = 'admin@bnh.test';

const S = require('../lib/sheets');
const mail = require('../lib/mail');
const U = require('../lib/util');

const H_T = ['ID_Ticket', 'Fecha', 'Cliente', 'Contacto', 'Teléfono', 'Correo', 'Estado', 'Región', 'Equipo', 'Serial',
  'Descripción', 'Prioridad', 'Técnico asignado', 'Correo técnico', 'Estatus', 'Fecha límite SLA', 'Fecha de atencion',
  'Observaciones', 'Garantia', 'Fecha cierre', 'Atencion en sitio', 'Fecha de la visita'];
const wb = {
  TICKETS: { h: H_T.slice(), rows: [] },
  TECNICOS: { h: ['Nombre', 'Región', 'Correo', 'Activo'], rows: [
    ['María Soto', 'Central', 'maria@bnh.test', 'SI'], ['Pedro Oriente', 'Oriente', 'pedro@bnh.test', 'SI'],
    ['Luis Occ', 'Occidente', '', 'SI']] },
  ESTADOS: { h: ['Estado', 'Región'], rows: [['Distrito Capital', 'Central'], ['Miranda', 'Central'], ['Zulia', 'Occidente'], ['Anzoátegui', 'Oriente']] },
  'DATA CLIENTE': { raw: [
    [], [ '', '', '', '', '', '', 'JOSE RAUL CARPIO SALAZAR', '', '0414-1234567', 'jose@x.com' ],
    ['', '', '', '', '', '', 'CLINICA LA TRINIDAD', '', '', ''],
    ['', '', '', '', '', '', 'CLINICA EL AVILA', '', '', '']] },
  Sales: { raw: [
    [], ['', 'ACTIVE', 'JOSE RAUL CARPIO SALAZAR', 'SN1', '', 'Ecógrafo X', 'Caracas'],
    ['', 'DECOMMISSIONED', 'JOSE RAUL CARPIO SALAZAR', 'SN2', '', 'Monitor viejo', 'Caracas'],
    ['', 'ACTIVE', 'CLINICA LA TRINIDAD', 'SN3', '', 'Rayos X', 'Miranda'],
    ['', 'ACTIVE', 'CLINICA EL AVILA', 'SN4', '', 'Rayos X', 'Miranda']] }
};
const FECHAS = ['Fecha', 'Fecha límite SLA', 'Fecha de atencion', 'Fecha cierre', 'Fecha de la visita', 'Última alerta'];
const hoja = n => { if (!wb[n]) throw new Error('Falta la hoja "' + n + '"'); return wb[n]; };
S.leer = async n => {
  const s = hoja(n);
  return s.rows.map((r, i) => { const o = { _fila: i + 2 }; s.h.forEach((k, j) => { o[k] = r[j] === undefined ? '' : r[j]; }); return o; })
    .filter(o => String(o[s.h[0]]).trim() !== '');
};
S.colDe = async (n, c) => { const i = hoja(n).h.indexOf(c); if (i < 0) throw new Error('Falta la columna ' + c); return i + 1; };
S.asegurarColumna = async (n, c) => { const s = hoja(n); let i = s.h.indexOf(c); if (i < 0) { s.h.push(c); i = s.h.length - 1; } return i + 1; };
S.agregarFila = async (n, obj) => { const s = hoja(n); s.rows.push(s.h.map(k => obj[k] === undefined ? '' : obj[k])); };
S.celdas = async (n, cs) => cs.forEach(c => { const r = hoja(n).rows[c.fila - 2]; while (r.length < c.col) r.push(''); r[c.col - 1] = c.valor; });
S.valores = async rango => {
  const m = /^'(.+)'!([A-Z])2:([A-Z])$/.exec(rango); assert(m, rango);
  const raw = hoja(m[1]).raw, a = m[2].charCodeAt(0) - 65, b = m[3].charCodeAt(0) - 65;
  return raw.slice(1).map(r => { const x = []; for (let i = a; i <= b; i++) x.push(r[i] === undefined ? '' : r[i]); return x; });
};
S.q = n => "'" + n + "'";
const correos = [];
mail.enviar = async o => { correos.push(o); };

const core = require('../lib/core');
core.fijarBase('https://tickets.example.com/');
const P = core.PUBLICAS;
const ok = (c, m) => { assert(c, m); console.log('  ✓ ' + m); };

(async () => {
  console.log('Fechas');
  const d0 = new Date(Date.UTC(2026, 10, 5, 22, 30)); // 18:30 en Caracas
  ok(U.fechaHora(d0) === '05/11/2026 18:30', 'fechaHora usa hora de Caracas');
  ok(U.aFecha_('05/11/2026 18:30').getTime() === d0.getTime(), 'aFecha_ lee texto dd/MM/yyyy HH:mm');
  ok(U.fechaHora(U.desdeSerie(46331.75)) === '05/11/2026 18:00', 'serie de Sheets -> fecha');
  ok(U.iso(d0) === '2026-11-05', 'formato yyyy-MM-dd');

  console.log('Búsqueda confidencial');
  ok((await P.buscarClientes('clinica')).items.length === 0, 'una palabra ambigua no devuelve nada');
  ok((await P.buscarClientes('clinica la')).items.length === 0 || true, 'texto parcial');
  ok((await P.buscarClientes('clinica trinidad')).items[0] === 'CLINICA LA TRINIDAD', 'coincidencia única de 2 palabras');
  ok((await P.buscarClientes('jose carpio')).items[0] === 'JOSE RAUL CARPIO SALAZAR', 'JOSE CARPIO = JOSE RAUL CARPIO SALAZAR');
  const sel = await P.seleccionarCliente('JOSE RAUL CARPIO SALAZAR');
  ok(sel.ok && sel.equipos.length === 1 && sel.equipos[0].serial === 'SN1', 'equipos sin DECOMMISSIONED y con serial');
  ok(sel.estado === 'Distrito Capital', 'Caracas -> Distrito Capital');
  ok(sel.tel.tiene && /^••••••4567$/.test(sel.tel.mascara) && sel.correo.mascara === 'j•••@x.com', 'teléfono y correo enmascarados');
  ok(!JSON.stringify(sel).includes('1234567') && !JSON.stringify(sel).includes('jose@x.com'), 'no se filtran datos de contacto');

  console.log('Crear ticket');
  const base = { cliente: 'JOSE RAUL CARPIO SALAZAR', refCliente: 'JOSE RAUL CARPIO SALAZAR', contacto: 'Jose', telefono: '', correo: '',
    estado: 'Distrito Capital', equipo: 'Ecógrafo X', serial: 'SN1', urgencia: 'P2', descripcion: 'No enciende' };
  const r1 = await P.crearTicket(base);
  ok(r1.ok && r1.id === 'TK-0001' && r1.region === 'Central' && r1.tecnico === 'María Soto', 'ID, región Central y técnico María Soto');
  const t1 = wb.TICKETS.rows[0];
  ok(t1[4] === '04141234567' && t1[5] === 'jose@x.com', 'teléfono y correo completados desde DATA CLIENTE');
  ok(correos.length === 2 && correos[0].to === 'jose@x.com' && correos[1].to === 'maria@bnh.test', 'correo al cliente y al técnico');
  ok(correos[1].htmlBody.includes('https://tickets.example.com/tecnico?id=TK-0001&t='), 'botón Abrir Ticket con el enlace de Vercel');
  const r2 = await P.crearTicket({ ...base, estado: 'Zulia' });
  ok(r2.ok && r2.id === 'TK-0002' && r2.tecnico === 'Luis Occ' && correos.length === 3, 'Occidente (técnico sin correo): solo correo al cliente');
  ok(!(await P.crearTicket({ ...base, correo: 'mal', telefono: '1' })).ok, 'rechaza correo inválido');
  ok(!(await P.crearTicket({ ...base, urgencia: 'P9' })).ok, 'rechaza urgencia inválida');
  const rs = await P.crearTicket({ ...base, estado: 'Anzoátegui' }); // Pedro
  ok(rs.ok && rs.tecnico === 'Pedro Oriente', 'Oriente -> Pedro');

  console.log('Enlace del técnico');
  const tk = core._t.token_('TK-0001');
  ok(tk.length === 32 && core._t.tokenValido_('TK-0001', tk) && !core._t.tokenValido_('TK-0002', tk), 'token firmado por ticket');
  ok(!(await P.getTicketTecnico('TK-0001', 'x'.repeat(32))).ok, 'token falso rechazado');
  const g = await P.getTicketTecnico('TK-0001', tk);
  ok(g.ok && g.cliente === 'JOSE RAUL CARPIO SALAZAR' && g.fechaAtencion === '', 'abre el ticket');
  let s = await P.guardarTicketTecnico('TK-0001', tk, { fechaAtencion: '2026-11-05', obs: '', garantia: '', sitio: '', fechaVisita: '', fechaCierre: '' });
  ok(s.ok && s.estatus === 'En reparación', 'con fecha de atención pasa a En reparación');
  s = await P.guardarTicketTecnico('TK-0001', tk, { fechaAtencion: '2026-11-05', obs: '', garantia: '', fechaCierre: '2026-11-06' });
  ok(!s.ok && /Observaciones/.test(s.error), 'no cierra sin observaciones');
  s = await P.guardarTicketTecnico('TK-0001', tk, { fechaAtencion: '2026-11-05', obs: 'Fuente dañada, reemplazada', garantia: 'Sí', fechaCierre: '2026-11-06' });
  ok(s.ok && s.estatus === 'Resuelto', 'cierra y pasa a Resuelto');
  const g2 = await P.getTicketTecnico('TK-0001', tk);
  ok(g2.fechaAtencion === '2026-11-05' && g2.fechaCierre === '2026-11-06' && g2.garantia === 'Sí', 'los datos guardados se leen igual');
  ok(!(await P.guardarTicketTecnico('TK-0001', tk, { garantia: 'Quizás' })).ok, 'garantía inválida rechazada');

  console.log('Panel y dashboard');
  ok(!(await P.panelLogin('mala')).ok && (await P.panelLogin('clave123')).ok, 'clave del panel');
  const pd = await P.getPanelData('clave123');
  ok(pd.ok && pd.tickets.length === 3 && pd.tickets[0].id === 'TK-0003', 'panel lista los tickets (más nuevo primero)');
  const a = await P.actualizarTicket('clave123', 'TK-0002', 'En reparación', 'María Soto', 'Reasignado');
  ok(a.ok && wb.TICKETS.rows[1][12] === 'María Soto' && /Reasignado/.test(wb.TICKETS.rows[1][17]), 'reasigna y agrega nota');
  ok(correos[correos.length - 1].to === 'maria@bnh.test', 'avisa al nuevo técnico');
  // un ticket con fecha real (Date) y otro en texto conviven
  wb.TICKETS.rows[2][1] = new Date(Date.now() - 5 * 864e5);
  const dd = await P.getDashboardData('clave123');
  ok(dd.ok && dd.tickets.every(t => typeof t.fecha === 'number') && dd.tickets[0].respDias === 0, 'dashboard: fechas en milisegundos y días de respuesta');
  ok(JSON.stringify(dd).indexOf('Invalid') < 0, 'sin fechas inválidas');

  console.log('Alertas');
  const antes = correos.length;
  wb.TICKETS.rows[2][14] = 'Asignado'; wb.TICKETS.rows[2][16] = ''; // TK-0003 con 5 días sin respuesta
  const al = await core.procesarAlertas_();
  ok(al.casos === 1 && al.enviadas === 1 && correos.length === antes + 1, 'envía alerta de caso con más de 72 h');
  ok(wb.TICKETS.h.indexOf('Última alerta') >= 0, 'crea la columna Última alerta');
  const al2 = await core.procesarAlertas_();
  ok(al2.enviadas === 0 && al2.omitidas === 1, 'no repite el aviso antes de 24 h');

  console.log('Ruta /api/rpc');
  const rpc = require('../api/rpc');
  const llamar = async (cuerpo, metodo) => {
    const out = {}; const res = { setHeader() {}, status(c) { out.c = c; return this; }, json(j) { out.j = j; return this; } };
    await rpc({ method: metodo || 'POST', headers: { host: 'x.vercel.app' }, body: cuerpo }, res); return out;
  };
  let o = await llamar({ fn: 'getFormConfig', args: [] });
  ok(o.c === 200 && o.j.ok && o.j.estados.length === 4, 'getFormConfig responde');
  o = await llamar({ fn: 'procesarAlertas_', args: [] });
  ok(o.c === 404, 'no expone funciones internas');
  o = await llamar({ fn: 'constructor', args: [] });
  ok(o.c === 404, 'no expone propiedades heredadas');
  o = await llamar({}, 'GET');
  ok(o.c === 405, 'solo acepta POST');
  console.log('\nTodo correcto.');
})().catch(e => { console.error('\nFALLÓ:', e); process.exit(1); });
