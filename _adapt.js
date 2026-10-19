// Adaptador: envuelve un handler estilo Netlify (event → {statusCode, headers, body})
// para que corra como función de Vercel (req, res). No cambia la lógica de las funciones.
module.exports = function adapt(handler) {
  return async function (req, res) {
    // req.body en Vercel puede venir ya parseado (objeto) o como string; lo normalizamos a string
    let body = req.body;
    if (body != null && typeof body !== "string") {
      try { body = JSON.stringify(body); } catch (e) { body = "{}"; }
    }
    const event = {
      httpMethod: req.method,
      body: body || "",
      queryStringParameters: req.query || {},
      headers: req.headers || {},
    };
    let result;
    try {
      result = await handler(event);
    } catch (err) {
      res.status(500).json({ ok: false, error: String((err && err.message) || err) });
      return;
    }
    const headers = (result && result.headers) || {};
    for (const k in headers) { try { res.setHeader(k, headers[k]); } catch (e) {} }
    res.status((result && result.statusCode) || 200);
    res.send((result && result.body) != null ? result.body : "");
  };
};
