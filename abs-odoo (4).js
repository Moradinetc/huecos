// Endpoint de Vercel: /api/abs-odoo  (la lógica vive en ./_lib, dentro de /api para que Vercel la empaquete)
const adapt = require("./_lib/_adapt.js");
const { handler } = require("./_lib/abs-odoo.js");
module.exports = adapt(handler);
