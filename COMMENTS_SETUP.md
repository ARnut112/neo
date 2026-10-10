# เปิดใช้เสียงจากผู้ชม (branch test-design)

## สิ่งที่ระบบทำ

- เปิดป๊อปอัพแล้วพิมพ์รีวิวได้ทันที เลือกส่งด้วย Google (ชื่อและรูปจากบัญชี โดยไม่เผยแพร่อีเมล) หรือโหมดนักท่องเที่ยว (ตั้งชื่อเองได้ ไม่มีรูปจริง และมีป้าย “ไม่ได้เข้าสู่ระบบ”) แม้ล็อกอินอยู่ก็เลือกส่งแบบนักท่องเที่ยวได้
- ก่อนพาไป Google เก็บเฉพาะข้อความร่างใน sessionStorage ของแท็บเดิม คืนข้อความเมื่อกลับมา และลบทิ้งเมื่อส่งสำเร็จหรือร่างมีอายุเกิน 24 ชั่วโมง ไม่เก็บ token/อีเมลใน storage และไม่ส่งรีวิวอัตโนมัติหลังล็อกอิน ต้องตรวจทานและยืนยันการเผยแพร่อีกครั้ง
- ผู้ส่งต้องยินยอมให้เผยแพร่ตามรูปแบบที่เลือก เมื่อเปลี่ยนรูปแบบจะล้างการยินยอมเดิม ข้อความใหม่เป็น `pending` เสมอ
- ข้อความยาว 5–400 ตัวอักษร บัญชีละ 1 ข้อความต่อวัน UTC (รอบใหม่ 07:00 น. เวลาไทย) แม้ส่งพร้อมกันหลายคำขอก็นับโควตาฐานข้อมูลเดียวกัน
- อ่านเฉพาะ 50 ข้อความที่อนุมัติล่าสุด สลับทุก 7 วินาที วนกลับข้อความแรก มีปุ่มพัก/ก่อนหน้า/ถัดไป หยุดอัตโนมัติเมื่อชี้เมาส์ โฟกัสในส่วนนี้ เปิดแบบฟอร์ม ซ่อนแท็บ หรือเลื่อนพ้นหน้าจอ
- ถ้าระบบตั้ง reduced motion จะอ่านโดยเลื่อนเอง ไม่เปลี่ยนอัตโนมัติ
- Preview/Development ใช้ `channel=preview`; Production ใช้ `channel=production` จึงไม่เอาข้อความทดลองขึ้นเว็บจริง
- รูป Google โหลดจาก googleusercontent.com ผู้ใช้ปลายทางจะเชื่อมต่อกับ Google เพื่อโหลดรูป; ไม่ส่ง referrer หากโหลดไม่ได้แสดงอักษรแรกของชื่อ
- ไม่มีข้อความรีวิวปลอม เมื่อยังไม่อนุมัติจะแสดงพื้นที่ว่างพร้อมคำเชิญให้ฝากข้อความ

## 1. สร้างตาราง

Supabase → SQL Editor → New query → รัน `supabase/comments.sql` ทั้งไฟล์

จากนั้นรัน `supabase/comments-guest.sql` เพื่อรองรับโหมดนักท่องเที่ยว หากมีตาราง comments อยู่แล้วให้รันเฉพาะ comments-guest.sql ก่อน Deploy โค้ดใหม่ ไฟล์นี้ไม่ลบข้อความเดิม และรันซ้ำได้ ไม่ต้องแก้ views.sql

ตารางนี้แยกจากตัวนับวิว ไม่ต้องแก้หรือรัน views.sql ใหม่ ไม่มี anonymous RLS policy และ service_role ของ API มีเฉพาะอ่าน/เพิ่มข้อความ ไม่มีสิทธิ์อนุมัติ

รีวิวนักท่องเที่ยวมี user_id เป็น null และมี guest_key สำหรับจำกัดการส่งซ้ำ ผู้ส่งเลือกชื่อได้ไม่เกิน 40 ตัวอักษร ถ้าเว้นว่างใช้ “ผู้ชมไม่ระบุตัวตน” API กำหนดรูปว่างและสถานะ pending เสมอ ชื่อที่ผู้ส่งตั้งเองไม่ทำให้ได้สถานะล็อกอิน ป้าย “ไม่ได้เข้าสู่ระบบ” อิง user_id ที่ฐานข้อมูลและ API ส่งออกเฉพาะ mode ไม่ส่ง user_id หรือ guest_key ต่อสาธารณะ

สำหรับตารางที่เปิดโหมดนักท่องเที่ยวไว้แล้ว ให้รัน `supabase/comments-guest-names.sql` ก่อน Deploy เพื่อผ่อนเงื่อนไขชื่อใน comments_author_kind โดยคงข้อมูลและข้อจำกัดการส่งซ้ำเดิมไว้

โหมดนักท่องเที่ยวจำกัด 1 รีวิวต่อเครือข่ายต่อวัน UTC ด้วย unique index ในฐานข้อมูล ผู้ชมที่ใช้ Wi-Fi/อินเทอร์เน็ตสาธารณะเดียวกันอาจใช้โควตาร่วมกัน เลือกส่งด้วย Google แทนได้ API ใช้ IP จาก x-vercel-forwarded-for ของ Vercel (อ้างอิง https://vercel.com/docs/headers/request-headers) มาทำ HMAC ด้วยคีย์ฝั่งเซิร์ฟเวอร์และวัน UTC เก็บเฉพาะรหัสรายวันใน guest_key ไม่บันทึก IP ดิบลงตารางและไม่ส่งรหัสนี้ออกทาง API สาธารณะ ไม่ใช้ fingerprint จากเบราว์เซอร์ การเปลี่ยน IP หรือคีย์เซิร์ฟเวอร์อาจทำให้โควตาเริ่มใหม่ จึงยังต้องตรวจอนุมัติทุกข้อความ

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

หากต้องการเลือกสถานะจากดรอปดาวน์ ให้รัน `supabase/comments-status-dropdown.sql` ใน SQL Editor แล้วรีเฟรช Table Editor ไฟล์นี้เปลี่ยน status จาก text เป็น enum โดยคงค่าเดิมไว้ API ยังส่ง pending และอ่าน approved ได้เหมือนเดิม ไม่ต้อง Deploy เว็บใหม่

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
- ทดสอบนักท่องเที่ยวจริงหลังรัน migration: ไม่ล็อกอิน → พิมพ์ → เลือกนักท่องเที่ยว → ยืนยัน → ส่ง → ตรวจ pending/user_id ว่าง/ไม่มีรูป → approve → reload เห็นชื่อนักท่องเที่ยว → ส่งซ้ำเครือข่ายเดิมได้ 429

ขั้นตอน Google จริงและ SQL ต้องทำบนบัญชีของเจ้าของเว็บก่อน จึงจะยืนยัน end-to-end กับบริการจริงได้
