// --- LZString (compresión de la respuesta para no exceder el límite de 6MB de Netlify) ---
var LZString=function(){var r=String.fromCharCode,o="ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/=",n="ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+-$",e={};function t(r,o){if(!e[r]){e[r]={};for(var n=0;n<r.length;n++)e[r][r.charAt(n)]=n}return e[r][o]}var i={compressToBase64:function(r){if(null==r)return"";var n=i._compress(r,6,function(r){return o.charAt(r)});switch(n.length%4){default:case 0:return n;case 1:return n+"===";case 2:return n+"==";case 3:return n+"="}},decompressFromBase64:function(r){return null==r?"":""==r?null:i._decompress(r.length,32,function(n){return t(o,r.charAt(n))})},compressToUTF16:function(o){return null==o?"":i._compress(o,15,function(o){return r(o+32)})+" "},decompressFromUTF16:function(r){return null==r?"":""==r?null:i._decompress(r.length,16384,function(o){return r.charCodeAt(o)-32})},compressToUint8Array:function(r){for(var o=i.compress(r),n=new Uint8Array(2*o.length),e=0,t=o.length;e<t;e++){var s=o.charCodeAt(e);n[2*e]=s>>>8,n[2*e+1]=s%256}return n},decompressFromUint8Array:function(o){if(null==o)return i.decompress(o);for(var n=new Array(o.length/2),e=0,t=n.length;e<t;e++)n[e]=256*o[2*e]+o[2*e+1];var s=[];return n.forEach(function(o){s.push(r(o))}),i.decompress(s.join(""))},compressToEncodedURIComponent:function(r){return null==r?"":i._compress(r,6,function(r){return n.charAt(r)})},decompressFromEncodedURIComponent:function(r){return null==r?"":""==r?null:(r=r.replace(/ /g,"+"),i._decompress(r.length,32,function(o){return t(n,r.charAt(o))}))},compress:function(o){return i._compress(o,16,function(o){return r(o)})},_compress:function(r,o,n){if(null==r)return"";var e,t,i,s={},u={},a="",p="",c="",l=2,f=3,h=2,d=[],m=0,v=0;for(i=0;i<r.length;i+=1)if(a=r.charAt(i),Object.prototype.hasOwnProperty.call(s,a)||(s[a]=f++,u[a]=!0),p=c+a,Object.prototype.hasOwnProperty.call(s,p))c=p;else{if(Object.prototype.hasOwnProperty.call(u,c)){if(c.charCodeAt(0)<256){for(e=0;e<h;e++)m<<=1,v==o-1?(v=0,d.push(n(m)),m=0):v++;for(t=c.charCodeAt(0),e=0;e<8;e++)m=m<<1|1&t,v==o-1?(v=0,d.push(n(m)),m=0):v++,t>>=1}else{for(t=1,e=0;e<h;e++)m=m<<1|t,v==o-1?(v=0,d.push(n(m)),m=0):v++,t=0;for(t=c.charCodeAt(0),e=0;e<16;e++)m=m<<1|1&t,v==o-1?(v=0,d.push(n(m)),m=0):v++,t>>=1}0==--l&&(l=Math.pow(2,h),h++),delete u[c]}else for(t=s[c],e=0;e<h;e++)m=m<<1|1&t,v==o-1?(v=0,d.push(n(m)),m=0):v++,t>>=1;0==--l&&(l=Math.pow(2,h),h++),s[p]=f++,c=String(a)}if(""!==c){if(Object.prototype.hasOwnProperty.call(u,c)){if(c.charCodeAt(0)<256){for(e=0;e<h;e++)m<<=1,v==o-1?(v=0,d.push(n(m)),m=0):v++;for(t=c.charCodeAt(0),e=0;e<8;e++)m=m<<1|1&t,v==o-1?(v=0,d.push(n(m)),m=0):v++,t>>=1}else{for(t=1,e=0;e<h;e++)m=m<<1|t,v==o-1?(v=0,d.push(n(m)),m=0):v++,t=0;for(t=c.charCodeAt(0),e=0;e<16;e++)m=m<<1|1&t,v==o-1?(v=0,d.push(n(m)),m=0):v++,t>>=1}0==--l&&(l=Math.pow(2,h),h++),delete u[c]}else for(t=s[c],e=0;e<h;e++)m=m<<1|1&t,v==o-1?(v=0,d.push(n(m)),m=0):v++,t>>=1;0==--l&&(l=Math.pow(2,h),h++)}for(t=2,e=0;e<h;e++)m=m<<1|1&t,v==o-1?(v=0,d.push(n(m)),m=0):v++,t>>=1;for(;;){if(m<<=1,v==o-1){d.push(n(m));break}v++}return d.join("")},decompress:function(r){return null==r?"":""==r?null:i._decompress(r.length,32768,function(o){return r.charCodeAt(o)})},_decompress:function(o,n,e){var t,i,s,u,a,p,c,l=[],f=4,h=4,d=3,m="",v=[],g={val:e(0),position:n,index:1};for(t=0;t<3;t+=1)l[t]=t;for(s=0,a=Math.pow(2,2),p=1;p!=a;)u=g.val&g.position,g.position>>=1,0==g.position&&(g.position=n,g.val=e(g.index++)),s|=(u>0?1:0)*p,p<<=1;switch(s){case 0:for(s=0,a=Math.pow(2,8),p=1;p!=a;)u=g.val&g.position,g.position>>=1,0==g.position&&(g.position=n,g.val=e(g.index++)),s|=(u>0?1:0)*p,p<<=1;c=r(s);break;case 1:for(s=0,a=Math.pow(2,16),p=1;p!=a;)u=g.val&g.position,g.position>>=1,0==g.position&&(g.position=n,g.val=e(g.index++)),s|=(u>0?1:0)*p,p<<=1;c=r(s);break;case 2:return""}for(l[3]=c,i=c,v.push(c);;){if(g.index>o)return"";for(s=0,a=Math.pow(2,d),p=1;p!=a;)u=g.val&g.position,g.position>>=1,0==g.position&&(g.position=n,g.val=e(g.index++)),s|=(u>0?1:0)*p,p<<=1;switch(c=s){case 0:for(s=0,a=Math.pow(2,8),p=1;p!=a;)u=g.val&g.position,g.position>>=1,0==g.position&&(g.position=n,g.val=e(g.index++)),s|=(u>0?1:0)*p,p<<=1;l[h++]=r(s),c=h-1,f--;break;case 1:for(s=0,a=Math.pow(2,16),p=1;p!=a;)u=g.val&g.position,g.position>>=1,0==g.position&&(g.position=n,g.val=e(g.index++)),s|=(u>0?1:0)*p,p<<=1;l[h++]=r(s),c=h-1,f--;break;case 2:return v.join("")}if(0==f&&(f=Math.pow(2,d),d++),l[c])m=l[c];else{if(c!==h)return null;m=i+i.charAt(0)}v.push(m),l[h++]=i+m.charAt(0),i=m,0==--f&&(f=Math.pow(2,d),d++)}}};return i}();

// netlify/functions/inventario-data.js
//
// BI PRODUCTOS — sincroniza en vivo con BigQuery (Odoo connector).
// Devuelve, por producto: sus 17 identificadores, existencia y create_date por
// sucursal, existencia en CEDIS, costo, y ventas por (sucursal, día) de los últimos
// ~12 meses. Une dos tablas de ventas:
//   - Venta_productos      (location_id)  para fechas >= 2025-12-01
//   - Ventas_Productos_25  (Sucursal txt) para fechas de 2025-01-01 a 2025-11-30
// El navegador filtra por sucursal y rango de fechas, y calcula vendido, venta diaria,
// cobertura, antigüedad, días sin movimiento y utilidad.
//
// Variables de entorno requeridas en Netlify (Site settings → Environment):
//   GCP_PROJECT_ID        = odooconnector-491517
//   GCP_CREDENTIALS_JSON  = (el JSON completo de la service account, una sola línea)
//   DASHBOARD_TOKEN       = (un texto secreto; el dashboard lo manda como ?token=)

const crypto = require('crypto');

const PROJECT_ID = process.env.GCP_PROJECT_ID;
const DASHBOARD_TOKEN = process.env.DASHBOARD_TOKEN;

const TZ = 'America/Tijuana';
const BASE_DATE = '2025-01-01';    // base de offsets y arranque de la ventana (historia completa desde ene-2025)
const MODERN_FROM = '2025-12-29';  // la tabla live arranca en firme el 29-dic; antes, la histórica

// Ubicaciones de tienda (location_id) incluidas en stock y ventas por sucursal.
const LOC_IDS = '84,66,120,54,90,126,114,48,72,78,42,162,24,96,138,180,30,108,102,168,156,36,186,132,60,150,198,192,144,174,4210,11,4093,8';

// location_id -> nombre de sucursal (desde Odoo). 9001 = Mayoreo (canal mayoreo, solo
// existe en la tabla histórica con nombre, sin location real).
const STORES = {
  '84':'Juventud','66':'Cataviña','120':'San Pedro','54':'Carpinteros','90':'Montejano',
  '126':'Villanova','114':'Sendero Mxli','48':'Cachanilla','72':'Galerias','78':'Gran Via',
  '42':'Benito','162':'Macroplaza','24':'Calafia','96':'Nvo Mxli 1','138':'Mandala',
  '180':'Peninsula','30':'Del Mar','108':'Plaza Alta','102':'Nvo Mxli 2','168':'Otay',
  '156':'Hipodromo','36':'Plaza Bonita','186':'Rio','132':'Calle 26','60':'Curto',
  '150':'Cacho','198':'Sendero Tj','192':'Revolución','144':'Aeropuerto','174':'Pacifico',
  '4210':'Sendero Ens','4093':'Tienda en línea','9001':'Mayoreo'
};

// Texto Sucursal (tabla histórica) -> location_id.
const SUC_CASE = `CASE h.Sucursal
  WHEN 'Juventud' THEN 84 WHEN 'Cataviña' THEN 66 WHEN 'San Pedro' THEN 120 WHEN 'Carpinteros' THEN 54
  WHEN 'Montejano' THEN 90 WHEN 'Villanova' THEN 126 WHEN 'Sendero Mxli' THEN 114 WHEN 'Cachanilla' THEN 48
  WHEN 'Galerias' THEN 72 WHEN 'Gran Via' THEN 78 WHEN 'Benito' THEN 42 WHEN 'Macroplaza' THEN 162
  WHEN 'Calafia' THEN 24 WHEN 'Nvo Mxli 1' THEN 96 WHEN 'Mandala' THEN 138 WHEN 'Peninsula' THEN 180
  WHEN 'Del Mar' THEN 30 WHEN 'Plaza Alta' THEN 108 WHEN 'Nvo Mxli 2' THEN 102 WHEN 'Otay' THEN 168
  WHEN 'Hipodromo' THEN 156 WHEN 'Plaza Bonita' THEN 36 WHEN 'Rio' THEN 186 WHEN 'Calle 26' THEN 132
  WHEN 'Curto' THEN 60 WHEN 'Cacho' THEN 150 WHEN 'Sendero TJ' THEN 198 WHEN 'Revolución' THEN 192
  WHEN 'Aeropuerto' THEN 144 WHEN 'Pacifico' THEN 174 WHEN 'Tienda en Linea' THEN 4093 WHEN 'Mayoreo' THEN 9001
  ELSE NULL END`;

const DIMORDER = ['arribo','departamento','marca','familia','grupo','subgrupo','segmento','linea','temporada','color','material','caracteristica','anio','talla','acabado','descuento','proveedor'];
const DIMLABEL = {arribo:'Arribo',departamento:'Departamento',marca:'Marca',familia:'Familia',grupo:'Grupo',subgrupo:'Subgrupo',segmento:'Segmento',linea:'Línea',temporada:'Temporada',color:'Color',material:'Material',caracteristica:'Característica',anio:'Año',talla:'Talla',acabado:'Acabado',descuento:'Descuento',proveedor:'Proveedor'};

// ---------- Autenticación Google ----------
function getCredentials() {
  const raw = process.env.GCP_CREDENTIALS_JSON;
  if (!raw) throw new Error('Falta la variable GCP_CREDENTIALS_JSON');
  return JSON.parse(raw);
}
function base64url(input) {
  return Buffer.from(input).toString('base64').replace(/=/g, '').replace(/\+/g, '-').replace(/\//g, '_');
}
function buildSignedJwt(creds) {
  const now = Math.floor(Date.now() / 1000);
  const header = { alg: 'RS256', typ: 'JWT' };
  const claim = { iss: creds.client_email, scope: 'https://www.googleapis.com/auth/bigquery.readonly', aud: 'https://oauth2.googleapis.com/token', iat: now, exp: now + 3600 };
  const unsigned = base64url(JSON.stringify(header)) + '.' + base64url(JSON.stringify(claim));
  const signer = crypto.createSign('RSA-SHA256');
  signer.update(unsigned);
  const signature = signer.sign(creds.private_key).toString('base64').replace(/=/g, '').replace(/\+/g, '-').replace(/\//g, '_');
  return unsigned + '.' + signature;
}
async function getAccessToken(creds) {
  const jwt = buildSignedJwt(creds);
  const res = await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST', headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: 'grant_type=urn:ietf:params:oauth:grant-type:jwt-bearer&assertion=' + encodeURIComponent(jwt),
  });
  const data = await res.json();
  if (!data.access_token) throw new Error('No se pudo autenticar con Google: ' + JSON.stringify(data));
  return data.access_token;
}
async function runQuery(token, sql) {
  const base = `https://bigquery.googleapis.com/bigquery/v2/projects/${PROJECT_ID}`;
  const res = await fetch(base + '/queries', {
    method: 'POST', headers: { 'Authorization': 'Bearer ' + token, 'Content-Type': 'application/json' },
    body: JSON.stringify({ query: sql, useLegacySql: false, location: 'US', timeoutMs: 60000, maxResults: 50000 }),
  });
  const data = await res.json();
  if (data.error) throw new Error('Error de BigQuery: ' + JSON.stringify(data.error));
  const fields = (data.schema && data.schema.fields) || [];
  const jobId = data.jobReference && data.jobReference.jobId;
  let allRows = data.rows || [];
  let pageToken = data.pageToken;
  while (pageToken && jobId) {
    const u = base + '/queries/' + encodeURIComponent(jobId) + '?location=US&maxResults=50000&pageToken=' + encodeURIComponent(pageToken);
    const r2 = await fetch(u, { headers: { 'Authorization': 'Bearer ' + token } });
    const d2 = await r2.json();
    if (d2.error) throw new Error('Error de BigQuery (paginación): ' + JSON.stringify(d2.error));
    allRows = allRows.concat(d2.rows || []);
    pageToken = d2.pageToken;
  }
  return allRows.map((r) => {
    const obj = {};
    r.f.forEach((cell, i) => { const f = fields[i]; let v = cell.v; if (v !== null && ['INTEGER','FLOAT','NUMERIC'].includes(f.type)) v = Number(v); obj[f.name] = v; });
    return obj;
  });
}

// ---------- Tablas ----------
const PROD = `\`${PROJECT_ID}.odoo_data.Master_Productos\``;
const INV = `\`${PROJECT_ID}.odoo_data.Inventario\``;
const CEDIS = `\`${PROJECT_ID}.odoo_data.Inventario_CEDIS\``;
const VTA = `\`${PROJECT_ID}.odoo_data.Venta_productos\``;
const VTA25 = `\`${PROJECT_ID}.odoo_data.Ventas_Productos_25\``;
const PUENTE = `\`${PROJECT_ID}.odoo_data.tabla_puente\``;
const PROVEEDORES = `\`${PROJECT_ID}.odoo_data.Tabla_Proveedores\``;
const COMPRAS = `\`${PROJECT_ID}.odoo_data.Tabla_de_Compras\``;
const RECEP = `\`${PROJECT_ID}.odoo_data.Recepcion_Cedis\``;

// 1) Producto + 17 identificadores + costo + CEDIS. Universo: con stock en tienda, con
//    venta por sucursal (cualquiera de las dos tablas, jun-2025+), o con stock en CEDIS.
const QUERY_PROD = `
  WITH uni AS (
    SELECT DISTINCT pu.product_tmpl_id AS id FROM ${INV} i JOIN ${PUENTE} pu ON pu.id=i.product_id
      WHERE i.quantity IS NOT NULL AND i.quantity<>0 AND i.location_id IN (${LOC_IDS})
    UNION DISTINCT
    SELECT DISTINCT pu.product_tmpl_id FROM ${VTA} v JOIN ${PUENTE} pu ON pu.id=v.product_id
      WHERE v.state='done' AND DATE(v.create_date,'${TZ}')>='${MODERN_FROM}' AND v.location_id IN (${LOC_IDS})
    UNION DISTINCT
    SELECT DISTINCT h.id FROM ${VTA25} h WHERE h.id IS NOT NULL AND h.Fecha>='${BASE_DATE}' AND h.Fecha<'${MODERN_FROM}'
    UNION DISTINCT
    SELECT DISTINCT pu.product_tmpl_id FROM ${CEDIS} c JOIN ${PUENTE} pu ON pu.id=c.product_id WHERE c.quantity IS NOT NULL AND c.quantity<>0
    UNION DISTINCT
    SELECT DISTINCT pu.product_tmpl_id FROM ${COMPRAS} tc JOIN ${PUENTE} pu ON pu.id=tc.product_id WHERE tc.state='assigned' AND tc.quantity IS NOT NULL AND tc.quantity<>0
    UNION DISTINCT
    SELECT DISTINCT pu.product_tmpl_id FROM ${RECEP} rcv JOIN ${PUENTE} pu ON pu.id=rcv.product_id WHERE rcv.quantity IS NOT NULL AND rcv.quantity<>0
  ),
  costo AS (SELECT product_tmpl_id AS id, AVG(SAFE_CAST(JSON_VALUE(standard_price, '$."1"') AS FLOAT64)) AS costo FROM ${PUENTE} WHERE standard_price IS NOT NULL GROUP BY id),
  cedis AS (SELECT pu.product_tmpl_id AS id, ROUND(SUM(c.quantity),0) AS cedis FROM ${CEDIS} c JOIN ${PUENTE} pu ON pu.id=c.product_id GROUP BY id),
  variante AS (SELECT product_tmpl_id AS id, MIN(id) AS product_id FROM ${PUENTE} GROUP BY product_tmpl_id)
  SELECT m.id AS id, va.product_id AS product_id, m.default_code AS codigo, m.name AS nombre_raw, COALESCE(m.list_price,0) AS precio,
    co.costo AS costo, COALESCE(cd.cedis,0) AS cedis,
    m.x_nombre_del_arribo AS arribo, m.x_departamento_ident AS departamento, m.x_marca_ident AS marca,
    m.x_familia_ident AS familia, m.x_grupo_ident AS grupo, m.x_subgrupo_ident AS subgrupo,
    m.x_segmento_ident AS segmento, m.x_linea_ident AS linea, m.x_temporada_ident AS temporada,
    m.x_color1_ident AS color, m.x_material1_ident AS material, m.x_caracteristica_ident AS caracteristica,
    m.x_ao_ident AS anio, m.x_talla_ident AS talla, m.x_acabado_ident AS acabado, m.x_descuento_ident AS descuento,
    pr.complete_name AS proveedor
  FROM ${PROD} m JOIN uni ON uni.id=m.id
  LEFT JOIN costo co ON co.id=m.id
  LEFT JOIN cedis cd ON cd.id=m.id
  LEFT JOIN variante va ON va.id=m.id
  LEFT JOIN ${PROVEEDORES} pr ON pr.id=m.x_nombre_proveedor`;

// 2) Existencia + create_date(offset) por (producto, sucursal): "loc:qty:coff,...".
const QUERY_STOCK = `
  WITH inv AS (
    SELECT pu.product_tmpl_id AS id, i.location_id AS loc, SUM(i.quantity) AS qty,
           MIN(DATE_DIFF(DATE(i.create_date,'${TZ}'), DATE '${BASE_DATE}', DAY)) AS coff
    FROM ${INV} i JOIN ${PUENTE} pu ON pu.id=i.product_id
    WHERE i.quantity IS NOT NULL AND i.quantity<>0 AND i.location_id IN (${LOC_IDS})
    GROUP BY id, loc HAVING qty<>0
  )
  SELECT id, STRING_AGG(CONCAT(CAST(loc AS STRING),':',CAST(CAST(ROUND(qty) AS INT64) AS STRING),':',CAST(coff AS STRING)),',' ORDER BY loc) AS s
  FROM inv GROUP BY id`;

// 3) Ventas por (producto, sucursal, día) jun-2025+, uniendo ambas tablas: "loc#off:q,off:q|loc#...".
const QUERY_SALES = `
  WITH ventas AS (
    SELECT pu.product_tmpl_id AS id, v.location_id AS loc,
           DATE_DIFF(DATE(v.create_date,'${TZ}'), DATE '${BASE_DATE}', DAY) AS off, v.quantity AS q
    FROM ${VTA} v JOIN ${PUENTE} pu ON pu.id=v.product_id
    WHERE v.state='done' AND DATE(v.create_date,'${TZ}')>='${MODERN_FROM}' AND v.location_id IN (${LOC_IDS})
    UNION ALL
    SELECT h.id AS id, ${SUC_CASE} AS loc, DATE_DIFF(h.Fecha, DATE '${BASE_DATE}', DAY) AS off, h.Cantidad AS q
    FROM ${VTA25} h WHERE h.id IS NOT NULL AND h.Fecha>='${BASE_DATE}' AND h.Fecha<'${MODERN_FROM}'
  ),
  perday AS (SELECT id, loc, off, CAST(ROUND(SUM(q)) AS INT64) AS q FROM ventas WHERE loc IS NOT NULL GROUP BY id, loc, off HAVING q<>0),
  perstore AS (SELECT id, loc, CONCAT(CAST(loc AS STRING),'#',STRING_AGG(CONCAT(CAST(off AS STRING),':',CAST(q AS STRING)),',' ORDER BY off)) AS blk FROM perday GROUP BY id, loc)
  SELECT id, STRING_AGG(blk,'|' ORDER BY loc) AS s FROM perstore GROUP BY id`;

// 4) Tránsito de compras (assigned) por producto: "id:q".
const QUERY_TR = `
  SELECT pu.product_tmpl_id AS id, CAST(ROUND(SUM(c.quantity),0) AS INT64) AS q
  FROM ${COMPRAS} c JOIN ${PUENTE} pu ON pu.id=c.product_id
  WHERE c.state='assigned' AND c.quantity IS NOT NULL
  GROUP BY id HAVING q<>0`;

// 5) En recepción CEDIS por producto: "id:q".
const QUERY_RC = `
  SELECT pu.product_tmpl_id AS id, CAST(ROUND(SUM(r.quantity),0) AS INT64) AS q
  FROM ${RECEP} r JOIN ${PUENTE} pu ON pu.id=r.product_id
  WHERE r.quantity IS NOT NULL
  GROUP BY id HAVING q<>0`;

// ---------- Helpers ----------
const _brk = /\s*\[[^\]]*\]\s*$/;
function cleanName(raw) {
  if (raw == null) return null;
  let name = String(raw);
  if (name.charAt(0) === '{') { try { const d = JSON.parse(name); if (d && typeof d === 'object') name = d.es_419 || d.es_MX || d.en_US || Object.values(d)[0] || ''; } catch (e) {} }
  return name.replace(_brk, '').trim() || null;
}
function todayTijuana() {
  return new Intl.DateTimeFormat('en-CA', { timeZone: TZ, year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date());
}
function diffDays(a, b) { return Math.round((Date.parse(a + 'T00:00:00Z') - Date.parse(b + 'T00:00:00Z')) / 86400000); }

exports.handler = async (event) => {
  const headers = { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store' };
  try {
    if (DASHBOARD_TOKEN) {
      const t = (event.queryStringParameters || {}).token || '';
      if (t !== DASHBOARD_TOKEN) return { statusCode: 401, headers, body: JSON.stringify({ ok: false, error: 'Token inválido' }) };
    }
    const creds = getCredentials();
    const token = await getAccessToken(creds);
    const [prod, stock, sales, transito, recep] = await Promise.all([
      runQuery(token, QUERY_PROD), runQuery(token, QUERY_STOCK), runQuery(token, QUERY_SALES),
      runQuery(token, QUERY_TR), runQuery(token, QUERY_RC),
    ]);

    const stockById = {}; stock.forEach((r) => { stockById[r.id] = r.s; });
    const salesById = {}; sales.forEach((r) => { salesById[r.id] = r.s; });
    const trById = {}; transito.forEach((r) => { trById[r.id] = r.q; });
    const rcById = {}; recep.forEach((r) => { rcById[r.id] = r.q; });

    const dims = {}; const didx = {};
    DIMORDER.forEach((k) => { dims[k] = []; didx[k] = {}; });
    function di(k, val) {
      if (val == null || String(val).trim() === '') val = '(Sin ' + DIMLABEL[k].toLowerCase() + ')';
      val = String(val);
      const m = didx[k];
      if (val in m) return m[val];
      const i = dims[k].length; dims[k].push(val); m[val] = i; return i;
    }
    const rows = prod.map((p) => {
      const dimidx = DIMORDER.map((k) => di(k, p[k]));
      const costo = (p.costo == null || isNaN(p.costo)) ? null : p.costo;
      return [p.id, p.codigo, cleanName(p.nombre_raw) || p.codigo, p.precio || 0, costo]
        .concat(dimidx)
        .concat([p.cedis || 0, stockById[p.id] || '', salesById[p.id] || '', trById[p.id] || 0, rcById[p.id] || 0, p.product_id || null]);
    });

    const hoy = todayTijuana();
    const payload = {
      ok: true, generado: hoy.split('-').reverse().join('/'),
      base: BASE_DATE, hoy: hoy, maxOff: diffDays(hoy, BASE_DATE),
      salesBase: BASE_DATE, salesMinOff: 0,
      dimOrder: DIMORDER, dimLabel: DIMLABEL, dims: dims, stores: STORES, rows: rows,
    };
    const lz = LZString.compressToBase64(JSON.stringify(payload));
    return { statusCode: 200, headers, body: JSON.stringify({ lz: lz }) };
  } catch (err) {
    return { statusCode: 500, headers, body: JSON.stringify({ ok: false, error: String(err && err.message || err) }) };
  }
};
