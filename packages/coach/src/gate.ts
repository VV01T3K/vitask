import type { Context } from "@earendil-works/chord/context";
import {
  defineTool,
  hook,
  ToolTask,
  type JsonObject,
  type TaskId,
  type ToolExecutionApi,
  type ToolExecutionResult,
  type ToolRegistration,
} from "@earendil-works/pi-durable";
import { LIMITS, type Approval, type ApprovalDecision, type MutatingTool } from "@vitask/protocol";

import { ACTIONS, isMutatingTool } from "./actions.ts";
import type { CoachDeps } from "./deps.ts";
import { CoachError } from "./errors.ts";
import { stopTask } from "./operations.ts";

const text = (value: string) => [{ type: "text" as const, text: value }];

function result(value: string, approval: Approval, isError = false): ToolExecutionResult {
  return {
    output: text(value),
    isError,
    details: { approvalId: approval.id, status: approval.status },
  };
}

/**
 * The front door of the approval gate, as a `beforeTool` hook: it refuses calls that could never be applied (unknown
 * ids, limits) before the user is asked, refuses mutating calls made by other tools, and caps open proposals. It
 * runs regardless of what the conversation says, so no message can switch it off.
 */
export function approvalPolicyHook(deps: CoachDeps) {
  return hook(ToolTask, {
    beforeTool: async (call) => {
      if (!isMutatingTool(call.name)) return undefined;
      if (call.parent !== undefined)
        return { block: "Changes can only be proposed directly by the coach." };
      const pending = await deps.store.listApprovals({
        status: "pending",
        limit: LIMITS.pendingApprovals + 1,
      });
      if (pending.length >= LIMITS.pendingApprovals) {
        return {
          block: "Too many changes are waiting for the user's decision. Wait for those first.",
        };
      }
      const action = ACTIONS[call.name] as (typeof ACTIONS)[MutatingTool];
      // The arguments are validated against the schema before this hook runs.
      const problem = await action.problem(call.arguments as never, deps);
      return problem === undefined ? undefined : { block: problem };
    },
  });
}

/**
 * Waits for the user's decision on `approval` without holding the decision in memory: a child task sleeps until the
 * deadline, and `decideApproval()` aborts it to wake this call. Each wait round has its own memo, so a rerun after a
 * restart finds the same child instead of creating another.
 */
async function awaitDecision(
  deps: CoachDeps,
  api: ToolExecutionApi,
  approval: Approval,
  context: Context,
): Promise<Approval> {
  let current = approval;
  for (let round = 0; current.status === "pending" && api.now() < current.expiresAt; round++) {
    const key = `approval.wait.${round}`;
    let waitId = await api.memo<number>(key, context);
    if (waitId === undefined) {
      waitId = Number(
        await api.createTask(
          deps.tasks().ApprovalWait,
          { approvalId: current.id, until: current.expiresAt },
          { ownership: { kind: "task", taskId: api.taskId } },
          context,
        ),
      );
      await api.memo(key, waitId, context);
      await deps.store.setApprovalWaitTask(current.id, waitId);
    }
    // A decision made before the wait task id was stored could not wake it; look before sleeping.
    const latest = await deps.store.getApproval(current.id);
    if (latest?.status === "pending") await api.waitForTask(waitId as TaskId, context);
    // The tool task stays live until its children are terminal, so never leave the wait task sleeping.
    await stopTask(deps, waitId);
    current = (await deps.store.getApproval(current.id)) ?? current;
  }
  return current;
}

/** Wraps a mutating action as a tool whose change runs only after the user approves it. */
function gatedTool(deps: CoachDeps, name: MutatingTool): ToolRegistration {
  const action = ACTIONS[name] as (typeof ACTIONS)[MutatingTool];
  return defineTool({
    name,
    description: `${action.description} The user must approve it in the app; the call waits for that.`,
    parameters: action.parameters,
    // Reruns after a restart find their approval and wait task through memos, and `apply` is idempotent per approval.
    replay: "safe",
    callers: ["model"],
    async execute(rawArgs, api, context) {
      const args = rawArgs as JsonObject;
      const id = await api.memo("approval.id", deps.newId("apr"), context);
      let approval = await deps.store.getApproval(id);
      if (!approval) {
        const expiresAt = await api.memo(
          "approval.expiresAt",
          api.now() + deps.config.approvalTtlMs,
          context,
        );
        approval = {
          id,
          tool: name,
          args,
          summary: await action.describe(args as never, deps),
          status: "pending",
          createdAt: api.now(),
          expiresAt,
          decidedAt: null,
          result: null,
        };
        if (await deps.store.insertApproval(approval, null))
          deps.publish({ type: "approval.upserted", approval });
      }
      await api.details({ approvalId: approval.id, status: approval.status }, context);

      approval = await awaitDecision(deps, api, approval, context);
      switch (approval.status) {
        case "pending": {
          const expired = await deps.store.transitionApproval(id, ["pending"], {
            status: "expired",
            decidedAt: api.now(),
            result: "No decision in time.",
          });
          if (expired) deps.publish({ type: "approval.upserted", approval: expired });
          return result(
            "The user did not decide in time; nothing changed.",
            expired ?? approval,
            true,
          );
        }
        case "approved": {
          let outcome: string;
          try {
            outcome = await action.apply(args as never, deps, id);
          } catch (error) {
            const message = error instanceof Error ? error.message : String(error);
            const failed = await deps.store.transitionApproval(id, ["approved"], {
              status: "failed",
              result: message,
            });
            if (failed) deps.publish({ type: "approval.upserted", approval: failed });
            return result(`Approved, but applying failed: ${message}`, failed ?? approval, true);
          }
          const applied = await deps.store.transitionApproval(id, ["approved"], {
            status: "applied",
            result: outcome,
          });
          if (applied) deps.publish({ type: "approval.upserted", approval: applied });
          return result(`The user approved. ${outcome}`, applied ?? approval);
        }
        case "applied":
          return result(`The user approved. ${approval.result ?? "Applied."}`, approval);
        case "rejected":
          return result("The user rejected this change; nothing changed.", approval, true);
        case "expired":
          return result(
            `Not applied: ${approval.result ?? "the proposal expired."}`,
            approval,
            true,
          );
        case "failed":
          return result(
            `Approved, but applying failed: ${approval.result ?? "unknown error"}`,
            approval,
            true,
          );
      }
    },
  });
}

export function gatedTools(deps: CoachDeps): ToolRegistration[] {
  return (Object.keys(ACTIONS) as MutatingTool[]).map((name) => gatedTool(deps, name));
}

/** Records the user's decision and wakes the waiting tool call. */
export async function decideApproval(
  deps: CoachDeps,
  id: string,
  decision: ApprovalDecision,
): Promise<Approval> {
  const approval = await deps.store.transitionApproval(id, ["pending"], {
    status: decision === "approve" ? "approved" : "rejected",
    decidedAt: deps.now(),
  });
  if (!approval) {
    const existing = await deps.store.getApproval(id);
    if (!existing) throw new CoachError("not_found", `No approval with id ${id}.`);
    throw new CoachError("conflict", `This proposal is already ${existing.status}.`);
  }
  deps.publish({ type: "approval.upserted", approval });
  await stopTask(deps, await deps.store.getApprovalWaitTask(id));
  return approval;
}
