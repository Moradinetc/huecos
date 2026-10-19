// Endpoint de Vercel: /api/huecos-snapshot  (la lógica vive en ./_lib, dentro de /api para que Vercel la empaquete)
const adapt = require("./_lib/_adapt.js");
const { handler } = require("./_lib/huecos-snapshot.js");
module.exports = adapt(handler);
