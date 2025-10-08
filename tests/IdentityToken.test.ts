import { describe, it, expect, beforeEach } from "vitest";
import { ClarityValue, stringAsciiCV, uintCV } from "@stacks/transactions";

const ERR_NOT_AUTHORIZED = 100;
const ERR_INVALID_RECIPIENT = 101;
const ERR_INVALID_AUTH_METHOD = 102;
const ERR_TOKEN_ALREADY_EXISTS = 103;
const ERR_TOKEN_NOT_FOUND = 104;
const ERR_TRANSFER_NOT_ALLOWED = 105;
const ERR_BURN_NOT_ALLOWED = 106;
const ERR_MINT_FAILED = 107;
const ERR_INVALID_TOKEN_ID = 108;
const ERR_OWNER_ONLY = 109;
const ERR_METADATA_TOO_LONG = 110;
const ERR_INVALID_METADATA = 111;
const ERR_AUTH_WRAPPER_NOT_SET = 112;
const ERR_AUTH_VERIFICATION_FAILED = 113;
const ERR_MAX_TOKENS_EXCEEDED = 114;
const ERR_INVALID_STATUS = 115;
const ERR_INVALID_TIMESTAMP = 116;
const ERR_AUTHORITY_NOT_VERIFIED = 117;
const ERR_INVALID_UPDATE_PARAM = 118;
const ERR_UPDATE_NOT_ALLOWED = 119;

interface TokenMetadata {
  authMethod: string;
  timestamp: number;
  status: boolean;
  additionalMetadata: string | null;
}

interface Result<T> {
  ok: boolean;
  value: T;
}

class IdentityTokenMock {
  state: {
    lastTokenId: number;
    maxTokens: number;
    mintFee: number;
    authWrapperContract: string | null;
    contractOwner: string;
    tokenMetadata: Map<number, TokenMetadata>;
    tokenOwners: Map<number, string>;
    tokenCountByOwner: Map<string, number>;
  } = {
    lastTokenId: 0,
    maxTokens: 1000000,
    mintFee: 100,
    authWrapperContract: null,
    contractOwner: "ST1TEST",
    tokenMetadata: new Map(),
    tokenOwners: new Map(),
    tokenCountByOwner: new Map(),
  };
  blockHeight: number = 0;
  caller: string = "ST1TEST";
  stxTransfers: Array<{ amount: number; from: string; to: string | null }> = [];

  constructor() {
    this.reset();
  }

  reset() {
    this.state = {
      lastTokenId: 0,
      maxTokens: 1000000,
      mintFee: 100,
      authWrapperContract: null,
      contractOwner: "ST1TEST",
      tokenMetadata: new Map(),
      tokenOwners: new Map(),
      tokenCountByOwner: new Map(),
    };
    this.blockHeight = 0;
    this.caller = "ST1TEST";
    this.stxTransfers = [];
  }

  getLastTokenId(): Result<number> {
    return { ok: true, value: this.state.lastTokenId };
  }

  getTokenUri(tokenId: number): Result<null> {
    return { ok: true, value: null };
  }

  getOwner(tokenId: number): Result<string | null> {
    return { ok: true, value: this.state.tokenOwners.get(tokenId) || null };
  }

  getTokenMetadata(tokenId: number): TokenMetadata | null {
    return this.state.tokenMetadata.get(tokenId) || null;
  }

  getTokenCountByOwner(owner: string): number {
    return this.state.tokenCountByOwner.get(owner) || 0;
  }

  isOwner(tokenId: number, caller: string): boolean {
    return this.state.tokenOwners.get(tokenId) === caller;
  }

  setAuthWrapperContract(contractPrincipal: string): Result<boolean> {
    if (this.caller !== this.state.contractOwner) return { ok: false, value: false };
    if (this.state.authWrapperContract !== null) return { ok: false, value: false };
    this.state.authWrapperContract = contractPrincipal;
    return { ok: true, value: true };
  }

  setMaxTokens(newMax: number): Result<boolean> {
    if (this.caller !== this.state.contractOwner) return { ok: false, value: false };
    if (newMax <= this.state.lastTokenId) return { ok: false, value: false };
    this.state.maxTokens = newMax;
    return { ok: true, value: true };
  }

  setMintFee(newFee: number): Result<boolean> {
    if (this.caller !== this.state.contractOwner) return { ok: false, value: false };
    if (newFee < 0) return { ok: false, value: false };
    this.state.mintFee = newFee;
    return { ok: true, value: true };
  }

  mint(recipient: string, authMethod: string, metadata: string | null): Result<number> {
    const nextId = this.state.lastTokenId + 1;
    if (nextId > this.state.maxTokens) return { ok: false, value: ERR_MAX_TOKENS_EXCEEDED };
    if (recipient !== this.caller) return { ok: false, value: ERR_INVALID_RECIPIENT };
    if (!authMethod || authMethod.length > 50) return { ok: false, value: ERR_INVALID_AUTH_METHOD };
    if (metadata && metadata.length > 256) return { ok: false, value: ERR_METADATA_TOO_LONG };
    if (!this.state.authWrapperContract) return { ok: false, value: ERR_AUTH_WRAPPER_NOT_SET };
    this.stxTransfers.push({ amount: this.state.mintFee, from: this.caller, to: this.state.authWrapperContract });
    this.state.tokenOwners.set(nextId, recipient);
    this.state.tokenMetadata.set(nextId, {
      authMethod,
      timestamp: this.blockHeight,
      status: true,
      additionalMetadata: metadata,
    });
    const currentCount = this.getTokenCountByOwner(recipient);
    this.state.tokenCountByOwner.set(recipient, currentCount + 1);
    this.state.lastTokenId = nextId;
    return { ok: true, value: nextId };
  }

  burn(tokenId: number): Result<boolean> {
    const owner = this.state.tokenOwners.get(tokenId);
    if (!owner) return { ok: false, value: false };
    if (this.caller !== owner) return { ok: false, value: false };
    this.state.tokenOwners.delete(tokenId);
    this.state.tokenMetadata.delete(tokenId);
    const currentCount = this.getTokenCountByOwner(owner);
    this.state.tokenCountByOwner.set(owner, currentCount - 1);
    return { ok: true, value: true };
  }

  transfer(tokenId: number, sender: string, recipient: string): Result<boolean> {
    return { ok: false, value: false };
  }

  updateMetadata(tokenId: number, newMetadata: string | null): Result<boolean> {
    const owner = this.state.tokenOwners.get(tokenId);
    if (!owner) return { ok: false, value: false };
    if (this.caller !== owner) return { ok: false, value: false };
    if (newMetadata && newMetadata.length > 256) return { ok: false, value: false };
    const meta = this.state.tokenMetadata.get(tokenId);
    if (!meta) return { ok: false, value: false };
    this.state.tokenMetadata.set(tokenId, { ...meta, additionalMetadata: newMetadata });
    return { ok: true, value: true };
  }

  setTokenStatus(tokenId: number, newStatus: boolean): Result<boolean> {
    if (this.caller !== this.state.contractOwner) return { ok: false, value: false };
    const meta = this.state.tokenMetadata.get(tokenId);
    if (!meta) return { ok: false, value: false };
    this.state.tokenMetadata.set(tokenId, { ...meta, status: newStatus });
    return { ok: true, value: true };
  }

  getContractOwner(): Result<string> {
    return { ok: true, value: this.state.contractOwner };
  }
}

describe("IdentityToken", () => {
  let contract: IdentityTokenMock;

  beforeEach(() => {
    contract = new IdentityTokenMock();
    contract.reset();
  });

  it("mints a token successfully", () => {
    contract.setAuthWrapperContract("ST2TEST");
    const result = contract.mint("ST1TEST", "email", "some-meta");
    expect(result.ok).toBe(true);
    expect(result.value).toBe(1);
    const owner = contract.getOwner(1);
    expect(owner.value).toBe("ST1TEST");
    const meta = contract.getTokenMetadata(1);
    expect(meta?.authMethod).toBe("email");
    expect(meta?.additionalMetadata).toBe("some-meta");
    expect(meta?.status).toBe(true);
    expect(contract.stxTransfers).toEqual([{ amount: 100, from: "ST1TEST", to: "ST2TEST" }]);
    expect(contract.getTokenCountByOwner("ST1TEST")).toBe(1);
  });

  it("rejects mint without auth wrapper", () => {
    const result = contract.mint("ST1TEST", "email", null);
    expect(result.ok).toBe(false);
    expect(result.value).toBe(ERR_AUTH_WRAPPER_NOT_SET);
  });

  it("rejects mint with invalid auth method", () => {
    contract.setAuthWrapperContract("ST2TEST");
    const longMethod = "a".repeat(51);
    const result = contract.mint("ST1TEST", longMethod, null);
    expect(result.ok).toBe(false);
    expect(result.value).toBe(ERR_INVALID_AUTH_METHOD);
  });

  it("rejects mint with invalid metadata", () => {
    contract.setAuthWrapperContract("ST2TEST");
    const longMeta = "a".repeat(257);
    const result = contract.mint("ST1TEST", "email", longMeta);
    expect(result.ok).toBe(false);
    expect(result.value).toBe(ERR_METADATA_TOO_LONG);
  });

  it("burns a token successfully", () => {
    contract.setAuthWrapperContract("ST2TEST");
    contract.mint("ST1TEST", "email", null);
    const result = contract.burn(1);
    expect(result.ok).toBe(true);
    expect(result.value).toBe(true);
    expect(contract.getOwner(1).value).toBe(null);
    expect(contract.getTokenMetadata(1)).toBe(null);
    expect(contract.getTokenCountByOwner("ST1TEST")).toBe(0);
  });

  it("rejects burn by non-owner", () => {
    contract.setAuthWrapperContract("ST2TEST");
    contract.mint("ST1TEST", "email", null);
    contract.caller = "ST3FAKE";
    const result = contract.burn(1);
    expect(result.ok).toBe(false);
    expect(result.value).toBe(false);
  });

  it("rejects transfer", () => {
    const result = contract.transfer(1, "ST1TEST", "ST2TEST");
    expect(result.ok).toBe(false);
    expect(result.value).toBe(false);
  });

  it("updates metadata successfully", () => {
    contract.setAuthWrapperContract("ST2TEST");
    contract.mint("ST1TEST", "email", "old-meta");
    const result = contract.updateMetadata(1, "new-meta");
    expect(result.ok).toBe(true);
    expect(result.value).toBe(true);
    const meta = contract.getTokenMetadata(1);
    expect(meta?.additionalMetadata).toBe("new-meta");
  });

  it("rejects metadata update by non-owner", () => {
    contract.setAuthWrapperContract("ST2TEST");
    contract.mint("ST1TEST", "email", null);
    contract.caller = "ST3FAKE";
    const result = contract.updateMetadata(1, "new-meta");
    expect(result.ok).toBe(false);
    expect(result.value).toBe(false);
  });

  it("sets token status successfully", () => {
    contract.setAuthWrapperContract("ST2TEST");
    contract.mint("ST1TEST", "email", null);
    const result = contract.setTokenStatus(1, false);
    expect(result.ok).toBe(true);
    expect(result.value).toBe(true);
    const meta = contract.getTokenMetadata(1);
    expect(meta?.status).toBe(false);
  });

  it("rejects status update by non-owner", () => {
    contract.setAuthWrapperContract("ST2TEST");
    contract.mint("ST1TEST", "email", null);
    contract.caller = "ST3FAKE";
    const result = contract.setTokenStatus(1, false);
    expect(result.ok).toBe(false);
    expect(result.value).toBe(false);
  });

  it("sets mint fee successfully", () => {
    const result = contract.setMintFee(200);
    expect(result.ok).toBe(true);
    expect(result.value).toBe(true);
    expect(contract.state.mintFee).toBe(200);
    contract.setAuthWrapperContract("ST2TEST");
    contract.mint("ST1TEST", "email", null);
    expect(contract.stxTransfers).toEqual([{ amount: 200, from: "ST1TEST", to: "ST2TEST" }]);
  });

  it("rejects mint fee change by non-owner", () => {
    contract.caller = "ST3FAKE";
    const result = contract.setMintFee(200);
    expect(result.ok).toBe(false);
    expect(result.value).toBe(false);
  });

  it("returns correct last token id", () => {
    contract.setAuthWrapperContract("ST2TEST");
    contract.mint("ST1TEST", "email", null);
    contract.mint("ST1TEST", "social", null);
    const result = contract.getLastTokenId();
    expect(result.ok).toBe(true);
    expect(result.value).toBe(2);
  });

  it("rejects mint when max tokens exceeded", () => {
    contract.state.maxTokens = 1;
    contract.setAuthWrapperContract("ST2TEST");
    contract.mint("ST1TEST", "email", null);
    const result = contract.mint("ST1TEST", "social", null);
    expect(result.ok).toBe(false);
    expect(result.value).toBe(ERR_MAX_TOKENS_EXCEEDED);
  });

  it("sets max tokens successfully", () => {
    const result = contract.setMaxTokens(2000000);
    expect(result.ok).toBe(true);
    expect(result.value).toBe(true);
    expect(contract.state.maxTokens).toBe(2000000);
  });

  it("rejects invalid max tokens", () => {
    contract.setAuthWrapperContract("ST2TEST");
    contract.mint("ST1TEST", "email", null);
    const result = contract.setMaxTokens(0);
    expect(result.ok).toBe(false);
    expect(result.value).toBe(false);
  });

  it("parses auth method with Clarity", () => {
    const cv: ClarityValue = stringAsciiCV("email");
    expect((cv as any).value).toBe("email");
  });

  it("parses token id with Clarity", () => {
    const cv: ClarityValue = uintCV(1);
    expect((cv as any).value).toEqual(BigInt(1));
  });

  it("gets contract owner correctly", () => {
    const result = contract.getContractOwner();
    expect(result.ok).toBe(true);
    expect(result.value).toBe("ST1TEST");
  });
});