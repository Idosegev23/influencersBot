# Meta App Review — Recording Guide (Tech Provider)

Two videos required. Meta explicitly accepts the cURL / WhatsApp Manager alternatives
used below — no product UI needs to appear. Record each in ONE take, full screen,
no cuts. Keep the terminal font large.

**Before recording:** open a private terminal profile (no other secrets on screen).
The access token WILL be visible in the commands — that is acceptable to Meta
(it's your own token in your own terminal), but rotate it after review if it bothers you.

Set up once per session:

```bash
cd /Users/idosegev/Downloads/TriRoars/Leaders/influencerbot
export $(grep -E '^(WHATSAPP_ACCESS_TOKEN|WHATSAPP_PHONE_NUMBER_ID|WHATSAPP_BUSINESS_ACCOUNT_ID)=' .env.local | xargs)
export RECIPIENT=9725XXXXXXXX   # ← your own phone, E.164 digits, no +
```

---

## Video 1 — send a message, receive it in WhatsApp

Frame: terminal on the left, WhatsApp Web (or your phone screen-mirrored) on the right,
logged into the RECIPIENT account.

Run (uses the pre-approved `hello_world` template — template sends work outside the
24h window, so this works even from a cold start):

```bash
curl -s -X POST "https://graph.facebook.com/v21.0/${WHATSAPP_PHONE_NUMBER_ID}/messages" \
  -H "Authorization: Bearer ${WHATSAPP_ACCESS_TOKEN}" \
  -H "Content-Type: application/json" \
  -d '{
    "messaging_product": "whatsapp",
    "to": "'"${RECIPIENT}"'",
    "type": "template",
    "template": { "name": "hello_world", "language": { "code": "en_US" } }
  }'
```

What the video must show, in order:
1. The command being executed
2. The JSON response with the `messages[0].id`
3. The message ARRIVING in the WhatsApp client — this is the part reviewers look for

Optional stronger close: reply to the message from the phone, then send a free-text
follow-up (now inside the 24h window) to show two-way messaging:

```bash
curl -s -X POST "https://graph.facebook.com/v21.0/${WHATSAPP_PHONE_NUMBER_ID}/messages" \
  -H "Authorization: Bearer ${WHATSAPP_ACCESS_TOKEN}" \
  -H "Content-Type: application/json" \
  -d '{
    "messaging_product": "whatsapp",
    "to": "'"${RECIPIENT}"'",
    "type": "text",
    "text": { "body": "Bestie demo: two-way messaging confirmed ✅" }
  }'
```

---

## Video 2 — create a message template

Option A (Meta's explicit alternative, easiest): screen-record **WhatsApp Manager**
(business.facebook.com → WhatsApp Manager → Message templates → Create template).
Create a simple UTILITY template, e.g. name `review_demo_order_update`, body:
`Hi {{1}}, your order {{2}} has been updated.` Show the form being filled and submitted.

Option B (cURL, same rights, same terminal setup):

```bash
curl -s -X POST "https://graph.facebook.com/v21.0/${WHATSAPP_BUSINESS_ACCOUNT_ID}/message_templates" \
  -H "Authorization: Bearer ${WHATSAPP_ACCESS_TOKEN}" \
  -H "Content-Type: application/json" \
  -d '{
    "name": "review_demo_order_update",
    "language": "en_US",
    "category": "UTILITY",
    "components": [{
      "type": "BODY",
      "text": "Hi {{1}}, your order {{2}} has been updated.",
      "example": { "body_text": [["Dana", "10432"]] }
    }]
  }'
```

Show the command + the response containing the new template `id` and `status: PENDING`.
Optionally refresh WhatsApp Manager's template list to show it appearing.

Cleanup after approval of the review (the demo template is not needed):

```bash
curl -s -X DELETE "https://graph.facebook.com/v21.0/${WHATSAPP_BUSINESS_ACCOUNT_ID}/message_templates?name=review_demo_order_update" \
  -H "Authorization: Bearer ${WHATSAPP_ACCESS_TOKEN}"
```

---

## Submission notes (App Review form)

Per-permission usage description (adapt freely):

- `whatsapp_business_messaging`: "Bestie is a SaaS platform providing AI-powered
  customer-service chatbots. We send and receive WhatsApp messages on behalf of our
  onboarded business clients: automated replies to their customers' inquiries within
  the customer-service window, and utility templates for order/support updates."
- `whatsapp_business_management`: "We manage our clients' WhatsApp Business Accounts
  on their behalf: subscribing our webhook to their WABA, creating and monitoring
  utility message templates for customer-service notifications, and reading account
  status. Clients onboard via Embedded Signup and retain full ownership of their WABA."
