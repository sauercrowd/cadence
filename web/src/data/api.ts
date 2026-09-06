import { workspaceClient } from "../api";
import {
  TaskStatus,
  AgentStatus,
  type Task as ProtoTask,
  type PhaseDefinition as ProtoPhase,
} from "../gen/worker/v1/worker_pb";

export type Status = "open" | "focus" | "done" | "archived";
export type PhaseDefinition = Omit<ProtoPhase, "$typeName" | "$unknown">;
export type Phase = {
  definition: PhaseDefinition;
  documentId: string;
};
export type Task = {
  id: string;
  title: string;
  status: Status;
  priority: number;
  agentStatus: "working" | null;
  currentPhaseId: string;
  revision: string;
  phases: Phase[];
  documents: { id: string; name: string; filename: string }[];
  updatedAt: number;
};
const statuses: Record<Status, TaskStatus> = {
  open: TaskStatus.OPEN,
  focus: TaskStatus.FOCUS,
  done: TaskStatus.DONE,
  archived: TaskStatus.ARCHIVED,
};
function task(t: ProtoTask): Task {
  return {
    id: t.id,
    title: t.name,
    status:
      (Object.keys(statuses) as Status[]).find(
        (key) => statuses[key] === t.status,
      ) || "open",
    priority: t.priority,
    agentStatus: t.agentStatus === AgentStatus.WORKING ? "working" : null,
    currentPhaseId: t.currentPhaseId,
    revision: t.revision,
    documents: t.documents,
    phases: t.phases
      .filter((p) => p.definition)
      .map((p) => ({
        definition: p.definition!,
        documentId: p.documentId,
      })),
    updatedAt: Number(t.updatedAt?.seconds || 0) * 1000,
  };
}
export const api = {
  workspace: () => workspaceClient.getWorkspace({}),
  tasks: async () => {
    const response = await workspaceClient.listTasks({});
    return { tasks: response.tasks.map(task), errors: response.errors };
  },
  task: async (id: string) =>
    task(await workspaceClient.getTask({ taskId: id })),
  createTask: async (
    title: string,
    overrides?: { priority?: number; status?: Status },
  ) => {
    const created = task(await workspaceClient.createTask({ name: title }));
    const patch: Partial<Pick<Task, "priority" | "status">> = {};
    if (overrides?.priority !== undefined && overrides.priority !== created.priority)
      patch.priority = overrides.priority;
    if (overrides?.status !== undefined && overrides.status !== created.status)
      patch.status = overrides.status;
    if (!Object.keys(patch).length) return created;
    return api.updateTask(created, patch);
  },
  updateTask: async (
    t: Task,
    patch: Partial<
      Pick<
        Task,
        "title" | "status" | "priority" | "agentStatus" | "currentPhaseId"
      >
    >,
  ) =>
    task(
      await workspaceClient.updateTask({
        id: t.id,
        revision: t.revision,
        name: patch.title,
        status: patch.status ? statuses[patch.status] : undefined,
        priority: patch.priority,
        currentPhaseId: patch.currentPhaseId,
        agentStatus:
          patch.agentStatus === "working"
            ? AgentStatus.WORKING
            : AgentStatus.NONE,
        updateMask: {
          paths: Object.keys(patch).map(
            (key) =>
              ({
                title: "name",
                agentStatus: "agent_status",
                currentPhaseId: "current_phase_id",
              })[key] || key,
          ),
        },
      }),
    ),
  document: (taskId: string, documentId: string) =>
    workspaceClient.getDocument({ taskId, documentId }),
  saveDocument: (
    taskId: string,
    documentId: string,
    content: string,
    revision: string,
  ) =>
    workspaceClient.updateDocument({ taskId, documentId, content, revision }),
  createDocument: (taskId: string, name: string) =>
    workspaceClient.createDocument({ taskId, name }),
  workflow: () => workspaceClient.getWorkflow({}),
  updateWorkflow: (phases: PhaseDefinition[], revision: string) =>
    workspaceClient.updateWorkflow({ workflow: { phases }, revision }),
};
