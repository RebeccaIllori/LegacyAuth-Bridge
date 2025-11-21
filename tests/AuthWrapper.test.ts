import { describe, it, expect, beforeEach } from "vitest";

type Principal = string;
type Buff32 = string;
type WrappedIdentity = {
  method: string;
  "token-id": bigint;
  active: boolean;
  "wrapped-at": bigint;
  "revoked-at": bigint | null;
  "updated-at": bigint;
};

type PendingProof = {
  user: Principal;
  method: string;
  "credential-hash": Buff32;
  "expires-at": bigint;
  "created-at": bigint;
};

class AuthWrapperSim {
  blockHeight = 1000n;
  oracle: Principal | null = null;
  nonceCounter = 0n;
  wrapped = new Map<Principal, WrappedIdentity>();
  pending = new Map<bigint, PendingProof>();
  owner = "owner";

  setBlockHeight(h: bigint) { this.blockHeight = h; }
  setOracle(caller: Principal, newOracle: Principal) {
    if (caller !== this.owner) throw new Error("100");
    if (newOracle === caller) throw new Error("100");
    this.oracle = newOracle;
    return true;
  }

  initiateWrap(
    caller: Principal,
    method: string,
    hash: Buff32,
    expiresIn: bigint
  ): bigint {
    if (expiresIn <= 0n) throw new Error("103");
    if (this.wrapped.has(caller)) throw new Error("101");
    if (!this.oracle) throw new Error("104");

    const nonce = this.nonceCounter++;
    const proof: PendingProof = {
      user: caller,
      method,
      "credential-hash": hash,
      "expires-at": this.blockHeight + expiresIn,
      "created-at": this.blockHeight,
    };
    this.pending.set(nonce, proof);
    return nonce;
  }

  completeWrap(
    caller: Principal,
    nonce: bigint,
    user: Principal,
    method: string,
    tokenId: bigint
  ) {
    if (caller !== this.oracle) throw new Error("100");
    const proof = this.pending.get(nonce);
    if (!proof) throw new Error("108");
    if (this.blockHeight > proof["expires-at"]) throw new Error("107");
    if (user !== proof.user || method !== proof.method) throw new Error("105");
    if (this.wrapped.has(user)) throw new Error("101");

    this.wrapped.set(user, {
      method,
      "token-id": tokenId,
      active: true,
      "wrapped-at": this.blockHeight,
      "revoked-at": null,
      "updated-at": this.blockHeight,
    });
    this.pending.delete(nonce);
    return true;
  }

  revokeIdentity(caller: Principal) {
    const entry = this.wrapped.get(caller);
    if (!entry) throw new Error("102");
    if (!entry.active) throw new Error("106");

    this.wrapped.set(caller, {
      ...entry,
      active: false,
      "revoked-at": this.blockHeight,
      "updated-at": this.blockHeight,
    });
    return true;
  }

  getWrapped(user: Principal) {
    return this.wrapped.get(user) ?? null;
  }

  isActive(user: Principal) {
    return this.wrapped.get(user)?.active ?? false;
  }
}

describe("AuthWrapper - pure simulation tests", () => {
  let sim: AuthWrapperSim;
  const owner = "owner";
  const oracle = "oracle";
  const alice = "alice";
  const bob = "bob";

  beforeEach(() => {
    sim = new AuthWrapperSim();
    sim.setOracle(owner, oracle);
  });

  it("successfully wraps identity via oracle", () => {
    const nonce = sim.initiateWrap(alice, "email", "a".repeat(64), 100n);
    sim.setBlockHeight(1050n);

    sim.completeWrap(oracle, nonce, alice, "email", 777n);

    const identity = sim.getWrapped(alice)!;
    expect(identity.method).toBe("email");
    expect(identity["token-id"]).toBe(777n);
    expect(identity.active).toBe(true);
    expect(sim.isActive(alice)).toBe(true);
  });

  it("only oracle can complete wrap", () => {
    const nonce = sim.initiateWrap(alice, "email", "a".repeat(64), 100n);

    expect(() => sim.completeWrap(alice, nonce, alice, "email", 1n))
      .toThrow("100");
  });

  it("proof expires correctly", () => {
    const nonce = sim.initiateWrap(alice, "email", "a".repeat(64), 10n);
    sim.setBlockHeight(sim.blockHeight + 20n);

    expect(() => sim.completeWrap(oracle, nonce, alice, "email", 1n))
      .toThrow("107");
  });

  it("user can revoke their own wrapped identity", () => {
    const nonce = sim.initiateWrap(alice, "email", "a".repeat(64), 100n);
    sim.completeWrap(oracle, nonce, alice, "email", 999n);

    sim.revokeIdentity(alice);
    expect(sim.isActive(alice)).toBe(false);
    expect(sim.getWrapped(alice)?.["revoked-at"]).not.toBeNull();
  });

  it("cannot revoke non-existent identity", () => {
    expect(() => sim.revokeIdentity(bob)).toThrow("102");
  });

  it("cannot revoke already revoked identity", () => {
    const nonce = sim.initiateWrap(alice, "email", "a".repeat(64), 100n);
    sim.completeWrap(oracle, nonce, alice, "email", 1n);
    sim.revokeIdentity(alice);

    expect(() => sim.revokeIdentity(alice)).toThrow("106");
  });

  it("pending proof is deleted after successful wrap", () => {
    const nonce = sim.initiateWrap(alice, "email", "a".repeat(64), 100n);
    sim.completeWrap(oracle, nonce, alice, "email", 1n);

    expect(sim.pending.has(nonce)).toBe(false);
  });

  it("nonce increments correctly", () => {
    const n1 = sim.initiateWrap(alice, "email", "a".repeat(64), 100n);
    const n2 = sim.initiateWrap(bob, "google", "b".repeat(64), 100n);
    expect(n2).toBe(n1 + 1n);
  });
});