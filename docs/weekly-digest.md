# Weekly member digest

Activity → Notifications → Preview weekly digest opens a read-only edition for the current verified member. The previous seven days supply up to six reviewed updates published after the member followed each project and three newly approved directory listings. Up to three upcoming events come from followed projects and start in the next seven days. The preview reads current publication and visibility state whenever it is opened. It creates no recipient list, subscription, send job or provider request. Existing in-app notification preferences and owner review alerts continue independently.

## Delivery status

The production Sites environment inventory at revision 4 contained the owner review recipient binding. It contained neither a Resend sending credential nor a sender binding. No campaign provider appeared among the production bindings. Firebase sign-in verification and recovery messages serve account authentication. These checks establish no verified campaign sender, domain, inbox delivery, or free-plan headroom for RMT.

* Resend lists a free marketing allowance of up to 1,000 contacts with unlimited marketing emails. Its separate 100-per-day and 3,000-per-month transactional allowances apply to transactional traffic. Sending requires a verified domain. [Account limits](https://resend.com/docs/knowledge-base/account-quotas-and-limits) · [Verified domains](https://resend.com/docs/dashboard/domains/introduction)
* Brevo's free plan allows 300 email sends per day. A campaign with more recipients requires manually requeuing the remaining contacts on subsequent days. [Free plan limits](https://help.brevo.com/hc/en-us/articles/208580669-FAQs-What-are-the-limits-of-the-Free-plan)
* Cloudflare Workers Free can send only to destination addresses verified in the Cloudflare account. That sender cannot reach an arbitrary directory of opted-in members on the free plan. [Cloudflare Email Service](https://developers.cloudflare.com/email-service/)

## Prerequisites for an email pilot

The owner would need to authorize a marketing sender, verify its sending domain, and demonstrate test inbox delivery with hard free-tier limits. The member pilot would need account-bound consent for the exact verified address, one-click unsubscribe and provider suppression handling, plus a durable unique recipient-and-edition delivery record covering concurrent sends and ambiguous provider outcomes. Sender credentials must be held in server-only bindings. Until those conditions pass, the in-app edition remains available and the site does not solicit email subscriptions.
