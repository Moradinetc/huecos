# BI Productos — Despliegue en Netlify (sincronizado con BigQuery)

Esta carpeta es un sitio Netlify que muestra el dashboard **BI Productos** jalando
los datos **en vivo** de BigQuery (proyecto `odooconnector-491517`, dataset `odoo_data`)
a través de una función serverless. No lleva datos embebidos: cada vez que se abre,
consulta BigQuery.

## Contenido
- `index.html` — el dashboard (consulta `/api/inventario-data`).
- `netlify.toml` — redirección de la API, timeout de la función y cabeceras.
- `netlify/functions/inventario-data.js` — conecta a BigQuery y arma los datos.

## Variables de entorno (Netlify → Site settings → Environment variables)
Configura estas TRES variables (son las mismas que usa tu otro dashboard):

| Variable | Valor |
|---|---|
| `GCP_PROJECT_ID` | `odooconnector-491517` |
| `GCP_CREDENTIALS_JSON` | El JSON completo de la *service account* de Google, en **una sola línea**. Debe tener permiso de lectura en BigQuery (rol *BigQuery Data Viewer* + *BigQuery Job User*). |
| `DASHBOARD_TOKEN` | Un texto secreto que tú inventes (ej. `etcetera-bi-2026`). El dashboard lo manda en la URL. Si lo dejas vacío, se desactiva la protección por token. |

## Cómo subirlo
**Opción A — arrastrar y soltar (lo más rápido):**
1. Entra a https://app.netlify.com → "Add new site" → "Deploy manually".
2. Arrastra **el contenido de esta carpeta** (no la carpeta, sino lo de adentro: `index.html`, `netlify.toml` y la carpeta `netlify/`).
3. Ve a *Site settings → Environment variables* y agrega las 3 variables de arriba.
4. *Deploys → Trigger deploy → Deploy site* para que tome las variables.

**Opción B — Git:** sube esta carpeta a un repo y conéctalo en Netlify. Mismo set de variables.

## Cómo abrirlo
Entra con el token en la URL:

```
https://TU-SITIO.netlify.app/?token=TU_DASHBOARD_TOKEN
```

(Si dejaste `DASHBOARD_TOKEN` vacío, basta con `https://TU-SITIO.netlify.app/`.)

## Notas
- La función corre 3 consultas a BigQuery y arma ~5 MB de datos; puede tardar unos
  segundos en la primera carga. El `timeout` está en 26s (plan Pro). En plan free el
  máximo es 10s; si llegara a cortarse, conviene subir de plan o avisarme para optimizar.
- Las ventas por sucursal existen desde **dic-2025** (el histórico 2025 no trae sucursal);
  por eso el rango de fechas arranca en `2025-12-01`. El stock por sucursal es al día.
- La **antigüedad** sale de `Inventario.create_date`; recuerda que la carga inicial del
  sistema fue dic-2025, así que para mucho producto sale parejo (~la misma fecha).
- Los **nombres de sucursal** están fijos en la función (mapeados desde Odoo). Si abren o
  renombran tiendas, hay que actualizar el objeto `STORES` dentro de `inventario-data.js`.
