# เปิดใช้ระบบคลังภาพหลังบ้าน

หน้า `admin.html` ใช้ธีมดำ–ทองและเข้าจากโลโก้บนเว็บหลัก ล็อกอิน Google ได้เฉพาะผู้ที่มี UID อยู่ใน `portfolio_admins` บัญชีผู้ดูแลที่กำหนดคือ **arnut369@gmail.com** ระบบนี้ใช้ Supabase และ Environment Variables ชุดเดิม ไม่ต้องใส่คีย์ใน HTML/JavaScript ฝั่งผู้ชม

## 1. เตรียมตารางและ Storage

Supabase → SQL Editor → New query → คัดลอก `supabase/portfolio.sql` ทั้งไฟล์ → Run

ไฟล์นี้สร้าง:

- `portfolio_admins`: UID ผู้ดูแล อิง Authentication → Users
- `portfolio_photos`: หมวด คำอธิบาย ลำดับ สถานะ ขนาด และตำแหน่งไฟล์
- Storage bucket `portfolio-images`: เก็บไฟล์ JPEG สำหรับหน้าเว็บ อัปโหลดผ่าน API ผู้ดูแลเท่านั้น
- รายการภาพเดิมในสไลด์ 32 ภาพต่อ environment เพื่อจัดการร่วมกับภาพใหม่ (ยังอ้างไฟล์ `img/` เดิม ไม่คัดลอกไฟล์เข้า Storage)

ผลสุดท้ายควรเป็น `admin_ready = true` ถ้าเป็น false แปลว่ายังไม่มีบัญชี Google นี้ใน Authentication → Users ให้ใช้บัญชี arnut369@gmail.com ล็อกอิน Google บนเว็บรีวิวเดิมสักครั้ง หรือเริ่มล็อกอินจากหลังบ้าน (ครั้งแรกอาจถูกปฏิเสธ แต่บัญชีจะถูกสร้างใน Supabase แล้ว) จากนั้นรันเฉพาะคำสั่งนี้:

```sql
insert into public.portfolio_admins (user_id)
select id from auth.users
where lower(email) = 'arnut369@gmail.com' and email_confirmed_at is not null
on conflict (user_id) do nothing;
```

หรือคัดลอก UID จาก Authentication → Users มาเพิ่มใน portfolio_admins ด้วย Table Editor ได้เลย ห้ามเพิ่มบัญชีผู้ชมทั่วไป การเป็นผู้รีวิวหรือรู้ URL หลังบ้านไม่ได้ให้สิทธิ์ผู้ดูแล

SQL ไม่ลบข้อมูลรีวิวหรือตัวนับวิว และจะเพิ่มภาพเดิมเฉพาะ environment ที่ยังไม่มีรายการภาพเลย หากภายหลังลบรายการทุกภาพแล้วรัน SQL เตรียมระบบซ้ำ ภาพเดิมจะถูกเพิ่มกลับมา

## 2. เพิ่ม URL กลับจากล็อกอิน

Supabase → Authentication → URL Configuration → Redirect URLs → Add URL:

```text
https://arnut.vercel.app/api/admin-auth
https://arnut-git-test-design-pacman10.vercel.app/api/admin-auth
```

เก็บ URL `/api/comment-auth` เดิมไว้ด้วย ใช้ Google Provider และ Client ID/Secret เดิมได้ ไม่ต้องแก้ callback `/auth/v1/callback` ใน Google Cloud

## 3. ตรวจ Environment Variables บน Vercel

ใช้ค่าที่ตั้งไว้แล้วสำหรับระบบรีวิว:

| ตัวแปร | Production | Preview ของ test-design |
| --- | --- | --- |
| SUPABASE_URL หรือ NEXT_PUBLIC_SUPABASE_URL | URL Supabase เดิม | URL Supabase เดิม |
| SUPABASE_SECRET_KEY หรือ SUPABASE_SERVICE_ROLE_KEY | คีย์ฝั่งเซิร์ฟเวอร์เดิม | คีย์ฝั่งเซิร์ฟเวอร์เดิม |
| COMMENTS_SITE_URL | https://arnut.vercel.app | https://arnut-git-test-design-pacman10.vercel.app |

ชื่อ COMMENTS_SITE_URL ถูกใช้ร่วมกับหลังบ้านด้วย เปิดเว็บบนโดเมนเดียวกับค่านี้เสมอ เพราะ API ตรวจ origin และ cookie กลับมายังโดเมนนี้ ถ้าแก้ Environment Variables ต้อง Deploy ใหม่

## 4. Deploy และใช้งาน

นำไฟล์ใหม่และไฟล์ที่แก้ขึ้น GitHub/Vercel แล้วเปิด `/admin.html` หรือกดโลโก้บนหน้าแรก ล็อกอินด้วยบัญชีผู้ดูแล

1. เลือกหมวดงานแต่ง / งานบวช / งานรับปริญญา / ผลงานอื่นๆ
2. เลือก JPEG, PNG หรือ WebP ได้ครั้งละ 20 ภาพ ไฟล์ต้นฉบับไม่เกิน 30 MB ต่อภาพ
3. ใส่คำอธิบาย (ไม่กรอกจะใช้ชื่อไฟล์) และลำดับ เริ่มต้นระบบจะวางต่อท้ายหมวดนั้น
4. กดอัปโหลด ระบบย่อด้านยาวให้ไม่เกิน 2560 พิกเซลและแปลงเป็น JPEG ไม่เกิน 2 MB ต่อภาพ ก่อนส่งผ่าน Vercel API ภาพ PNG โปร่งใสจะใช้พื้นสีขาว ไม่มี EXIF ต้นฉบับติดไปด้วย
5. เปิดหน้าเว็บใหม่ ภาพที่แสดงจะเข้าคิวสไลด์ตามหมวดและลำดับ โดยไม่ต้อง Deploy เพื่อเปลี่ยนรายการภาพแต่ละครั้ง

แก้หมวด คำอธิบาย ลำดับ หรือซ่อนภาพได้จากการ์ดแต่ละใบ แล้วกดบันทึก เลขลำดับน้อยแสดงก่อน หากเลขเท่ากันเรียงตามเวลาสร้างและ ID

การลบภาพอัปโหลดจะนำออกจากเว็บไซต์และลบไฟล์ใน Storage การลบภาพเดิมนำออกเฉพาะรายการสไลด์ ไฟล์ใน GitHub ยังอยู่ ระบบขอให้ยืนยันก่อนลบ

## การแยกเว็บจริงกับเว็บทดสอบ

ใช้ `channel=production` กับเว็บจริง และ `channel=preview` กับ Preview/Development โดยเซิร์ฟเวอร์กำหนดเอง หน้าแอดมินมีป้ายบอก environment รูปที่อัปโหลดบนเว็บทดสอบไม่ถูกย้ายไปเว็บจริงเพียงแค่ merge branch ต้องอัปโหลดบนหลังบ้านของเว็บจริงด้วย

## ความปลอดภัยและข้อจำกัด

- API ตรวจเซสชัน Google ที่ยืนยันอีเมลและตาราง UID ผู้ดูแลทุกครั้ง รวมถึงก่อนอ่านรายการจัดการภาพ ไม่ส่ง secret หรือ access token ให้ JavaScript หน้าเว็บ เซสชันเป็น HttpOnly / Secure / SameSite=Lax อายุไม่เกิน 1 ชั่วโมง แยกจากเซสชันรีวิว
- ตารางทั้งสองใช้ RLS และไม่มีสิทธิ์อ่าน/เขียนสำหรับ anon/authenticated การเขียน Storage ของ bucket นี้ถูกปิดสำหรับ client ทั่วไป และทำได้ผ่าน API หลังตรวจสิทธิ์เท่านั้น
- Bucket นี้เก็บภาพเพื่อเผยแพร่สาธารณะ การซ่อนจากสไลด์ไม่ได้ทำให้ URL ไฟล์เป็นส่วนตัว ผู้ที่มี URL เดิมอาจยังเปิดได้ หากต้องการนำไฟล์ออกให้ใช้ลบ ภาพอาจยังอยู่ในแคชผู้ชมชั่วคราว
- API ตรวจโครงสร้าง JPEG และขนาดก่อนรับ ไม่ใช้ชื่อไฟล์จากผู้ใช้เป็น Storage path และไม่รับ Storage path หรือ UID จากผู้เรียกเพื่ออัปโหลด/ลบ
- การอัปโหลดเป็นลำดับและไม่มี retry อัตโนมัติ หากคำขอขาดกลางทาง ให้โหลดรายการใหม่ก่อนส่งซ้ำ แถวที่ยังอัปโหลดไม่ครบถูกเก็บในคลังแบบซ่อน เพื่อให้ลบและอัปโหลดใหม่ได้
- ถ้า Supabase ไม่พร้อม หน้าเว็บยังใช้ภาพเดิมที่อยู่ในโปรเจกต์และสไลด์แบบเดิม ทำให้ภาพเดิมที่เคยซ่อนผ่านหลังบ้านอาจกลับมาแสดงชั่วคราวเมื่อ API ล้มเหลว การซ่อนผ่านหลังบ้านจึงเหมาะกับการคัดเลือกภาพ ไม่ใช้เป็นการจำกัดการเข้าถึงไฟล์ส่วนตัว
- หน้าเว็บดึงรายการใหม่เมื่อเปิดหรือรีโหลด ไม่เปลี่ยนภาพกลางสไลด์ที่ผู้ชมเปิดค้างไว้
- การตั้งค่าบัญชี/SQL/Storage และทดสอบ Google จริงต้องทำในบัญชี Supabase/Vercel ของเจ้าของเว็บ การทดสอบในเครื่องใช้บริการจำลอง

## ตรวจสอบ

```text
node --test tests/portfolio.cjs tests/comments.cjs tests/views.cjs
node tests/portfolio-browser.cjs
node tests/browser.cjs
node tests/comments-browser.cjs
```

เบราว์เซอร์เทสต์ต้องมี Playwright และ Microsoft Edge การทดสอบครอบคลุมสิทธิ์ผู้ดูแล, PKCE, การอัปโหลดไม่ครบ, ซ่อน/ลบ, หมวด/ลำดับ, fallback ภาพเดิม และหน้าจอ 320/390/768/1440 พิกเซล

มี `tests/portfolio-sql.cjs` สำหรับทดสอบ SQL/RLS ด้วย PostgreSQL จำลองผ่าน @electric-sql/pglite (dependency สำหรับทดสอบเท่านั้น ไม่ใช้บนเว็บจริง) ถ้าไม่ได้ติดตั้งจะข้ามชุดนี้

เอกสารอ้างอิง: https://supabase.com/docs/guides/storage/buckets/fundamentals และ https://vercel.com/docs/functions/limitations
