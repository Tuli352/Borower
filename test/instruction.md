Customers already store a unique referral code and an optional referred-by link, but a signed-in customer cannot yet claim someone else's code after signup or see how many people they referred.

### Endpoint

Add `POST /customers/profile/referral` for authenticated customers (`AppContext` = CUSTOMER).

The request body is JSON with a string field `code`. Validate it with a class-validator DTO using `@IsString()` and `@IsNotEmpty()`. Place the DTO at `src/customers/dto/redeem-referral.dto.ts` and export the class as `RedeemReferralDto`.

### Success (HTTP 200)

Trim leading and trailing whitespace from `code`. Matching is case-sensitive. When the code belongs to another customer and the caller has never been referred (`referredById` is null):

1. Set the caller's `referredById` to the referrer's id.
2. Add 100 to the referrer's `totalLoyaltyPoints`.
3. Return `{ "referredById": "<referrer id>", "pointsAwarded": 100 }`.

### Errors

Put an `error` field in the JSON body:

- Empty or whitespace-only code after trim → HTTP 400, `invalid_referral_code`
- No customer owns the code → HTTP 404, `referral_not_found`
- Caller already referred, or the code is the caller's own code → HTTP 409, `referral_not_eligible`

A second redeem by the same caller must return 409 and must not award points again. Concurrent claims must not double-award; re-check `referredById` inside a transaction before writing.

### Profile

Enrich `GET /customers/profile` so the response always includes `referralCount` and `totalLoyaltyPoints`. When the stored points value is missing, use `0`.

Leave existing non-referral flows unchanged. Internal helpers are optional. The route, DTO path above, and profile fields are required.

IMPORTANT: Work on a new branch from main and commit when done.
