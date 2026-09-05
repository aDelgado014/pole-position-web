// El catálogo se sirve desde Supabase (tabla "vehicles"); si falla o no hay red,
// caemos al inventario estático embebido en inventory.js para que la tienda nunca se quede vacía.
const SUPABASE_URL = 'https://ldyimaorzidmdvsysewm.supabase.co';
const SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImxkeWltYW9yemlkbWR2c3lzZXdtIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODgyOTE3MTAsImV4cCI6MjEwMzg2NzcxMH0.bJIg9dfEWdUq2KptYqtjAWpDnWAmve5Te4ZF51LkW9c';

let inventory = Array.isArray(window.POLE_INVENTORY) ? window.POLE_INVENTORY : [];

function mapSupabaseVehicle(row) {
  return {
    id: row.slug,
    brand: row.brand,
    model: row.model,
    family: row.family,
    condition: row.condition,
    conditionLabel: row.condition_label,
    category: Array.isArray(row.categories) ? row.categories : [],
    price: row.price === null || row.price === undefined ? null : Number(row.price),
    year: Number(row.year),
    km: Number(row.km) || 0,
    image: row.image_path,
    alt: row.image_alt,
    theme: row.theme || 'card-white',
    status: row.status,
    description: row.description,
    specs: row.specs || {}
  };
}

async function loadInventory() {
  try {
    const url = `${SUPABASE_URL}/rest/v1/vehicles?select=*&status=in.(available,reserved)&order=featured_position.asc.nullslast,created_at.desc`;
    const response = await fetch(url, {
      headers: { apikey: SUPABASE_ANON_KEY, Authorization: `Bearer ${SUPABASE_ANON_KEY}` }
    });
    if (!response.ok) throw new Error(`Supabase respondió ${response.status}`);
    const rows = await response.json();
    if (Array.isArray(rows) && rows.length) {
      inventory = rows.map(mapSupabaseVehicle);
    }
  } catch (error) {
    console.warn('No se pudo cargar el inventario en vivo, usando catálogo estático de respaldo.', error);
  }
}
const euro = new Intl.NumberFormat('es-ES', { style: 'currency', currency: 'EUR', maximumFractionDigits: 0 });
const number = new Intl.NumberFormat('es-ES');
const state = { filter: 'all', query: '', sort: 'featured' };

function escapeHtml(value) {
  return String(value ?? '').replace(/[&<>"']/g, (ch) => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'
  })[ch]);
}

const menuButton = document.querySelector('.menu-toggle');
const nav = document.querySelector('.main-nav');
const grid = document.querySelector('#inventory-grid');
const count = document.querySelector('#inventory-count');
const empty = document.querySelector('#inventory-empty');
const detailDialog = document.querySelector('#vehicle-dialog');
const reserveDialog = document.querySelector('#reserve-dialog');

menuButton?.addEventListener('click', () => {
  const open = nav.classList.toggle('open');
  menuButton.setAttribute('aria-expanded', String(open));
  menuButton.setAttribute('aria-label', open ? 'Cerrar menú' : 'Abrir menú');
});

document.querySelectorAll('.main-nav a').forEach((link) => {
  link.addEventListener('click', () => {
    nav.classList.remove('open');
    menuButton?.setAttribute('aria-expanded', 'false');
  });
});

function normalize(value) {
  return String(value).toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '');
}

function priceLabel(vehicle) {
  return vehicle.price ? euro.format(vehicle.price) : 'Consultar';
}

function vehicleSearchText(vehicle) {
  return normalize([vehicle.brand, vehicle.model, vehicle.family, vehicle.condition, vehicle.conditionLabel, ...vehicle.category].join(' '));
}

function visibleInventory() {
  const query = normalize(state.query.trim());
  const list = inventory.filter((vehicle) => {
    const categoryMatch = state.filter === 'all' || vehicle.condition === state.filter || vehicle.category.includes(state.filter);
    return categoryMatch && (!query || vehicleSearchText(vehicle).includes(query));
  });

  return [...list].sort((a, b) => {
    if (state.sort === 'price-asc') return (a.price ?? Infinity) - (b.price ?? Infinity);
    if (state.sort === 'price-desc') return (b.price ?? -1) - (a.price ?? -1);
    if (state.sort === 'newest') return b.year - a.year;
    return inventory.indexOf(a) - inventory.indexOf(b);
  });
}

function cardTemplate(vehicle) {
  const metric = vehicle.km > 0 ? `${number.format(vehicle.km)} km` : vehicle.specs.Cilindrada || vehicle.specs.Autonomía || '0 km';
  const metricLabel = vehicle.km > 0 ? 'Kilometraje' : vehicle.specs.Cilindrada ? 'Cilindrada' : 'Autonomía';
  return `<article class="bike-card ${vehicle.theme}" data-id="${escapeHtml(vehicle.id)}">
    <div class="card-top"><span class="pill">${escapeHtml(vehicle.conditionLabel)}</span><span>${escapeHtml(vehicle.brand.toUpperCase())}</span></div>
    <img class="bike-visual" src="${escapeHtml(vehicle.image)}" alt="${escapeHtml(vehicle.alt)}" loading="lazy" decoding="async">
    <div class="bike-info">
      <p>${escapeHtml(vehicle.family)}</p><h3>${escapeHtml(vehicle.model)}</h3>
      <div class="card-facts"><span><b>${escapeHtml(metric)}</b>${escapeHtml(metricLabel)}</span><span><b>${escapeHtml(vehicle.year)}</b>Año</span></div>
      <div class="card-price"><strong>${escapeHtml(priceLabel(vehicle))}</strong>${vehicle.price ? '<small>Precio anunciado</small>' : '<small>Disponibilidad bajo consulta</small>'}</div>
      <button class="card-action" type="button" data-view="${escapeHtml(vehicle.id)}" aria-label="Ver ficha de ${escapeHtml(vehicle.brand)} ${escapeHtml(vehicle.model)}">Ver ficha completa <b>↗</b></button>
    </div>
  </article>`;
}

function applyTilt() {
  if (window.matchMedia('(prefers-reduced-motion: reduce)').matches || !window.matchMedia('(hover: hover) and (pointer: fine)').matches) return;
  document.querySelectorAll('.bike-card').forEach((card) => {
    card.addEventListener('pointermove', (event) => {
      const bounds = card.getBoundingClientRect();
      card.style.setProperty('--ry', `${((event.clientX - bounds.left) / bounds.width - 0.5) * 4}deg`);
      card.style.setProperty('--rx', `${((event.clientY - bounds.top) / bounds.height - 0.5) * -4}deg`);
    });
    card.addEventListener('pointerleave', () => {
      card.style.setProperty('--ry', '0deg');
      card.style.setProperty('--rx', '0deg');
    });
  });
}

function renderInventory() {
  const results = visibleInventory();
  grid.innerHTML = results.map(cardTemplate).join('');
  count.textContent = `${results.length} ${results.length === 1 ? 'moto encontrada' : 'motos encontradas'}`;
  empty.hidden = results.length !== 0;
  applyTilt();
}

document.querySelectorAll('.filter').forEach((button) => {
  button.addEventListener('click', () => {
    document.querySelectorAll('.filter').forEach((item) => {
      const active = item === button;
      item.classList.toggle('active', active);
      item.setAttribute('aria-pressed', String(active));
    });
    state.filter = button.dataset.filter;
    renderInventory();
  });
});

document.querySelector('#inventory-search')?.addEventListener('input', (event) => {
  state.query = event.target.value;
  renderInventory();
});

document.querySelector('#inventory-sort')?.addEventListener('change', (event) => {
  state.sort = event.target.value;
  renderInventory();
});

document.querySelector('#clear-filters')?.addEventListener('click', () => {
  state.filter = 'all'; state.query = ''; state.sort = 'featured';
  document.querySelector('#inventory-search').value = '';
  document.querySelector('#inventory-sort').value = 'featured';
  document.querySelectorAll('.filter').forEach((item) => {
    const active = item.dataset.filter === 'all';
    item.classList.toggle('active', active);
    item.setAttribute('aria-pressed', String(active));
  });
  renderInventory();
});

const FINANCE_APR = 0.095; // TIN orientativo para el simulador (no es una oferta vinculante)

function financeMonthly(principal, months) {
  const r = FINANCE_APR / 12;
  if (principal <= 0 || months <= 0) return 0;
  return (principal * r) / (1 - Math.pow(1 + r, -months));
}

function financeCalcTemplate(vehicle) {
  if (!vehicle.price) return '';
  return `<div class="finance-calc" data-price="${vehicle.price}">
    <p class="finance-calc-title">Simulador de financiación <small>(orientativo)</small></p>
    <div class="finance-calc-controls">
      <label>Entrada<select data-finance="down"><option value="0">0%</option><option value="10">10%</option><option value="20" selected>20%</option><option value="30">30%</option></select></label>
      <label>Plazo<select data-finance="months"><option value="24">24 meses</option><option value="36" selected>36 meses</option><option value="48">48 meses</option><option value="60">60 meses</option></select></label>
    </div>
    <p class="finance-calc-result">Cuota estimada: <strong data-finance="result">—</strong>/mes</p>
    <p class="finance-calc-disclaimer">Cálculo orientativo a TIN ${(FINANCE_APR * 100).toFixed(1).replace('.', ',')}% de ejemplo, sin comisiones. No es una oferta vinculante; la condición final depende del estudio de financiación de nuestro partner.</p>
  </div>`;
}

function updateFinanceCalc(container) {
  const calc = container.querySelector('.finance-calc');
  if (!calc) return;
  const price = Number(calc.dataset.price);
  const downPct = Number(calc.querySelector('[data-finance="down"]').value);
  const months = Number(calc.querySelector('[data-finance="months"]').value);
  const principal = price * (1 - downPct / 100);
  const monthly = financeMonthly(principal, months);
  calc.querySelector('[data-finance="result"]').textContent = monthly ? euro.format(monthly) : '—';
}

function openVehicle(vehicle) {
  const specs = Object.entries(vehicle.specs).map(([label, value]) => `<div><span>${escapeHtml(label)}</span><strong>${escapeHtml(value)}</strong></div>`).join('');
  const detail = document.querySelector('#vehicle-detail');
  detail.innerHTML = `<div class="detail-image ${vehicle.theme}"><span class="pill">${escapeHtml(vehicle.conditionLabel)}</span><img src="${escapeHtml(vehicle.image)}" alt="${escapeHtml(vehicle.alt)}" decoding="async"></div>
    <div class="detail-copy"><p class="eyebrow dark"><span></span>${escapeHtml(vehicle.brand.toUpperCase())}</p><h2 id="vehicle-dialog-title">${escapeHtml(vehicle.model)}</h2><p class="detail-family">${escapeHtml(vehicle.family)}</p><p>${escapeHtml(vehicle.description)}</p>
    <div class="detail-specs">${specs}</div><div class="detail-buy"><div><small>Precio</small><strong>${escapeHtml(priceLabel(vehicle))}</strong><span>${vehicle.price ? 'Sujeto a disponibilidad' : 'Solicita precio y disponibilidad'}</span></div><button class="button button-primary" type="button" data-reserve="${escapeHtml(vehicle.id)}">Quiero esta moto <span>↗</span></button></div>
    ${financeCalcTemplate(vehicle)}</div>`;
  updateFinanceCalc(detail);
  detailDialog.showModal();
}

document.querySelector('#vehicle-detail')?.addEventListener('change', (event) => {
  if (event.target.closest('[data-finance]')) updateFinanceCalc(event.currentTarget);
});

function openReserve(vehicle) {
  if (detailDialog.open) detailDialog.close();
  document.querySelector('#reserve-vehicle-id').value = vehicle.id;
  document.querySelector('#reserve-vehicle').textContent = `${vehicle.brand} ${vehicle.model} · ${priceLabel(vehicle)}`;
  document.querySelector('#reserve-loaded-at').value = String(Date.now());
  reserveDialog.showModal();
}

grid?.addEventListener('click', (event) => {
  const button = event.target.closest('[data-view]');
  const vehicle = button && inventory.find((item) => item.id === button.dataset.view);
  if (vehicle) openVehicle(vehicle);
});

document.querySelector('#vehicle-detail')?.addEventListener('click', (event) => {
  const button = event.target.closest('[data-reserve]');
  const vehicle = button && inventory.find((item) => item.id === button.dataset.reserve);
  if (vehicle) openReserve(vehicle);
});

document.querySelector('[data-close-dialog]')?.addEventListener('click', () => detailDialog.close());
document.querySelector('[data-close-reserve]')?.addEventListener('click', () => reserveDialog.close());
[detailDialog, reserveDialog].forEach((dialog) => dialog?.addEventListener('click', (event) => {
  if (event.target === dialog) dialog.close();
}));

function reservationEmail(data, vehicle) {
  const subject = `Solicitud web · ${vehicle ? `${vehicle.brand} ${vehicle.model}` : data.get('interes')}`;
  const body = [
    'Hola Pole Position,', '',
    `Nombre: ${data.get('nombre')}`,
    `Teléfono: ${data.get('telefono')}`,
    data.get('email') ? `Email: ${data.get('email')}` : '',
    data.get('tipo') ? `Solicitud: ${data.get('tipo')}` : `Interés: ${data.get('interes')}`,
    vehicle ? `Moto: ${vehicle.brand} ${vehicle.model} (${priceLabel(vehicle)})` : '',
    data.get('mensaje') ? `Mensaje: ${data.get('mensaje')}` : ''
  ].filter(Boolean).join('\n');
  return `mailto:info@polepositioncanarias.es?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(body)}`;
}

document.querySelector('#reserve-form')?.addEventListener('submit', async (event) => {
  event.preventDefault();
  const form = event.currentTarget;
  const data = new FormData(form);
  const vehicle = inventory.find((item) => item.id === data.get('vehicle_id'));
  const status = form.querySelector('.form-status');
  const submit = form.querySelector('[type="submit"]');
  status.textContent = 'Enviando solicitud…';
  submit.disabled = true;
  try {
    const response = await fetch('/api/reservations', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(Object.fromEntries(data))
    });
    if (!response.ok) throw new Error('online reservations unavailable');
    status.textContent = 'Solicitud recibida. El equipo contactará contigo.';
    form.reset();
    window.setTimeout(() => reserveDialog.close(), 1800);
  } catch {
    status.textContent = 'Abriendo tu correo para completar el envío…';
    window.location.href = reservationEmail(data, vehicle);
  } finally {
    submit.disabled = false;
  }
});

document.querySelector('#lead-form')?.addEventListener('submit', (event) => {
  event.preventDefault();
  const form = event.currentTarget;
  const data = new FormData(form);
  form.querySelector('.form-status').textContent = 'Abriendo tu correo para enviar la consulta…';
  window.location.href = reservationEmail(data);
});

const launcher = document.querySelector('#chat-launcher');
const assistant = document.querySelector('#shop-assistant');
const chatLog = document.querySelector('#chat-log');
const suggestions = ['Motos de ocasión', 'Opciones para A2', 'Menos de 5.000 €', 'Horario y ubicación'];

function addChatMessage(text, author = 'bot') {
  const message = document.createElement('div');
  message.className = `chat-message ${author}`;
  message.textContent = text;
  chatLog.appendChild(message);
  chatLog.scrollTop = chatLog.scrollHeight;
}

function renderSuggestions() {
  document.querySelector('#chat-suggestions').innerHTML = suggestions.map((item) => `<button type="button">${item}</button>`).join('');
}

function describeMatches(matches) {
  if (!matches.length) return 'Ahora mismo no encuentro una coincidencia exacta en el catálogo publicado. Puedo ayudarte a ampliar la búsqueda o puedes llamar al 928 48 50 92 para consultar otras unidades.';
  const shown = matches.slice(0, 3).map((item) => `${item.brand} ${item.model} (${priceLabel(item)})`).join(', ');
  return `Estas son las mejores coincidencias: ${shown}. Puedes buscarlas en la tienda y abrir su ficha para solicitar una cita.`;
}

function botReply(raw) {
  const text = normalize(raw);
  if (/hola|buenas|hey/.test(text)) return '¡Hola! Puedo buscar motos por marca, presupuesto, tipo, estado o carné. ¿Qué tienes en mente?';
  if (/horario|abren|abierto|ubicacion|direccion|donde/.test(text)) return 'Estamos en C. Joaquín Blume, 21, Las Palmas de Gran Canaria. El horario publicado es de lunes a viernes, 09:00–13:00 y 15:00–19:00. Teléfono: 928 48 50 92.';
  if (/taller|revision|averia|neumatic|freno/.test(text)) return 'El taller atiende mantenimiento, diagnóstico, neumáticos, frenos, recambios y accesorios. Puedes pedir cita desde el formulario de contacto o llamar al 928 48 50 92.';
  if (/financia|cuota|plazo/.test(text)) return 'Podemos preparar una consulta de financiación sobre una moto concreta. Abre su ficha y elige “Consultar financiación”; el equipo confirmará entrada, plazo y condiciones.';
  if (/telefono|whatsapp|movil|llamar/.test(text)) return 'El teléfono público verificado es el 928 48 50 92. No hemos encontrado un móvil o WhatsApp oficial verificado, así que la web usa llamada y correo para evitar enviarte a un número incorrecto.';

  const compactNumber = raw.match(/(?:€|eur)?\s*(\d{1,2}(?:[.\s]\d{3})+|\d{4,5})\s*(?:€|eur)?/i);
  if (compactNumber) {
    const budget = Number(compactNumber[1].replace(/[.\s]/g, ''));
    return describeMatches(inventory.filter((item) => item.price && item.price <= budget).sort((a, b) => a.price - b.price));
  }

  let matches = inventory;
  if (/ocasion|segunda mano|usada/.test(text)) matches = matches.filter((item) => item.condition === 'ocasion');
  else if (/km0|km 0/.test(text)) matches = matches.filter((item) => item.condition === 'km0');
  else if (/nueva|nuevo/.test(text)) matches = matches.filter((item) => item.condition === 'nueva');
  else if (/electrica|electrico/.test(text)) matches = matches.filter((item) => item.category.includes('electrica'));
  else if (/a2|carnet/.test(text)) matches = matches.filter((item) => item.category.includes('a2'));
  else {
    const direct = inventory.filter((item) => vehicleSearchText(item).split(' ').some((term) => term.length > 2 && text.includes(term)));
    if (direct.length) matches = direct;
    else return 'Puedo ayudarte con motos nuevas, KM0, de ocasión, eléctricas, opciones A2, presupuesto, taller, horario y ubicación. Prueba, por ejemplo: “una moto A2 por menos de 5.000 €”.';
  }
  return describeMatches(matches);
}

function openChat() {
  assistant.hidden = false;
  launcher.setAttribute('aria-expanded', 'true');
  if (!chatLog.children.length) {
    addChatMessage('Hola, soy el asistente de Pole Position. Dime qué moto buscas y revisaré el inventario publicado.');
    renderSuggestions();
  }
  document.querySelector('#chat-input').focus();
}

function closeChat() {
  assistant.hidden = true;
  launcher.setAttribute('aria-expanded', 'false');
  launcher.focus();
}

launcher?.addEventListener('click', () => assistant.hidden ? openChat() : closeChat());
document.querySelector('#chat-close')?.addEventListener('click', closeChat);
document.querySelector('#chat-suggestions')?.addEventListener('click', (event) => {
  const button = event.target.closest('button');
  if (!button) return;
  addChatMessage(button.textContent, 'user');
  addChatMessage(botReply(button.textContent));
});
document.querySelector('#chat-form')?.addEventListener('submit', (event) => {
  event.preventDefault();
  const input = document.querySelector('#chat-input');
  const value = input.value.trim();
  if (!value) return;
  addChatMessage(value, 'user');
  input.value = '';
  window.setTimeout(() => addChatMessage(botReply(value)), 220);
});

document.addEventListener('keydown', (event) => {
  if (event.key === 'Escape' && !assistant.hidden) closeChat();
});

document.querySelector('#year').textContent = new Date().getFullYear();
loadInventory().finally(renderInventory);

if ('serviceWorker' in navigator) {
  window.addEventListener('load', () => {
    navigator.serviceWorker.register('/sw.js').catch(() => {});
  });
}


/* Ritmo de scroll: progreso continuo y revelado suave de las secciones. */
(function initScrollTransitions() {
  const reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  if (reduceMotion) return;

  const root = document.documentElement;
  root.classList.add('js-reveal-active');

  const progress = document.createElement('div');
  progress.className = 'scroll-progress';
  progress.setAttribute('aria-hidden', 'true');
  document.body.prepend(progress);

  const revealTargets = document.querySelectorAll(
    '.choice-path-inner, .brand-strip, .inventory .section-heading, .inventory-tools, #inventory-grid, .service-grid, .experience, .reviews-head, .review-grid, .contact-grid, .footer-grid'
  );
  revealTargets.forEach((target) => target.classList.add('scroll-reveal'));

  const revealObserver = new IntersectionObserver((entries) => {
    entries.forEach((entry) => {
      if (!entry.isIntersecting) return;
      entry.target.classList.add('is-visible');
      revealObserver.unobserve(entry.target);
    });
  }, { threshold: 0.01, rootMargin: '0px 0px -6% 0px' });
  revealTargets.forEach((target) => revealObserver.observe(target));

  function revealVisible() {
    revealTargets.forEach((target) => {
      if (target.classList.contains('is-visible')) return;
      const rect = target.getBoundingClientRect();
      if (rect.top < window.innerHeight * 0.94 && rect.bottom > 0) {
        target.classList.add('is-visible');
        revealObserver.unobserve(target);
      }
    });
  }

  let ticking = false;
  function updateScrollProgress() {
    revealVisible();
    const available = root.scrollHeight - window.innerHeight;
    const ratio = available > 0 ? Math.min(1, Math.max(0, window.scrollY / available)) : 0;
    root.style.setProperty('--scroll-progress', ratio.toFixed(4));
    ticking = false;
  }

  window.addEventListener('scroll', () => {
    if (ticking) return;
    ticking = true;
    requestAnimationFrame(updateScrollProgress);
  }, { passive: true });
  updateScrollProgress();
})();

/* Scrollytelling: despiece de la moto ligado al scroll (sección Taller) */
(function initScrolly() {
  const section = document.querySelector('#detalle-taller');
  const canvas = document.querySelector('#scrolly-canvas');
  if (!section || !canvas) return;

  const FRAME_COUNT = 65;
  const framePath = (i) => `assets/taller/taller-${String(i).padStart(3, '0')}.webp`;
  const ctx = canvas.getContext('2d');
  const caption = document.querySelector('#scrolly-caption');
  const captionHeading = caption?.querySelector('h2');
  const progressBar = document.querySelector('#scrolly-progress-bar');
  const captions = [
    'Cada pieza cuenta.',
    'Solo recambio de calidad.',
    'Tu moto, siempre a punto.'
  ];

  const reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;

  const images = new Array(FRAME_COUNT);
  let loadedCount = 0;
  let ready = false;

  function drawFrame(index) {
    const img = images[index];
    if (!img || !img.complete || !img.naturalWidth) return;
    if (canvas.width !== img.naturalWidth) canvas.width = img.naturalWidth;
    if (canvas.height !== img.naturalHeight) canvas.height = img.naturalHeight;
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    ctx.drawImage(img, 0, 0);
  }

  function loadFrames() {
    if (ready) return;
    ready = true;
    for (let i = 0; i < FRAME_COUNT; i++) {
      const img = new Image();
      img.decoding = 'async';
      img.onload = () => {
        loadedCount++;
        if (i === 0) drawFrame(0);
      };
      img.src = framePath(i);
      images[i] = img;
    }
  }

  if (reduceMotion) {
    // Sin animación: mostramos un único fotograma representativo (la moto ya despiezada) y salimos.
    canvas.width = 900; canvas.height = 600;
    const still = new Image();
    still.decoding = 'async';
    images[FRAME_COUNT - 1] = still;
    still.onload = () => drawFrame(FRAME_COUNT - 1);
    still.src = framePath(FRAME_COUNT - 1);
    return;
  }

  // Empezamos a precargar los fotogramas un poco antes de que la sección entre en pantalla.
  const preloadObserver = new IntersectionObserver((entries) => {
    entries.forEach((entry) => {
      if (entry.isIntersecting) {
        loadFrames();
        preloadObserver.disconnect();
      }
    });
  }, { rootMargin: '600px 0px' });
  preloadObserver.observe(section);

  let currentFrame = -1;
  let currentCaptionIndex = -1;
  let ticking = false;

  function updateCaption(index) {
    if (index === currentCaptionIndex || !caption || !captionHeading) return;
    currentCaptionIndex = index;
    caption.classList.add('is-fading');
    window.setTimeout(() => {
      captionHeading.textContent = captions[index];
      caption.classList.remove('is-fading');
    }, 180);
  }

  function onScroll() {
    if (ticking) return;
    ticking = true;
    requestAnimationFrame(() => {
      ticking = false;
      const rect = section.getBoundingClientRect();
      const total = rect.height - window.innerHeight;
      if (total <= 0) return;
      const progress = Math.min(1, Math.max(0, -rect.top / total));

      if (progressBar) progressBar.style.width = `${Math.round(progress * 100)}%`;

      const captionIndex = Math.min(captions.length - 1, Math.floor(progress * captions.length));
      updateCaption(captionIndex);

      const frameIndex = Math.min(FRAME_COUNT - 1, Math.round(progress * (FRAME_COUNT - 1)));
      if (frameIndex !== currentFrame && images[frameIndex]?.complete) {
        currentFrame = frameIndex;
        drawFrame(frameIndex);
      }
    });
  }

  window.addEventListener('scroll', onScroll, { passive: true });
  onScroll();
})();
