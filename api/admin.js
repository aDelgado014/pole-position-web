const crypto = require('crypto');

function timingSafeEqual(a, b) {
  const bufA = Buffer.from(String(a || ''));
  const bufB = Buffer.from(String(b || ''));
  if (bufA.length !== bufB.length) {
    // Igualamos longitudes para que la comparación siga tardando lo mismo (evita filtrar la longitud del token).
    crypto.timingSafeEqual(bufA, bufA);
    return false;
  }
  return crypto.timingSafeEqual(bufA, bufB);
}

function isAuthorized(request) {
  const token = request.headers['x-admin-token'];
  const expected = process.env.ADMIN_TOKEN;
  if (!expected) return false;
  return timingSafeEqual(token, expected);
}

const ALLOWED_FIELDS = [
  'slug', 'brand', 'model', 'family', 'condition', 'condition_label',
  'price', 'year', 'km', 'categories', 'description', 'image_path',
  'image_alt', 'theme', 'specs', 'status', 'featured_position'
];

function pickAllowed(body) {
  const out = {};
  for (const key of ALLOWED_FIELDS) {
    if (body[key] !== undefined) out[key] = body[key];
  }
  return out;
}

async function supabaseFetch(path, options = {}) {
  const supabaseUrl = process.env.SUPABASE_URL;
  const secretKey = process.env.SUPABASE_SECRET_KEY;
  if (!supabaseUrl || !secretKey) {
    throw Object.assign(new Error('Supabase no configurado'), { status: 503 });
  }
  const response = await fetch(`${supabaseUrl}/rest/v1/${path}`, {
    ...options,
    headers: {
      apikey: secretKey,
      Authorization: `Bearer ${secretKey}`,
      'Content-Type': 'application/json',
      ...(options.headers || {})
    }
  });
  return response;
}

module.exports = async function admin(request, response) {
  response.setHeader('Cache-Control', 'no-store');
  response.setHeader('X-Content-Type-Options', 'nosniff');

  if (!isAuthorized(request)) {
    return response.status(401).json({ error: 'No autorizado.' });
  }

  try {
    if (request.method === 'GET') {
      const r = await supabaseFetch('vehicles?select=*&order=featured_position.asc.nullslast,created_at.desc');
      const data = await r.json();
      if (!r.ok) return response.status(r.status).json({ error: 'No se pudo leer el inventario.', detail: data });
      return response.status(200).json(data);
    }

    if (request.method === 'POST') {
      const body = pickAllowed(request.body || {});
      if (!body.slug || !body.brand || !body.model) {
        return response.status(400).json({ error: 'Faltan campos obligatorios: slug, brand, model.' });
      }
      const r = await supabaseFetch('vehicles', {
        method: 'POST',
        headers: { Prefer: 'return=representation' },
        body: JSON.stringify(body)
      });
      const data = await r.json();
      if (!r.ok) return response.status(r.status).json({ error: 'No se pudo crear el vehículo.', detail: data });
      return response.status(201).json(data);
    }

    if (request.method === 'PATCH') {
      const id = request.query?.id || (request.body && request.body.id);
      if (!id) return response.status(400).json({ error: 'Falta el id del vehículo.' });
      const body = pickAllowed(request.body || {});
      const r = await supabaseFetch(`vehicles?id=eq.${encodeURIComponent(id)}`, {
        method: 'PATCH',
        headers: { Prefer: 'return=representation' },
        body: JSON.stringify(body)
      });
      const data = await r.json();
      if (!r.ok) return response.status(r.status).json({ error: 'No se pudo actualizar el vehículo.', detail: data });
      return response.status(200).json(data);
    }

    if (request.method === 'DELETE') {
      const id = request.query?.id;
      if (!id) return response.status(400).json({ error: 'Falta el id del vehículo.' });
      const r = await supabaseFetch(`vehicles?id=eq.${encodeURIComponent(id)}`, { method: 'DELETE' });
      if (!r.ok) {
        const data = await r.json().catch(() => null);
        return response.status(r.status).json({ error: 'No se pudo borrar el vehículo.', detail: data });
      }
      return response.status(204).end();
    }

    response.setHeader('Allow', 'GET, POST, PATCH, DELETE');
    return response.status(405).json({ error: 'Método no permitido.' });
  } catch (error) {
    console.error('Admin handler failed', error instanceof Error ? error.message : 'unknown');
    return response.status(error.status || 500).json({ error: 'Error interno del panel.' });
  }
};
