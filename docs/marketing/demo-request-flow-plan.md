# Mutqan Demo Request Flow Plan

Status: lightweight public demo request page with a safe mailto fallback  
Owner surface: public marketing/contact flow only  
Primary route: `/contact`

## Current State

- `/contact` is a public route rendered by `src/pages/site/ContactPage.tsx`.
- Landing and navigation demo CTAs route to `/contact`.
- The page has been lightened so the form is the dominant conversion surface.
- The sidebar is reduced to one compact direct contact card.
- Long preparation and explanatory side cards were removed from the page.
- No public demo request API route, database table, or reliable public lead-capture backend exists yet.
- Existing email infrastructure is scoped to authentication and internal notifications, not public demo requests.

## What Happens On Submit

1. The browser validates required fields on the page.
2. If validation passes, the page builds a prefilled email addressed to `info@mutqan-sa.com`.
3. The visitor's email client opens through a `mailto:` link.
4. The page shows a prepared-draft state with a fallback link.

The request is not considered received until the visitor sends the email from their email client.

## Storage And Sending

- Stored in database: no.
- Sent by backend: no.
- Sent by visitor email client: yes, after the visitor confirms and sends the generated email.
- Destination: `info@mutqan-sa.com`.

## Required Fields

- الاسم
- جهة العمل
- البريد الإلكتروني
- رقم الجوال
- نوع المنشأة
- ما الذي ترغب في تحسينه؟

Optional fields:

- المسمى
- المواقع أو الأصول
- ملاحظات

## Current Page Copy Direction

- Short, confident, and form-led.
- The hero gives only enough context to request a demo.
- The form intro is brief: "بيانات التواصل" and "املأ البيانات الأساسية وسنرتب معك العرض المناسب."
- The mailto notice stays honest and concise: "سيتم فتح بريدك لإرسال الطلب إلى فريق متقن."

## Future Improvement

Add a small server-side demo request endpoint with:

- Rate limiting.
- Basic spam protection.
- Server-side validation.
- Email notification to Mutqan.
- Optional lead storage.
- A real success state only after the request is stored or sent reliably.

Use this Arabic success message only after a real backend exists:

> تم استلام طلبك بنجاح. سنراجع البيانات ونتواصل معك لترتيب عرض مناسب لاحتياج منشأتك.

English:

> Your request has been received. We will review your details and contact you to arrange a suitable demo.

## Acceptance Criteria

- `/contact` is reachable publicly.
- The form remains the main page focus.
- Required fields are visually clear.
- Optional fields remain available but feel secondary.
- Validation messages are clear.
- The mailto fallback does not claim the request was received.
- Landing page remains unchanged.
- No dashboard, product UI, database migration, or backend email change is required.
- `npm run build` passes.
- `npm run lint` passes or any unrelated existing warnings are documented.
