"use strict";

// ============================================================
// Módulo Abastecimiento · Etapa 1 · Existencia EN VIVO
// Consulta Odoo (stock.quant) al momento. Para un set de
// product_ids devuelve: existencia por sucursal y disponible
// en CEDIS. El tablero usa esto para el "0 real" y el tope.
//
// POST body: { "product_ids": [130368, 95692, ...] }
// Env: ODOO_URL, ODOO_DB, ODOO_USER, ODOO_API_KEY
// ============================================================

// location_id de "Existencias" por sucursal (usage=internal).
// Los primeros 30 van de 6 en 6 porque se dieron de alta juntos; Sendero Ens
// es posterior y le tocó el id 4210. Si falta aquí, esa tienda aparece con
// existencia 0 en todo el análisis y el sistema la ve como si estuviera
// vacía: pediría de más para ella y no descontaría lo que ya tiene.
const SUC_LOCS = [24,30,36,42,48,54,60,66,72,78,84,90,96,102,108,114,120,126,132,138,144,150,156,162,168,174,180,186,192,198,4210];
const CEDIS_LOC = 8; // CEDIS/Existencias (se usa child_of para incluir racks)

// ------------------------------------------------------------------
// Raíces del CEDIS. Existencias es la de siempre; Producción se usa
// para surtir lo que todavía está en el área de producción.
// El id de Producción NO se codifica: se busca por nombre una sola vez
// y se guarda en memoria del módulo. Se puede fijar con la variable de
// entorno ODOO_LOC_PRODUCCION si algún día conviene.
// ------------------------------------------------------------------
let _locProd = null, _locProdAt = 0;
async function locProduccion() {
  const fijo = Number(process.env.ODOO_LOC_PRODUCCION || 0);
  if (fijo) return fijo;
  if (_locProd && Date.now() - _locProdAt < 30 * 60 * 1000) return _locProd;
  try {
    const rows = await odooRpc("stock.location", "search_read", [
      [["usage", "=", "internal"], ["complete_name", "ilike", "CEDIS/Produc"]],
      ["id", "complete_name"],
    ], { limit: 50 });
    if (!rows || !rows.length) return null;
    // la raíz es la de nombre más corto (CEDIS/Producción, no sus hijos)
    rows.sort((a, b) => String(a.complete_name).length - String(b.complete_name).length);
    _locProd = rows[0].id; _locProdAt = Date.now();
    return _locProd;
  } catch (e) { return null; }
}
// Devuelve el id de la raíz pedida. Si Producción no existe, cae en
// Existencias para no dejar al usuario sin surtir.
async function locRaiz(raiz) {
  if (String(raiz) !== "produccion") return CEDIS_LOC;
  const p = await locProduccion();
  return p || CEDIS_LOC;
}

// Sesión de Odoo cacheada a nivel módulo: la instancia caliente de Netlify
// reusa el uid y evita autenticarse en CADA llamada (antes: 2 viajes por consulta).
let _odooUid = null, _odooUidAt = 0, _odooAuthPromise = null;
const ODOO_UID_TTL = 10 * 60 * 1000; // 10 min
async function odooAuth(force) {
  const now = Date.now();
  if (!force && _odooUid && (now - _odooUidAt) < ODOO_UID_TTL) return _odooUid;
  // Si ya hay un login en vuelo, las llamadas paralelas esperan el mismo
  // (evita autenticarse varias veces cuando se lanzan consultas en paralelo).
  if (!force && _odooAuthPromise) return _odooAuthPromise;
  const url = process.env.ODOO_URL.replace(/\/+$/, "");
  const db = process.env.ODOO_DB, user = process.env.ODOO_USER, key = process.env.ODOO_API_KEY;
  _odooAuthPromise = (async () => {
    const auth = await fetch(url + "/jsonrpc", {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ jsonrpc: "2.0", method: "call",
        params: { service: "common", method: "authenticate", args: [db, user, key, {}] } }),
    });
    const ad = await auth.json();
    if (ad.error) throw new Error("Odoo auth: " + JSON.stringify(ad.error));
    if (!ad.result) throw new Error("Odoo auth falló (uid vacío) - revisa ODOO_USER/ODOO_API_KEY");
    _odooUid = ad.result; _odooUidAt = Date.now();
    return _odooUid;
  })();
  try { return await _odooAuthPromise; } finally { _odooAuthPromise = null; }
}
async function odooRpc(model, method, args, kwargs, _reintento) {
  const url = process.env.ODOO_URL.replace(/\/+$/, "");
  const db = process.env.ODOO_DB, key = process.env.ODOO_API_KEY;
  const uid = await odooAuth(false);
  const res = await fetch(url + "/jsonrpc", {
    method: "POST", headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ jsonrpc: "2.0", method: "call",
      params: { service: "object", method: "execute_kw",
        args: [db, uid, key, model, method, args, kwargs || {}] } }),
  });
  const d = await res.json();
  if (d.error) {
    const msg = JSON.stringify(d.error);
    // si la sesión caducó, renueva el uid y reintenta una sola vez
    if (!_reintento && /session|access denied|expired|AccessDenied/i.test(msg)) {
      await odooAuth(true);
      return odooRpc(model, method, args, kwargs, true);
    }
    throw new Error("Odoo " + model + "." + method + ": " + msg);
  }
  return d.result;
}

// Ejecuta tareas en paralelo pero de a pocas, para no saturar Odoo
async function enLotes(tareas, concurrencia) {
  const res = [];
  for (let i = 0; i < tareas.length; i += concurrencia) {
    const lote = tareas.slice(i, i + concurrencia);
    res.push(...await Promise.all(lote.map((t) => t())));
  }
  return res;
}
const trozos = (arr, n) => { const o = []; for (let i = 0; i < arr.length; i += n) o.push(arr.slice(i, i + n)); return o; };

// Si Netlify va a cortar la función (10 s), preferimos responder JSON con un
// mensaje entendible antes que dejar que devuelva su página HTML de error.
const LIMITE_MS = 8500;
function conLimite(promesa) {
  return Promise.race([
    promesa,
    new Promise((_, rej) => setTimeout(() => rej(new Error(
      "La consulta de existencias tardó más de " + (LIMITE_MS / 1000) + " s. " +
      "Prueba con una ventana de fechas más corta.")), LIMITE_MS)),
  ]);
}

exports.handler = async (event) => {
  try {
    const body = JSON.parse(event.body || "{}");
    if (body.ping) return json(200, { ok: true, warm: true });

    // "pares" = [[sucursal, product_id], ...] -> solo pedimos lo que de verdad se usa.
    // Si llega "product_ids" (modo antiguo) se consultan todas las sucursales.
    const pares = Array.isArray(body.pares) ? body.pares : null;
    let ids = Array.isArray(body.product_ids) ? body.product_ids.map(Number).filter(Boolean) : [];
    if (pares && !ids.length) ids = [...new Set(pares.map((p) => Number(p[1])).filter(Boolean))];
    if (!ids.length) return json(400, { ok: false, error: "product_ids vacío" });

    const out = {};
    // suc       = físico en la tienda (quantity, tal cual Odoo)
    // suc_res   = piezas apartadas ahí (reserved_quantity): ya tienen dueño,
    //             sea un pedido de tienda, un traslado o una venta pendiente
    // suc_libre = físico - apartado, nunca negativo
    for (const id of ids) out[id] = { suc: {}, suc_res: {}, suc_libre: {}, cedis: 0, cedis_fisico: 0, reservado: 0, cedis_prod: 0 };
    const LOC_PROD = await locProduccion();

    // ---- CEDIS: disponible = cantidad - reservado (por trozos, en paralelo) ----
    const tareasCedis = trozos(ids, 400).map((chunk) => async () =>
      odooRpc("stock.quant", "read_group", [
        [["product_id", "in", chunk], ["location_id", "child_of", CEDIS_LOC]],
        ["quantity:sum", "reserved_quantity:sum"], ["product_id"],
      ], { lazy: false }));

    // ---- Sucursales: una consulta por sucursal, solo con SUS productos ----
    let tareasSuc;
    if (pares) {
      const porSuc = {};
      pares.forEach(([suc, pid]) => {
        const s2 = Number(suc), p2 = Number(pid);
        if (!s2 || !p2) return;
        (porSuc[s2] = porSuc[s2] || new Set()).add(p2);
      });
      tareasSuc = Object.entries(porSuc).map(([suc, set]) => async () => {
        const lista = [...set];
        const g = await odooRpc("stock.quant", "read_group", [
          [["product_id", "in", lista], ["location_id", "=", Number(suc)], ["quantity", "!=", 0]],
          ["quantity:sum", "reserved_quantity:sum"], ["product_id"],
        ], { lazy: false });
        return { suc: Number(suc), grupos: g };
      });
    } else {
      tareasSuc = trozos(ids, 200).map((chunk) => async () => ({
        suc: null,
        grupos: await odooRpc("stock.quant", "read_group", [
          [["product_id", "in", chunk], ["location_id", "in", SUC_LOCS], ["quantity", "!=", 0]],
          ["quantity:sum", "reserved_quantity:sum"], ["product_id", "location_id"],
        ], { lazy: false }),
      }));
    }

    // Misma consulta pero contra la raíz de Producción, si existe
    const tareasProd = LOC_PROD ? trozos(ids, 400).map((chunk) => async () =>
      odooRpc("stock.quant", "read_group", [
        [["product_id", "in", chunk], ["location_id", "child_of", LOC_PROD]],
        ["quantity:sum", "reserved_quantity:sum"], ["product_id"],
      ], { lazy: false })) : [];

    const [resCedis, resSuc, resProd] = await conLimite(Promise.all([
      enLotes(tareasCedis, 3),
      enLotes(tareasSuc, 8),
      enLotes(tareasProd, 3),
    ]));

    resCedis.flat().forEach((g) => {
      const pid = Array.isArray(g.product_id) ? g.product_id[0] : g.product_id;
      if (!out[pid]) return;
      const fisico = Math.round(g.quantity || 0), res = Math.round(g.reserved_quantity || 0);
      out[pid].cedis_fisico = fisico;
      out[pid].reservado = res;
      out[pid].cedis = Math.max(0, fisico - res);
    });

    (resProd || []).flat().forEach((g) => {
      const pid = Array.isArray(g.product_id) ? g.product_id[0] : g.product_id;
      if (!out[pid]) return;
      out[pid].cedis_prod = Math.max(0,
        Math.round(g.quantity || 0) - Math.round(g.reserved_quantity || 0));
    });

    resSuc.forEach(({ suc, grupos }) => {
      grupos.forEach((g) => {
        const pid = Array.isArray(g.product_id) ? g.product_id[0] : g.product_id;
        if (!out[pid]) return;
        const loc = suc != null ? suc : (Array.isArray(g.location_id) ? g.location_id[0] : g.location_id);
        // Igual que en el CEDIS: se guarda el físico y lo apartado por
        // separado, para que la pantalla pueda decidir con cuál trabajar
        // sin volver a preguntarle a Odoo.
        const fis = Math.round(g.quantity || 0);
        const ap = Math.round(g.reserved_quantity || 0);
        out[pid].suc[loc] = fis;
        out[pid].suc_res[loc] = ap;
        out[pid].suc_libre[loc] = Math.max(0, fis - ap);
      });
    });

    return json(200, { ok: true, total: ids.length, existencias: out,
      loc_produccion: LOC_PROD || null });
  } catch (err) {
    return json(500, { ok: false, error: String((err && err.message) || err) });
  }
};

function json(code, body) {
  return { statusCode: code, headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) };
}
