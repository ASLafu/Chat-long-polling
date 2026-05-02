// ============================================================
//  Ejercicio: REST vs Long Polling – Servidor Chat
//  Dos paneles de chat lado a lado:
//    - Izquierda: REST clásico (petición → respuesta inmediata)
//    - Derecha:   Long Polling (el servidor retiene la conexión
//                 hasta que llega un mensaje nuevo)
// ============================================================
'use strict';

const path    = require('path');
const express = require('express');
const app     = express();
const PORT    = 4000;

app.use(express.json());
app.use(express.static(path.join(__dirname)));

// ── Almacén de mensajes ─────────────────────────────────────
const restMessages = [];   // historial REST
const lpMessages   = [];   // historial Long Polling

// ── Clientes Long Polling en espera ─────────────────────────
let waitingClients = [];   // [{ res, timer }]

// ============================================================
//  REST – POST /api/rest/mensaje
//  El cliente envía un mensaje y recibe respuesta al instante.
//  GET /api/rest/mensajes devuelve todo el historial.
// ============================================================
app.post('/api/rest/mensaje', (req, res) => {
  const msg = {
    id: restMessages.length + 1,
    usuario: req.body.usuario || 'Anónimo',
    texto: req.body.texto || '',
    timestamp: Date.now(),
  };
  restMessages.push(msg);
  res.json({ ok: true, mensaje: msg });
});

app.get('/api/rest/mensajes', (_req, res) => {
  res.json({ ok: true, mensajes: restMessages });
});

// ============================================================
//  LONG POLLING
//
//  POST /api/lp/mensaje   → Publica un mensaje.
//                            Se entrega a TODOS los clientes suscritos.
//
//  GET  /api/lp/esperar?desde=ID
//       → El cliente se queda esperando hasta que haya mensajes
//         con id > desde.  Si ya los hay, responde al instante.
//         Si no, retiene la conexión hasta 25 s (timeout).
// ============================================================

app.post('/api/lp/mensaje', (req, res) => {
  const msg = {
    id: lpMessages.length + 1,
    usuario: req.body.usuario || 'Anónimo',
    texto: req.body.texto || '',
    timestamp: Date.now(),
  };
  lpMessages.push(msg);

  // Despertar a TODOS los clientes en espera
  const clients = waitingClients.splice(0);
  clients.forEach(c => {
    clearTimeout(c.timer);
    c.res.json({ ok: true, mensajes: [msg] });
  });

  res.json({ ok: true, mensaje: msg });
});

app.get('/api/lp/esperar', (req, res) => {
  const desde = parseInt(req.query.desde) || 0;

  // ¿Ya hay mensajes nuevos? → devolver al instante
  const nuevos = lpMessages.filter(m => m.id > desde);
  if (nuevos.length > 0) {
    return res.json({ ok: true, mensajes: nuevos });
  }

  // Si no, retener la conexión hasta 25 s
  const timer = setTimeout(() => {
    waitingClients = waitingClients.filter(c => c.res !== res);
    res.json({ ok: true, mensajes: [], timeout: true });
  }, 25_000);

  waitingClients.push({ res, timer });

  req.on('close', () => {
    clearTimeout(timer);
    waitingClients = waitingClients.filter(c => c.res !== res);
  });
});

// ── Reset ───────────────────────────────────────────────────
app.post('/api/reset', (_req, res) => {
  restMessages.length = 0;
  lpMessages.length   = 0;
  waitingClients.forEach(c => {
    clearTimeout(c.timer);
    c.res.json({ ok: true, mensajes: [], reset: true });
  });
  waitingClients = [];
  res.json({ ok: true });
});

// ── Arrancar ────────────────────────────────────────────────
app.listen(PORT, () => {
  console.log(`
╔═══════════════════════════════════════════════════════╗
║   Chat REST vs Long Polling                           ║
║   Abre en el navegador: http://localhost:${PORT}        ║
╚═══════════════════════════════════════════════════════╝
  `);
});
