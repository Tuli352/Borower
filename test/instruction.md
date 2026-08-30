Customers already store a unique referral code and an optional referred-by link, but nothing lets a signed-in customer claim someone else's code after signup or see how many people they have successfully referred.

Provide a redemption path on the customer API.

### Public HTTP contract

- An authenticated customer (AppContext = CUSTOMER) can `POST /customers/profile/referral` with a JSON body containing a string field `code`.
- Validation: the body must contain a non-empty string after trimming. Use a DTO with class-validator (`@IsString()`, `@IsNotEmpty()`) so missing/empty bodies are rejected before business logic.
- Success (HTTP 200):
  - The supplied code (after trimming leading/trailing whitespace; comparison is case-sensitive) belongs to another customer.
  - The caller has never been referred before (`referredById` is null).
  - Persist `referredById` on the caller to the referrer's customer id.
  - Award a fixed loyalty-point bonus of **100** by incrementing the referrer's `totalLoyaltyPoints`.
  - Return JSON body: `{ "referredById": "<referrer customer id>", "pointsAwarded": 100 }`.
- Error cases (return the exact error string in the response body under an `error` field):
  - Empty or whitespace-only code after trim → HTTP 400, `error: "invalid_referral_code"`.
  - No customer owns the code → HTTP 404, `error: "referral_not_found"`.
  - Caller is already referred, or the code is the caller's own code → HTTP 409, `error: "referral_not_eligible"`.
- A second redeem attempt by the same caller must always return 409 / `referral_not_eligible` and must not award points again.
- Concurrent redeem attempts for the same caller must not double-award the referrer (use a transaction that re-checks `referredById` before writing).

### Profile enrichment

Extend the existing authenticated `GET /customers/profile` response so that it always includes:
- `referralCount` (number of customers whose `referredById` points to this customer),
- `totalLoyaltyPoints` (current value of the field, defaulting to 0 if absent).

Existing auth, listing, wallet, order, and other non-referral flows must remain unaffected. Customers who never call the new endpoint continue to work exactly as before.

### Implementation notes

- You may introduce helper modules, a dedicated `ReferralService`, constants, or pure utility functions if you wish; they are not required by the public contract.
- The only required surface is the HTTP route above, the DTO for the body, the wiring from controller → service, and the enriched profile fields on `findOne` / `GET profile`.
- All business rules listed above must be enforced; tests will exercise the public service methods and the observable outcomes (status codes, response bodies, database side-effects via mocks).

IMPORTANT: Please work on this in a new branch from main and commit everything when you are done.
