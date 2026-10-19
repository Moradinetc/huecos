// Endpoint de Vercel: /api/inventario-data
// Reusa la función original (en /lib) a través del adaptador; no duplica lógica.
const adapt = require("../lib/_adapt.js");
const { handler } = require("../lib/inventario-data.js");
module.exports = adapt(handler);
