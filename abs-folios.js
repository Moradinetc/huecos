// Endpoint de Vercel: /api/abs-folios
// Reusa la función original (en /lib) a través del adaptador; no duplica lógica.
const adapt = require("../lib/_adapt.js");
const { handler } = require("../lib/abs-folios.js");
module.exports = adapt(handler);
