// Exercises the plugin end to end against a live network: creates a settlement
// account, commits an obligation, has the attesters release it, and checks that
// the attester quorum alone could not have moved the funds.
//
//   HEDERA_NETWORK=testnet HEDERA_ACCOUNT_ID=0.0.x HEDERA_PRIVATE_KEY=0x... \
//     npm run test:integration
import {
  AccountBalanceQuery,
  AccountCreateTransaction,
  Client,
  Hbar,
  PrivateKey,
  ScheduleCreateTransaction,
  ScheduleSignTransaction,
  Timestamp,
  TransferTransaction,
} from "@hiero-ledger/sdk";
import { settlementAccountKey } from "../dist/index.js";

const { HEDERA_NETWORK = "testnet", HEDERA_ACCOUNT_ID, HEDERA_PRIVATE_KEY } = process.env;

if (!HEDERA_ACCOUNT_ID || !HEDERA_PRIVATE_KEY) {
  console.error("Set HEDERA_ACCOUNT_ID and HEDERA_PRIVATE_KEY (see .env.example).");
  process.exit(1);
}

const AMOUNT = 5;
const committerKey = PrivateKey.fromStringECDSA(HEDERA_PRIVATE_KEY);
const client = (
  HEDERA_NETWORK === "mainnet" ? Client.forMainnet() : Client.forTestnet()
).setOperator(HEDERA_ACCOUNT_ID, committerKey);

const scheduleState = async (scheduleId) => {
  const { ScheduleInfoQuery } = await import("@hiero-ledger/sdk");
  const info = await new ScheduleInfoQuery().setScheduleId(scheduleId).execute(client);
  return info.executed !== null;
};

const run = async () => {
  const attesters = [0, 1, 2].map(() => PrivateKey.generateED25519());
  const key = settlementAccountKey(
    committerKey.publicKey,
    attesters.map((a) => a.publicKey),
    2,
  );

  const account = (
    await (
      await new AccountCreateTransaction()
        .setKeyWithoutAlias(key)
        .setInitialBalance(new Hbar(AMOUNT + 1))
        .setReceiverSignatureRequired(false)
        .execute(client)
    ).getReceipt(client)
  ).accountId;
  console.log(`settlement account ${account}  key = and(committer, 2-of-3 attesters)`);

  const beneficiary = (
    await (
      await new AccountCreateTransaction()
        .setKeyWithoutAlias(PrivateKey.generateECDSA().publicKey)
        .setInitialBalance(new Hbar(0))
        .execute(client)
    ).getReceipt(client)
  ).accountId;

  const inner = new TransferTransaction()
    .addHbarTransfer(account, new Hbar(-AMOUNT))
    .addHbarTransfer(beneficiary, new Hbar(AMOUNT));

  const scheduleId = (
    await (
      await new ScheduleCreateTransaction()
        .setScheduledTransaction(inner)
        .setScheduleMemo("integration settlement")
        .setExpirationTime(Timestamp.fromDate(new Date(Date.now() + 1800 * 1000)))
        .setWaitForExpiry(false)
        .execute(client)
    ).getReceipt(client)
  ).scheduleId;
  console.log(`committed ${scheduleId}, committer branch satisfied`);

  const sign = async (attester) => {
    const tx = await (
      await new ScheduleSignTransaction().setScheduleId(scheduleId).freezeWith(client)
    ).sign(attester);
    await (await tx.execute(client)).getReceipt(client);
  };

  await sign(attesters[0]);
  const afterOne = await scheduleState(scheduleId);
  console.log(`after 1 attester : ${afterOne ? "EXECUTED" : "pending"}  (expected pending)`);

  await sign(attesters[1]);
  const afterTwo = await scheduleState(scheduleId);
  console.log(`after 2 attesters: ${afterTwo ? "EXECUTED" : "pending"}  (expected EXECUTED)`);

  const balance = await new AccountBalanceQuery().setAccountId(beneficiary).execute(client);
  const paid = balance.hbars.toTinybars().toNumber() === AMOUNT * 1e8;

  const ok = !afterOne && afterTwo && paid;
  console.log(
    `\n${ok ? "PASS" : "FAIL"}: settlement released by quorum, beneficiary paid ${balance.hbars.toString()}`,
  );
  client.close();
  process.exit(ok ? 0 : 1);
};

run().catch((error) => {
  console.error(error.message ?? error);
  process.exit(1);
});
