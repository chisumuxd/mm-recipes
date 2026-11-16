// การเชื่อมต่อ Supabase ของร้าน
// ใส่ค่าสองตัวนี้จากหน้า Supabase > Project Settings > API
//   supabaseUrl      คือ Project URL เช่น https://abcdxyz.supabase.co
//   supabaseAnonKey  คือ anon public key (คีย์สาธารณะ ใส่ในหน้าเว็บได้ ห้ามใส่ service_role key)
// ถ้าเว้นว่างไว้ หน้าเว็บจะทำงานแบบเดิม: แสดงข้อมูลที่เขียนไว้ในไฟล์ และไม่มีระบบสมาชิก
window.SITE_CONFIG = {
  supabaseUrl: '',
  supabaseAnonKey: '',
};
