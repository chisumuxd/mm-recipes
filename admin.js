// The admin page: orders, products with their photographs, the promotion, the shop page's words and LINE id,
// the members. Every change goes through a database function that checks the admin role again; this page only
// decides what to show.

import { configured, sb, rpc, el, baht, imageSrc, errorText, onValidSubmit, STATUS, thaiDate, IMAGE_BUCKET, cfg } from './site.js';

const views = [...document.querySelectorAll('[data-view]')];
const show = name => views.forEach(v => { v.hidden = v.dataset.view !== name; });
const $ = id => document.getElementById(id);
const say = text => { $('admin-status').textContent = text || ''; };
let board = null;

// ---------------------------------------------------------------- tabs
const tabs = [...document.querySelectorAll('.app__tab')];
tabs.forEach(tab => tab.addEventListener('click', () => {
  tabs.forEach(t => { const on = t === tab; t.setAttribute('aria-selected', String(on)); $(t.getAttribute('aria-controls')).hidden = !on; });
  say('');
}));

// the shop page keeps a copy of its content in the browser; drop it so this browser shows the change at once
const dropCache = () => { try { localStorage.removeItem('tamruean.site.v1'); } catch { /* no storage */ } };

// ---------------------------------------------------------------- orders
function orderCard(o) {
  const select = el('select', { 'aria-label': `สถานะออเดอร์เลขที่ ${o.id}` }, Object.entries(STATUS).map(([v, label]) => el('option', { value: v, selected: v === o.status }, label)));
  select.addEventListener('change', async () => {
    try { await rpc('admin_set_order_status', { p_id: o.id, p_status: select.value }); o.status = select.value; say(`ออเดอร์เลขที่ ${o.id}: ${STATUS[select.value]}`); }
    catch (e) { say(errorText(e)); select.value = o.status; }
  });
  return el('li', { class: 'app__item' },
    el('div', { class: 'app__item-head' }, el('strong', {}, `เลขที่ ${o.id} · ${o.customer_name}`), el('span', { class: 'app__meta' }, `${thaiDate(o.created_at)} · ${o.user_id ? 'สมาชิก' : 'ลูกค้าทั่วไป'}`)),
    el('ul', { class: 'app__lines' }, o.items.map(l => el('li', {}, el('span', {}, `${l.name} ${l.qty} กระปุก`), el('span', {}, baht(l.line_total))))),
    o.promo_discount ? el('p', { class: 'app__meta' }, `ส่วนลดโปรโมชั่น ${o.promo_percent}% ลด ${baht(o.promo_discount)}`) : null,
    o.member_discount ? el('p', { class: 'app__meta' }, `ส่วนลดสมาชิก ${o.member_percent}% ลด ${baht(o.member_discount)}`) : null,
    el('p', { class: 'app__total' }, el('span', {}, 'ยอดสินค้า'), el('span', {}, baht(o.total))),
    el('p', { class: 'app__address' }, o.address),
    el('div', { class: 'app__actions' }, el('span', { class: 'app__meta' }, 'สถานะ'), select));
}
function renderOrders() {
  $('orders').replaceChildren(...(board.orders.length ? board.orders.map(orderCard) : [el('li', { class: 'app__empty' }, 'ยังไม่มีออเดอร์')]));
}

// ---------------------------------------------------------------- products
// a photograph is drawn down to 1,280px on its long side and saved as WebP before it is uploaded
async function shrink(file) {
  const bitmap = await createImageBitmap(file);
  const scale = Math.min(1, 1280 / Math.max(bitmap.width, bitmap.height));
  const canvas = Object.assign(document.createElement('canvas'), { width: Math.round(bitmap.width * scale), height: Math.round(bitmap.height * scale) });
  canvas.getContext('2d').drawImage(bitmap, 0, 0, canvas.width, canvas.height);
  const blob = await new Promise(done => canvas.toBlob(done, 'image/webp', 0.82));
  if (!blob) throw new Error('image');
  return blob;
}
async function upload(file) {
  if (!/^image\/(jpeg|png|webp)$/.test(file.type)) throw Object.assign(new Error('type'), { friendly: 'ใช้ไฟล์รูป JPG, PNG หรือ WebP' });
  const blob = await shrink(file);
  if (blob.size > 2 * 1024 * 1024) throw Object.assign(new Error('size'), { friendly: 'รูปใหญ่เกิน 2 MB เลือกรูปอื่น' });
  const path = `${Date.now()}-${Math.random().toString(36).slice(2, 10)}.webp`;
  const { error } = await sb.storage.from(IMAGE_BUCKET).upload(path, blob, { contentType: 'image/webp', cacheControl: '31536000' });
  if (error) throw error;
  return sb.storage.from(IMAGE_BUCKET).getPublicUrl(path).data.publicUrl;
}
const storedPath = url => { const base = `${cfg.supabaseUrl.replace(/\/+$/, '')}/storage/v1/object/public/${IMAGE_BUCKET}/`; return String(url || '').startsWith(base) ? url.slice(base.length) : ''; };

let fieldCount = 0;
function productForm(p) {
  const n = ++fieldCount, isNew = !p.id;
  const id = key => `pf${n}-${key}`;
  const field = (key, label, attrs, error, full) => el('div', { class: `field${full ? ' field--full' : ''}` },
    el('label', { for: id(key) }, label),
    el('input', { id: id(key), name: key, type: 'text', value: p[key] ?? '', 'aria-describedby': `${id(key)}-err`, ...attrs }),
    el('p', { class: 'field__error', id: `${id(key)}-err`, hidden: true }, error));
  const src = imageSrc(p.image_url);
  const thumb = el('div', { class: 'app__thumb' }, src ? el('img', { src, alt: '' }) : null);
  const file = el('input', { id: id('file'), type: 'file', accept: 'image/jpeg,image/png,image/webp' });
  const active = el('input', { id: id('active'), type: 'checkbox', checked: p.active !== false });
  const form = el('form', { class: 'form', 'data-fix': 'มี {n} ช่องที่ต้องแก้', novalidate: true },
    field('name', 'ชื่อสินค้า', { maxlength: 60, required: true }, 'เขียนชื่อสินค้า'),
    field('price', 'ราคา เป็นบาท', { inputmode: 'numeric', pattern: '[1-9][0-9]{0,5}', required: true }, 'เขียนราคาเป็นตัวเลขเต็มบาท'),
    field('weight', 'ขนาด เช่น 120 กรัม', { maxlength: 30 }, 'ข้อความยาวเกินไป'),
    field('sort', 'ลำดับ เลขน้อยขึ้นก่อน', { inputmode: 'numeric', pattern: '-?[0-9]{1,5}' }, 'เขียนลำดับเป็นตัวเลข'),
    field('ingredients', 'ส่วนผสมหลัก หนึ่งบรรทัด', { maxlength: 80 }, 'ข้อความยาวเกินไป', true),
    field('description', 'คำอธิบายสั้น', { maxlength: 120 }, 'ข้อความยาวเกินไป', true),
    field('image_alt', 'คำบรรยายรูป สำหรับผู้ใช้โปรแกรมอ่านหน้าจอ', { maxlength: 160 }, 'ข้อความยาวเกินไป', true),
    el('div', { class: 'field field--full app__file' }, el('label', { for: id('file') }, isNew ? 'รูปสินค้า' : 'เปลี่ยนรูปสินค้า'), file),
    el('label', { class: 'app__check field--full', for: id('active') }, active, 'เปิดขายและแสดงบนหน้าร้าน'),
    el('div', { class: 'btn-row' },
      el('button', { class: 'btn btn--primary', type: 'submit' }, isNew ? 'เพิ่มสินค้า' : 'บันทึกสินค้า'),
      isNew ? null : el('button', { class: 'btn btn--secondary btn--danger', type: 'button', onclick: remove }, 'ลบสินค้า')),
    el('p', { class: 'form__status', role: 'status', 'data-form-status': true }));

  file.addEventListener('change', () => { const f = file.files[0]; if (f) thumb.replaceChildren(el('img', { src: URL.createObjectURL(f), alt: '' })); });

  async function remove() {
    if (!confirm(`ลบ "${p.name}" ออกจากร้าน? ออเดอร์เก่าที่มีสินค้านี้ยังอยู่ครบ`)) return;
    try {
      await rpc('admin_delete_product', { p_id: p.id });
      const old = storedPath(p.image_url); if (old) await sb.storage.from(IMAGE_BUCKET).remove([old]);
      dropCache(); await load('products'); say(`ลบ ${p.name} แล้ว`);
    } catch (e) { say(errorText(e)); }
  }

  onValidSubmit(form, async status => {
    const v = k => form.elements[k].value.trim();
    const row = { name: v('name'), price: Number(v('price')), weight: v('weight'), ingredients: v('ingredients'), description: v('description'), image_alt: v('image_alt'), active: active.checked };
    if (v('sort') !== '') row.sort = Number(v('sort'));
    if (!isNew) row.id = p.id;
    if (file.files[0]) {
      status('กำลังอัปโหลดรูป');
      try { row.image_url = await upload(file.files[0]); }
      catch (e) { status(e.friendly || errorText(e, 'อัปโหลดรูปไม่สำเร็จ ลองอีกครั้ง')); return; }
    }
    await rpc('admin_save_product', { p: row });
    const old = row.image_url ? storedPath(p.image_url) : '';
    if (old) await sb.storage.from(IMAGE_BUCKET).remove([old]);
    dropCache(); await load('products'); say(isNew ? `เพิ่ม ${row.name} แล้ว` : `บันทึก ${row.name} แล้ว`);
  });
  return el('div', { class: 'app__card app__product' }, thumb, form);
}
function renderProducts() {
  $('products').replaceChildren(...board.products.map(productForm));
  $('new-product').replaceChildren(productForm({ active: true }));
}

// ---------------------------------------------------------------- the promotion
function promoRow(r = {}) {
  const n = ++fieldCount;
  const row = el('div', { class: 'app__promo' },
    el('div', { class: 'field' }, el('label', { for: `pr${n}-jars` }, 'ครบกี่กระปุก'),
      el('input', { id: `pr${n}-jars`, 'data-jars': true, type: 'text', inputmode: 'numeric', pattern: '[1-9][0-9]{0,2}', required: true, value: r.min_jars ?? '', 'aria-describedby': `pr${n}-jars-err` }),
      el('p', { class: 'field__error', id: `pr${n}-jars-err`, hidden: true }, 'เขียนจำนวนกระปุก 2 ขึ้นไป')),
    el('div', { class: 'field' }, el('label', { for: `pr${n}-percent` }, 'ลดกี่เปอร์เซ็นต์'),
      el('input', { id: `pr${n}-percent`, 'data-percent': true, type: 'text', inputmode: 'numeric', pattern: '[1-9][0-9]?', required: true, value: r.percent ?? '', 'aria-describedby': `pr${n}-percent-err` }),
      el('p', { class: 'field__error', id: `pr${n}-percent-err`, hidden: true }, 'เขียนเปอร์เซ็นต์ 1 ถึง 90')),
    el('button', { class: 'btn btn--secondary', type: 'button', onclick: () => row.remove() }, 'ลบ'));
  return row;
}
function renderPromotions() { $('promo-rows').replaceChildren(...board.promotions.map(promoRow)); }

// ---------------------------------------------------------------- the shop page's words
const SETTINGS = ['brand_name', 'line_id', 'hero_title', 'hero_lead', 'products_title', 'products_lead', 'promo_title', 'promo_lead', 'close_title', 'footer_lede', 'member_discount_percent'];
function renderSettings() {
  for (const key of SETTINGS) $(`s-${key}`).value = board.settings[key] ?? '';
  document.querySelectorAll('[data-brand]').forEach(n => { n.textContent = board.settings.brand_name; });
}

// ---------------------------------------------------------------- members
function renderMembers() {
  $('members').replaceChildren(...board.members.map(m => el('li', { class: 'app__item' },
    el('div', { class: 'app__item-head' }, el('strong', {}, m.full_name || m.email), el('span', { class: 'app__meta' }, `${m.role === 'admin' ? 'แอดมิน · ' : ''}สมัคร ${thaiDate(m.created_at)} · ${m.orders} ออเดอร์`)),
    el('p', { class: 'app__meta' }, m.email),
    m.address ? el('p', { class: 'app__address' }, m.address) : null)));
}

const RENDER = { orders: renderOrders, products: renderProducts, promotions: renderPromotions, settings: renderSettings, members: renderMembers };
async function load(only) {
  board = await rpc('admin_get_dashboard');
  for (const [name, fn] of Object.entries(RENDER)) if (!only || only === name) fn();
}

if (!configured) show('setup');
else {
  const { data } = await sb.auth.getSession();
  if (!data.session) show('denied');
  else {
    try { await load(); show('admin'); }
    catch (e) { console.warn(e); $('denied-text').textContent = errorText(e, 'เปิดหน้าแอดมินไม่ได้ ลองเข้าสู่ระบบใหม่'); show('denied'); }
  }

  $('promo-add').addEventListener('click', () => $('promo-rows').append(promoRow()));
  onValidSubmit($('promo-form'), async status => {
    const rows = [...$('promo-rows').children].map(r => ({ min_jars: Number(r.querySelector('[data-jars]').value), percent: Number(r.querySelector('[data-percent]').value) }));
    board.promotions = await rpc('admin_save_promotions', { p: rows });
    dropCache(); renderPromotions(); status('บันทึกโปรโมชั่นแล้ว');
  });

  onValidSubmit($('settings-form'), async status => {
    const p = Object.fromEntries(SETTINGS.map(key => [key, $(`s-${key}`).value.trim()]));
    p.member_discount_percent = Number(p.member_discount_percent);
    board.settings = await rpc('admin_save_settings', { p });
    dropCache(); renderSettings(); status('บันทึกหน้าร้านแล้ว');
  });
}
