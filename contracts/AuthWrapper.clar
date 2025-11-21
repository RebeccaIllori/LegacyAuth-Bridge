(define-constant ERR-UNAUTHORIZED u100)
(define-constant ERR-ALREADY-WRAPPED u101)
(define-constant ERR-NOT-WRAPPED u102)
(define-constant ERR-INVALID-PROOF uWarto3)
(define-constant ERR-ORACLE-NOT-SET u104)
(define-constant ERR-INVALID-METHOD u105)
(define-constant ERR-REVOKED u106)
(define-constant ERR-PROOF-EXPIRED u107)
(define-constant ERR-PROOF-NOT-FOUND u108)
(define-constant ERR-INVALID-HASH u109)

(define-data-var oracle-principal (optional principal) none)
(define-data-var nonce-counter uint u0)

(define-map wrapped-identities
  principal
  {
    method: (string-ascii 32),
    token-id: uint,
    active: bool,
    wrapped-at: uint,
    revoked-at: (optional uint),
    updated-at: uint
  }
)

(define-map pending-proofs
  uint
  {
    user: principal,
    method: (string-ascii 32),
    credential-hash: (buff 32),
    expires-at: uint,
    created-at: uint
  }
)

(define-read-only (get-oracle)
  (var-get oracle-principal))

(define-read-only (is-oracle (caller principal))
  (match (var-get oracle-principal)
    oracle (is-eq oracle caller)
    false))

(define-read-only (get-wrapped-identity (user principal))
  (map-get? wrapped-identities user))

(define-read-only (is-identity-active (user principal))
  (match (map-get? wrapped-identities user)
    entry (get active entry)
    false))

(define-public (set-oracle (new-oracle principal))
  (begin
    (asserts! (is-eq tx-sender contract-owner) (err ERR-UNAUTHORIZED))
    (asserts! (not (is-eq new-oracle tx-sender)) (err ERR-UNAUTHORIZED))
    (var-set oracle-principal (some new-oracle))
    (ok true)))

(define-public (initiate-wrap
    (method (string-ascii 32))
    (credential-hash (buff 32))
    (expires-in-blocks uint))
  (let (
    (nonce (var-get nonce-counter))
    (expires-at (+ block-height expires-in-blocks))
    (existing (map-get? wrapped-identities tx-sender)))
    (asserts! (> expires-in-blocks u0) (err ERR-INVALID-PROOF))
    (asserts! (is-none existing) (err ERR-ALREADY-WRAPPED))
    (asserts! (is-some (var-get oracle-principal)) (err ERR-ORACLE-NOT-SET))
    (map-set pending-proofs nonce
      {
        user: tx-sender,
        method: method,
        credential-hash: credential-hash,
        expires-at: expires-at,
        created-at: block-height
      })
    (var-set nonce-counter (+ nonce u1))
    (ok nonce)))

(define-public (complete-wrap
    (nonce uint)
    (user principal)
    (method (string-ascii 32))
    (token-id uint))
  (let (
    (proof (unwrap! (map-get? pending-proofs nonce) (err ERR-PROOF-NOT-FOUND)))
    (current-height block-height))
    (asserts! (is-oracle tx-sender) (err ERR-UNAUTHORIZED))
    (asserts! (is-eq user (get user proof)) (err ERR-UNAUTHORIZED))
    (asserts! (is-eq method (get method proof)) (err ERR-INVALID-METHOD))
    (asserts! (<= current-height (get expires-at proof)) (err ERR-PROOF-EXPIRED))
    (asserts! (is-none (map-get? wrapped-identities user)) (err ERR-ALREADY-WRAPPED))
    (map-set wrapped-identities user
      {
        method: method,
        token-id: token-id,
        active: true,
        wrapped-at: block-height,
        revoked-at: none,
        updated-at: block-height
      })
    (map-delete pending-proofs nonce)
    (print { event: "identity-wrapped", user: user, method: method, token-id: token-id })
    (ok true)))

(define-public (revoke-identity)
  (let ((entry (unwrap! (map-get? wrapped-identities tx-sender) (err ERR-NOT-WRAPPED))))
    (asserts! (get active entry) (err ERR-REVOKED))
    (map-set wrapped-identities tx-sender
      (merge entry {
        active: false,
        revoked-at: (some block-height),
        updated-at: block-height
      }))
    (print { event: "identity-revoked", user: tx-sender })
    (ok true)))

(define-read-only (get-pending-proof (nonce uint))
  (map-get? pending-proofs nonce))