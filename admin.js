const loginView = document.querySelector('#admin-login-view');
const panelView = document.querySelector('#admin-panel-view');
const tokenInput = document.querySelector('#admin-token-input');
const loginBtn = document.querySelector('#admin-login-btn');
const loginMsg = document.querySelector('#admin-login-msg');
const panelMsg = document.querySelector('#admin-panel-msg');
const tbody = document.querySelector('#admin-table-body');
const addForm = document.querySelector('#admin-add-form');

const STORAGE_KEY = 'pp_admin_token';

function getToken() {
  return sessionStorage.getItem(STORAGE_KEY) || '';
}

function setMsg(el, text, kind) {
  el.textContent = text || '';
  el.className = 'admin-msg' + (kind ? ` ${kind}` : '');
}

async function apiRequest(method, query, body) {
  const response = await fetch(`/api/admin${query || ''}`, {
    method,
    headers: {
      'Content-Type': 'application/json',
      'x-admin-token': getToken()
    },
    body: body ? JSON.stringify(body) : undefined
  });
  if (response.status === 401) {
    sessionStorage.removeItem(STORAGE_KEY);
    showLogin('La clave ha caducado o no es válida. Vuelve a introducirla.');
    throw new Error('unauthorized');
  }
  if (response.status === 204) return null;
  const data = await response.json().catch(() => null);
  if (!response.ok) throw new Error((data && data.error) || `Error ${response.status}`);
  return data;
}

function showLogin(message) {
  loginView.hidden = false;
  panelView.hidden = true;
  if (message) setMsg(loginMsg, message, 'err');
}

function showPanel() {
  loginView.hidden = true;
  panelView.hidden = false;
  loadVehicles();
}

function rowTemplate(v) {
  const tr = document.createElement('tr');
  tr.dataset.id = v.id;
  tr.innerHTML = `
    <td><strong>${escapeAdmin(v.brand)} ${escapeAdmin(v.model)}</strong><br><small>${escapeAdmin(v.slug)}</small></td>
    <td>
      <select data-field="status">
        <option value="draft">Borrador</option>
        <option value="available">Disponible</option>
        <option value="reserved">Reservada</option>
        <option value="sold">Vendida</option>
      </select>
    </td>
    <td><input type="number" min="0" data-field="price" value="${v.price ?? ''}" placeholder="A consultar"></td>
    <td><input type="number" min="0" data-field="km" value="${v.km ?? 0}"></td>
    <td><input type="number" data-field="year" value="${v.year ?? ''}" style="width:70px"></td>
    <td><input type="number" data-field="featured_position" value="${v.featured_position ?? ''}" style="width:70px"></td>
    <td class="admin-row-actions">
      <button class="admin-btn admin-btn-save" data-action="save">Guardar</button>
      <button class="admin-btn admin-btn-delete" data-action="delete">Borrar</button>
    </td>`;
  tr.querySelector('[data-field="status"]').value = v.status;
  return tr;
}

function escapeAdmin(value) {
  return String(value ?? '').replace(/[&<>"']/g, (ch) => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'
  })[ch]);
}

async function loadVehicles() {
  setMsg(panelMsg, 'Cargando inventario…');
  try {
    const rows = await apiRequest('GET', '');
    tbody.innerHTML = '';
    (rows || []).forEach((v) => tbody.appendChild(rowTemplate(v)));
    setMsg(panelMsg, `${(rows || []).length} motos en el inventario (incluye borradores y vendidas).`);
  } catch (error) {
    if (error.message !== 'unauthorized') setMsg(panelMsg, `Error al cargar: ${error.message}`, 'err');
  }
}

tbody?.addEventListener('click', async (event) => {
  const button = event.target.closest('button[data-action]');
  if (!button) return;
  const row = button.closest('tr');
  const id = row.dataset.id;

  if (button.dataset.action === 'delete') {
    if (!window.confirm('¿Borrar esta moto del inventario? No se puede deshacer.')) return;
    try {
      await apiRequest('DELETE', `?id=${id}`);
      row.remove();
      setMsg(panelMsg, 'Moto borrada.', 'ok');
    } catch (error) {
      if (error.message !== 'unauthorized') setMsg(panelMsg, `Error al borrar: ${error.message}`, 'err');
    }
    return;
  }

  if (button.dataset.action === 'save') {
    const get = (field) => row.querySelector(`[data-field="${field}"]`).value;
    const payload = {
      status: get('status'),
      price: get('price') === '' ? null : Number(get('price')),
      km: Number(get('km')) || 0,
      year: Number(get('year')),
      featured_position: get('featured_position') === '' ? null : Number(get('featured_position'))
    };
    try {
      await apiRequest('PATCH', `?id=${id}`, payload);
      setMsg(panelMsg, 'Cambios guardados.', 'ok');
    } catch (error) {
      if (error.message !== 'unauthorized') setMsg(panelMsg, `Error al guardar: ${error.message}`, 'err');
    }
  }
});

addForm?.addEventListener('submit', async (event) => {
  event.preventDefault();
  const data = new FormData(addForm);
  let specs = {};
  try {
    specs = JSON.parse(data.get('specs') || '{}');
  } catch {
    setMsg(panelMsg, 'La ficha técnica debe ser JSON válido, ej: {"Cilindrada":"650 cc"}', 'err');
    return;
  }
  const payload = {
    slug: data.get('slug').trim(),
    brand: data.get('brand').trim(),
    model: data.get('model').trim(),
    family: data.get('family').trim(),
    condition: data.get('condition'),
    condition_label: data.get('condition_label').trim(),
    price: data.get('price') ? Number(data.get('price')) : null,
    year: Number(data.get('year')),
    km: Number(data.get('km')) || 0,
    categories: data.get('categories').split(',').map((s) => s.trim()).filter(Boolean),
    description: data.get('description').trim(),
    image_path: data.get('image_path').trim(),
    image_alt: data.get('image_alt').trim(),
    theme: data.get('theme').trim() || 'card-white',
    status: data.get('status'),
    specs
  };
  try {
    await apiRequest('POST', '', payload);
    setMsg(panelMsg, 'Moto añadida al inventario.', 'ok');
    addForm.reset();
    loadVehicles();
  } catch (error) {
    if (error.message !== 'unauthorized') setMsg(panelMsg, `Error al crear: ${error.message}`, 'err');
  }
});

loginBtn?.addEventListener('click', async () => {
  const token = tokenInput.value.trim();
  if (!token) return;
  sessionStorage.setItem(STORAGE_KEY, token);
  setMsg(loginMsg, 'Comprobando…');
  try {
    await apiRequest('GET', '');
    tokenInput.value = '';
    showPanel();
  } catch (error) {
    if (error.message !== 'unauthorized') setMsg(loginMsg, `Error: ${error.message}`, 'err');
  }
});

tokenInput?.addEventListener('keydown', (event) => {
  if (event.key === 'Enter') loginBtn.click();
});

document.querySelector('#admin-logout-btn')?.addEventListener('click', () => {
  sessionStorage.removeItem(STORAGE_KEY);
  showLogin();
});

if (getToken()) {
  showPanel();
} else {
  showLogin();
}
