# Owner email and SMS alerts

RMT stores two private notification records when an application, ownership claim, or project edit enters review: one email and one SMS. These records are inserted in the same transaction as the pending item. A saved application remains saved if a notification attempt fails.

The adapter code is implemented. Recipients and provider credentials are intentionally blank in this repository. No provider account, paid subscription, phone number, or live message was created during implementation.

## Configuration

Set these values as **server runtime bindings/secrets** through the deployment host. Do not place values in Git, browser code, public environment variables, or a project application form.

| Setting | Purpose |
| --- | --- |
| `RMT_ADMIN_USER_IDS` | Existing exact reviewer allowlist. A nonempty allowlist is required before notifications run. |
| `RMT_PUBLIC_URL` | Trusted HTTPS base URL of this RMT deployment, with no query or fragment. The adapter adds `#review`. |
| `RMT_NOTIFICATION_EMAIL` | The owner's chosen email recipient. |
| `RMT_EMAIL_FROM` | A Resend-authorized sender email, optionally `RMT <sender@your-domain>`. |
| `RESEND_API_KEY` | Resend server API key authorized to send from that domain. |
| `RMT_NOTIFICATION_PHONE` | The owner's chosen phone recipient in international E.164 format. |
| `TWILIO_ACCOUNT_SID` | The Twilio account owning the SMS sender. |
| `TWILIO_AUTH_TOKEN` | That account's server authentication token. |
| `TWILIO_FROM_NUMBER` | SMS-capable sender number configured in that Twilio account, in E.164 format. |

Email and SMS can be enabled independently. Each needs the common reviewer access and review URL settings. Provider accounts, sender authorization, permitted destinations, and any messaging charges remain the deployment owner's responsibility. This app does not provision or purchase them.

After saving the settings, sign in as an allowed reviewer and open **Review → Notifications**. The cards report missing settings without exposing recipient addresses or credentials. “Configured” means the required server settings are present; it does not prove provider authentication or delivery. The **Retry ready alerts** button processes existing queued records, up to three at a time. It does not send a separate test message. New pending submissions also trigger a bounded, awaited processing attempt.

## Queue and delivery meaning

| Stored status | Meaning in the reviewer UI |
| --- | --- |
| `pending` | Queued; no confirmed provider attempt yet. |
| `unconfigured` | Required server configuration is missing; no HTTP request occurred. |
| `sending` | A worker has claimed the row and is contacting the provider. |
| `sent` | **Accepted by provider.** A provider message ID was received. Delivery to the owner's inbox or phone is not confirmed. |
| `failed` | A definite rejection or explicit provider failure was recorded. |
| `uncertain` | The request may have been accepted, but its result could not be established. |

Each processing call claims at most three records. Each provider request has an eight-second timeout and an 8 KB response limit. Failed attempts wait at least one minute and stop after three attempts. There is no background scheduler: processing occurs after a submission or an explicit reviewer retry. If a process stops mid-attempt, its `sending` record becomes uncertain after two minutes.

The status endpoint is read-only. Both status and retry require the server reviewer allowlist. Retry is a same-origin JSON POST with the exact action `{"action":"retry"}`. Recipients, message bodies, channel choices, publication decisions, and credentials cannot be supplied through this endpoint. Notification links open the private review workspace and perform no approval or publication action.

## Avoiding duplicate messages

An atomic database update claims a row before sending. A successful row is never sent again. Queue uniqueness is per review event and channel; a later revision entering review is a new event.

**Email:** Resend receives a stable `Idempotency-Key` for the row. The destination, sender, subject, and text are frozen at the first attempt. Retries reuse exactly that body and key within a conservative 23-hour window, inside Resend's documented 24-hour key retention. A fingerprint of the provider credential is stored, never the credential itself. An uncertain attempt is held if that credential changes, so a change of provider account cannot silently defeat deduplication. A definite rejection can be retried with corrected credentials. Changing a recipient or sender setting does not rewrite the body of an already attempted alert.

**SMS:** A timeout, ambiguous server response, or interrupted attempt is held as `uncertain`. It is not automatically retried and is excluded from the retry button. Check the Twilio message log before taking any further action. A returned Message SID is preserved for investigation; an SMS with a provider ID is never automatically recreated, even if the provider reports failure.

There is no “force resend” action. Rows with an expired email retry window, exhausted attempts, malformed saved payload, or changed credentials after an uncertain email need manual investigation. Do not reset uncertain SMS rows or create replacements without checking provider logs first. This avoids claiming exactly-once delivery where the provider cannot guarantee it.

The frozen request includes the recipient and sender and remains private in the database. The admin JSON report exposes safe status, project name, event type, attempt count, timestamps, and provider reference only. Raw provider response text is neither logged nor persisted. No applicant contact details or ownership evidence are included in an alert.

## Integration and verification

- `lib/server/notifications.ts` exports `dispatchNotifications(db, env)`, the post-commit wrapper that cannot turn a saved application into an apparent failure.
- `flushNotifications(db, env, limit = 3)` is the bounded processor used by the reviewer retry endpoint.
- `notificationStatus(db, env)` supplies the private, sanitized report.
- `tests/notifications.test.mjs` uses in-memory SQLite and mocked HTTP responses; the tests send no messages.

Live recipient ownership, provider authentication, delivery, sender readiness, and production reviewer identity must be configured and verified by the deployment owner before claiming alerts are operational.

## Provider references

- [Resend Send Email API](https://resend.com/docs/api-reference/emails/send-email): HTTPS JSON request, sender/recipient and text fields, response email ID.
- [Resend idempotency keys](https://resend.com/docs/dashboard/emails/idempotency-keys): stable request keys, identical retries, 24-hour retention.
- [Twilio Message resource](https://www.twilio.com/docs/messaging/api/message-resource): form-encoded creation request, message SID and lifecycle statuses. A queued response is distinct from delivery.
- [Twilio API requests](https://www.twilio.com/docs/usage/requests-to-twilio): server authentication and request encoding.
