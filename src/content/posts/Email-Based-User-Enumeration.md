---
title: 'Email-Based User Enumeration'
published: 2026-01-04
draft: false
tags: ['bug bounty', 'information disclosure']
toc: true
coverImage:
  src: 'banner1.gif'
  alt: 'Animated scene of a security researcher working at a laptop'
---

This Blog is related to privacy-related vulnerability that I reported to a **private bug bounty program**.

The issue was classified as an **Information Disclosure** vulnerability with **Medium severity (5.3)**.  
It allowed retrieving **any user’s account information using only the email address associated with the account**.

---

## Background

While testing an **Android application**, this was actually my **first time seriously testing mobile assets**.  
I wasn’t deeply familiar with Android internals yet, so I focused on reviewing API usage and unused endpoints exposed in the app.

I had already hunted on the **same target’s web application**, so I had a good understanding of the platform’s functionality and data model.

During API enumeration, I noticed an endpoint that was **present in the API list but not actively used** by the app. That immediately caught my attention.

The endpoint was:
```
api.target.com/find/users
```
---

## Initial Testing

I started by sending a `GET` request.

- **Response:** `405 Method Not Allowed`

So I switched to a `POST` request.

- **Response:** `402 Bad Request`
- Error message indicated: `Content-Type: application/json required`

I added the proper content type adn retried 
- **Response:** `username not found`

At this point, things started getting interesting.

---

## Dead Ends & Breakthrough
At first, I was excited and thought this could turn into a high severity vulnerability but 

I first tried sending a **username** belonging to my target account.
- **Response:** `username not found`

i thought maybe userid might work 

so then tried using a **user ID**.

- **Response:** still `username not found`

That was disappointing, and honestly, I thought the endpoint might be broken or useless.  
I saved the request and decided to analyze it later.

While reviewing the **Android login request** in Burp history, I noticed something important:\
The account login request looked like this:

```text
POST /login HTTP/1.1
Host: api.target.com

username=<EMAIL>&password=<PASSWORD>
```
That gave me an idea that maybe the application was treating the email address as the username.

and then tried using a **Email Id**.
- **Response:** `200 Ok`
- **Response:** `full metadata of email connected account `

>That confirmed the issue.!!

## Steps To Reproduce:
1. Create new account 
2. A POST request is made with a JSON payload containing the target email address.
```
POST /find/users
Authorization: Bearer <VALID_API_TOKEN>
Content-Type: application/json

{
  "username": "target_user@example.com"
}
```
3. - The API responds with user metadata,
 including: 
 - Internal user Info  
 - Account creation timestamps 
 - Public profile URL 
 - Account tier 
 - Billing info 
 - Capabilities & feature flags 
 - Email addresses linked to the account 
 - Team and membership metadata 
 - Location metadata (if set)


## Impact

- Confirmation of email registration status
- Collection of detailed user profiles at scale
- Mapping of users to teams/organizations

While not containing direct PII like full billing addresses, the exposed metadata is far more than what should be accessible without authentication or consent

## Timeline

- ⮞**September 5, 2025** - Report submitted with proposed Critical severity
- ⮞**~20 minutes later** - Passed initial analyst review
Same day 
- ⮞Briefly marked as **Duplicate** (of a report targeting a different endpoint using user ID)
Quick appeal 
- ⮞Explained the distinction: **different endpoint**, **different input** (email vs ID), broader enumeration potential
- ⮞**~1 hour later** :
Analyst reopened, apologized, and moved to program review
- ⮞**~2 hours later** :
Program downgraded to Medium severity, but acknowledged the unique endpoint and additional exposed fields (e.g., team metadata)
Shortly after
- ⮞Resolved with monetary reward ($$$)

Program comment:
"We’re already aware that several of our APIs expose extended metadata due to shared response structures... While the root cause is similar to previous reports, you’ve highlighted a distinct endpoint and surfaced additional details... Although this information isn’t highly sensitive on its own, we agree it’s worth tracking."

## Final Thoughts

Sometimes a quick appeal with clear technical distinction can turn a duplicate into a valid finding. Politeness and precision pay off.

>Stay curious, hunt responsibly. 🔍
