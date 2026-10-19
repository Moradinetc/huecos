"use strict";

// ============================================================
// Módulo Abastecimiento · Etapa 1 · Folios
// Acciones (POST body {accion:...}):
//   crear   -> {lineas:[{suc,sucursal_nom,product_id,product_tmpl_id,sku,nombre,
//                        vendidas,transito,sugeridas,surtir,precio,utilidad}], desde, hasta, creado_por}
//   listar  -> devuelve folios + solicitudes + líneas
//   cancelar_folio -> {folio_id}
//   cancelar_linea -> {linea_id}
// Env: SUPABASE_URL, SUPABASE_SERVICE_ROLE
// ============================================================

const SB = () => process.env.SUPABASE_URL;
function H() {
  const k = process.env.SUPABASE_SERVICE_ROLE;
  return { apikey: k, Authorization: `Bearer ${k}`, "Content-Type": "application/json" };
}
async function sbRaw(method, path, body, extraHeaders) {
  const res = await fetch(SB() + "/rest/v1/" + path, {
    method, headers: { ...H(), ...(extraHeaders || {}) },
    body: body ? JSON.stringify(body) : undefined,
  });
  const txt = await res.text();
  let data; try { data = txt ? JSON.parse(txt) : null; } catch { data = txt; }
  if (!res.ok) throw new Error("Supabase " + method + " " + path + ": " + txt);
  return data;
}

// ------------------------------------------------------------------
// TODA lectura pagina sola.
//
// Supabase corta cada respuesta en 1000 filas y no avisa: `limit=30000`
// devuelve 1000 y el código se queda tan contento. Había consultas así
// repartidas por todas las funciones, y cada una era un faltante
// silencioso esperando a que un folio o un histórico creciera.
//
// El corte se resuelve aquí, una sola vez y para todas: si la consulta
// pidió 1000 filas o más —o no puso límite, que para Supabase es lo
// mismo— se piden páginas hasta que una venga incompleta. Las consultas
// con límite propio menor a 1000 se respetan tal cual: quien pidió
// `limit=1` quiere una.
//
// El offset necesita un orden estable, así que si la consulta no trae
// `order=` se le agrega `id.asc`; la primera página ya se pide con ese
// orden, para que no se mezclen dos criterios. Si la tabla no tuviera
// `id`, se devuelve lo juntado en vez de tronar.
//
// Los ayudantes que ya arman su propio limit/offset llaman a sbRaw
// directo: no deben pasar por aquí.
// ------------------------------------------------------------------
const SB_PAGINA = 1000;
function sbLimitDe(path) { const m = /[?&]limit=(\d+)/.exec(path); return m ? Number(m[1]) : null; }
function sbSinPaginado(path) {
  return path.replace(/([?&])(limit|offset)=\d+/g, "$1").replace(/([?&])&+/g, "$1").replace(/[?&]+$/, "");
}
// ------------------------------------------------------------------
// URL demasiado larga: se parte sola la lista del `in.(...)`.
//
// `folio_id=in.(1000,1001,…)` con mil quinientos ids arma una URL de más
// de 7 KB. El proxy que Supabase tiene delante la rechaza con 414 antes de
// llegar a la base, así que la consulta NO devuelve menos filas: no
// devuelve ninguna. Y como varias de esas consultas viven dentro de un
// try/catch que solo escribe en el log, el resultado eran columnas en cero
// —"En proc." y "Tráns"— sin un solo aviso en pantalla.
//
// Esto va en el mismo lugar donde se resolvió el corte de las 1000 filas:
// una vez, para todas las consultas. Si la URL se pasa del margen, se
// busca la lista `in.(...)` más larga, se corta a la mitad y cada mitad se
// vuelve a pedir por el mismo camino —así que si sigue siendo larga se
// vuelve a partir— y al final se junta todo.
//
// Se parte ANTES de paginar, no después: si se partiera con el
// `limit/offset` ya puesto, cada mitad se saltaría sus propias mil filas y
// las cuentas saldrían cortas, que es peor que el 414.
// ------------------------------------------------------------------
const SB_URL_TOPE = 3000;
function sbUrlLarga(path) { return String(path || "").length > SB_URL_TOPE; }
function sbInMasLargo(path) {
  const re = /([?&])([A-Za-z0-9_]+)=in\.\(([^)]*)\)/g;
  let m, mejor = null;
  while ((m = re.exec(path))) if (!mejor || m[3].length > mejor[3].length) mejor = m;
  if (!mejor) return null;
  const lista = mejor[3].split(",").filter((v) => v !== "");
  if (lista.length < 2) return null;
  const ini = mejor.index + mejor[1].length, fin = mejor.index + mejor[0].length, col = mejor[2];
  return { lista, arma: (t) => path.slice(0, ini) + col + "=in.(" + t.join(",") + ")" + path.slice(fin) };
}
async function sbPartida(fn, path) {
  const p = sbInMasLargo(path);
  if (!p) return null;                    // no hay lista que partir: que siga su camino
  const mitad = Math.ceil(p.lista.length / 2);
  const out = [];
  let ultimo = null;
  for (const t of [p.lista.slice(0, mitad), p.lista.slice(mitad)]) {
    const r = await fn(p.arma(t));
    if (Array.isArray(r)) out.push(...r); else ultimo = r;
  }
  return { v: (!out.length && ultimo !== null) ? ultimo : out };
}

async function sb(method, path, body, extraHeaders) {
  // Si la URL se pasa de largo, se parte la lista del in.(...) y se
  // pide por trozos: si no, el proxy la rechaza con 414 y la consulta
  // devuelve cero filas sin avisar.
  if (sbUrlLarga(path)) {
    const trozos = await sbPartida((p) => sb(method, p, body, extraHeaders), path);
    if (trozos) return trozos.v;
  }
  if (method !== "GET") return sbRaw(method, path, body, extraHeaders);
  const pedido = sbLimitDe(path);
  if (pedido !== null && pedido < SB_PAGINA) return sbRaw(method, path, body, extraHeaders);
  const limpio = sbSinPaginado(path);
  const sep = limpio.includes("?") ? "&" : "?";
  const teniaOrden = /[?&]order=/.test(limpio);
  const conOrden = teniaOrden ? limpio : `${limpio}${sep}order=id.asc`;
  const sep2 = conOrden.includes("?") ? "&" : "?";
  const tope = pedido === null ? Infinity : pedido;
  const out = [];
  for (let i = 0; i < 200; i++) {
    const falta = tope === Infinity ? SB_PAGINA : Math.min(SB_PAGINA, tope - out.length);
    if (falta <= 0) break;
    let lote;
    try { lote = await sbRaw(method, `${conOrden}${sep2}limit=${falta}&offset=${out.length}`, body, extraHeaders); }
    catch (e) {
      // La primera página falló. Si el `order=id.asc` lo pusimos nosotros,
      // pudo ser una tabla o vista sin columna `id`: se reintenta la
      // consulta original, tal como se pedía antes de paginar.
      if (!out.length) { if (!teniaOrden) return sbRaw("GET", path, body, extraHeaders); throw e; }
      break;
    }
    if (!Array.isArray(lote)) return out.length ? out : lote;
    out.push(...lote);
    if (lote.length < falta) break;
  }
  return out;
}
// ------------------------------------------------------------------
// Trae TODAS las filas de una consulta, aunque sean muchas.
//
// Supabase corta cada respuesta en 1000 filas, sin avisar. Poner
// `limit=20000` no sirve de nada: devuelve 1000 igual, y como el código
// pedía "hasta 20 mil", nadie se enteraba de que faltaban las demás.
//
// El resultado eran cifras en cero justo en lo más reciente: con 1,062
// líneas de picking se traían las 1,000 primeras —las más viejas— y los
// pedidos de hoy salían con 0 piezas y 0 % de cumplimiento.
//
// Esto pide de mil en mil hasta que una página venga incompleta.
// ------------------------------------------------------------------
const SB_TOPE = 1000;      // el corte que aplica Supabase por respuesta
async function sbPag(path, orden) {
  // Si la URL se pasa de largo, se parte la lista del in.(...) y se
  // pide por trozos: si no, el proxy la rechaza con 414 y la consulta
  // devuelve cero filas sin avisar.
  if (sbUrlLarga(path)) {
    const trozos = await sbPartida((p) => sbPag(p, orden), path);
    if (trozos) return trozos.v;
  }
  const base = path.replace(/&?limit=\d+/g, "").replace(/&?offset=\d+/g, "");
  const sep = base.includes("?") ? "&" : "?";
  const ord = orden || "id.desc";
  const out = [];
  for (let i = 0; i < 40; i++) {
    const lote = await sbRaw("GET", `${base}${sep}order=${ord}&limit=${SB_TOPE}&offset=${out.length}`);
    out.push(...lote);
    if (lote.length < SB_TOPE) break;
  }
  return out;
}

// ------------------------------------------------------------------
// Consulta POR LOTES cuando el filtro es una lista de ids.
//
// `folio_id=in.(1,2,3,…)` con dos mil ids arma una URL de más de 10 KB.
// El proxy que tiene Supabase delante corta la petición con un 414 antes
// de que llegue a la base, así que la consulta truena entera —no devuelve
// menos filas: no devuelve ninguna—. Y si ese error cae en un try/catch
// que solo lo anota en consola, lo que se ve es una columna en cero sin
// ningún aviso, que es justo lo que pasaba con "En proc.".
//
// Aquí se parte la lista en trozos y se junta todo lo que devuelven. Cada
// trozo pasa por sb(), así que además pagina solo si trae más de mil.
// ------------------------------------------------------------------
async function sbEnLotes(arma, ids, porLote) {
  const paso = porLote || 200;
  const lista = [...new Set((ids || []).filter((v) => v !== null && v !== undefined && v !== ""))];
  const out = [];
  for (let i = 0; i < lista.length; i += paso) {
    const lote = await sb("GET", arma(lista.slice(i, i + paso)));
    if (Array.isArray(lote)) out.push(...lote);
  }
  return out;
}

async function rpcFolio() {
  // genera folio ABS-AAAAMMDD-NNN vía la función SQL abs_next_folio()
  const res = await fetch(SB() + "/rest/v1/rpc/abs_next_folio", { method: "POST", headers: H(), body: "{}" });
  if (res.ok) { const v = await res.json(); if (v) return v; }
  // fallback: consecutivo por fecha desde la tabla
  const d = new Date().toISOString().slice(2, 10).replace(/-/g, ""); // AAMMDD
  const prev = await sb("GET", `abs_folios?select=folio&folio=like.AB-${d}-*&order=folio.desc&limit=1`);
  let n = 1;
  if (prev && prev.length) { const m = /(\d+)$/.exec(prev[0].folio); if (m) n = Number(m[1]) + 1; }
  return "AB-" + d + "-" + String(n).padStart(3, "0");
}


// ---------- Odoo ----------
const PICK_TYPE = 3;       // "Pick": CEDIS/Existencias -> CEDIS/Packing Zone
const LOC_CEDIS = 8;       // CEDIS/Existencias
const LOC_PACK  = 12;      // CEDIS/Packing Zone
const LOC_OUT   = 11;      // CEDIS/Output

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
  if (String(raiz) !== "produccion") return LOC_CEDIS;
  const p = await locProduccion();
  return p || LOC_CEDIS;
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
// ------------------------------------------------------------------
// Rama (branch): el módulo NO la toca.
//
// El módulo de sucursales de Odoo revienta cuando un empujón mezcla dos
// ramas ("Expected singleton: res.branch(83, 53)"). Fijarle una rama a
// nuestros traslados no alcanzaba, porque el choque ocurre en los
// movimientos que Odoo genera solo.
//
// Así que se deja el campo VACÍO: sin rama no hay dos ramas que comparar y
// el módulo no tiene con qué tronar. Si algún día se quiere volver a fijar
// una, basta con poner el id en ODOO_BRANCH_CEDIS.
// ------------------------------------------------------------------
const BRANCH_CEDIS = Number(process.env.ODOO_BRANCH_CEDIS || 0);   // 0 = sin rama

async function creaPicking(vals) {
  const datos = { ...vals };
  if (BRANCH_CEDIS) datos.branch_id = BRANCH_CEDIS;
  else datos.branch_id = false;        // explícito: que no herede la del usuario
  try {
    return await odooRpc("stock.picking", "create", [datos]);
  } catch (e) {
    const s = String((e && e.message) || e);
    if (!/branch_id/.test(s)) throw e;
    console.log("Odoo no aceptó branch_id, se crea sin él:", s.slice(0, 120));
    return await odooRpc("stock.picking", "create", [vals]);
  }
}

// Deja el traslado sin rama (o con la fijada) antes de validar, para que el
// módulo de sucursales no encuentre dos y truene.
async function ramaNeutra(id) {
  const v = BRANCH_CEDIS ? BRANCH_CEDIS : false;
  try {
    await odooRpc("stock.picking", "write", [[id], { branch_id: v }]);
    const mv = await odooRpc("stock.move", "search_read", [[["picking_id", "=", id]], ["id"]], {});
    if (mv.length) await odooRpc("stock.move", "write", [mv.map((m) => m.id), { branch_id: v }]);
  } catch (e) {
    console.log("No se pudo dejar sin rama el picking " + id + ":", (e && e.message) || e);
  }
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

// Disponible en CEDIS por producto = cantidad - reservado
async function disponibleCedis(ids, raiz) {
  if (!ids.length) return {};
  const loc = await locRaiz(raiz);
  const g = await odooRpc("stock.quant", "read_group", [
    [["product_id", "in", ids], ["location_id", "child_of", loc]],
    ["quantity:sum", "reserved_quantity:sum"], ["product_id"],
  ], { lazy: false });
  const out = {};
  for (const id of ids) out[id] = 0;
  for (const r of g) {
    const pid = Array.isArray(r.product_id) ? r.product_id[0] : r.product_id;
    out[pid] = Math.max(0, Math.round((r.quantity || 0) - (r.reserved_quantity || 0)));
  }
  return out;
}

// Crea y confirma el picking Pick -> Odoo reserva automáticamente (at_confirm)
// Red de seguridad: si alguna línea llega sin product_id, se resuelve por
// SKU contra Odoo antes de intentar la reserva. Así el folio no depende de
// que la pantalla lo haya mandado bien (pasaba con el traspaso manual, y
// con un navegador que se quedó con el HTML viejo en caché).
async function completaProductIds(lineas) {
  const faltan = [...new Set(lineas
    .filter((l) => !Number(l.product_id) && l.sku)
    .map((l) => String(l.sku).toUpperCase().trim()))];
  if (!faltan.length) return { resueltos: 0, sinResolver: [] };
  const prods = await odooRpc("product.product", "search_read", [
    [["default_code", "in", faltan]], ["id", "default_code", "product_tmpl_id"],
  ], { limit: faltan.length + 20 });
  const porSku = {};
  (prods || []).forEach((p) => {
    if (p.default_code) porSku[String(p.default_code).toUpperCase().trim()] = p;
  });
  let resueltos = 0;
  lineas.forEach((l) => {
    if (Number(l.product_id) || !l.sku) return;
    const p = porSku[String(l.sku).toUpperCase().trim()];
    if (!p) return;
    l.product_id = p.id;
    if (!l.product_tmpl_id) {
      l.product_tmpl_id = Array.isArray(p.product_tmpl_id) ? p.product_tmpl_id[0] : p.product_tmpl_id;
    }
    resueltos++;
  });
  const sinResolver = faltan.filter((s) => !porSku[s]);
  return { resueltos, sinResolver };
}

// ------------------------------------------------------------------
// El rack de donde salió cada pieza, resuelto a su ubicación en Odoo.
//
// La línea del picking guarda el rack como texto corto ("B-04"), que es lo
// último del nombre completo ("CEDIS/Existencias/B-04"). Para devolver la
// mercancía a SU lugar —y no a la raíz— hay que traducir ese texto de vuelta
// a un id de ubicación.
//
// Se lee una sola vez por invocación y se guarda en memoria.
// ------------------------------------------------------------------
let _racksCache = null, _racksAt = 0, _racksRaiz = null;
async function racksDe(raiz) {
  const loc = await locRaiz(raiz);
  if (_racksCache && _racksRaiz === loc && Date.now() - _racksAt < 30 * 60 * 1000) return _racksCache;
  const mapa = {};
  try {
    const locs = await odooRpc("stock.location", "search_read", [
      [["usage", "=", "internal"], ["location_id", "child_of", loc]], ["id", "complete_name"],
    ], { limit: 500 });
    locs.forEach((l) => {
      const corto = String(l.complete_name || "").split("/").pop().trim();
      if (corto && !mapa[corto.toUpperCase()]) mapa[corto.toUpperCase()] = l.id;
    });
  } catch (e) { console.log("No se pudieron leer los racks:", (e && e.message) || e); }
  _racksCache = mapa; _racksAt = Date.now(); _racksRaiz = loc;
  return mapa;
}

// ------------------------------------------------------------------
// Regresa mercancía a su ubicación de origen.
//
// Cuando se cancela un pedido cuya mercancía ya se bajó del rack, hay que
// devolverla: si no, se queda en la Packing Zone o en el Output, fuera de su
// lugar, y el análisis la ve como si no existiera.
//
// Se crea y valida el traslado de vuelta en un solo paso.
// ------------------------------------------------------------------
// `piezas` es una lista de { product_id, pzs, destino }: cada renglón puede
// volver a un rack distinto, que es de donde salió.
async function regresaMercancia(desde, hacia, piezas, motivo) {
  const lista = (piezas || []).filter((x) => x && x.product_id && x.pzs > 0);
  if (!lista.length) return null;
  const pids = [...new Set(lista.map((x) => Number(x.product_id)))];
  const prods = await odooRpc("product.product", "read", [pids, ["uom_id", "default_code", "display_name"]]);
  const uom = {}, cod = {};
  prods.forEach((p) => {
    uom[p.id] = Array.isArray(p.uom_id) ? p.uom_id[0] : p.uom_id;
    cod[p.id] = p.default_code || p.display_name;
  });
  const moves = lista.map((x) => [0, 0, {
    name: cod[x.product_id] || String(x.product_id), product_id: Number(x.product_id),
    product_uom_qty: x.pzs, product_uom: uom[x.product_id],
    location_id: Number(desde),
    // cada pieza a SU rack; si no se pudo resolver, a la raíz
    location_dest_id: Number(x.destino || hacia),
  }]);
  const id = await creaPicking({
    picking_type_id: PICK_TYPE, location_id: Number(desde), location_dest_id: Number(hacia),
    origin: motivo, move_ids_without_package: moves,
  });
  await odooRpc("stock.picking", "action_confirm", [[id]]);
  try { await odooRpc("stock.picking", "action_assign", [[id]]); } catch (e) {}
  const mv = await odooRpc("stock.move", "search_read", [
    [["picking_id", "=", id]], ["id", "product_id", "product_uom_qty"]], {});
  for (const m of mv) {
    await odooRpc("stock.move", "write", [[m.id], { quantity: Number(m.product_uom_qty || 0), picked: true }]);
  }
  await odooRpc("stock.picking", "button_validate", [[id]], {
    context: { skip_backorder: true, picking_ids_not_to_backorder: [id] },
  });
  const [chk] = await odooRpc("stock.picking", "read", [[id], ["name", "state"]]);
  if (!chk || chk.state !== "done") {
    throw new Error("El traslado de regreso quedó en «" + ((chk && chk.state) || "?") + "», no validado.");
  }
  return { id, name: chk.name };
}

async function crearPickingReserva(folio, nombre, lineas, raiz) {
  const LOC_ORIGEN = await locRaiz(raiz);
  // Si existe un tipo de operación cuyo origen sea esa raíz, se usa ese.
  // Si no, se reutiliza el Pick de siempre sobreescribiendo el origen.
  let tipo = PICK_TYPE;
  if (LOC_ORIGEN !== LOC_CEDIS) {
    try {
      const tp = await odooRpc("stock.picking.type", "search_read", [
        [["code", "=", "internal"], ["default_location_src_id", "child_of", LOC_ORIGEN]],
        ["id"],
      ], { limit: 1 });
      if (tp && tp.length) tipo = tp[0].id;
    } catch (e) { /* se queda con PICK_TYPE */ }
  }
  // antes de nada, que ninguna línea se quede sin identificador
  const fix = await completaProductIds(lineas);
  if (fix.resueltos) console.log("product_id resuelto por SKU en", fix.resueltos, "línea(s)");

  // consolida por producto (el picker baja todo junto)
  const porProd = {};
  for (const l of lineas) {
    const pid = Number(l.product_id);
    if (!pid) continue;
    porProd[pid] = (porProd[pid] || 0) + Number(l.surtir || 0);
  }
  const pids = Object.keys(porProd).map(Number);
  if (!pids.length) {
    // Pasaba con el traspaso manual: las líneas viajaban sin product_id
    // y Odoo no tiene con qué reservar. El mensaje ahora dice qué revisar.
    const skus = (fix.sinResolver.length ? fix.sinResolver
      : [...new Set(lineas.map((l) => l.sku).filter(Boolean))]).slice(0, 5);
    throw new Error("No encontré esos SKU en Odoo, así que no hay qué reservar"
      + (skus.length ? ": " + skus.join(", ") : "")
      + ". Revisa que existan y que tengan código interno.");
  }

  // unidad de medida por producto
  const prods = await odooRpc("product.product", "read", [pids, ["uom_id", "default_code", "display_name"]]);
  const uom = {}, code = {};
  prods.forEach((p) => { uom[p.id] = Array.isArray(p.uom_id) ? p.uom_id[0] : p.uom_id; code[p.id] = p.default_code || p.display_name; });

  const moves = pids.map((pid) => [0, 0, {
    name: code[pid] || String(pid),
    product_id: pid,
    product_uom_qty: porProd[pid],
    product_uom: uom[pid],
    location_id: LOC_ORIGEN,
    location_dest_id: LOC_PACK,
  }]);

  const pickingId = await creaPicking({
    picking_type_id: tipo,
    location_id: LOC_ORIGEN,
    location_dest_id: LOC_PACK,
    origin: folio + (nombre ? " · " + nombre : ""),
    move_ids_without_package: moves,
  });
  await odooRpc("stock.picking", "action_confirm", [[pickingId]]);
  try { await odooRpc("stock.picking", "action_assign", [[pickingId]]); } catch (e) { /* at_confirm ya reserva */ }
  const [pk] = await odooRpc("stock.picking", "read", [[pickingId], ["name", "state"]]);
  return { id: pickingId, name: pk.name, state: pk.state };
}

exports.handler = async (event) => {
  try {
    if (event.httpMethod !== "POST") return json(405, { ok: false, error: "usa POST" });
    const b = JSON.parse(event.body || "{}");
    const accion = b.accion;

    if (accion === "crear") {
      const lineas = b.lineas || [];
      if (!lineas.length) return json(400, { ok: false, error: "sin líneas" });
      const nombre = String(b.nombre || "").trim();
      if (!nombre) return json(400, { ok: false, error: "El folio requiere un nombre." });

      // --- BLOQUEO: valida disponible en CEDIS (cantidad - reservado) ---
      const necesita = {};
      lineas.forEach((l) => { const pid = Number(l.product_id); if (pid) necesita[pid] = (necesita[pid] || 0) + Number(l.surtir || 0); });
      const pidsNec = Object.keys(necesita).map(Number);
      const raiz = (b.raiz === "produccion") ? "produccion" : "existencias";
      const raizNom = raiz === "produccion" ? "CEDIS/Producción" : "CEDIS/Existencias";
      const disp = await disponibleCedis(pidsNec, raiz);
      const faltantes = [];
      for (const pid of pidsNec) {
        if ((disp[pid] || 0) < necesita[pid]) {
          const ln = lineas.find((x) => Number(x.product_id) === pid) || {};
          faltantes.push({ sku: ln.sku || String(pid), nombre: ln.nombre || "", pide: necesita[pid], disponible: disp[pid] || 0 });
        }
      }
      if (faltantes.length) {
        return json(200, { ok: false, bloqueado: true, faltantes,
          raiz, error: "No hay disponible suficiente en " + raizNom +
            " (ya hay piezas reservadas en otros folios, o están en la otra ubicación)." });
      }

      // --- RESERVA en Odoo: crea y confirma el picking Pick ---
      const folioTmp = await rpcFolio();
      let pick;
      try { pick = await crearPickingReserva(folioTmp, nombre, lineas, raiz); }
      catch (e) { return json(500, { ok: false, error: "No se pudo reservar en Odoo: " + String(e.message || e) }); }

      const folio = folioTmp;
      // De qué modo del análisis salió el pedido. Antes iba fijo en
      // "resurtido", así que en picking un folio de producto nuevo o de
      // arribo se veía igual que uno de ceros. La lista es cerrada a
      // propósito: si llega cualquier otra cosa, se guarda como resurtido.
      const ORIGENES = ["resurtido", "nuevo", "arribo", "manual", "hueco"];
      const origen = ORIGENES.includes(String(b.origen || "")) ? String(b.origen) : "resurtido";
      const filaFolio = {
        folio, nombre, estado: "por_pickear", origen,
        raiz, odoo_picking_id: pick.id, odoo_picking_name: pick.name,
        ventana_desde: b.desde || null,
        ventana_hasta: b.hasta || null, creado_por: b.creado_por || "tablero",
      };
      let fol;
      try {
        [fol] = await sb("POST", "abs_folios", filaFolio, { Prefer: "return=representation" });
      } catch (e) {
        // Si todavía no se corrió el SQL, la columna "raiz" no existe.
        // El folio se crea igual; solo se pierde de qué ubicación salió.
        if (!String((e && e.message) || e).includes("raiz")) throw e;
        delete filaFolio.raiz;
        [fol] = await sb("POST", "abs_folios", filaFolio, { Prefer: "return=representation" });
      }

      // agrupa por sucursal -> crea solicitudes
      const porSuc = {};
      for (const l of lineas) (porSuc[l.suc] = porSuc[l.suc] || { nom: l.sucursal_nom }).lineas = (porSuc[l.suc].lineas || []).concat(l);
      const solRows = Object.keys(porSuc).map((suc) => ({
        folio_id: fol.id, sucursal_id: Number(suc),
        sucursal_nom: porSuc[suc].nom || ("Suc " + suc), estado: "pendiente",
      }));
      const sols = await sb("POST", "abs_solicitudes", solRows, { Prefer: "return=representation" });
      const solBySuc = {}; sols.forEach((s) => { solBySuc[s.sucursal_id] = s.id; });

      const linRows = lineas.map((l) => ({
        folio_id: fol.id, solicitud_id: solBySuc[l.suc],
        product_id: l.product_id, product_tmpl_id: l.product_tmpl_id || null,
        sku: l.sku, descripcion: l.nombre, pzs_vendidas: l.vendidas || 0,
        pzs_transito: l.transito || 0, pzs_sugeridas: l.sugeridas || 0,
        pzs_surtir: l.surtir || 0, precio: l.precio || null, utilidad: l.utilidad || null,
      }));
      await sb("POST", "abs_solicitud_lineas", linRows);
      return json(200, { ok: true, folio, folio_id: fol.id, lineas: linRows.length, sucursales: sols.length });
    }

    // Cumplimiento del análisis: lo que se pidió contra lo que llegó al rack
// ==================================================================
// EL COSTO Y LOS SKU DEL CUMPLIMIENTO
//
// El dashboard medía piezas y dinero A PRECIO DE VENTA. Faltaban las
// otras dos cosas con las que se decide: cuántos SKU distintos movió
// cada etapa, y cuánto dinero a COSTO se quedó en el camino. Un 93 %
// en piezas puede ser un 85 % en dinero si lo que no salió era lo caro.
//
// De dónde sale cada cosa:
//
//   piezas y venta   de la línea, igual que siempre (`precio` es el que
//                    tenía el producto el día que se aprobó el folio)
//   SKU              product_id distintos de esa etapa. NO se suman
//                    entre días: el mismo SKU tres días es UN SKU en el
//                    total, así que la columna no cuadra con su suma y
//                    está bien que no cuadre
//   costo            `standard_price` de Odoo, preguntado al vuelo
//
// Por qué el costo se pregunta y no se lee de la línea: hoy NO se
// guarda. Al aprobar un folio se guardan precio y utilidad, y el costo
// que sí vio el análisis se pierde ahí. Preguntarlo a Odoo funciona
// hacia atrás —sirve para los folios viejos, que es lo que se quiere
// medir— a cambio de que sea el costo de HOY y no el del día en que se
// pidió. La pantalla lo dice con esas palabras en vez de presumir una
// exactitud que no tiene.
// ==================================================================
const FECHA = (x) => String(x || "").slice(0, 10);

// El costo de cada producto, de Odoo, en una sola vuelta. Si Odoo no
// contesta se sigue sin costo: el resto del tablero no se cae por eso.
async function costoDeProductos(ids) {
  const out = {};
  const lista = [...new Set((ids || []).map(Number).filter(Boolean))];
  if (!lista.length) return { costo: out, error: null, medidos: 0 };
  try {
    // De 500 en 500: un `read` con miles de ids se le atraganta a Odoo.
    for (let i = 0; i < lista.length; i += 500) {
      const trozo = lista.slice(i, i + 500);
      const filas = await odooRpc("product.product", "read", [trozo, ["standard_price"]]);
      (filas || []).forEach((p) => { out[p.id] = Number(p.standard_price || 0); });
    }
    return { costo: out, error: null, medidos: Object.keys(out).length };
  } catch (e) {
    return { costo: out, error: String((e && e.message) || e).slice(0, 200), medidos: 0 };
  }
}

// Una celda del reporte: piezas, dinero a venta, dinero a costo y el
// conjunto de SKU. El conjunto se guarda como Set mientras se acumula y
// se convierte en número al final; si se guardara el número desde el
// principio, el mismo SKU en dos folios del mismo día contaría dos veces.
const celda = () => ({ pz: 0, venta: 0, costo: 0, sku: new Set() });
function suma(c, pz, precio, costoU, pid) {
  if (!(pz > 0)) return;
  c.pz += pz;
  c.venta += pz * (Number(precio) || 0);
  c.costo += pz * (Number(costoU) || 0);
  if (pid) c.sku.add(Number(pid));
}
const ETAPAS = ["ped", "rec", "emp", "con", "rcp", "ent"];
const filaVacia = () => { const o = {}; ETAPAS.forEach((k) => { o[k] = celda(); }); return o; };
const cierra = (o) => {
  const r = {};
  ETAPAS.forEach((k) => {
    r[k] = { pz: o[k].pz, sku: o[k].sku.size,
             venta: Math.round(o[k].venta), costo: Math.round(o[k].costo) };
  });
  return r;
};

    if (accion === "cumplimiento") {
      const desde = b.desde ? String(b.desde) : null;
      const hasta = b.hasta ? String(b.hasta) : null;
      let qf = "abs_cumplimiento_folio?select=*&order=creado_en.desc&limit=500";
      let qs = "abs_cumplimiento_sucursal?select=*&limit=20000";
      if (desde) { qf += `&creado_en=gte.${desde}`; qs += `&creado_en=gte.${desde}`; }
      if (hasta) { qf += `&creado_en=lte.${hasta}T23:59:59`; qs += `&creado_en=lte.${hasta}T23:59:59`; }
      let [folios, sucs] = await Promise.all([sb("GET", qf), sb("GET", qs)]);

      // ----------------------------------------------------------------
      // EL ORIGEN, DE LA TABLA Y NO DE LA VISTA.
      //
      // Filtrar por «Arribo» devolvía cero. El origen se leía de
      // `abs_cumplimiento_folio`, que es una VISTA: si la columna no está
      // ahí —o se quedó en null cuando se armó—, la comparación no
      // empata con nada y el chip se ve roto sin decir por qué.
      //
      // El dato de verdad vive en `abs_folios.origen`, que es donde lo
      // escribe el tablero al aprobar. Se lee de ahí y se pisa lo que
      // dijera la vista: una sola fuente, la buena.
      // ----------------------------------------------------------------
      const idsFol = folios.map((f) => f.folio_id).filter(Boolean);
      let origenDe = {};
      try {
        const base = await sbEnLotes((t) =>
          "abs_folios?select=id,origen&id=in.(" + t.join(",") + ")", idsFol);
        base.forEach((x) => { origenDe[x.id] = x.origen || "resurtido"; });
        folios.forEach((f) => { f.origen = origenDe[f.folio_id] || f.origen || "resurtido"; });
        // Las filas por sucursal se cuelgan del mismo folio
        sucs.forEach((x) => { if (origenDe[x.folio_id]) x.origen = origenDe[x.folio_id]; });
      } catch (e) { /* si falla, se queda el de la vista */ }

      // Cuántos folios hay de cada origen EN EL PERIODO, antes de filtrar:
      // es lo que deja que cada chip diga su número y que un cero se lea
      // como «no hubo», no como «se descompuso».
      const porOrigen = {};
      folios.forEach((f) => {
        const k = String(f.origen || "resurtido");
        porOrigen[k] = (porOrigen[k] || 0) + 1;
      });

      // El origen se filtraba solo en la pantalla. Ahora también aquí: el
      // desglose por fecha se arma en el servidor y tiene que hablar del
      // MISMO conjunto de folios que las barras, o los dos totales de la
      // misma tarjeta no cuadrarían.
      const orig = String(b.origen || "").trim();
      if (orig) {
        folios = folios.filter((f) => String(f.origen || "") === orig);
        sucs = sucs.filter((x) => String(x.origen || "") === orig);
      }

      // ----------------------------------------------------------------
      // Las dos etapas que faltaban: RECEPCIÓN y ENTRADA.
      //
      // La vista de cumplimiento llega hasta lo consolidado. De ahí en
      // adelante el rastro vive en Pack & Go, así que se arma aquí:
      //
      //   recibidas  piezas que la tienda contó al abrir los paquetes
      //              (abs_paquete_lineas.recibidas)
      //   entradas   de esas, las que SÍ se movieron al inventario de la
      //              tienda en Odoo. Si el traspaso falló, el consolidado
      //              queda sin `odoo_recep_id`: la tienda tiene la
      //              mercancía y el sistema no. Eso es lo que mide.
      //   transito   lo consolidado que todavía no se recibe, con la
      //              antigüedad del envío más viejo. No se castiga: puede
      //              ir en la paquetería de una foránea.
      //
      // El paquete guarda su folio_id, así que todo se puede sumar por
      // folio sin tocar la vista.
      // ----------------------------------------------------------------
      try {
        const fids = folios.map((f) => f.folio_id).filter(Boolean);
        if (fids.length) {
          // POR LOTES, siempre. Un periodo largo son cientos de folios y
          // miles de paquetes: `in.(...)` con esa lista arma una URL de
          // kilobytes y el proxy de Supabase la corta con un 414 ANTES de
          // llegar a la base. No devuelve menos filas: truena entera.
          const paq = await sbEnLotes((t) =>
            `abs_paquetes?select=id,folio_id,consolidado_id,estado&folio_id=in.(${t.join(",")})`, fids);
          const pids = paq.map((p) => p.id);
          const coIds = [...new Set(paq.map((p) => p.consolidado_id).filter(Boolean))];
          const [plin, cons] = await Promise.all([
            sbEnLotes((t) =>
              `abs_paquete_lineas?select=paquete_id,pzs,recibidas,precio&paquete_id=in.(${t.join(",")})`, pids),
            sbEnLotes((t) =>
              `abs_consolidados?select=id,estado,odoo_recep_id,creado_en&id=in.(${t.join(",")})`, coIds),
          ]);
          const coDe = {};
          cons.forEach((c) => { coDe[c.id] = c; });
          const paqDe = {};
          paq.forEach((p) => { paqDe[p.id] = p; });
          const acum = {};
          const dato = (fid) => (acum[fid] = acum[fid]
            || { rec: 0, mRec: 0, ent: 0, mEnt: 0, tra: 0, mTra: 0, viejo: null });
          plin.forEach((l) => {
            const p2 = paqDe[l.paquete_id];
            if (!p2 || !p2.folio_id) return;
            const d = dato(p2.folio_id);
            const co = p2.consolidado_id ? coDe[p2.consolidado_id] : null;
            const precio = Number(l.precio || 0);
            const recib = Number(l.recibidas == null ? 0 : l.recibidas);
            // Sin consolidado el paquete sigue en el rack: no es tránsito ni recepción
            if (!co) return;
            if (co.estado === "recibido") {
              d.rec += recib; d.mRec += recib * precio;
              if (co.odoo_recep_id) { d.ent += recib; d.mEnt += recib * precio; }
            } else {
              const pz = Number(l.pzs || 0);
              d.tra += pz; d.mTra += pz * precio;
              if (co.creado_en && (!d.viejo || co.creado_en < d.viejo)) d.viejo = co.creado_en;
            }
          });
          folios.forEach((f) => {
            const d = acum[f.folio_id] || { rec: 0, mRec: 0, ent: 0, mEnt: 0, tra: 0, mTra: 0, viejo: null };
            f.pzs_recibidas = d.rec;
            f.monto_recibido = Math.round(d.mRec);
            f.pzs_entradas = d.ent;
            f.monto_entrada = Math.round(d.mEnt);
            f.pzs_en_transito = d.tra;
            f.monto_en_transito = Math.round(d.mTra);
            f.transito_desde = d.viejo;
          });
        }
      } catch (e) {
        // Si esto falla, el dashboard sigue mostrando las cuatro etapas de
        // siempre: las dos nuevas quedan en cero y se avisa en la respuesta.
        return json(200, { ok: true, folios, sucursales: sucs, por_origen: porOrigen,
          aviso_etapas: String(e.message || e) });
      }
      // ----------------------------------------------------------------
      // El desglose por fecha, con SKU y costo.
      //
      // Se arma del renglón, no de la vista: la vista da piezas y dinero
      // por folio, pero no sabe de SKU distintos ni de costo. Si algún
      // día los dos números no cuadran, se dice —abajo va `cuadre`— en
      // vez de enseñar dos totales distintos en la misma pantalla.
      // ----------------------------------------------------------------
      let porFecha = [], totales = null, infoCosto = null, cuadre = null, avisoTabla = null;
      try {
        const fids = folios.map((f) => f.folio_id).filter(Boolean);
        const fechaDe = {};
        folios.forEach((f) => { fechaDe[f.folio_id] = FECHA(f.creado_en); });

        // Lo PEDIDO sale de la solicitud y lo RECOLECTADO del picking:
        // son dos tablas distintas. `abs_solicitud_lineas` no tiene la
        // columna `recolectado` —vive en `abs_picking_lineas`— y pedírsela
        // devuelve un 400 que tumbaba el desglose entero.
        //
        // Todo por lotes: con cientos de folios la lista de ids sola arma
        // una URL de kilobytes y el proxy la corta antes de la base.
        const lineas = await sbEnLotes((t) =>
          "abs_solicitud_lineas?select=folio_id,product_id,sku,pzs_surtir,precio" +
          "&folio_id=in.(" + t.join(",") + ")", fids);
        const pick = await sbEnLotes((t) =>
          "abs_picking_lineas?select=folio_id,product_id,sku,recolectado,precio" +
          "&folio_id=in.(" + t.join(",") + ")", fids);

        // Los paquetes otra vez, ahora con el producto de cada renglón:
        // de aquí salen empacadas, consolidadas, recibidas y entradas.
        const paq2 = await sbEnLotes((t) =>
          "abs_paquetes?select=id,folio_id,consolidado_id&folio_id=in.(" + t.join(",") + ")", fids);
        const pids2 = paq2.map((p) => p.id);
        const coIds2 = [...new Set(paq2.map((p) => p.consolidado_id).filter(Boolean))];
        const [plin2, cons2] = await Promise.all([
          sbEnLotes((t) => "abs_paquete_lineas?select=paquete_id,product_id,sku,pzs,recibidas,precio" +
            "&paquete_id=in.(" + t.join(",") + ")", pids2),
          sbEnLotes((t) => "abs_consolidados?select=id,estado,odoo_recep_id&id=in.(" +
            t.join(",") + ")", coIds2),
        ]);
        const coDe2 = {}; cons2.forEach((c) => { coDe2[c.id] = c; });
        const paqDe2 = {}; paq2.forEach((p) => { paqDe2[p.id] = p; });

        // El costo, de Odoo, una sola vez para todos los productos que
        // aparecen en cualquier etapa.
        const productos = [];
        lineas.forEach((l) => { if (l.product_id) productos.push(l.product_id); });
        pick.forEach((l) => { if (l.product_id) productos.push(l.product_id); });
        plin2.forEach((l) => { if (l.product_id) productos.push(l.product_id); });
        const cst = await costoDeProductos(productos);
        const costoDe = (pid) => cst.costo[Number(pid)] || 0;

        const dias = {}, tot = filaVacia();
        const dia = (f) => (dias[f] = dias[f] || filaVacia());
        let sinProducto = 0;

        lineas.forEach((l) => {
          const f = fechaDe[l.folio_id]; if (!f) return;
          if (!l.product_id) sinProducto++;
          const c = costoDe(l.product_id), pr = l.precio, d = dia(f);
          suma(d.ped, Number(l.pzs_surtir || 0), pr, c, l.product_id);
          suma(tot.ped, Number(l.pzs_surtir || 0), pr, c, l.product_id);
        });
        pick.forEach((l) => {
          const f = fechaDe[l.folio_id]; if (!f) return;
          const c = costoDe(l.product_id), pr = l.precio, d = dia(f);
          suma(d.rec, Number(l.recolectado || 0), pr, c, l.product_id);
          suma(tot.rec, Number(l.recolectado || 0), pr, c, l.product_id);
        });

        plin2.forEach((l) => {
          const p = paqDe2[l.paquete_id]; if (!p || !p.folio_id) return;
          const f = fechaDe[p.folio_id]; if (!f) return;
          if (!l.product_id) sinProducto++;
          const c = costoDe(l.product_id), pr = l.precio, pid = l.product_id;
          const pz = Number(l.pzs || 0), rec = Number(l.recibidas == null ? 0 : l.recibidas);
          const d = dia(f);
          suma(d.emp, pz, pr, c, pid); suma(tot.emp, pz, pr, c, pid);
          const co = p.consolidado_id ? coDe2[p.consolidado_id] : null;
          if (!co) return;                       // sigue en el rack
          suma(d.con, pz, pr, c, pid); suma(tot.con, pz, pr, c, pid);
          if (co.estado !== "recibido") return;  // va en camino
          suma(d.rcp, rec, pr, c, pid); suma(tot.rcp, rec, pr, c, pid);
          if (co.odoo_recep_id) { suma(d.ent, rec, pr, c, pid); suma(tot.ent, rec, pr, c, pid); }
        });

        porFecha = Object.keys(dias).sort().reverse()
          .map((f) => ({ fecha: f, etapas: cierra(dias[f]) }));
        totales = cierra(tot);
        infoCosto = { fuente: "odoo_standard_price", productos: cst.medidos,
                      sin_product_id: sinProducto, error: cst.error };

        // ¿Cuadra lo que dice la vista con lo que dicen los renglones?
        const vPed = folios.reduce((a, f) => a + Number(f.pzs_pedidas || 0), 0);
        const vEmp = folios.reduce((a, f) => a + Number(f.pzs_empacadas || 0), 0);
        cuadre = { pedidas_vista: vPed, pedidas_lineas: totales.ped.pz,
                   empacadas_vista: vEmp, empacadas_lineas: totales.emp.pz,
                   difiere: Math.abs(vPed - totales.ped.pz) > Math.max(5, vPed * 0.005) ||
                            Math.abs(vEmp - totales.emp.pz) > Math.max(5, vEmp * 0.005) };
      } catch (e) {
        // Que falle el desglose no puede tumbar el tablero de siempre.
        //
        // Y el aviso se limpia antes de enseñarlo: el mensaje crudo trae
        // la URL con los quinientos ids pegados, que llena la pantalla y
        // esconde lo único que importa —qué tabla y qué columna—.
        avisoTabla = String((e && e.message) || e)
          .replace(/=in\.\([^)]*\)/g, "=in.(…)")
          .replace(/&[a-z_]+=(eq|gte|lte)\.[^&\s]*/g, "")
          .slice(0, 300);
      }

      return json(200, { ok: true, folios, sucursales: sucs, por_origen: porOrigen,
        por_fecha: porFecha, totales, costo: infoCosto, cuadre, aviso_tabla: avisoTabla });
    }

    // ------------------------------------------------------------------
    // Piezas YA COMPROMETIDAS en un pedido que aún no llega a la tienda.
    // Sirve para no volver a surtir algo que ya va en camino: el análisis
    // lo muestra en su propia columna y lo puede filtrar.
    //
    // Cuenta todo lo que está en proceso: aprobado, en picking, en pack y
    // consolidado sin recibir. Se excluye lo terminado, lo recibido y lo
    // cancelado, porque eso ya está en la existencia de la tienda.
    // ------------------------------------------------------------------
    if (accion === "en_proceso") {
      // Dos cosas distintas en una sola consulta:
      //   filas -> lo comprometido en folios abiertos (para el filtro)
      //   hoy   -> lo que ya se pidió HOY, aunque el folio ya se haya
      //            terminado, para poder marcarlo en el análisis y no
      //            volver a pedir lo mismo el mismo día
      // Sin `limit`: sb() pagina hasta traerlos todos. Con `limit=2000`
      // pedía dos mil folios abiertos de golpe y luego metía esos dos mil
      // ids en una sola URL, que era la mitad del problema.
      const [fol, folHoy] = await Promise.all([
        sb("GET", "abs_folios?select=id,estado&estado=not.in.(terminado,cancelado)"),
        sbPag("abs_folios?select=id,creado_en&estado=neq.cancelado"
          + "&creado_en=gte." + new Date(Date.now() - 48 * 3600 * 1000).toISOString()),
      ]);
      // "Hoy" es el día del CEDIS, no el del servidor
      const TZ_CEDIS = "America/Tijuana";
      const dia = (d) => new Date(d).toLocaleDateString("en-CA", { timeZone: TZ_CEDIS });
      const hoyEs = dia(Date.now());
      const idsHoy = new Set(folHoy.filter((f) => f.creado_en && dia(f.creado_en) === hoyEs).map((f) => f.id));
      const ids = [...new Set([...fol.map((f) => f.id), ...idsHoy])];
      if (!ids.length) {
        return json(200, { ok: true, filas: [], hoy: [], camino: [],
          diag: { folios_abiertos: 0, folios_hoy: 0, lineas: 0, sin_producto: 0, sin_sucursal: 0 } });
      }
      const lin = await sbEnLotes((t) =>
        `abs_solicitud_lineas?select=folio_id,product_id,sku,pzs_surtir,solicitud_id`
        + `&folio_id=in.(${t.join(",")})`, ids);
      // la sucursal de cada línea sale de su solicitud
      const solIds = [...new Set(lin.map((l) => l.solicitud_id).filter(Boolean))];
      const sucDe = {};
      if (solIds.length) {
        const sol = await sbEnLotes((t) =>
          `abs_solicitudes?select=id,sucursal_id&id=in.(${t.join(",")})`, solIds);
        sol.forEach((s) => { sucDe[s.id] = s.sucursal_id; });
      }
      const abiertos = new Set(fol.map((f) => f.id));
      const acum = {}, acumHoy = {};
      // Las líneas que se caen del conteo se cuentan aparte: es la
      // diferencia entre "no hay nada comprometido" y "hay líneas sin
      // product_id y por eso la columna sale vacía".
      let sinProd = 0, sinSuc = 0;
      lin.forEach((l) => {
        const suc = sucDe[l.solicitud_id];
        const pid = Number(l.product_id);
        if (!pid) { sinProd++; return; }
        if (!suc) { sinSuc++; return; }
        const k = suc + "|" + pid;
        const pzs = Number(l.pzs_surtir || 0);
        if (abiertos.has(l.folio_id)) acum[k] = (acum[k] || 0) + pzs;
        if (idsHoy.has(l.folio_id)) acumHoy[k] = (acumHoy[k] || 0) + pzs;
      });
      const desarma = (o) => Object.keys(o).map((k) => {
        const [s, p] = k.split("|");
        return { suc: Number(s), product_id: Number(p), pzs: o[k] };
      });

      // ------------------------------------------------------------------
      // EN CAMINO: lo que ya salió del picking y la tienda todavía no recibe.
      //
      // Había un hueco: al terminar el picking el folio deja de contar como
      // "en proceso", pero la columna de tránsito solo veía la mercancía una
      // vez que el consolidado salía del CEDIS. Entre una cosa y otra —todo
      // el rato que la mercancía está en la mesa de pack o en el rack— la
      // pieza no aparecía en ninguna columna, y el análisis la volvía a
      // pedir aunque ya fuera para esa misma tienda.
      //
      // Se cuenta desde Supabase, que es lo único que sabe a qué sucursal va
      // cada pieza, y suma dos cosas:
      //   · lo empacado en paquetes que la tienda aún no recibe
      //   · lo que sigue pendiente en una sucursal de pack todavía abierta
      // Desaparece solo cuando la tienda recibe, o cuando esa sucursal se
      // cierra sin la mercancía (se fue a backorder).
      // ------------------------------------------------------------------
      const camino = {};
      let avisoCamino = "";
      try {
        const desde = new Date(Date.now() - 45 * 24 * 3600 * 1000).toISOString();
        const folT = await sb("GET",
          `abs_folios?select=id&estado=eq.terminado&creado_en=gte.${desde}`);
        const idsT = folT.map((f) => f.id);
        if (idsT.length) {
          const [paq, dest] = await Promise.all([
            sbEnLotes((t) => `abs_paquetes?select=id,folio_id,sucursal_id,estado&folio_id=in.(${t.join(",")})`, idsT),
            sbEnLotes((t) => `abs_pack_destinos?select=folio_id,sucursal_id,estado&folio_id=in.(${t.join(",")})`, idsT),
          ]);
          // 1 · empacado y todavía sin recibir
          const pendientes = paq.filter((p) => p.estado !== "recibido");
          const pidsPaq = pendientes.map((p) => p.id);
          const sucDePaq = {};
          pendientes.forEach((p) => { sucDePaq[p.id] = p.sucursal_id; });
          if (pidsPaq.length) {
            const pl = await sbEnLotes((t) =>
              `abs_paquete_lineas?select=paquete_id,product_id,pzs&paquete_id=in.(${t.join(",")})`, pidsPaq);
            pl.forEach((l) => {
              const suc = sucDePaq[l.paquete_id], pid = Number(l.product_id);
              if (!suc || !pid) return;
              const k = suc + "|" + pid;
              camino[k] = (camino[k] || 0) + Number(l.pzs || 0);
            });
          }
          // 2 · lo que sigue esperando en una sucursal de pack abierta
          const abiertos = new Set(dest.filter((d) => d.estado !== "terminada")
            .map((d) => d.folio_id + "|" + d.sucursal_id));
          if (abiertos.size) {
            const solT = await sbEnLotes((t) =>
              `abs_solicitudes?select=id,folio_id,sucursal_id&folio_id=in.(${t.join(",")})`, idsT);
            const sucDeSolT = {};
            solT.forEach((s) => {
              if (abiertos.has(s.folio_id + "|" + s.sucursal_id)) sucDeSolT[s.id] = s.sucursal_id;
            });
            const idsSol = Object.keys(sucDeSolT).map(Number);
            const ll = await sbEnLotes((t) =>
              `abs_solicitud_lineas?select=solicitud_id,product_id,pzs_surtir&solicitud_id=in.(${t.join(",")})`, idsSol);
            ll.forEach((l) => {
              const suc = sucDeSolT[l.solicitud_id], pid = Number(l.product_id);
              if (!suc || !pid) return;
              const k = suc + "|" + pid;
              // lo pedido menos lo que ya se le empacó
              const falta = Number(l.pzs_surtir || 0) - Number(camino[k] || 0);
              if (falta > 0) camino[k] = (camino[k] || 0) + falta;
            });
          }
        }
      } catch (e) {
        // Se sigue devolviendo lo comprometido, pero el aviso viaja en la
        // respuesta: antes solo quedaba en un log que nadie mira.
        avisoCamino = String((e && e.message) || e);
        console.log("No se pudo calcular lo que va en camino:", avisoCamino);
      }

      return json(200, {
        ok: true,
        filas: desarma(acum), hoy: desarma(acumHoy), camino: desarma(camino),
        aviso_camino: avisoCamino || undefined,
        diag: {
          folios_abiertos: fol.length, folios_hoy: idsHoy.size,
          lineas: lin.length, sin_producto: sinProd, sin_sucursal: sinSuc,
          claves: Object.keys(acum).length,
        },
      });
    }

    if (accion === "listar") {
      const folios = await sb("GET", "abs_folios?select=*&order=creado_en.desc&limit=200");
      const fids = folios.map((f) => f.id);
      if (!fids.length) return json(200, { ok: true, folios, solicitudes: [], lineas: [] });

      // Las líneas se traen POR PÁGINAS.
      //
      // Antes iban en una sola consulta con `order=id.asc&limit=20000`, o sea
      // las 20 mil líneas MÁS VIEJAS. Como los folios nuevos tienen los ids
      // más altos, sus líneas quedaban fuera del corte y la pestaña Folios
      // los mostraba con "0 líneas · 0 pz · 0 suc." — y el problema empeoraba
      // conforme crecía la tabla: cada semana se quedaban fuera más folios.
      //
      // Se pide de lo más nuevo a lo más viejo y en páginas, así que los
      // recientes entran siempre.
      // Con sbPag, que pide de mil en mil: pedir "hasta 10 mil" no servía
      // porque Supabase corta en 1000 y el corte se leía como "ya no hay
      // más". Resultado: al abrir un folio no aparecía su contenido.
      const lineas = await sbPag(
        `abs_solicitud_lineas?select=*&folio_id=in.(${fids.join(",")})`);
      const sols = await sbPag(`abs_solicitudes?select=*&folio_id=in.(${fids.join(",")})`);

      // Totales por folio calculados aquí, para que la pantalla no dependa
      // de haber recibido todas las líneas
      const tot = {};
      lineas.forEach((l) => {
        const t2 = tot[l.folio_id] = tot[l.folio_id] || { lineas: 0, piezas: 0, sols: new Set() };
        t2.lineas++;
        t2.piezas += Number(l.pzs_surtir || 0);
        if (l.solicitud_id) t2.sols.add(l.solicitud_id);
      });
      folios.forEach((f) => {
        const t2 = tot[f.id];
        f.n_lineas = t2 ? t2.lineas : 0;
        f.n_piezas = t2 ? t2.piezas : 0;
        f.n_sucursales = t2 ? t2.sols.size : 0;
      });

      return json(200, { ok: true, folios, solicitudes: sols, lineas });
    }

    // Las líneas de UN folio, para abrirlo desde la lista sin haber tenido
    // que cargar de golpe las de todos.
    if (accion === "folio_lineas") {
      const fid = Number(b.folio_id);
      const [lineas, sols] = await Promise.all([
        sbPag(`abs_solicitud_lineas?select=*&folio_id=eq.${fid}&order=id.asc&limit=20000`, "id.asc"),
        sb("GET", `abs_solicitudes?select=*&folio_id=eq.${fid}&limit=5000`),
      ]);
      // El rack de cada SKU, para que el detalle del folio lo muestre igual
      // que la pantalla del picker. Vive en las líneas de picking, que se
      // arman cuando alguien toma el pedido: si todavía nadie lo tomó, no
      // hay racks y el detalle se muestra sin esa columna.
      let picking = [];
      try {
        picking = await sbPag(
          `abs_picking_lineas?select=sku,rack,pedidas,recolectado,estado&folio_id=eq.${fid}&limit=20000`);
      } catch (e) {
        console.log("Sin líneas de picking para el folio " + fid + ":", (e && e.message) || e);
      }
      return json(200, { ok: true, lineas, solicitudes: sols, picking });
    }

    // ---------- cancelar un folio ----------
    //
    // Cancelar no era "cancelar": se liberaba la reserva en Odoo y el folio
    // quedaba marcado, pero el proceso seguía vivo —el picker lo veía en su
    // lista, el pack lo podía empacar, el consolidador lo mandaba a la
    // tienda— y la mercancía ya recolectada se quedaba tirada en la Packing
    // Zone, fuera de su rack y sin que nadie la regresara.
    //
    // Ahora se deshace todo el proceso y la mercancía vuelve a su ubicación
    // de origen. Con un límite: si algo ya se consolidó, la cancelación se
    // bloquea, porque esa mercancía va camino a la tienda y lo que
    // corresponde es una devolución, no borrar el pedido.
    if (accion === "cancelar_folio") {
      const fid = Number(b.folio_id);
      const [f0] = await sb("GET", `abs_folios?select=*&id=eq.${fid}&limit=1`);
      if (!f0) return json(404, { ok: false, error: "Pedido no encontrado." });
      if (f0.estado === "cancelado") return json(200, { ok: false, error: "Ese pedido ya estaba cancelado." });

      const [lin, dest, paq] = await Promise.all([
        sbPag(`abs_picking_lineas?select=*&folio_id=eq.${fid}&limit=20000`),
        sb("GET", `abs_pack_destinos?select=*&folio_id=eq.${fid}&limit=5000`),
        sb("GET", `abs_paquetes?select=*&folio_id=eq.${fid}&limit=5000`),
      ]);

      // 1 · ¿ya salió del CEDIS? entonces no se cancela
      const yaFuera = paq.filter((x) => ["consolidado", "en_transito", "entregado", "recibido", "cruzado"].includes(x.estado));
      if (yaFuera.length) {
        return json(200, { ok: false, bloqueado: "consolidado",
          error: "No se puede cancelar: " + yaFuera.length + " paquete(s) ya se consolidaron y van camino a la tienda ("
            + yaFuera.map((x) => x.folio_pq).slice(0, 3).join(", ")
            + "). Esa mercancía se regresa con una devolución desde la sucursal, no cancelando el pedido." });
      }

      // 2 · dónde quedó lo que ya se recolectó
      const sucDeDest = {};
      dest.forEach((d) => { sucDeDest[d.sucursal_id] = d; });
      const sucDePaq = {};
      paq.forEach((x) => { sucDePaq[x.id] = x.sucursal_id; });
      const pids = paq.map((x) => x.id);
      const plin = pids.length
        ? await sbPag(`abs_paquete_lineas?select=paquete_id,product_id,sku,pzs&paquete_id=in.(${pids.join(",")})`)
        : [];

      // lo empacado de una sucursal ya cerrada salió a Output; lo demás
      // sigue en la Packing Zone
      // De qué rack salió cada producto, para devolverlo ahí mismo
      const racks = await racksDe(f0.raiz);
      const rackDeProd = {};
      lin.forEach((l) => {
        const pid = Number(l.product_id);
        if (pid && l.rack && !rackDeProd[pid]) rackDeProd[pid] = String(l.rack).trim();
      });
      const destinoDe = (pid) => {
        const r = rackDeProd[pid];
        return (r && racks[r.toUpperCase()]) || null;   // null = a la raíz
      };

      const enOut = {}, enPack = {};
      plin.forEach((l) => {
        const suc = sucDePaq[l.paquete_id];
        const d = sucDeDest[suc];
        const salio = !!(d && d.odoo_pack_id);
        const bolsa = salio ? enOut : enPack;
        const pid = Number(l.product_id);
        if (pid) bolsa[pid] = (bolsa[pid] || 0) + Number(l.pzs || 0);
      });
      // lo recolectado que nunca se empacó se quedó en Packing
      lin.forEach((l) => {
        const pid = Number(l.product_id), rec = Number(l.recolectado || 0);
        if (!pid || rec <= 0) return;
        const yaEnPaquete = (enOut[pid] || 0) + (enPack[pid] || 0);
        const suelto = rec - yaEnPaquete;
        if (suelto > 0) enPack[pid] = (enPack[pid] || 0) + suelto;
      });
      // cada producto con su rack de destino
      const aLista = (bolsa) => Object.keys(bolsa).map(Number).filter((pid) => bolsa[pid] > 0)
        .map((pid) => ({ product_id: pid, pzs: bolsa[pid], destino: destinoDe(pid),
                         rack: rackDeProd[pid] || null }));

      // 3 · se cancela la reserva que quedara viva
      const ids = [];
      if (f0.odoo_picking_id) ids.push(Number(f0.odoo_picking_id));
      const origen = f0.folio + (f0.nombre ? " · " + f0.nombre : "");
      try {
        const otros = await odooRpc("stock.picking", "search_read", [
          [["origin", "=", origen], ["state", "not in", ["done", "cancel"]]], ["id"],
        ], { limit: 500 });
        otros.forEach((p2) => { if (!ids.includes(p2.id)) ids.push(p2.id); });
      } catch (e) { /* al menos el conocido */ }
      let liberados = 0;
      for (const id of ids) {
        try { await odooRpc("stock.picking", "action_cancel", [[id]]); liberados++; }
        catch (e) { /* ya cancelado o validado */ }
      }

      // 4 · y la mercancía vuelve a su ubicación de origen
      const destino = await locRaiz(f0.raiz);
      const regresos = [], racksOk = {}, racksNo = {};
      let errRegreso = null;
      try {
        const lPack = aLista(enPack), lOut = aLista(enOut);
        if (lPack.length) regresos.push(await regresaMercancia(LOC_PACK, destino, lPack, "Cancelación " + f0.folio));
        if (lOut.length) regresos.push(await regresaMercancia(LOC_OUT, destino, lOut, "Cancelación " + f0.folio));
        // qué racks recibieron mercancía y cuáles no se pudieron resolver
        [...lPack, ...lOut].forEach((x) => {
          if (x.destino) racksOk[x.rack] = (racksOk[x.rack] || 0) + x.pzs;
          else racksNo[x.rack || "sin rack"] = (racksNo[x.rack || "sin rack"] || 0) + x.pzs;
        });
      } catch (e) { errRegreso = String((e && e.message) || e); }

      // 5 · el proceso se cierra en todos lados
      for (const x of paq) {
        if (x.estado === "cancelado") continue;
        try { await sb("PATCH", `abs_paquetes?id=eq.${x.id}`, { estado: "cancelado" }); } catch (e) {}
      }
      for (const d of dest) {
        if (d.estado === "terminada") continue;
        try { await sb("PATCH", `abs_pack_destinos?id=eq.${d.id}`, { estado: "terminada", fin: nowISO(), inicio: null }); } catch (e) {}
      }
      await sb("PATCH", `abs_folios?id=eq.${fid}`, { estado: "cancelado" });

      const pzsPack = Object.values(enPack).reduce((a, n) => a + n, 0);
      const pzsOut = Object.values(enOut).reduce((a, n) => a + n, 0);
      return json(200, { ok: true,
        reserva_liberada: liberados > 0, pickings_cancelados: liberados,
        regresado_pack: pzsPack, regresado_out: pzsOut,
        movimientos: regresos.filter(Boolean).map((r) => r.name),
        racks: Object.keys(racksOk).map((r) => r + " (" + racksOk[r] + " pz)"),
        racks_sin_resolver: Object.keys(racksNo).map((r) => r + " (" + racksNo[r] + " pz)"),
        paquetes_cancelados: paq.length,
        picker: f0.picker_nom || null,
        error_regreso: errRegreso,
        destino_nom: f0.raiz === "produccion" ? "CEDIS/Producción" : "CEDIS/Existencias" });
    }

    // ------------------------------------------------------------------
    // Export a Excel: las piezas que salieron del análisis, por fecha.
    //
    // Un renglón por SKU y sucursal, con el folio al que se fue, y —lo que
    // hace útil el archivo— cuánto de eso se recolectó de verdad y cuánto
    // salió en cajas. "Lo que salió" puede querer decir tres cosas
    // distintas: lo que se autorizó, lo que el picker juntó y lo que se
    // empacó. Las tres van en columnas separadas, para que nadie tenga que
    // adivinar cuál está leyendo.
    // ------------------------------------------------------------------
    if (accion === "export_aprobado") {
      const desde = b.desde ? String(b.desde) : null;
      const hasta = b.hasta ? String(b.hasta) : null;
      let qf = "abs_folios?select=*";
      if (desde) qf += `&creado_en=gte.${encodeURIComponent(desde)}`;
      if (hasta) qf += `&creado_en=lte.${encodeURIComponent(hasta)}T23:59:59`;
      const fol = await sb("GET", `${qf}&order=creado_en.asc`);
      if (!fol.length) return json(200, { ok: true, filas: [] });
      const ids = fol.map((f) => f.id);

      const [sols, lin, pick, paq] = await Promise.all([
        sbEnLotes((t) => `abs_solicitudes?select=id,folio_id,sucursal_id,sucursal_nom&folio_id=in.(${t.join(",")})`, ids),
        sbEnLotes((t) => `abs_solicitud_lineas?select=*&folio_id=in.(${t.join(",")})`, ids),
        sbEnLotes((t) => `abs_picking_lineas?select=folio_id,sku,rack,pedidas,recolectado&folio_id=in.(${t.join(",")})`, ids)
          .catch(() => []),
        sbEnLotes((t) => `abs_paquetes?select=id,folio_id,sucursal_id&folio_id=in.(${t.join(",")})`, ids)
          .catch(() => []),
      ]);
      // lo empacado, por folio + sucursal + sku
      let plin = [];
      if (paq.length) {
        try {
          plin = await sbEnLotes((t) =>
            `abs_paquete_lineas?select=paquete_id,sku,pzs&paquete_id=in.(${t.join(",")})`,
            paq.map((p) => p.id));
        } catch (e) { plin = []; }
      }
      const paqPor = {}; paq.forEach((p) => { paqPor[p.id] = p; });
      const empacado = {};
      plin.forEach((l) => {
        const p = paqPor[l.paquete_id]; if (!p) return;
        const k = p.folio_id + "|" + p.sucursal_id + "|" + l.sku;
        empacado[k] = (empacado[k] || 0) + Number(l.pzs || 0);
      });
      // el picking es por folio y SKU, no por sucursal
      const recol = {}, rack = {};
      pick.forEach((l) => {
        const k = l.folio_id + "|" + l.sku;
        recol[k] = (recol[k] || 0) + Number(l.recolectado || 0);
        if (l.rack) rack[k] = l.rack;
      });
      const folPor = {}; fol.forEach((f) => { folPor[f.id] = f; });
      const solPor = {}; sols.forEach((x) => { solPor[x.id] = x; });

      // Lo recolectado es por FOLIO y SKU, no por sucursal: el picker junta
      // las piezas de todo el pedido y el reparto viene después. Si se
      // repitiera en cada renglón de sucursal, sumar esa columna en Excel
      // contaría las mismas piezas varias veces. Se pone UNA sola vez, en
      // el primer renglón de cada folio+SKU, y las demás quedan vacías.
      const yaPuesto = new Set();
      const filas = lin.map((l) => {
        const f = folPor[l.folio_id] || {}, sl = solPor[l.solicitud_id] || {};
        const kSuc = l.folio_id + "|" + sl.sucursal_id + "|" + l.sku;
        const kFol = l.folio_id + "|" + l.sku;
        const pzs = Number(l.pzs_surtir || 0);
        const precio = Number(l.precio || 0);
        return {
          fecha: String(f.creado_en || "").slice(0, 10),
          folio: f.folio || "",
          nombre_folio: f.nombre || "",
          origen: f.origen || "resurtido",
          estado_folio: f.estado || "",
          sucursal: sl.sucursal_nom || (sl.sucursal_id ? "Suc " + sl.sucursal_id : ""),
          sku: l.sku || "",
          descripcion: l.descripcion || "",
          rack: rack[kFol] || "",
          pzs_autorizadas: pzs,
          pzs_recolectadas: yaPuesto.has(kFol) ? "" : (yaPuesto.add(kFol), Number(recol[kFol] || 0)),
          pzs_empacadas: Number(empacado[kSuc] || 0),
          precio: precio,
          importe: Math.round(pzs * precio * 100) / 100,
          utilidad: l.utilidad != null ? Number(l.utilidad) : "",
          pzs_vendidas: Number(l.pzs_vendidas || 0),
          picker: f.picker_nom || f.picker || "",
          empacadora: f.pack_packer_nom || f.pack_packer || "",
        };
      }).sort((a, c) => (a.fecha + a.folio + a.sucursal + a.sku)
        .localeCompare(c.fecha + c.folio + c.sucursal + c.sku));
      return json(200, { ok: true, filas, folios: fol.length });
    }

    if (accion === "cancelar_linea") {
      await sb("DELETE", `abs_solicitud_lineas?id=eq.${Number(b.linea_id)}`);
      return json(200, { ok: true });
    }

    return json(400, { ok: false, error: "acción no reconocida" });
  } catch (err) {
    return json(500, { ok: false, error: String((err && err.message) || err) });
  }
};

function json(code, body) {
  return { statusCode: code, headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) };
}
