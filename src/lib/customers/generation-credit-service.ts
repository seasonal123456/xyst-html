import { prisma } from "@/lib/db";

type SiteJobCreditRow = {
  id: string;
  ownerAccountId: string | null;
  chargedCreditAt: Date | string | null;
  chargedCreditAmount: number | bigint | null;
};

type AccountCreditRow = {
  id: string;
  credits: number | bigint;
  status: string;
};

export type CreditConsumeResult =
  | { ok: true; charged: boolean; remainingCredits: number }
  | { ok: false; status: number; error: string };

export async function consumeCreditForSiteJob(siteJobId: string, accountId: string): Promise<CreditConsumeResult> {
  try {
    return await prisma.$transaction(async (tx) => {
      const jobs = await tx.$queryRaw<SiteJobCreditRow[]>`
        SELECT id, ownerAccountId, chargedCreditAt, chargedCreditAmount
        FROM SiteJob
        WHERE id = ${siteJobId}
        LIMIT 1
      `;
      const job = jobs[0];
      if (!job) return { ok: false, status: 404, error: "官网任务不存在。" } as const;
      if (job.ownerAccountId && job.ownerAccountId !== accountId) {
        return { ok: false, status: 403, error: "该官网任务不属于当前登录账号。" } as const;
      }

      const accounts = await tx.$queryRaw<AccountCreditRow[]>`
        SELECT id, credits, status
        FROM CustomerAccount
        WHERE id = ${accountId}
        LIMIT 1
      `;
      const account = accounts[0];
      if (!account || account.status !== "active") {
        return { ok: false, status: 401, error: "账号不可用，请重新登录。" } as const;
      }

      if (job.chargedCreditAt) {
        await tx.$executeRaw`
          UPDATE SiteJob
          SET ownerAccountId = ${accountId}, updatedAt = CURRENT_TIMESTAMP
          WHERE id = ${siteJobId} AND ownerAccountId IS NULL
        `;
        return { ok: true, charged: false, remainingCredits: Number(account.credits) } as const;
      }

      if (Number(account.credits) <= 0) {
        return { ok: false, status: 402, error: "当前账号可用次数不足，请联系管理员充值。" } as const;
      }

      const marked = await tx.$executeRaw`
        UPDATE SiteJob
        SET ownerAccountId = ${accountId}, chargedCreditAt = CURRENT_TIMESTAMP, chargedCreditAmount = 1, updatedAt = CURRENT_TIMESTAMP
        WHERE id = ${siteJobId} AND chargedCreditAt IS NULL
      `;
      if (Number(marked) <= 0) {
        return { ok: true, charged: false, remainingCredits: Number(account.credits) } as const;
      }

      const decremented = await tx.$executeRaw`
        UPDATE CustomerAccount
        SET credits = credits - 1, updatedAt = CURRENT_TIMESTAMP
        WHERE id = ${accountId} AND credits > 0 AND status = 'active'
      `;
      if (Number(decremented) <= 0) {
        throw new Error("NO_CREDITS_AFTER_MARK");
      }

      return { ok: true, charged: true, remainingCredits: Number(account.credits) - 1 } as const;
    });
  } catch (error) {
    if (error instanceof Error && error.message === "NO_CREDITS_AFTER_MARK") {
      return { ok: false, status: 402, error: "当前账号可用次数不足，请联系管理员充值。" };
    }
    throw error;
  }
}

export async function attachSiteJobToAccount(siteJobId: string, accountId: string) {
  await prisma.$executeRaw`
    UPDATE SiteJob
    SET ownerAccountId = COALESCE(ownerAccountId, ${accountId}), updatedAt = CURRENT_TIMESTAMP
    WHERE id = ${siteJobId}
  `;
}

export async function ensureSiteJobAccountAccess(siteJobId: string, accountId: string) {
  const jobs = await prisma.$queryRaw<SiteJobCreditRow[]>`
    SELECT id, ownerAccountId, chargedCreditAt, chargedCreditAmount
    FROM SiteJob
    WHERE id = ${siteJobId}
    LIMIT 1
  `;
  const job = jobs[0];
  if (!job) return { ok: false, status: 404, error: "官网任务不存在。" } as const;
  if (job.ownerAccountId && job.ownerAccountId !== accountId) {
    return { ok: false, status: 403, error: "该官网任务不属于当前登录账号。" } as const;
  }
  if (!job.ownerAccountId) {
    await attachSiteJobToAccount(siteJobId, accountId);
  }
  return { ok: true } as const;
}

export async function consumeCreditForSiteRevision(
  siteJobId: string,
  accountId: string,
  options: { shouldCharge: boolean }
): Promise<CreditConsumeResult> {
  return prisma.$transaction(async (tx) => {
    const jobs = await tx.$queryRaw<SiteJobCreditRow[]>`
      SELECT id, ownerAccountId, chargedCreditAt, chargedCreditAmount
      FROM SiteJob
      WHERE id = ${siteJobId}
      LIMIT 1
    `;
    const job = jobs[0];
    if (!job) return { ok: false, status: 404, error: "官网任务不存在。" } as const;
    if (job.ownerAccountId && job.ownerAccountId !== accountId) {
      return { ok: false, status: 403, error: "该官网任务不属于当前登录账号。" } as const;
    }

    const accounts = await tx.$queryRaw<AccountCreditRow[]>`
      SELECT id, credits, status
      FROM CustomerAccount
      WHERE id = ${accountId}
      LIMIT 1
    `;
    const account = accounts[0];
    if (!account || account.status !== "active") {
      return { ok: false, status: 401, error: "账号不可用，请重新登录。" } as const;
    }

    await tx.$executeRaw`
      UPDATE SiteJob
      SET ownerAccountId = COALESCE(ownerAccountId, ${accountId}), updatedAt = CURRENT_TIMESTAMP
      WHERE id = ${siteJobId}
    `;

    if (!options.shouldCharge) {
      return { ok: true, charged: false, remainingCredits: Number(account.credits) } as const;
    }

    if (Number(account.credits) <= 0) {
      return { ok: false, status: 402, error: "当前账号可用次数不足，请联系管理员充值。" } as const;
    }

    const decremented = await tx.$executeRaw`
      UPDATE CustomerAccount
      SET credits = credits - 1, updatedAt = CURRENT_TIMESTAMP
      WHERE id = ${accountId} AND credits > 0 AND status = 'active'
    `;
    if (Number(decremented) <= 0) {
      return { ok: false, status: 402, error: "当前账号可用次数不足，请联系管理员充值。" } as const;
    }

    return { ok: true, charged: true, remainingCredits: Number(account.credits) - 1 } as const;
  });
}

export async function refundCustomerCredits(accountId: string, amount: number) {
  if (amount <= 0) return;
  await prisma.$executeRaw`
    UPDATE CustomerAccount
    SET credits = credits + ${amount}, updatedAt = CURRENT_TIMESTAMP
    WHERE id = ${accountId}
  `;
}

export async function attachLegacyJobToAccount(jobId: string, accountId: string) {
  await prisma.$executeRaw`
    UPDATE Job
    SET ownerAccountId = COALESCE(ownerAccountId, ${accountId}), updatedAt = CURRENT_TIMESTAMP
    WHERE id = ${jobId}
  `;
}

export async function consumeCreditForLegacyJob(jobId: string, accountId: string): Promise<CreditConsumeResult> {
  try {
    return await prisma.$transaction(async (tx) => {
      const jobs = await tx.$queryRaw<SiteJobCreditRow[]>`
        SELECT id, ownerAccountId, chargedCreditAt, chargedCreditAmount
        FROM Job
        WHERE id = ${jobId}
        LIMIT 1
      `;
      const job = jobs[0];
      if (!job) return { ok: false, status: 404, error: "任务不存在。" } as const;
      if (job.ownerAccountId && job.ownerAccountId !== accountId) {
        return { ok: false, status: 403, error: "该任务不属于当前登录账号。" } as const;
      }

      const accounts = await tx.$queryRaw<AccountCreditRow[]>`
        SELECT id, credits, status
        FROM CustomerAccount
        WHERE id = ${accountId}
        LIMIT 1
      `;
      const account = accounts[0];
      if (!account || account.status !== "active") {
        return { ok: false, status: 401, error: "账号不可用，请重新登录。" } as const;
      }
      if (Number(account.credits) <= 0) {
        return { ok: false, status: 402, error: "当前账号可用次数不足，请联系管理员充值。" } as const;
      }

      await tx.$executeRaw`
        UPDATE Job
        SET ownerAccountId = ${accountId}, chargedCreditAt = CURRENT_TIMESTAMP, chargedCreditAmount = chargedCreditAmount + 1, updatedAt = CURRENT_TIMESTAMP
        WHERE id = ${jobId}
      `;
      await tx.$executeRaw`
        UPDATE CustomerAccount
        SET credits = credits - 1, updatedAt = CURRENT_TIMESTAMP
        WHERE id = ${accountId} AND credits > 0 AND status = 'active'
      `;
      return { ok: true, charged: true, remainingCredits: Number(account.credits) - 1 } as const;
    });
  } catch (error) {
    if (error instanceof Error && error.message === "NO_CREDITS_AFTER_MARK") {
      return { ok: false, status: 402, error: "当前账号可用次数不足，请联系管理员充值。" };
    }
    throw error;
  }
}

export async function ensureLegacyJobAccountAccess(jobId: string, accountId: string, options: { claimUnowned?: boolean } = {}) {
  const jobs = await prisma.$queryRaw<SiteJobCreditRow[]>`
    SELECT id, ownerAccountId, chargedCreditAt, chargedCreditAmount
    FROM Job
    WHERE id = ${jobId}
    LIMIT 1
  `;
  const job = jobs[0];
  if (!job) return { ok: false, status: 404, error: "任务不存在。" } as const;
  if (job.ownerAccountId && job.ownerAccountId !== accountId) {
    return { ok: false, status: 403, error: "该任务不属于当前登录账号。" } as const;
  }
  if (!job.ownerAccountId && !options.claimUnowned) {
    return { ok: false, status: 403, error: "该历史任务尚未绑定客户账号，请联系管理员处理。" } as const;
  }
  if (!job.ownerAccountId) {
    await attachLegacyJobToAccount(jobId, accountId);
  }
  return { ok: true } as const;
}
