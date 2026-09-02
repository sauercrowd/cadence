import { createClient } from "@connectrpc/connect";
import { createConnectTransport } from "@connectrpc/connect-web";

import { WorkspaceService } from "./gen/worker/v1/worker_pb";

const transport = createConnectTransport({ baseUrl: "/api" });

export const workspaceClient = createClient(WorkspaceService, transport);
