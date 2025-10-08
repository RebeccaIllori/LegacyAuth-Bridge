(define-constant ERR-NOT-AUTHORIZED u100)
(define-constant ERR-INVALID-RECIPIENT u101)
(define-constant ERR-INVALID-AUTH-METHOD u102)
(define-constant ERR-TOKEN-ALREADY-EXISTS u103)
(define-constant ERR-TOKEN-NOT-FOUND u104)
(define-constant ERR-TRANSFER-NOT-ALLOWED u105)
(define-constant ERR-BURN-NOT-ALLOWED u106)
(define-constant ERR-MINT-FAILED u107)
(define-constant ERR-INVALID-TOKEN-ID u108)
(define-constant ERR-OWNER-ONLY u109)
(define-constant ERR-METADATA-TOO-LONG u110)
(define-constant ERR-INVALID-METADATA u111)
(define-constant ERR-AUTH-WRAPPER-NOT-SET u112)
(define-constant ERR-AUTH-VERIFICATION-FAILED u113)
(define-constant ERR-MAX-TOKENS-EXCEEDED u114)
(define-constant ERR-INVALID-STATUS u115)
(define-constant ERR-INVALID-TIMESTAMP u116)
(define-constant ERR-AUTHORITY-NOT-VERIFIED u117)
(define-constant ERR-INVALID-UPDATE-PARAM u118)
(define-constant ERR-UPDATE-NOT-ALLOWED u119)

(define-non-fungible-token identity-token uint)

(define-data-var last-token-id uint u0)
(define-data-var max-tokens uint u1000000)
(define-data-var mint-fee uint u100)
(define-data-var auth-wrapper-contract (optional principal) none)
(define-data-var contract-owner principal tx-sender)

(define-map token-metadata
  uint
  {
    auth-method: (string-ascii 50),
    timestamp: uint,
    status: bool,
    additional-metadata: (optional (string-utf8 256))
  }
)

(define-map token-owners uint principal)

(define-map token-count-by-owner principal uint)

(define-read-only (get-last-token-id)
  (ok (var-get last-token-id))
)

(define-read-only (get-token-uri (token-id uint))
  (ok none)
)

(define-read-only (get-owner (token-id uint))
  (ok (map-get? token-owners token-id))
)

(define-read-only (get-token-metadata (token-id uint))
  (map-get? token-metadata token-id)
)

(define-read-only (get-token-count-by-owner (owner principal))
  (default-to u0 (map-get? token-count-by-owner owner))
)

(define-read-only (is-owner (token-id uint) (caller principal))
  (is-eq (some caller) (map-get? token-owners token-id))
)

(define-private (validate-recipient (recipient principal))
  (if (is-eq recipient tx-sender)
    (ok true)
    (err ERR-INVALID-RECIPIENT))
)

(define-private (validate-auth-method (method (string-ascii 50)))
  (if (and (> (len method) u0) (<= (len method) u50))
    (ok true)
    (err ERR-INVALID-AUTH-METHOD))
)

(define-private (validate-metadata (metadata (optional (string-utf8 256))))
  (match metadata
    m (if (<= (len m) u256)
        (ok true)
        (err ERR-METADATA-TOO-LONG))
    (ok true))
)

(define-private (validate-token-id (token-id uint))
  (if (<= token-id (var-get last-token-id))
    (ok true)
    (err ERR-INVALID-TOKEN-ID))
)

(define-private (validate-timestamp (ts uint))
  (if (>= ts block-height)
    (ok true)
    (err ERR-INVALID-TIMESTAMP))
)

(define-private (validate-status (status bool))
  (ok true)
)

(define-public (set-auth-wrapper-contract (contract-principal principal))
  (begin
    (asserts! (is-eq tx-sender (var-get contract-owner)) (err ERR-OWNER-ONLY))
    (asserts! (is-none (var-get auth-wrapper-contract)) (err ERR-AUTHORITY-NOT-VERIFIED))
    (var-set auth-wrapper-contract (some contract-principal))
    (ok true)
  )
)

(define-public (set-max-tokens (new-max uint))
  (begin
    (asserts! (is-eq tx-sender (var-get contract-owner)) (err ERR-OWNER-ONLY))
    (asserts! (> new-max (var-get last-token-id)) (err ERR-INVALID-UPDATE-PARAM))
    (var-set max-tokens new-max)
    (ok true)
  )
)

(define-public (set-mint-fee (new-fee uint))
  (begin
    (asserts! (is-eq tx-sender (var-get contract-owner)) (err ERR-OWNER-ONLY))
    (asserts! (>= new-fee u0) (err ERR-INVALID-UPDATE-PARAM))
    (var-set mint-fee new-fee)
    (ok true)
  )
)

(define-public (mint (recipient principal) (auth-method (string-ascii 50)) (metadata (optional (string-utf8 256))))
  (let (
    (next-id (+ (var-get last-token-id) u1))
    (auth-wrapper (var-get auth-wrapper-contract))
  )
    (asserts! (<= next-id (var-get max-tokens)) (err ERR-MAX-TOKENS-EXCEEDED))
    (try! (validate-recipient recipient))
    (try! (validate-auth-method auth-method))
    (try! (validate-metadata metadata))
    (asserts! (is-some auth-wrapper) (err ERR-AUTH-WRAPPER-NOT-SET))
    (let ((wrapper (unwrap! auth-wrapper (err ERR-AUTH-WRAPPER-NOT-SET))))
      (try! (contract-call? wrapper verify-and-wrap auth-method recipient))
      (try! (stx-transfer? (var-get mint-fee) tx-sender wrapper))
    )
    (asserts! (is-ok (nft-mint? identity-token next-id recipient)) (err ERR-MINT-FAILED))
    (map-set token-owners next-id recipient)
    (map-set token-metadata next-id
      {
        auth-method: auth-method,
        timestamp: block-height,
        status: true,
        additional-metadata: metadata
      }
    )
    (map-set token-count-by-owner recipient (+ (get-token-count-by-owner recipient) u1))
    (var-set last-token-id next-id)
    (print { event: "token-minted", id: next-id, recipient: recipient })
    (ok next-id)
  )
)

(define-public (burn (token-id uint))
  (let ((owner (unwrap! (map-get? token-owners token-id) (err ERR-TOKEN-NOT-FOUND))))
    (asserts! (is-eq tx-sender owner) (err ERR-OWNER-ONLY))
    (asserts! (is-ok (nft-burn? identity-token token-id tx-sender)) (err ERR-BURN-NOT-ALLOWED))
    (map-delete token-owners token-id)
    (map-delete token-metadata token-id)
    (map-set token-count-by-owner owner (- (get-token-count-by-owner owner) u1))
    (print { event: "token-burned", id: token-id })
    (ok true)
  )
)

(define-public (transfer (token-id uint) (sender principal) (recipient principal))
  (err ERR-TRANSFER-NOT-ALLOWED)
)

(define-public (update-metadata (token-id uint) (new-metadata (optional (string-utf8 256))))
  (let ((owner (unwrap! (map-get? token-owners token-id) (err ERR-TOKEN-NOT-FOUND))))
    (asserts! (is-eq tx-sender owner) (err ERR-OWNER-ONLY))
    (try! (validate-metadata new-metadata))
    (match (map-get? token-metadata token-id)
      meta
        (map-set token-metadata token-id (merge meta { additional-metadata: new-metadata }))
      (err ERR-TOKEN-NOT-FOUND)
    )
    (print { event: "metadata-updated", id: token-id })
    (ok true)
  )
)

(define-public (set-token-status (token-id uint) (new-status bool))
  (let ((owner (unwrap! (map-get? token-owners token-id) (err ERR-TOKEN-NOT-FOUND))))
    (asserts! (is-eq tx-sender (var-get contract-owner)) (err ERR-OWNER-ONLY))
    (try! (validate-status new-status))
    (match (map-get? token-metadata token-id)
      meta
        (map-set token-metadata token-id (merge meta { status: new-status }))
      (err ERR-TOKEN-NOT-FOUND)
    )
    (print { event: "status-updated", id: token-id, status: new-status })
    (ok true)
  )
)

(define-public (get-contract-owner)
  (ok (var-get contract-owner))
)