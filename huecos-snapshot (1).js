// ============================================================
// HUECOS · Snapshot semanal + cobertura
// Env: SUPABASE_URL, SUPABASE_SERVICE_ROLE
// Acciones (POST { accion, ... }):
//   - "registrar"      : crea/actualiza un snapshot de la semana (concepto filtrado)
//   - "semana"         : lista los snapshots de una semana con su avance
//   - "cobertura"      : registra cobertura(s) de un snapshot (ligadas a un folio)
//   - "semanas"        : lista las semanas que tienen snapshots
// ============================================================

const SB = () => process.env.SUPABASE_URL;
function H() {
  const k = process.env.SUPABASE_SERVICE_ROLE;
  return { apikey: k, Authorization: `Bearer ${k}`, "Content-Type": "application/json" };
}
async function sb(method, path, body, extra) {
  const res = await fetch(SB() + "/rest/v1/" + path, {
    method, headers: { ...H(), ...(extra || {}) },
    body: body ? JSON.stringify(body) : undefined,
  });
  const txt = await res.text();
  let data; try { data = txt ? JSON.parse(txt) : null; } catch { data = txt; }
  if (!res.ok) throw new Error("Supabase " + method + " " + path + ": " + txt);
  return data;
}

// Semana ISO lun–dom a partir de una fecha (default: hoy en Tijuana).
function semanaDe(fechaStr) {
  const TZ = "America/Tijuana";
  let base;
  if (fechaStr) base = new Date(fechaStr + "T12:00:00");
  else {
    const hoy = new Intl.DateTimeFormat("en-CA", { timeZone: TZ, year: "numeric", month: "2-digit", day: "2-digit" }).format(new Date());
    base = new Date(hoy + "T12:00:00");
  }
  // lunes = 1 … domingo = 7
  const dow = (base.getDay() + 6) % 7; // 0 = lunes
  const lunes = new Date(base); lunes.setDate(base.getDate() - dow);
  const domingo = new Date(lunes); domingo.setDate(lunes.getDate() + 6);
  // número de semana ISO
  const d = new Date(Date.UTC(lunes.getFullYear(), lunes.getMonth(), lunes.getDate()));
  const dayNum = (d.getUTCDay() + 6) % 7;
  d.setUTCDate(d.getUTCDate() - dayNum + 3);
  const firstThursday = new Date(Date.UTC(d.getUTCFullYear(), 0, 4));
  const week = 1 + Math.round(((d - firstThursday) / 86400000 - 3 + ((firstThursday.getUTCDay() + 6) % 7)) / 7);
  const iso = (x) => x.toISOString().slice(0, 10);
  return { semana: d.getUTCFullYear() + "-W" + String(week).padStart(2, "0"), ini: iso(lunes), fin: iso(domingo) };
}

exports.handler = async (event) => {
  const cors = { "Access-Control-Allow-Origin": "*", "Access-Control-Allow-Headers": "Content-Type", "Content-Type": "application/json" };
  if (event.httpMethod === "OPTIONS") return { statusCode: 200, headers: cors, body: "" };
  try {
    const body = event.body ? JSON.parse(event.body) : {};
    const accion = body.accion || "semana";

    // ── registrar / actualizar un snapshot de la semana ──────────────────
    if (accion === "registrar") {
      const sem = semanaDe(body.fecha);
      const fila = {
        semana: sem.semana, semana_ini: sem.ini, semana_fin: sem.fin,
        concepto_clave: String(body.concepto_clave || ""),
        concepto_label: String(body.concepto_label || ""),
        filtros: body.filtros || {}, agrupa_por: body.agrupa_por || null,
        sucursales: body.sucursales || [],
        rango_desde: body.rango_desde || null, rango_hasta: body.rango_hasta || null,
        hueco_piezas: Math.round(body.hueco_piezas || 0),
        hueco_valor: Number(body.hueco_valor || 0),
        sku_count: Math.round(body.sku_count || 0),
        detalle: body.detalle || null,
        creado_por: body.creado_por || null,
        actualizado_en: new Date().toISOString(),
      };
      // upsert por (semana, concepto_clave)
      const r = await sb("POST", "huecos_snapshot?on_conflict=semana,concepto_clave",
        fila, { Prefer: "resolution=merge-duplicates,return=representation" });
      const snap = Array.isArray(r) ? r[0] : r;
      return { statusCode: 200, headers: cors, body: JSON.stringify({ ok: true, snapshot: snap, semana: sem }) };
    }

    // ── registrar cobertura(s) ligadas a un folio ────────────────────────
    if (accion === "cobertura") {
      const lineas = (body.coberturas || []).map((c) => ({
        snapshot_id: c.snapshot_id, folio: body.folio || c.folio || null, folio_id: body.folio_id || c.folio_id || null,
        tipo: c.tipo === "similar" ? "similar" : "sku",
        product_id: c.product_id || null, product_tmpl_id: c.product_tmpl_id || null,
        sku: c.sku || null, nombre: c.nombre || null,
        sucursal_loc: c.sucursal_loc || null, sucursal_code: c.sucursal_code || null,
        piezas: Math.round(c.piezas || 0),
        cubre_sku: c.cubre_sku || null, cubre_product_id: c.cubre_product_id || null,
        precio: c.precio != null ? Number(c.precio) : null,
        creado_por: body.creado_por || null,
      })).filter((x) => x.snapshot_id && x.piezas > 0);
      if (!lineas.length) return { statusCode: 200, headers: cors, body: JSON.stringify({ ok: true, insertadas: 0 }) };
      const r = await sb("POST", "huecos_cobertura", lineas, { Prefer: "return=representation" });
      return { statusCode: 200, headers: cors, body: JSON.stringify({ ok: true, insertadas: (r || []).length }) };
    }

    // ── listar snapshots de una semana con su avance ─────────────────────
    if (accion === "semana") {
      const sem = body.semana || semanaDe(body.fecha).semana;
      const rows = await sb("GET", "huecos_avance?semana=eq." + encodeURIComponent(sem) + "&order=concepto_label.asc", null);
      return { statusCode: 200, headers: cors, body: JSON.stringify({ ok: true, semana: sem, filas: rows || [] }) };
    }

    // ── listar las semanas que tienen snapshots ──────────────────────────
    if (accion === "semanas") {
      const rows = await sb("GET", "huecos_snapshot?select=semana,semana_ini,semana_fin&order=semana_ini.desc", null);
      const vistas = {}; (rows || []).forEach((r) => { vistas[r.semana] = r; });
      return { statusCode: 200, headers: cors, body: JSON.stringify({ ok: true, semanas: Object.values(vistas) }) };
    }

    return { statusCode: 400, headers: cors, body: JSON.stringify({ ok: false, error: "acción no reconocida: " + accion }) };
  } catch (err) {
    return { statusCode: 500, headers: cors, body: JSON.stringify({ ok: false, error: String((err && err.message) || err) }) };
  }
};
