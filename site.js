// Shared by the shop page, the member page and the admin page: the Supabase client, small helpers,
// and the order arithmetic (the database works the same sums again when an order is saved).

export const cfg = window.SITE_CONFIG || {};
export const configured = /^https?:\/\/[^\s/]+/.test(cfg.supabaseUrl || '') && !!cfg.supabaseAnonKey && !!window.supabase;
export const sb = configured ? window.supabase.createClient(cfg.supabaseUrl.replace(/\/+$/, ''), cfg.supabaseAnonKey) : null;

export const baht = n => `${Number(n || 0).toLocaleString('th-TH')} บาท`;
export const IMAGE_BUCKET = 'product-images';

// el('a', { class: 'link', href: '#x' }, 'text', child): text is always set as text, never as HTML
export function el(tag, props = {}, ...children) {
  const node = document.createElement(tag);
  for (const [k, v] of Object.entries(props)) {
    if (v == null || v === false) continue;
    if (k === 'class') node.className = v;
    else if (k === 'text') node.textContent = v;
    else if (k.startsWith('on') && typeof v === 'function') node.addEventListener(k.slice(2), v);
    else if (v === true) node.setAttribute(k, '');
    else node.setAttribute(k, v);
  }
  for (const c of children.flat()) if (c != null && c !== false) node.append(c);
  return node;
}

export async function rpc(name, args) {
  const { data, error } = await sb.rpc(name, args);
  if (error) throw error;
  return data;
}

// A product picture is one of the site's own files or a file in the shop's own storage bucket; anything else is dropped.
export function imageSrc(url) {
  url = String(url || '').trim();
  if (/^assets\/[\w./-]+$/.test(url) && !url.includes('..')) return url;
  const base = `${(cfg.supabaseUrl || '').replace(/\/+$/, '')}/storage/v1/object/public/${IMAGE_BUCKET}/`;
  if (configured && url.startsWith(base) && !url.includes('..')) return url;
  return '';
}

const MESSAGES = {
  name_required: 'เขียนชื่อผู้รับ',
  address_required: 'เขียนที่อยู่จัดส่งและเบอร์โทรให้ครบ',
  items_required: 'ใส่จำนวนอย่างน้อย 1 กระปุก',
  bad_item: 'รายการสินค้าไม่ถูกต้อง โหลดหน้าใหม่แล้วลองอีกครั้ง',
  bad_quantity: 'จำนวนต่อสูตรต้องเป็น 1 ถึง 99 กระปุก',
  product_not_found: 'มีสินค้าที่ร้านปิดการขายแล้ว โหลดหน้าใหม่แล้วเลือกอีกครั้ง',
  too_many_orders: 'ส่งออเดอร์ถี่เกินไป รอสักครู่แล้วลองใหม่',
  not_signed_in: 'เข้าสู่ระบบก่อน',
  not_admin: 'บัญชีนี้ไม่มีสิทธิ์แอดมิน',
  brand_required: 'เขียนชื่อแบรนด์',
  bad_promotions: 'รายการโปรโมชั่นไม่ถูกต้อง',
  bad_status: 'สถานะออเดอร์ไม่ถูกต้อง',
  order_not_found: 'ไม่พบออเดอร์นี้',
  'Invalid login credentials': 'อีเมลหรือรหัสผ่านไม่ถูกต้อง',
  'User already registered': 'อีเมลนี้สมัครสมาชิกแล้ว เข้าสู่ระบบได้เลย',
  'Email not confirmed': 'ยังไม่ได้ยืนยันอีเมล เปิดลิงก์ในอีเมลที่ร้านส่งให้ก่อน',
};
export function errorText(e, fallback = 'ทำรายการไม่สำเร็จ ลองอีกครั้ง') {
  const m = String((e && (e.message || e.msg || e.error_description)) || '');
  if (MESSAGES[m]) return MESSAGES[m];
  if (/duplicate key/.test(m) && /promotions/.test(m)) return 'มีจำนวนกระปุกซ้ำกันในโปรโมชั่น';
  if (/check constraint/.test(m)) return 'มีค่าที่กรอกเกินช่วงที่รับได้ ตรวจตัวเลขและความยาวข้อความ';
  if (/password/i.test(m) && /(6|at least|short|weak)/i.test(m)) return 'รหัสผ่านสั้นเกินไป ใช้อย่างน้อย 8 ตัว';
  if (/rate limit|too many/i.test(m)) return 'ลองบ่อยเกินไป รอสักครู่แล้วลองใหม่';
  if (/fetch|network/i.test(m)) return 'เชื่อมต่อไม่ได้ ตรวจอินเทอร์เน็ตแล้วลองอีกครั้ง';
  return fallback;
}
// an error the customer can fix by changing what they typed (as against a failed connection)
export const isInputError = e => !!(e && e.code && /^(22023|54000|42501|23\d{3})$/.test(String(e.code)));

// ---------------------------------------------------------------- order arithmetic
// lines: [{ name, price, qty }]; promotions: [{ min_jars, percent }]
export function orderTotals(lines, promotions, memberPercent) {
  const items = lines.filter(l => l.qty > 0).map(l => ({ ...l, line_total: l.price * l.qty }));
  const jars = items.reduce((n, l) => n + l.qty, 0);
  const subtotal = items.reduce((n, l) => n + l.line_total, 0);
  const promo_percent = Math.max(0, ...promotions.filter(p => p.min_jars <= jars).map(p => p.percent));
  const promo_discount = Math.round(subtotal * promo_percent / 100);
  const member_percent = Number(memberPercent) || 0;
  const member_discount = Math.round((subtotal - promo_discount) * member_percent / 100);
  return { items, jars, subtotal, promo_percent, promo_discount, member_percent, member_discount, total: subtotal - promo_discount - member_discount };
}

export function orderMessage(brand, order, name, address) {
  return [
    `ออเดอร์จากเว็บ ${brand}${order.id ? ` เลขที่ ${order.id}` : ''}`,
    ...order.items.map(l => `${l.name} ${l.qty} กระปุก ${baht(l.line_total)}`),
    order.promo_discount ? `ส่วนลดโปรโมชั่น ${order.promo_percent}% ลด ${baht(order.promo_discount)}` : null,
    order.member_discount ? `ส่วนลดสมาชิก ${order.member_percent}% ลด ${baht(order.member_discount)}` : null,
    `ยอดสินค้า ${baht(order.total)} (ยังไม่รวมค่าส่ง)`,
    `ชื่อผู้รับ: ${name}`,
    `ที่อยู่และเบอร์โทร: ${address}`,
  ].filter(Boolean).join('\n');
}

export function lineOrderUrl(lineId, text) {
  lineId = String(lineId || '').trim();
  return lineId
    ? `https://line.me/R/oaMessage/${encodeURIComponent(lineId)}/?${encodeURIComponent(text)}`
    : `https://line.me/R/share?text=${encodeURIComponent(text)}`;
}
export const lineAddUrl = lineId => `https://line.me/R/ti/p/${encodeURIComponent(String(lineId || '').trim())}`;

export const STATUS = { new: 'ใหม่', confirmed: 'ยืนยันแล้ว', shipped: 'ส่งแล้ว', cancelled: 'ยกเลิก' };
export const thaiDate = iso => new Date(iso).toLocaleString('th-TH', { dateStyle: 'medium', timeStyle: 'short' });

// The kit's forms (assets/system.js) check the fields a form had when the page loaded; forms and fields built
// later (a product's editor, a promotion step) are checked here the same way: each reason under its own field,
// the first one focused, a count in the status line. The handler runs only for a valid form.
export function fieldsToFix(form) {
  const bad = [];
  for (const f of form.querySelectorAll('input, select, textarea')) {
    if (/^(hidden|submit|button|reset|file|checkbox)$/.test(f.type)) continue;
    const err = (f.getAttribute('aria-describedby') || '').split(/\s+/).map(id => document.getElementById(id)).find(n => n && n.classList.contains('field__error'));
    const ok = f.checkValidity();
    if (ok) f.removeAttribute('aria-invalid'); else { f.setAttribute('aria-invalid', 'true'); bad.push(f); }
    if (err) err.hidden = ok;
  }
  return bad;
}
export function onValidSubmit(form, handler) {
  form.addEventListener('input', e => { if (e.target.getAttribute && e.target.getAttribute('aria-invalid') === 'true') fieldsToFix(form); });
  form.addEventListener('submit', async e => {
    if (e.defaultPrevented) return;
    e.preventDefault();
    const button = form.querySelector('[type="submit"]');
    const status = form.querySelector('[data-form-status]');
    const say = text => { if (status) status.textContent = text || ''; };
    const bad = fieldsToFix(form);
    if (bad.length) { say((form.dataset.fix || 'มี {n} ช่องที่ต้องแก้').replace('{n}', bad.length)); bad[0].focus(); return; }
    if (button) { button.disabled = true; button.setAttribute('aria-busy', 'true'); }
    try { await handler(say); }
    catch (err) { say(errorText(err)); console.warn(err); }
    finally { if (button) { button.disabled = false; button.removeAttribute('aria-busy'); } }
  });
}
