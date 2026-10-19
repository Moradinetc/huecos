// Endpoint de Vercel: /api/huecos-snapshot
// Reusa la función original (en /lib) a través del adaptador; no duplica lógica.
const adapt = require("../lib/_adapt.js");
const { handler } = require("../lib/huecos-snapshot.js");
module.exports = adapt(handler);
