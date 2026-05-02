// ============================================================
//  Benchmark: 10.000 POST REST  vs  10.000 mensajes Long Polling
//
//  Uso:  node benchmark.js
//  Requisito: el servidor (servidor.js) debe estar corriendo.
// ============================================================
'use strict';

const http = require('http');

const HOST  = 'localhost';
const PORT  = 4000;
const TOTAL = 10_000;

// Paralelismo: cuántas peticiones simultáneas lanzar.
// Demasiadas → el SO rechaza sockets; pocas → más lento.
const CONCURRENCY = 100;

// ============================================================
//  Helpers HTTP (sin dependencias externas)
// ============================================================

/** POST JSON y devuelve promesa con la respuesta parseada */
function postJSON(path, body) {
  return new Promise((resolve, reject) => {
    const data = JSON.stringify(body);
    const req = http.request({
      hostname: HOST,
      port: PORT,
      path,
      method: 'POST',
      headers: {
        'Content-Type':   'application/json',
        'Content-Length':  Buffer.byteLength(data),
      },
    }, (res) => {
      let chunks = '';
      res.on('data', c => chunks += c);
      res.on('end', () => {
        try   { resolve(JSON.parse(chunks)); }
        catch { resolve(chunks); }
      });
    });
    req.on('error', reject);
    req.end(data);
  });
}

/** GET y devuelve promesa con la respuesta parseada */
function getJSON(path) {
  return new Promise((resolve, reject) => {
    const req = http.request({
      hostname: HOST,
      port: PORT,
      path,
      method: 'GET',
    }, (res) => {
      let chunks = '';
      res.on('data', c => chunks += c);
      res.on('end', () => {
        try   { resolve(JSON.parse(chunks)); }
        catch { resolve(chunks); }
      });
    });
    req.on('error', reject);
    req.end();
  });
}

// ============================================================
//  Ejecutar N tareas con paralelismo limitado
// ============================================================
async function runPool(total, concurrency, taskFn) {
  let index = 0;
  let completed = 0;
  const latencies = [];

  async function worker() {
    while (index < total) {
      const i = index++;
      const t0 = performance.now();
      await taskFn(i);
      latencies.push(performance.now() - t0);
      completed++;
    }
  }

  const workers = Array.from({ length: concurrency }, () => worker());
  await Promise.all(workers);
  return latencies;
}

// ============================================================
//  TEST 1: 10.000 POST REST
// ============================================================
async function benchREST() {
  console.log(`\n── TEST REST: ${TOTAL.toLocaleString()} peticiones POST ──`);
  console.log(`   Concurrencia: ${CONCURRENCY}`);

  const t0 = performance.now();

  const latencies = await runPool(TOTAL, CONCURRENCY, (i) =>
    postJSON('/api/rest/mensaje', { texto: `msg-${i}` })
  );

  const elapsed = performance.now() - t0;
  return { elapsed, latencies };
}

// ============================================================
//  TEST 2: 10.000 mensajes Long Polling
//
//  Flujo:
//    - Lanzamos CONCURRENCY consumidores (GET /api/lp/esperar)
//      que van recibiendo mensajes y vuelven a suscribirse.
//    - En paralelo, un pool de productores envía 10.000 POST
//      a /api/lp/enviar.
//    - Medimos el tiempo total desde que el primer productor
//      envía hasta que el último consumidor recibe.
// ============================================================
async function benchLP() {
  console.log(`\n── TEST LONG POLLING: ${TOTAL.toLocaleString()} mensajes ──`);
  console.log(`   Concurrencia productores: ${CONCURRENCY}`);
  console.log(`   Consumidores simultáneos: ${CONCURRENCY}`);

  let received    = 0;
  const latencies = [];
  const sendTimes = new Map(); // id → timestamp envío

  const t0 = performance.now();

  // ── Consumidores: bucle de suscripción ────────────────────
  const consumerDone = new Promise((resolve) => {
    async function consumer() {
      while (received < TOTAL) {
        try {
          const msg = await getJSON('/api/lp/esperar');
          if (msg.ok && msg.id) {
            received++;
            const sentAt = sendTimes.get(msg.id);
            if (sentAt) latencies.push(performance.now() - sentAt);
          }
        } catch {
          // Servidor ocupado, reintentar
        }
      }
    }
    const consumers = Array.from({ length: CONCURRENCY }, () => consumer());
    Promise.all(consumers).then(resolve);
  });

  // ── Productores: enviar 10.000 mensajes ───────────────────
  let sentIndex = 0;
  async function producerWorker() {
    while (sentIndex < TOTAL) {
      const i = sentIndex++;
      sendTimes.set(i + 1, performance.now()); // id del servidor es 1-based
      await postJSON('/api/lp/enviar', { texto: `lp-${i}` });
    }
  }
  const producers = Array.from({ length: CONCURRENCY }, () => producerWorker());
  await Promise.all(producers);

  // Esperar a que los consumidores terminen de recibir todo
  await consumerDone;

  const elapsed = performance.now() - t0;
  return { elapsed, latencies };
}

// ============================================================
//  Estadísticas
// ============================================================
function stats(label, result) {
  const { elapsed, latencies } = result;
  latencies.sort((a, b) => a - b);
  const sum = latencies.reduce((s, v) => s + v, 0);

  console.log(`\n┌─── Resultados: ${label} ────────────────────────`);
  console.log(`│  Mensajes:          ${latencies.length.toLocaleString()}`);
  console.log(`│  Tiempo total:      ${(elapsed / 1000).toFixed(2)} s`);
  console.log(`│  Throughput:        ${(latencies.length / (elapsed / 1000)).toFixed(0)} msg/s`);
  console.log(`│  Latencia media:    ${(sum / latencies.length).toFixed(2)} ms`);
  console.log(`│  Latencia mín:      ${latencies[0].toFixed(2)} ms`);
  console.log(`│  Latencia máx:      ${latencies.at(-1).toFixed(2)} ms`);
  console.log(`│  P50:               ${latencies[Math.floor(latencies.length * 0.50)].toFixed(2)} ms`);
  console.log(`│  P95:               ${latencies[Math.floor(latencies.length * 0.95)].toFixed(2)} ms`);
  console.log(`│  P99:               ${latencies[Math.floor(latencies.length * 0.99)].toFixed(2)} ms`);
  console.log(`└──────────────────────────────────────────────────`);
}

// ============================================================
//  Main
// ============================================================
async function main() {
  console.log('══════════════════════════════════════════════════');
  console.log('  Benchmark: REST vs Long Polling – 10.000 msgs  ');
  console.log('══════════════════════════════════════════════════');

  // Reset servidor
  await postJSON('/api/reset', {});

  // 1) REST
  const restResult = await benchREST();
  stats('REST POST', restResult);

  // Reset
  await postJSON('/api/reset', {});

  // 2) Long Polling
  const lpResult = await benchLP();
  stats('LONG POLLING', lpResult);

  // ── Comparación final ─────────────────────────────────────
  console.log('\n══════════════════════════════════════════════════');
  console.log('  COMPARACIÓN FINAL');
  console.log('══════════════════════════════════════════════════');

  const restTime = restResult.elapsed / 1000;
  const lpTime   = lpResult.elapsed / 1000;
  const ratio    = lpTime / restTime;

  console.log(`  REST:         ${restTime.toFixed(2)} s`);
  console.log(`  Long Polling: ${lpTime.toFixed(2)} s`);

  if (ratio > 1) {
    console.log(`  → Long Polling fue ${ratio.toFixed(1)}x más lento que REST`);
  } else {
    console.log(`  → Long Polling fue ${(1/ratio).toFixed(1)}x más rápido que REST`);
  }

  const restAvg = restResult.latencies.reduce((s,v) => s+v, 0) / restResult.latencies.length;
  const lpAvg   = lpResult.latencies.reduce((s,v) => s+v, 0)   / lpResult.latencies.length;

  console.log(`\n  Latencia media REST:  ${restAvg.toFixed(2)} ms`);
  console.log(`  Latencia media LP:    ${lpAvg.toFixed(2)} ms`);

  console.log('\n══════════════════════════════════════════════════');
  console.log('  CONCLUSIÓN');
  console.log('══════════════════════════════════════════════════');
  console.log(`
  REST (request/response):
    ✓ Cada petición abre conexión, envía, recibe, cierra.
    ✓ Ideal para operaciones puntuales (CRUD).
    ✗ Si necesitas "escuchar" eventos, debes hacer polling
      periódico → desperdicio de ancho de banda.

  Long Polling:
    ✓ El servidor retiene la conexión abierta hasta que hay
      datos → menor latencia para notificaciones push.
    ✓ Compatible con HTTP/1.1 (no requiere WebSocket).
    ✗ Mantener conexiones abiertas consume memoria/sockets
      en el servidor → peor throughput bruto.
    ✗ Cada respuesta requiere reconexión del consumidor.

  Para 10.000 mensajes de tipo "fire & forget":
    → REST es más eficiente (no hay overhead de espera).

  Para notificaciones en tiempo real con baja frecuencia:
    → Long Polling gana en latencia percibida.
`);
}

main().catch(console.error);
