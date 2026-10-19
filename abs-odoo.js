// Endpoint de Vercel: /api/abs-odoo
// Reusa la función original (en /lib) a través del adaptador; no duplica lógica.
const adapt = require("../lib/_adapt.js");
const { handler } = require("../lib/abs-odoo.js");
module.exports = adapt(handler);
