# Pole Position Canarias — web

Web del concesionario de motos Pole Position Canarias (Las Palmas de Gran Canaria). Sitio estático (HTML/CSS/JS sin frameworks) con backend serverless en Vercel y base de datos en Supabase.

**Producción:** https://pole-position-motos.vercel.app
**Repositorio:** github.com/aDelgado014/pole-position-web (privado)

## Estructura del proyecto

```
index.html            Página principal (una sola página, navegación por anclas)
styles.css             Todos los estilos, un único archivo
script.js               Lógica del sitio: catálogo, filtros, diálogos, chat, formularios, scroll de Taller
inventory.js            Catálogo estático de respaldo (se usa solo si falla la conexión con Supabase)
admin.html / admin.js   Panel de administración del inventario (/admin.html)
sw.js                    Service worker (PWA: caché básica, carga rápida en visitas repetidas)
api/reservations.js      Función serverless: recibe el formulario de reserva/contacto
api/admin.js             Función serverless: CRUD del inventario para el panel de administración
assets/                  Imágenes (WebP), iconos, y los fotogramas del scroll de Taller
supabase/migrations/     Esquema SQL de la base de datos (histórico, ya aplicado)
privacidad.html, cookies.html, aviso-legal.html   Páginas legales (LSSI-CE / RGPD)
robots.txt, sitemap.xml  SEO técnico
vercel.json              Cabeceras de seguridad (CSP, HSTS, etc.) y configuración de Vercel
```

## Variables de entorno necesarias en Vercel

Ve a **Vercel → proyecto `pole-position-motos` → Settings → Environment Variables** y añade:

| Variable | Valor | Dónde se usa |
|---|---|---|
| `SUPABASE_URL` | `https://ldyimaorzidmdvsysewm.supabase.co` | `api/reservations.js`, `api/admin.js` |
| `SUPABASE_SECRET_KEY` | La clave `service_role` del proyecto de Supabase (**Supabase → Project Settings → API → service_role**, no la copies de aquí, no está en este repo por seguridad) | `api/reservations.js`, `api/admin.js` |
| `ADMIN_TOKEN` | Clave para entrar en `/admin.html`. Puedes usar la que te dimos o generar una nueva | `api/admin.js` |

Sin `SUPABASE_URL`/`SUPABASE_SECRET_KEY`, la web sigue funcionando pero con el catálogo estático de `inventory.js` y sin guardar reservas online (el formulario cae automáticamente a abrir el correo del cliente).

El catálogo público (lectura) usa una clave *anon* que sí está embebida en `script.js` a propósito — es pública por diseño en Supabase y la seguridad real la da la Row Level Security (RLS) de la base de datos, no el secreto de esa clave.

## Despliegue

El proyecto de Vercel (`pole-position-motos`) ya existe y está vinculado (`.vercel/project.json`). Dos formas de desplegar:

1. **Conectar Git (recomendado):** Vercel → proyecto → Settings → Git → "Connect Git Repository" → selecciona este repositorio. A partir de ahí, cada `git push` a `main` despliega solo.
2. **Manual con el CLI:**
   ```
   npm i -g vercel
   vercel login
   vercel --prod
   ```

## Base de datos (Supabase)

Proyecto: `pole-position-motos` (ref `ldyimaorzidmdvsysewm`), plan gratuito, región `eu-west-3`.

Tablas: `vehicles` (catálogo), `vehicle_images` (fotos adicionales, aún sin usar desde el frontend), `leads` (solicitudes de contacto/reserva). Todas con Row Level Security activada — el público solo puede leer motos en estado `available`/`reserved`; escribir requiere la clave `service_role` (solo desde las funciones serverless, nunca desde el navegador).

El esquema completo está en `supabase/migrations/`. Ya está aplicado en el proyecto — esos archivos son el histórico, no hace falta volver a ejecutarlos salvo que crees un proyecto de Supabase nuevo desde cero.

## Panel de administración (`/admin.html`)

Permite gestionar el inventario sin tocar código: cambiar precio, kilometraje, estado (disponible / reservada / vendida / borrador) y orden de aparición, además de dar de alta motos nuevas.

- Entra en `tu-dominio/admin.html` e introduce la clave (`ADMIN_TOKEN`).
- La página no aparece en buscadores (`noindex`) pero no es "secreta" — la seguridad real está en la clave, igual que una contraseña. Si crees que se ha filtrado, cámbiala en Vercel (variable `ADMIN_TOKEN`) y todo el que la tuviera antes queda fuera al instante.
- No sube fotos todavía: el campo "Imagen" espera una ruta ya existente dentro de `/assets` (ej. `assets/motos/inventario/archivo.webp`). Subir la foto al servidor sigue siendo manual por ahora.

## Desarrollo local

No hay build ni dependencias de Node para el frontend. Para probar en local:

```
python3 -m http.server 8000
```

y abre `http://localhost:8000`. Las funciones de `/api` (reservas, admin) no se ejecutan con un servidor estático simple — para probarlas hace falta `vercel dev` (requiere `vercel login`) o desplegar a producción.

## Pendiente (depende del propio negocio, no se puede resolver desde aquí)

- **NIF/CIF y datos registrales** para `aviso-legal.html` y `privacidad.html` (marcados en la propia página).
- **Valoración real de Google** (la cifra "4,4/5 · 156 reseñas" de la web es un placeholder, no se pudo verificar — confírmala en la ficha de Google Business antes de publicar).
- **Cuenta de Instagram activa** a confirmar (@poleposition.sl vs @polepositioncanarias).
- **WhatsApp Business:** el botón flotante ya está en el CSS (`.whatsapp`), solo falta el número y conectarlo.
- **Fotos reales** del stock de ocasión (las actuales son de catálogo/genéricas).
- **Analítica** (GA4 / Meta Pixel), **CRM** y **aviso por email al equipo** cuando entra una reserva: todo esto necesita crear una cuenta externa y darme la clave/ID correspondiente.

## Seguridad

Cabeceras de seguridad (CSP, HSTS, X-Frame-Options, etc.) en `vercel.json`. El formulario de reservas tiene honeypot + verificación de tiempo de envío + límite de 3 solicitudes por IP cada 10 minutos (todo server-side, sin depender de un servicio externo). El panel de administración usa comparación de token a tiempo constante para evitar timing attacks.
