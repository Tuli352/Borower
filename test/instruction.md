Customers already store a unique referral code and an optional referred-by link, but nothing lets a signed-in customer claim someone else's code after signup or see referral stats.

Add POST /customers/profile/referral for authenticated customers (AppContext = CUSTOMER). Body JSON must include string field `code`, validated with a DTO using class-validator `@IsString()` and `@IsNotEmpty()`.

Success (200): after trimming whitespace (case-sensitive match) the code belongs to another customer and the caller has never been referred. Set the caller's referredById, add 100 to the referrer's totalLoyaltyPoints, return `{ "referredById": "<id>", "pointsAwarded": 100 }`.

Errors (response body includes `error`):
- empty/whitespace-only code after trim → 400, `invalid_referral_code`
- unknown code → 404, `referral_not_found`
- already referred or own code → 409, `referral_not_eligible`

A second redeem by the same caller must return 409 and award no points. Concurrent claims must not double-award (re-check referredById inside a transaction before write).

Enrich GET /customers/profile with `referralCount` and `totalLoyaltyPoints` (default 0). Other existing flows stay unchanged.

Wire the route on CustomersController to your service layer however you like; structure is free as long as the HTTP contract and profile fields hold.

IMPORTANT: Work on a new branch from main and commit when done.
