package server

import (
	"connectrpc.com/connect"
	"context"
	v1 "github.com/sauercrowd/worker/gen/worker/v1"
	"github.com/sauercrowd/worker/internal/workspace"
	"google.golang.org/protobuf/types/known/emptypb"
)

func statusProto(s string) v1.TaskStatus {
	switch s {
	case "open":
		return v1.TaskStatus_TASK_STATUS_OPEN
	case "focus":
		return v1.TaskStatus_TASK_STATUS_FOCUS
	case "done":
		return v1.TaskStatus_TASK_STATUS_DONE
	case "archived":
		return v1.TaskStatus_TASK_STATUS_ARCHIVED
	}
	return v1.TaskStatus_TASK_STATUS_UNSPECIFIED
}
func statusString(s v1.TaskStatus) string {
	switch s {
	case v1.TaskStatus_TASK_STATUS_OPEN:
		return "open"
	case v1.TaskStatus_TASK_STATUS_FOCUS:
		return "focus"
	case v1.TaskStatus_TASK_STATUS_DONE:
		return "done"
	case v1.TaskStatus_TASK_STATUS_ARCHIVED:
		return "archived"
	}
	return ""
}
func agentProto(s *string) v1.AgentStatus {
	if s != nil {
		return v1.AgentStatus_AGENT_STATUS_WORKING
	}
	return v1.AgentStatus_AGENT_STATUS_NONE
}
func definitionProto(p workspace.PhaseDefinition) *v1.PhaseDefinition {
	return &v1.PhaseDefinition{Id: p.ID, Number: int32(p.Number), Name: p.Name, Mode: p.Mode, DocumentTemplate: p.DocumentTemplate}
}
func definitionModel(p *v1.PhaseDefinition) workspace.PhaseDefinition {
	return workspace.PhaseDefinition{ID: p.Id, Number: int(p.Number), Name: p.Name, Mode: p.Mode, DocumentTemplate: p.DocumentTemplate}
}
func phasesProto(phases []workspace.TaskPhase) []*v1.TaskPhase {
	result := []*v1.TaskPhase{}
	for _, p := range phases {
		phase := &v1.TaskPhase{Definition: definitionProto(p.Definition), DocumentId: p.DocumentID}
		result = append(result, phase)
	}
	return result
}
func workflowProto(w workspace.Workflow) *v1.Workflow {
	result := &v1.Workflow{Revision: w.Revision}
	for _, p := range w.Phases {
		result.Phases = append(result.Phases, definitionProto(p))
	}
	return result
}

func (h *Handler) GetWorkspace(context.Context, *connect.Request[emptypb.Empty]) (*connect.Response[v1.WorkspaceInfo], error) {
	info := h.store.Info()
	return connect.NewResponse(&v1.WorkspaceInfo{Id: info.ID, Name: info.Name, LogoPath: info.LogoPath}), nil
}
func (h *Handler) CreateSubtask(_ context.Context, r *connect.Request[v1.CreateSubtaskRequest]) (*connect.Response[v1.Task], error) {
	t, err := h.store.CreateSubtask(r.Msg.TaskId, r.Msg.PhaseId, r.Msg.Name, r.Msg.Revision)
	if err != nil {
		return nil, rpcError(err)
	}
	return connect.NewResponse(taskToProto(t)), nil
}
func (h *Handler) UpdateSubtask(_ context.Context, r *connect.Request[v1.UpdateSubtaskRequest]) (*connect.Response[v1.Task], error) {
	t, err := h.store.UpdateSubtask(r.Msg.TaskId, int(r.Msg.Number), r.Msg.Done, r.Msg.Revision)
	if err != nil {
		return nil, rpcError(err)
	}
	return connect.NewResponse(taskToProto(t)), nil
}
func (h *Handler) GetTask(_ context.Context, r *connect.Request[v1.TaskRequest]) (*connect.Response[v1.Task], error) {
	t, e := h.store.GetTask(r.Msg.TaskId)
	if e != nil {
		return nil, rpcError(e)
	}
	return connect.NewResponse(taskToProto(t)), nil
}
func (h *Handler) UpdateTask(_ context.Context, r *connect.Request[v1.UpdateTaskRequest]) (*connect.Response[v1.Task], error) {
	var activity *string
	if r.Msg.AgentStatus == v1.AgentStatus_AGENT_STATUS_WORKING {
		value := "working"
		activity = &value
	} else if r.Msg.AgentStatus != v1.AgentStatus_AGENT_STATUS_NONE {
		return nil, connect.NewError(connect.CodeInvalidArgument, workspace.ErrInvalidName)
	}
	u := workspace.TaskUpdate{Name: r.Msg.Name, Status: statusString(r.Msg.Status), Priority: int(r.Msg.Priority), AgentStatus: activity, CurrentPhaseID: r.Msg.CurrentPhaseId, Fields: r.Msg.GetUpdateMask().GetPaths()}
	t, e := h.store.UpdateTask(r.Msg.Id, r.Msg.Revision, u)
	if e != nil {
		return nil, rpcError(e)
	}
	return connect.NewResponse(taskToProto(t)), nil
}
func (h *Handler) GetWorkflow(context.Context, *connect.Request[emptypb.Empty]) (*connect.Response[v1.Workflow], error) {
	w, e := h.store.GetWorkflow()
	if e != nil {
		return nil, rpcError(e)
	}
	return connect.NewResponse(workflowProto(w)), nil
}
func (h *Handler) UpdateWorkflow(_ context.Context, r *connect.Request[v1.UpdateWorkflowRequest]) (*connect.Response[v1.Workflow], error) {
	w := workspace.Workflow{}
	for _, p := range r.Msg.GetWorkflow().GetPhases() {
		w.Phases = append(w.Phases, definitionModel(p))
	}
	updated, e := h.store.UpdateWorkflow(w, r.Msg.Revision)
	if e != nil {
		return nil, rpcError(e)
	}
	return connect.NewResponse(workflowProto(updated)), nil
}
