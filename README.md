# LegacyAuth Bridge

## Overview

**LegacyAuth Bridge** is a decentralized Web3 identity solution built on the Stacks blockchain using Clarity smart contracts. It addresses the real-world problem of fragmented and insecure legacy authentication methods (e.g., email/password logins, OAuth from centralized providers like Google or Facebook) by "wrapping" them into blockchain-native tokens. These tokens act as portable, verifiable digital identities that users can control, reducing reliance on vulnerable centralized systems.

### Real-World Problems Solved
- **Credential Silos and Breaches**: Billions of credentials are stored in centralized databases, leading to massive data breaches (e.g., Equifax 2017, affecting 147M people). Wrapped tokens offload verification to the blockchain, minimizing single points of failure.
- **Interoperability Gaps**: Users must re-authenticate across apps, wasting time and increasing phishing risks. Soulbound-like tokens enable seamless, cross-dApp access.
- **Privacy and Control Loss**: Traditional auth exposes users to tracking and data monetization. This project uses token wrappers for self-sovereign identity (SSI), allowing selective disclosure via zero-knowledge proofs (integrated via oracles).
- **Onboarding Friction for Web3**: Legacy users hesitate due to wallet complexity. Bridge them in by tokenizing existing creds without full KYC.

By wrapping auth into non-transferable NFTs (soulbound tokens), users gain a "digital passport" for Web3, verifiable on-chain. Early adopters: dApps in DeFi, gaming, and social platforms on Stacks/Bitcoin ecosystem.

### Key Features
- **Auth Wrapping**: Convert legacy creds (verified off-chain) into soulbound NFTs.
- **Revocable & Updatable**: Tokens can be revoked if creds are compromised.
- **Oracle Integration**: Secure off-chain verification (e.g., via Chainlink on Stacks).
- **Cross-Chain Potential**: Bridge to Ethereum/Solana for broader adoption.
- **Privacy-First**: Optional ZK proofs for credential verification without revealing details.

## Architecture

The system uses 6 core Clarity smart contracts deployed on Stacks mainnet/testnet. High-level flow:
1. User submits legacy auth creds to an off-chain oracle.
2. Oracle verifies and triggers on-chain minting of a wrapper token.
3. Token grants access to dApps via signature-based auth.
4. Users can revoke/update as needed.

### Smart Contracts (5-7 Solid Contracts)
All contracts are written in Clarity (v1), with traits for composability. Deploy via Clarinet CLI. Example snippets below; full code in `/contracts/` folder.

1. **IdentityToken (NFT Minting & Soulbound Logic)**
   - Handles minting non-transferable NFTs representing wrapped identities.
   - Traits: SIP-009 (Stacks Improvement Proposal for NFTs).
   - Real-World Value: Core token for identity portability.
   ```clarity:disable-run
   (impl-trait .trait/sip-009-nft-trait.sip-009-nft-trait)
   (define-data-var last-id uint u0)

   (define-public (mint (recipient principal) (auth-method string-ascii))
     (let ((new-id (var-get last-id)))
       (try! (contract-call? .auth-wrapper verify-and-wrap auth-method recipient))
       (var-set last-id (+ new-id u1))
       (nft-mint? identity-token new-id recipient)
     )
   )
   ;; Transfer disabled for soulbound
   (define-read-only (transfer (token-id uint) (sender principal) (recipient principal))
     (ok false) ;; Non-transferable
   )
   ```

2. **AuthWrapper (Core Wrapping Mechanism)**
   - Wraps legacy auth (e.g., email hash) into token metadata.
   - Integrates oracle callbacks for verification.
   - Solves: Secure tokenization of sensitive creds.
   ```clarity
   (define-map wrapped-auths principal {method: string-ascii, token-id: uint, active: bool})

   (define-public (wrap-auth (principal principal) (method string-ascii) (proof (buff 32)))
     ;; Oracle verifies proof off-chain
     (asserts! (oracle-verify? method proof) (err u1001))
     (let ((token-id (contract-call? .identity-token mint principal method)))
       (map-insert wrapped-auths principal {method: method, token-id: (unwrap-panic token-id), active: true})
       (ok token-id)
     )
   )
   ```

3. **VerificationOracle (Off-Chain Bridge)**
   - Manages oracle feeds for auth verification (e.g., email OTP or social login callback).
   - Uses Stacks' cross-chain messaging for Bitcoin-anchored security.
   - Real-World Value: Bridges Web2 to Web3 without full decentralization loss.
   ```clarity
   (define-map oracle-requests uint {request-data: (string-ascii 34), status: (string-ascii 10)})

   (define-public (request-verification (method string-ascii) (data (buff 128)))
     (let ((req-id (generate-id)))
       (map-insert oracle-requests req-id {request-data: (to-ascii data), status: "pending"})
       ;; Emit event for off-chain oracle
       (ok req-id)
     )
   )

   (define-public (callback (req-id uint) (valid bool))
     (asserts! (is-oracle? tx-sender) (err u1002))
     (let ((entry (unwrap! (map-get? oracle-requests req-id) (err u1003))))
       (if valid
         (map-set oracle-requests req-id (merge entry {status: "verified"}))
         (err u1004)
       )
     )
   )
   ```

4. **AccessControl (Permission Management)**
   - Defines roles/ACLs for token holders (e.g., dApp access grants).
   - Integrates with wrapped tokens for signature-based auth.
   - Solves: Granular control in multi-dApp ecosystems.
   ```clarity
   (define-map permissions principal {dapp: principal, allowed: bool})

   (define-public (grant-access (user principal) (dapp principal))
     (let ((token-id (get-wrapped-token user)))
       (asserts! (> token-id u0) (err u2001))
       (map-insert permissions user {dapp: dapp, allowed: true})
       (ok true)
     )
   )

   (define-read-only (can-access? (user principal) (dapp principal))
     (match (map-get? permissions user)
       entry (is-eq (get allowed entry) true)
       false
     )
   )
   ```

5. **RevocationManager (Token Lifecycle)**
   - Handles revocation/updates for compromised creds.
   - Burns/invalidates tokens, emits events for dApps.
   - Real-World Value: Mitigates breach aftermath (e.g., post-LinkedIn 2021 hack).
   ```clarity
   (define-public (revoke-token (user principal))
     (let ((entry (unwrap! (map-get? .auth-wrapper/wrapped-auths user) (err u3001))))
       (asserts! (get active entry) (err u3002))
       (map-set .auth-wrapper/wrapped-auths user (merge entry {active: false}))
       (contract-call? .identity-token burn (get token-id entry) user)
       (ok true)
     )
   )
   ```

6. **IdentityRegistry (Global Lookup & Interop)**
   - Centralized (decentralized) registry for querying wrapped identities.
   - Supports cross-chain bridges via sBTC or Stacks' Clarity interops.
   - Solves: Discoverability for dApps.
   ```clarity
   (define-map registry principal uint) ;; principal -> token-id

   (define-public (register-identity (user principal) (token-id uint))
     (asserts! (is-token-owner? token-id user) (err u4001))
     (map-insert registry user token-id)
     (ok true)
   )

   (define-read-only (get-identity (user principal))
     (map-get? registry user)
   )
   ```

## Getting Started

### Prerequisites
- [Clarinet CLI](https://docs.stacks.co/clarinet) for development.
- Stacks wallet (e.g., Leather) for deployment.
- Node.js for off-chain oracle scripts (in `/oracles/`).

### Local Development
1. Clone repo: <this-repo>
2. Install: `npm install` (for scripts)
3. Run devnet: `clarinet integrate`
4. Deploy: `clarinet deploy --manifest Clarity.toml`
5. Test: `clarinet test --name *.clar`

### Deployment
- Testnet: Update `Clarity.toml` with testnet addresses.
- Mainnet: Use Hiro's deploy tools; anchor with Bitcoin for security.

### Usage Example
1. User calls `wrap-auth` with email proof.
2. Oracle verifies → Mints NFT.
3. dApp queries `can-access?` via signature from user's wallet.


## Contributing
Fork, PR to `main`. Follow Clarity style guide. Issues welcome!

## License
MIT License. See [LICENSE](LICENSE).