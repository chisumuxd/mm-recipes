// The member page: sign in, join, reset a password, the saved name and address, the order history.

import { configured, sb, rpc, el, baht, errorText, onValidSubmit, STATUS, thaiDate } from './site.js';

const views = [...document.querySelectorAll('[data-view]')];
const show = name => {
  views.forEach(v => { v.hidden = v.dataset.view !== name; });
  document.querySelector('main').dataset.showing = name; // app.css centres every view but the signed-in one
};
const $ = id => document.getElementById(id);

// Signed out, the page is the sign-in card; account.html#register is the join card (its own address, so Back works).
let signedOut = false;
function showAuth() {
  signedOut = true;
  const joining = location.hash === '#register';
  show(joining ? 'register' : 'auth');
  document.title = joining ? 'สมัครสมาชิก' : 'บัญชีสมาชิก';
}
window.addEventListener('hashchange', () => { if (signedOut) { showAuth(); window.scrollTo(0, 0); } });
$('to-register').addEventListener('click', () => {
  if (!$('r-email').value && $('l-email').value) $('r-email').value = $('l-email').value.trim();
});

function brand() {
  try { const c = JSON.parse(localStorage.getItem('tamruean.site.v1') || 'null'); if (c && c.settings.brand_name) document.querySelectorAll('[data-brand]').forEach(n => { n.textContent = c.settings.brand_name; }); } catch { /* no storage */ }
}

function orderCard(o) {
  const again = () => {
    try { localStorage.setItem('tamruean.reorder', JSON.stringify({ items: o.items.map(l => ({ product_id: l.product_id, qty: l.qty })) })); } catch { /* no storage */ }
    location.href = 'index.html#order-form';
  };
  return el('li', { class: 'app__item' },
    el('div', { class: 'app__item-head' }, el('strong', {}, `ออเดอร์เลขที่ ${o.id}`), el('span', { class: 'app__meta' }, `${thaiDate(o.created_at)} · ${STATUS[o.status] || o.status}`)),
    el('ul', { class: 'app__lines' }, o.items.map(l => el('li', {}, el('span', {}, `${l.name} ${l.qty} กระปุก`), el('span', {}, baht(l.line_total))))),
    o.promo_discount ? el('p', { class: 'app__meta' }, `ส่วนลดโปรโมชั่น ${o.promo_percent}% ลด ${baht(o.promo_discount)}`) : null,
    o.member_discount ? el('p', { class: 'app__meta' }, `ส่วนลดสมาชิก ${o.member_percent}% ลด ${baht(o.member_discount)}`) : null,
    el('p', { class: 'app__total' }, el('span', {}, 'ยอดสินค้า'), el('span', {}, baht(o.total))),
    el('div', { class: 'app__actions' }, el('button', { class: 'btn btn--secondary', type: 'button', onclick: again }, 'สั่งรายการนี้อีกครั้ง')));
}

async function showMember() {
  signedOut = false;
  if (/^#(register|login)$/.test(location.hash)) history.replaceState(null, '', location.pathname + location.search);
  show('loading');
  let account;
  try { account = await rpc('get_my_account'); }
  catch (e) { console.warn(e); await sb.auth.signOut(); showAuth(); return; }
  const p = account.profile || {};
  $('hello').textContent = p.full_name ? `สวัสดี ${p.full_name}` : p.email;
  $('admin-link').hidden = p.role !== 'admin';
  $('p-name').value = p.full_name || '';
  $('p-address').value = p.address || '';
  const percent = Number(account.member_discount_percent) || 0;
  $('member-discount').hidden = !percent;
  $('member-discount').textContent = percent ? `สมาชิกได้ส่วนลดเพิ่ม ${percent}% ทุกออเดอร์ที่สั่งขณะเข้าสู่ระบบ` : '';
  const list = $('orders');
  list.replaceChildren(...(account.orders.length ? account.orders.map(orderCard) : [el('li', { class: 'app__empty' }, 'ยังไม่มีออเดอร์ ออเดอร์ที่สั่งขณะเข้าสู่ระบบจะแสดงที่นี่')]));
  show('member');
}

brand();
if (!configured) show('setup');
else {
  let recovering = false;
  sb.auth.onAuthStateChange(event => { if (event === 'PASSWORD_RECOVERY') { recovering = true; signedOut = false; show('recover'); } });
  const { data } = await sb.auth.getSession();
  if (recovering) show('recover'); else if (data.session) await showMember(); else showAuth();

  onValidSubmit($('login-form'), async say => {
    say('กำลังเข้าสู่ระบบ');
    const { error } = await sb.auth.signInWithPassword({ email: $('l-email').value.trim(), password: $('l-password').value });
    if (error) throw error;
    say(''); await showMember();
  });

  onValidSubmit($('register-form'), async say => {
    say('กำลังสมัครสมาชิก');
    const { data: out, error } = await sb.auth.signUp({ email: $('r-email').value.trim(), password: $('r-password').value, options: { data: { full_name: $('r-name').value.trim() }, emailRedirectTo: location.href.split('#')[0] } });
    if (error) throw error;
    // a project that asks members to confirm their email gives no session yet
    if (!out.session) { say('ส่งลิงก์ยืนยันไปที่อีเมลแล้ว เปิดลิงก์นั้นแล้วกลับมาเข้าสู่ระบบ'); return; }
    say(''); await showMember();
  });

  $('forgot').addEventListener('click', async () => {
    const status = $('login-form').querySelector('[data-form-status]');
    const email = $('l-email').value.trim();
    if (!/^\S+@\S+\.\S+$/.test(email)) { status.textContent = 'เขียนอีเมลในช่องอีเมลก่อน แล้วกดลืมรหัสผ่านอีกครั้ง'; $('l-email').focus(); return; }
    const { error } = await sb.auth.resetPasswordForEmail(email, { redirectTo: location.href.split('#')[0] });
    status.textContent = error ? errorText(error) : 'ส่งลิงก์ตั้งรหัสผ่านใหม่ไปที่อีเมลแล้ว';
  });

  onValidSubmit($('recover-form'), async say => {
    const { error } = await sb.auth.updateUser({ password: $('n-password').value });
    if (error) throw error;
    say(''); await showMember();
  });

  onValidSubmit($('profile-form'), async say => {
    await rpc('save_my_profile', { p_full_name: $('p-name').value, p_address: $('p-address').value });
    say('บันทึกชื่อและที่อยู่แล้ว');
    $('hello').textContent = `สวัสดี ${$('p-name').value.trim()}`;
  });

  $('logout').addEventListener('click', async () => { await sb.auth.signOut(); history.replaceState(null, '', location.pathname + location.search); showAuth(); });
}
