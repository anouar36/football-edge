# FE-004 — فحوصات الجودة الآلية

## الفحوصات
- quality: npm ci ثم typecheck وlint وtest:model وqa:money.
- pipeline: PostgreSQL مؤقتة؛ db:push ثم qa:pipeline مع CSV وAI محاكيين.
- security: قاعدة مؤقتة مستقلة؛ build ثم run-security.mjs بحساب وهمي.
- FE-004 required gate: يفشل إذا فشل أو أُلغي أو تُجاوز أي فحص مطلوب.

## الإعدادات والعزل
لا يقرأ workflow أي GitHub Secret.
القيم الموجودة فيه بيانات اختبار وهمية، وليست مفاتيح مزودين حقيقية.
كل job يعتمد PostgreSQL مؤقتة باسم fe004_ci.
لا تستعمل هذه الأوامر على إعدادات Neon أو قاعدة الإنتاج.
qa:pipeline يمسح جداول قاعدة الاختبار.

local-only-fetch.mjs يمنع fetch خارج loopback أثناء الاختبارات.
هذا ليس عزل شبكة شاملًا. npm ci والبناء قد يحتاجان الإنترنت،
خصوصًا تحميل Google Fonts أثناء البناء.
QA_RUN_CRON يبقى 0 في فحص الأمان.

## التشغيل
CI يستخدم Node 22 وnpm ci.
يشغل pull_request إلى main، أو workflow_dispatch من GitHub Actions.
السجلات تظهر في خطوات Actions.
للتشغيل المحلي: استعمل نسخة معزولة دون ملفات .env الأصلية،
PostgreSQL مخصصة، وإعدادات مماثلة للـworkflow، مع تعديل المنفذ المحلي.
لا تنفذ npm ci داخل مختبر node_modules دياله رابط لنسخة المشروع الأصلية.

## تصحيحات مرتبطة بالفحص
صفحة المباراة تستعمل params.id دون فك ترميز إضافي.
فحص streaming لا يقبل 200 وحده؛ يتحقق من noindex وعلامة الصفحة وNEXT_NOT_FOUND.
توجد اختبارات مضادة لرفض صفحات 200 غير المرتبطة بـnot-found.
docs مستثناة من TypeScript لأنها تحتوي نسخ كود مرجعية.

## قبل إعلان الاكتمال
يلزم تشغيل CI فعليًا وإثبات نجاحه وفشله مع خطأ مقصود.
النجاح المحلي لا يثبت نجاح GitHub Actions أوتفعيل حماية main.
بعد التحقق، يمكن اعتماد FE-004 required gate كفحص مطلوب في حماية الفرع.
