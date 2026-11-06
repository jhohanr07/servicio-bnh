// Envío de correos por SMTP (nodemailer).
let transporte = null;

function obtener() {
  if (!transporte) {
    const { SMTP_HOST, SMTP_PORT, SMTP_USER, SMTP_PASS } = process.env;
    if (!SMTP_USER || !SMTP_PASS) throw new Error('Faltan SMTP_USER y SMTP_PASS para enviar correos.');
    const nodemailer = require('nodemailer');
    const puerto = parseInt(SMTP_PORT || '465', 10);
    transporte = nodemailer.createTransport({
      host: SMTP_HOST || 'smtp.gmail.com', port: puerto, secure: puerto === 465,
      auth: { user: SMTP_USER, pass: SMTP_PASS }
    });
  }
  return transporte;
}

// { to, subject, body (texto), htmlBody, cc }
async function enviar(o) {
  const from = process.env.MAIL_FROM || process.env.SMTP_USER;
  await obtener().sendMail({ from, to: o.to, cc: o.cc, subject: o.subject, text: o.body, html: o.htmlBody });
}

module.exports = { enviar };
