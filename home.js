// The shop page. Without Supabase (config.js left empty) the page stands as written in index.html and the order
// goes straight to LINE. With Supabase the brand, the words, the products and the promotion come from the
// database, an order is saved before LINE opens, and a signed-in member gets their name, address and discount.

import { configured, sb, rpc, el, baht, imageSrc, orderTotals, orderMessage, lineOrderUrl, lineAddUrl, errorText, isInputError, fieldsToFix } from './site.js';

const CACHE = 'tamruean.site.v1';
const form = document.getElementById('order-form');
const qtyBox = form.querySelector('[data-site-list="qty"]');
const count = form.querySelector('#o-count');
const total = form.querySelector('#o-total');
const text = form.querySelector('#o-text');
const nameField = form.querySelector('#o-name');
const addressField = form.querySelector('#o-address');
const memberNote = form.querySelector('[data-member-note]');
const status = form.querySelector('[data-form-status]');

// what the page sells, as written in index.html, until the database answers
const site = {
  settings: { brand_name: document.querySelector('[data-site="brand_name"]').textContent.trim(), line_id: (form.dataset.lineId || '').trim(), member_discount_percent: 0 },
  products: [...qtyBox.querySelectorAll('input[data-product]')].map(i => ({ id: null, name: i.dataset.product, price: Number(i.dataset.price) })),
  promotions: [{ min_jars: 3, percent: 10 }, { min_jars: 6, percent: 15 }],
};
let member = null;   // { profile, member_discount_percent } once signed in

// ---------------------------------------------------------------- the order card
const qtyInputs = () => [...qtyBox.querySelectorAll('input[data-product]')];
const amount = i => (/^[0-9]{1,2}$/.test(i.value.trim()) ? parseInt(i.value.trim(), 10) : 0);
const lines = () => qtyInputs().map(i => ({ product_id: i.dataset.productId ? Number(i.dataset.productId) : null, name: i.dataset.product, price: Number(i.dataset.price), qty: amount(i) }));
const memberPercent = () => (member ? Number(site.settings.member_discount_percent) || 0 : 0);

function update() {
  const inputs = qtyInputs();
  const t = orderTotals(lines(), site.promotions, memberPercent());
  // the first quantity field carries the "at least one jar" rule, so the kit's check shows it under that field
  if (inputs[0]) inputs[0].setCustomValidity(t.jars ? '' : 'none');
  const parts = [];
  if (t.promo_discount) parts.push(`โปรโมชั่นลด ${t.promo_percent}% (${baht(t.promo_discount)})`);
  if (t.member_discount) parts.push(`สมาชิกลด ${t.member_percent}% (${baht(t.member_discount)})`);
  count.textContent = t.jars ? [`${t.jars} กระปุก`, ...parts].join(' ') : 'ยังไม่ได้เลือกน้ำพริก';
  total.textContent = baht(t.total);
  text.value = orderMessage(site.settings.brand_name, t, nameField.value.trim(), addressField.value.trim());
  return t;
}
form.addEventListener('input', e => { update(); if (e.target.getAttribute('aria-invalid') === 'true') fieldsToFix(form); });

function renderMemberNote() {
  const percent = Number(site.settings.member_discount_percent) || 0;
  memberNote.replaceChildren();
  memberNote.hidden = !(configured && percent > 0);
  if (memberNote.hidden) return;
  if (member) memberNote.append(`สมาชิกได้ส่วนลดเพิ่ม ${percent}% จากยอดหลังหักโปรโมชั่น`);
  else memberNote.append(`สมาชิกได้ส่วนลดเพิ่ม ${percent}% `, el('a', { class: 'link', href: 'account.html' }, 'เข้าสู่ระบบสมาชิก'));
}

// ---------------------------------------------------------------- the page from the database
const setText = (key, value) => document.querySelectorAll(`[data-site="${key}"]`).forEach(n => { n.textContent = value; });

function picture(p, sizes) {
  const src = imageSrc(p.image_url);
  if (!src) return null;
  const img = el('img', { src, alt: p.image_alt || p.name, loading: 'lazy', decoding: 'async', width: 960, height: 960, 'data-source': 'client', 'data-subject': 'product' });
  // the site's own files come in three sizes; a picture from the shop's storage is one file
  const m = src.match(/^(assets\/img\/photo-[\w-]+?)(?:-(?:500|960))?\.webp$/);
  if (m) { img.srcset = `${m[1]}-500.webp 500w, ${m[1]}-960.webp 960w`; img.sizes = sizes; }
  return img;
}

function render(data) {
  const s = data.settings || {};
  Object.assign(site, { settings: s, products: data.products || [], promotions: data.promotions || [] });
  for (const key of ['brand_name', 'hero_lead', 'products_title', 'products_lead', 'promo_title', 'promo_lead', 'close_title', 'footer_lede']) {
    if (typeof s[key] === 'string' && s[key]) setText(key, s[key]);
  }
  if (s.brand_name && s.hero_title) document.title = `${s.brand_name}: ${s.hero_title}`;
  // the hero's phrases stay whole on their lines: one phrase per space-separated part
  const h1 = document.querySelector('[data-site-hero]');
  if (h1 && s.hero_title) h1.replaceChildren(...s.hero_title.split(/\s+/).filter(Boolean).flatMap((w, i) => [i ? ' ' : null, el('span', { class: 'nb' }, w)]));

  // the line-up
  const grid = document.querySelector('[data-site-list="products"]');
  const span = { 1: 'span-6', 2: 'span-6', 3: 'span-4' }[site.products.length] || 'span-3';
  grid.replaceChildren(...site.products.map(p => el('a', { class: `tile ${span}`, id: `p-${p.id}`, href: '#order-form' },
    el('div', { class: 'tile__media' }, picture(p, '(max-width: 639px) 100vw, (max-width: 1023px) 50vw, 420px')),
    el('div', { class: 'tile__head' }, el('h3', {}, p.name), el('span', { class: 'tile__price' }, baht(p.price))),
    (p.weight || p.ingredients) ? el('p', { class: 'tile__facts' }, [p.weight, p.ingredients].filter(Boolean).join(' · ')) : null,
    p.description ? el('p', {}, p.description) : null)));

  // the nav's picture cards: the first four
  const menu = document.querySelector('[data-site-list="menu"]');
  menu.replaceChildren(...site.products.slice(0, 4).map(p => {
    const img = picture(p, '302px');
    if (img) img.className = 'frame__img';
    return el('a', { class: 'menu-card span-3', href: `#p-${p.id}` },
      el('div', { class: 'panel' }, img), el('span', { class: 't-card' }, p.name),
      p.ingredients ? el('span', { class: 't-small muted' }, p.ingredients) : null);
  }));

  // the promotion's rows
  const promos = [...site.promotions].sort((a, b) => a.min_jars - b.min_jars);
  const row = (name, value) => el('li', {}, el('span', { class: 'rows__name' }, name), el('span', { class: 'rows__value' }, value));
  const rows = promos.map(p => row(`ครบ ${p.min_jars} กระปุก`, `ลด ${p.percent}%`));
  if (promos.length && promos[0].min_jars > 1) rows.push(row(promos[0].min_jars === 2 ? '1 กระปุก' : `1 ถึง ${promos[0].min_jars - 1} กระปุก`, 'ราคาปกติ'));
  if (Number(s.member_discount_percent) > 0) rows.push(row('สมาชิก', `ลดเพิ่ม ${s.member_discount_percent}%`));
  document.querySelector('[data-site-list="promotions"]').replaceChildren(...rows);
  const closeLead = document.querySelector('[data-site-close-lead]');
  if (closeLead) closeLead.textContent = promos.length ? `ครบ ${promos[0].min_jars} กระปุก ลด ${promos[0].percent}% คละสูตรได้` : (s.products_lead || '');

  // the order card's quantity fields, keeping what was already typed
  const typed = Object.fromEntries(qtyInputs().map(i => [i.dataset.productId || i.dataset.product, i.value]));
  // the fields about to be replaced stay in the kit's list of fields to check: leave none of them marked as wrong
  for (const i of qtyInputs()) i.setCustomValidity('');
  const legend = qtyBox.querySelector('legend');
  qtyBox.replaceChildren(legend, ...site.products.map((p, n) => el('div', { class: 'field' },
    el('label', { for: `q-${p.id}` }, `${p.name} `, el('span', {}, baht(p.price))),
    el('input', { id: `q-${p.id}`, type: 'text', inputmode: 'numeric', pattern: '[0-9]{1,2}', autocomplete: 'off', value: typed[p.id] || typed[p.name] || '0',
      'data-product': p.name, 'data-price': p.price, 'data-product-id': p.id, 'aria-describedby': `q-${p.id}-err` }),
    el('p', { class: 'field__error', id: `q-${p.id}-err`, hidden: true }, n === 0 ? 'ใส่จำนวนเป็นตัวเลข และสั่งอย่างน้อย 1 กระปุก' : `ใส่จำนวน${p.name}เป็นตัวเลข`))));

  // LINE: with the shop's id the order opens the shop's chat and the add-friend links work
  if (s.line_id) document.querySelectorAll('[data-line-add]').forEach(a => { a.href = lineAddUrl(s.line_id); });
  applyReorder();
  renderMemberNote();
  update();
}

// "order again" from the member page: the quantities of an earlier order
function applyReorder() {
  let again = null;
  try { again = JSON.parse(localStorage.getItem('tamruean.reorder') || 'null'); localStorage.removeItem('tamruean.reorder'); } catch { /* no storage */ }
  if (!again || !Array.isArray(again.items)) return;
  for (const it of again.items) {
    const input = qtyBox.querySelector(`input[data-product-id="${Number(it.product_id)}"]`);
    if (input) input.value = String(Math.min(99, Math.max(0, Number(it.qty) || 0)));
  }
}

const shown = () => document.documentElement.classList.remove('site-wait');

async function loadMember() {
  const { data } = await sb.auth.getSession();
  document.querySelectorAll('[data-account-link]').forEach(a => { a.textContent = data.session ? 'บัญชีของฉัน' : 'เข้าสู่ระบบ'; });
  if (!data.session) return;
  try {
    member = await rpc('get_my_account');
    if (!nameField.value) nameField.value = member.profile.full_name || '';
    if (!addressField.value) addressField.value = member.profile.address || '';
  } catch (e) { console.warn(e); }
  renderMemberNote();
  update();
}

if (configured) {
  try { const cached = JSON.parse(localStorage.getItem(CACHE) || 'null'); if (cached) { render(cached); shown(); } } catch { /* no storage */ }
  rpc('get_site').then(data => {
    render(data);
    try { localStorage.setItem(CACHE, JSON.stringify(data)); } catch { /* no storage */ }
  }).catch(e => console.warn('get_site', e)).finally(shown);
  loadMember();

  // save the order, then open LINE with it. The database works out the prices and the discounts; if it cannot be
  // reached the order still goes to LINE with the sums the page worked out, so the shop never loses it.
  form.addEventListener('submit', async e => {
    if (e.defaultPrevented) return;   // the kit's checks found a field to fix
    e.preventDefault();
    const local = update();
    // the quantity fields were built after the kit read the form, so they are checked here, each reason under its field
    const bad = fieldsToFix(form);
    if (bad.length) { status.textContent = form.dataset.fix.replace('{n}', bad.length); bad[0].focus(); return; }
    const name = nameField.value.trim(), address = addressField.value.trim();
    const button = form.querySelector('[type="submit"]');
    button.disabled = true; status.textContent = 'กำลังบันทึกออเดอร์';
    let order = local;
    try {
      order = await rpc('place_order', { p_items: local.items.map(l => ({ product_id: l.product_id, qty: l.qty })), p_name: name, p_address: address });
    } catch (err) {
      if (isInputError(err)) { status.textContent = errorText(err); button.disabled = false; return; }
      console.warn('place_order', err);
    }
    status.textContent = 'กำลังเปิด LINE';
    button.disabled = false;
    location.href = lineOrderUrl(site.settings.line_id, orderMessage(site.settings.brand_name, order, name, address));
  });
} else {
  // no database: the form's own GET opens LINE's share screen with the order (index.html), or the shop's chat
  // when data-line-id is set on the form
  // with no member system there is nothing to sign in to: the links to the member page go
  document.querySelectorAll('a[href="account.html"]').forEach(a => (a.parentElement.tagName === 'LI' ? a.parentElement : a).remove());
  const lineId = site.settings.line_id;
  if (lineId) document.querySelectorAll('[data-line-add]').forEach(a => { a.href = lineAddUrl(lineId); });
  form.addEventListener('submit', e => {
    if (e.defaultPrevented) return;
    update();
    if (lineId) { e.preventDefault(); location.href = lineOrderUrl(lineId, text.value); }
  });
  update();
}
