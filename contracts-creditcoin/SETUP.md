# Setup — contracts-creditcoin

Dependencies come from the real `@gluwa/usc-contracts` npm package (published
by Gluwa, current as of Aug 17 2026) — no manual file-hunting needed.

```bash
npm install
npx hardhat compile
```

`UptimeRegistry.sol` imports `INativeQueryVerifier`, `NativeQueryVerifierLib`,
and `EvmV1Decoder` directly from `@gluwa/usc-contracts` via node_modules
resolution — Hardhat/Solidity handles this automatically, same as any npm
Solidity dependency.

**Already compiler-verified in this build:**
- `viaIR: true` is required in the optimizer settings — without it, compilation
  fails with a stack-too-deep error from `EvmV1Decoder`'s nested structs. This
  is already set in `hardhat.config.js`.
- Struct field names (`LogEntry.address_`, `MerkleProofEntry.hash`) were
  confirmed against the real installed package source, not guessed.

## Deploy order

1. Deploy `HeartbeatBeacon.sol` on Sepolia first (in `../contracts-sepolia`) —
   you need its address for step 2.
2. Deploy `UptimeRegistry.sol` on Creditcoin CC3 Testnet, passing the beacon's
   Sepolia address into the constructor.
3. Fund your Creditcoin testnet wallet via the faucet
   (docs.creditcoin.org/wallets/using-testnet-faucet) before deploying.

```bash
# .env in this folder:
# CREDITCOIN_RPC_URL=https://rpc.cc3-testnet.creditcoin.network
# DEPLOYER_PRIVATE_KEY=0x...
```
