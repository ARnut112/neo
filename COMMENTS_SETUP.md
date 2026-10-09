# เปิดใช้เสียงจากผู้ชม (branch test-design)

## สิ่งที่ระบบทำ

- เข้าสู่ระบบด้วย Google ผ่าน Supabase ก่อนส่ง ชื่อและรูปมาจากบัญชี Google ไม่มีอีเมลแสดงต่อสาธารณะ
- ผู้ส่งต้องยินยอมให้เผยแพร่ชื่อ รูป และข้อความ ข้อความใหม่เป็น `pending` เสมอ
- ข้อความยาว 5–400 ตัวอักษร บัญชีละ 1 ข้อความต่อวัน UTC (รอบใหม่ 07:00 น. เวลาไทย) แม้ส่งพร้อมกันหลายคำขอก็นับโควตาฐานข้อมูลเดียวกัน
- อ่านเฉพาะ 50 ข้อความที่อนุมัติล่าสุด สลับทุก 7 วินาที วนกลับข้อความแรก มีปุ่มพัก/ก่อนหน้า/ถัดไป หยุดอัตโนมัติเมื่อชี้เมาส์ โฟกัสในส่วนนี้ เปิดแบบฟอร์ม ซ่อนแท็บ หรือเลื่อนพ้นหน้าจอ
- ถ้าระบบตั้ง reduced motion จะอ่านโดยเลื่อนเอง ไม่เปลี่ยนอัตโนมัติ
- Preview/Development ใช้ `channel=preview`; Production ใช้ `channel=production` จึงไม่เอาข้อความทดลองขึ้นเว็บจริง
- รูป Google โหลดจาก googleusercontent.com ผู้ใช้ปลายทางจะเชื่อมต่อกับ Google เพื่อโหลดรูป; ไม่ส่ง referrer หากโหลดไม่ได้แสดงอักษรแรกของชื่อ
- ไม่มีข้อความรีวิวปลอม เมื่อยังไม่อนุมัติจะแสดงพื้นที่ว่างพร้อมคำเชิญให้ฝากข้อความ

## 1. สร้างตาราง

Supabase → SQL Editor → New query → รัน `supabase/comments.sql` ทั้งไฟล์

ตารางนี้แยกจากตัวนับวิว ไม่ต้องแก้หรือรัน views.sql ใหม่ ไม่มี anonymous RLS policy และ service_role ของ API มีเฉพาะอ่าน/เพิ่มข้อความ ไม่มีสิทธิ์อนุมัติ

## 2. เปิด Google login

ทำตาม https://supabase.com/docs/guides/auth/social-login/auth-google

1. Google Cloud Console: สร้าง/เลือกโปรเจกต์ ตั้ง OAuth consent screen/Branding และสร้าง OAuth Client ชนิด Web application
2. Authorized redirect URIs ของ Google ให้ใช้ callback URL ที่ Supabase แสดง (รูปแบบ `https://PROJECT.supabase.co/auth/v1/callback`) ไม่ใช่ callback ของเว็บ Vercel
3. Supabase → Authentication → Sign In / Providers → Google: เปิด provider และใส่ Google Client ID / Client Secret แล้ว Save
4. ถ้าแอป Google ยังเป็น Testing ให้เพิ่มบัญชีที่จะทดลองเป็น Test users; ก่อนเปิดให้ผู้ชมทั่วไปใช้ ให้จัดการ publishing status/verification ตามที่ Google กำหนด

## 3. ตั้ง URL ให้ตรงกับเว็บที่ทดสอบ

Supabase → Authentication → URL Configuration:

- Site URL: `https://arnut.vercel.app`
- Redirect URLs: เพิ่ม `https://arnut.vercel.app/api/comment-auth`
- สำหรับ test-design เพิ่ม `https://ชื่อโดเมน-preview-ของคุณ/api/comment-auth` ด้วย คัดลอก branch Preview URL จาก Vercel ไม่ใช้ URL เดาสุ่ม

Vercel → โปรเจกต์ arnut → Environment Variables:

| ตัวแปร | Production | Preview ของ test-design |
| --- | --- | --- |
| `SUPABASE_URL` หรือ `NEXT_PUBLIC_SUPABASE_URL` | URL โปรเจกต์ Supabase | URL โปรเจกต์ Supabase |
| `SUPABASE_SECRET_KEY` หรือ `SUPABASE_SERVICE_ROLE_KEY` | คีย์ฝั่งเซิร์ฟเวอร์ | คีย์ฝั่งเซิร์ฟเวอร์ |
| `COMMENTS_SITE_URL` | `https://arnut.vercel.app` | `https://ชื่อโดเมน-preview-ของคุณ` |

ต้องเพิ่มสิทธิ์ Preview ให้ค่าจาก Integration ด้วย หากเดิมเลือกไว้เฉพาะ Production ตัว COMMENTS_SITE_URL ให้ใส่เฉพาะ origin ไม่มี /api หรือ path อื่น แล้ว Redeploy

เปิดทดสอบผ่าน URL เดียวกับ COMMENTS_SITE_URL เสมอ (รวมถึง callback) เพื่อให้ cookie กลับไปยังโดเมนเดียวกัน ใช้ URL ของ branch ที่คงที่ ไม่ใช้ URL deployment ชั่วคราวแต่ละรอบ และไม่เพิ่ม wildcard กว้าง ๆ ใน allowlist

เซสชันเป็น HttpOnly / Secure / SameSite=Lax cookie หมดอายุไม่เกิน 1 ชั่วโมง ไม่มี refresh token เก็บไว้ จึงอาจต้องกด Google login ใหม่เมื่อหมดอายุ โค้ดใช้ PKCE และไม่ส่ง secret/access token ให้ JavaScript ในหน้าเว็บ

## 4. อนุมัติข้อความ

1. Supabase → Table Editor → `comments`
2. กรอง `status=pending` และ `channel=preview` เพื่อทดลอง (เลือก production เมื่อดูเว็บจริง)
3. ตรวจชื่อและข้อความ เปลี่ยน `status` เป็น `approved` แล้ว Save
4. Reload เว็บ ข้อความจะเข้าคิวบับเบิลทันที ไม่ต้อง Deploy ซ้ำ
5. ถ้าไม่ต้องการเผยแพร่ เปลี่ยนเป็น `rejected`; หากเคยอนุมัติแล้วเปลี่ยนกลับก็จะหายจากรายการเมื่อโหลดใหม่

ผู้ดูแลใช้ Dashboard Supabase ของตัวเอง ไม่ต้องสร้างหน้า admin และไม่แชร์คีย์กับผู้คอมเมนต์ ถ้าผู้ชมขอลบข้อความหรือรูป ให้ค้นชื่อ/ข้อความในตารางแล้วลบแถวนั้นได้

## ข้อจำกัดและการทดสอบ

การยืนยัน Google เป็นเพียงบัญชีผู้ส่ง ไม่ใช่หลักฐานว่าเคยจ้างงาน จึงใช้คำว่า “เสียงจากผู้ชม” ไม่มีป้ายลูกค้าที่ผ่านการยืนยันหรือคะแนนดาว ระบบยังไม่มีอีเมลแจ้งเตือนผู้ดูแลและไม่มีหน้าจัดการของผู้ส่ง

ถ้าส่งแล้วเครือข่ายขาดหาย อาจบันทึกสำเร็จไปแล้ว จึงไม่ retry อัตโนมัติ โควตาฐานข้อมูลช่วยป้องกันการส่งซ้ำ แต่ไม่ได้ป้องกันสแปมหลายบัญชีทั้งหมด ใช้ Dashboard ปฏิเสธข้อความและเพิ่มการจำกัดคำขอที่ Vercel ตามปริมาณใช้งานจริง

- `node --test tests/comments.cjs` ตรวจ API ด้วย Supabase จำลอง
- `node tests/comments-browser.cjs` ตรวจบับเบิลและฟอร์มด้วยข้อมูลจำลองที่อยู่เฉพาะใน test (ต้องมี Playwright + Edge)
- ทดสอบ Google จริงบน Vercel: login → ส่ง → เห็นสถานะรอ → ตรวจ Table Editor → approve → reload → เห็นข้อความ → logout

ขั้นตอน Google จริงและ SQL ต้องทำบนบัญชีของเจ้าของเว็บก่อน จึงจะยืนยัน end-to-end กับบริการจริงได้
