// Endpoint de Vercel: /api/abs-folios  (la lógica vive en ./_lib, dentro de /api para que Vercel la empaquete)
const adapt = require("./_lib/_adapt.js");
const { handler } = require("./_lib/abs-folios.js");
module.exports = adapt(handler);
