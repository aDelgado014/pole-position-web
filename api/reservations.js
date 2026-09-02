const REQUEST_TYPES = {
  'Ver la moto': 'view',
  'Reservar una prueba': 'test_ride',
  'Consultar financiación': 'finance',
  'Entregar mi moto': 'trade_in'
};

function clean(value, max) {
  return typeof value === 'string' ? value.trim().slice(0, max) : '';
}

module.exports = async function reservations(request, response) {
  response.setHeader('Cache-Control', 'no-store');
  response.setHeader('X-Content-Type-Options', 'nosniff');

  if (request.method !== 'POST') {
    response.setHeader('Allow', 'POST');
    return response.status(405).json({ error: 'Método no permitido.' });
  }

  const body = request.body || {};
  if (clean(body.website, 100)) return response.status(204).end();

  // Anti-bot: el campo se rellena en el cliente al abrir el diálogo de reserva.
  // Un envío ausente, corrupto o demasiado rápido (< 1.2s) delata un script automatizado.
  const loadedAt = Number(body.loaded_at);
  if (!Number.isFinite(loadedAt) || Date.now() - loadedAt < 1200) {
    return response.status(204).end();
  }

  const payload = {
    vehicle_slug: clean(body.vehicle_id, 120) || null,
    customer_name: clean(body.nombre, 120),
    phone: clean(body.telefono, 32),
    email: clean(body.email, 254),
    request_type: REQUEST_TYPES[body.tipo] || 'other',
    message: clean(body.mensaje, 2000) || null,
    source: 'website',
    consent_at: new Date().toISOString()
  };

  if (payload.customer_name.length < 2 || payload.phone.length < 6 || !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(payload.email)) {
    return response.status(400).json({ error: 'Revisa el nombre, teléfono y email.' });
  }

  const supabaseUrl = process.env.SUPABASE_URL;
  const secretKey = process.env.SUPABASE_SECRET_KEY;
  if (!supabaseUrl || !secretKey) {
    return response.status(503).json({ error: 'Reservas online pendientes de activación.', fallback: 'email' });
  }

  const forwardedFor = request.headers['x-forwarded-for'];
  const ip = (Array.isArray(forwardedFor) ? forwardedFor[0] : forwardedFor || '').split(',')[0].trim() || 'unknown';
  payload.ip_address = ip.slice(0, 64);

  const supabaseHeaders = {
    apikey: secretKey,
    Authorization: `Bearer ${secretKey}`,
    'Content-Type': 'application/json'
  };

  try {
    // Límite de peticiones: máximo 3 solicitudes por IP en 10 minutos.
    // Es una defensa razonable contra bots simples sin depender de un servicio externo nuevo.
    if (ip !== 'unknown') {
      const since = new Date(Date.now() - 10 * 60 * 1000).toISOString();
      const countUrl = `${supabaseUrl}/rest/v1/leads?select=id&ip_address=eq.${encodeURIComponent(ip)}&created_at=gte.${encodeURIComponent(since)}`;
      const countResult = await fetch(countUrl, {
        headers: { ...supabaseHeaders, Prefer: 'count=exact', Range: '0-0' }
      });
      const total = Number(countResult.headers.get('content-range')?.split('/')[1] || 0);
      if (total >= 3) {
        return response.status(429).json({ error: 'Demasiadas solicitudes. Inténtalo de nuevo en unos minutos.' });
      }
    }

    const result = await fetch(`${supabaseUrl}/rest/v1/leads`, {
      method: 'POST',
      headers: { ...supabaseHeaders, Prefer: 'return=minimal' },
      body: JSON.stringify(payload)
    });

    if (!result.ok) {
      console.error('Supabase lead insert failed', result.status);
      return response.status(502).json({ error: 'No pudimos registrar la solicitud.' });
    }
    return response.status(201).json({ ok: true });
  } catch (error) {
    console.error('Reservation handler failed', error instanceof Error ? error.message : 'unknown');
    return response.status(502).json({ error: 'No pudimos registrar la solicitud.' });
  }
};
