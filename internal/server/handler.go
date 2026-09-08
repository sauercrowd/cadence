package server

import (
	"context"
	"errors"

	"connectrpc.com/connect"
	workerv1 "github.com/sauercrowd/worker/gen/worker/v1"
	"github.com/sauercrowd/worker/gen/worker/v1/workerv1connect"
	"github.com/sauercrowd/worker/internal/workspace"
	"google.golang.org/protobuf/types/known/emptypb"
	"google.golang.org/protobuf/types/known/timestamppb"
)

type Handler struct {
	workerv1connect.UnimplementedWorkspaceServiceHandler
	store *workspace.Store
}

func NewHandler(store *workspace.Store) *Handler {
	return &Handler{store: store}
}

func (h *Handler) ListTasks(context.Context, *connect.Request[emptypb.Empty]) (*connect.Response[workerv1.ListTasksResponse], error) {
	tasks, warnings, err := h.store.ListTasksWithErrors()
	if err != nil {
		return nil, rpcError(err)
	}
	response := &workerv1.ListTasksResponse{Tasks: make([]*workerv1.Task, 0, len(tasks)), Errors: warnings}
	for _, task := range tasks {
		response.Tasks = append(response.Tasks, taskToProto(task))
	}
	return connect.NewResponse(response), nil
}

func (h *Handler) CreateTask(_ context.Context, request *connect.Request[workerv1.CreateTaskRequest]) (*connect.Response[workerv1.Task], error) {
	task, err := h.store.CreateTask(request.Msg.Name)
	if err != nil {
		return nil, rpcError(err)
	}
	return connect.NewResponse(taskToProto(task)), nil
}

func (h *Handler) RenameTask(_ context.Context, request *connect.Request[workerv1.RenameTaskRequest]) (*connect.Response[workerv1.Task], error) {
	task, err := h.store.RenameTask(request.Msg.TaskId, request.Msg.Name)
	if err != nil {
		return nil, rpcError(err)
	}
	return connect.NewResponse(taskToProto(task)), nil
}

func (h *Handler) DeleteTask(_ context.Context, request *connect.Request[workerv1.TaskRequest]) (*connect.Response[emptypb.Empty], error) {
	if err := h.store.DeleteTask(request.Msg.TaskId); err != nil {
		return nil, rpcError(err)
	}
	return connect.NewResponse(&emptypb.Empty{}), nil
}

func (h *Handler) CreateDocument(_ context.Context, request *connect.Request[workerv1.CreateDocumentRequest]) (*connect.Response[workerv1.Document], error) {
	document, err := h.store.CreateDocument(request.Msg.TaskId, request.Msg.Name)
	if err != nil {
		return nil, rpcError(err)
	}
	return connect.NewResponse(documentToProto(document)), nil
}

func (h *Handler) GetDocument(_ context.Context, request *connect.Request[workerv1.DocumentRequest]) (*connect.Response[workerv1.Document], error) {
	document, err := h.store.GetDocument(request.Msg.TaskId, request.Msg.DocumentId)
	if err != nil {
		return nil, rpcError(err)
	}
	return connect.NewResponse(documentToProto(document)), nil
}

func (h *Handler) RenameDocument(_ context.Context, request *connect.Request[workerv1.RenameDocumentRequest]) (*connect.Response[workerv1.Document], error) {
	document, err := h.store.RenameDocument(request.Msg.TaskId, request.Msg.DocumentId, request.Msg.Name)
	if err != nil {
		return nil, rpcError(err)
	}
	return connect.NewResponse(documentToProto(document)), nil
}

func (h *Handler) UpdateDocument(_ context.Context, request *connect.Request[workerv1.UpdateDocumentRequest]) (*connect.Response[workerv1.Document], error) {
	document, err := h.store.UpdateDocument(request.Msg.TaskId, request.Msg.DocumentId, request.Msg.Content, request.Msg.Revision)
	if err != nil {
		return nil, rpcError(err)
	}
	return connect.NewResponse(documentToProto(document)), nil
}

func (h *Handler) DeleteDocument(_ context.Context, request *connect.Request[workerv1.DocumentRequest]) (*connect.Response[emptypb.Empty], error) {
	if err := h.store.DeleteDocument(request.Msg.TaskId, request.Msg.DocumentId); err != nil {
		return nil, rpcError(err)
	}
	return connect.NewResponse(&emptypb.Empty{}), nil
}

func taskToProto(task workspace.Task) *workerv1.Task {
	subtasks := make([]*workerv1.Subtask, 0, len(task.Subtasks))
	for _, s := range task.Subtasks {
		subtasks = append(subtasks, &workerv1.Subtask{Number: int32(s.Number), PhaseId: s.PhaseID, DocumentId: s.DocumentID, Name: s.Name, Done: s.Done})
	}
	documents := make([]*workerv1.DocumentSummary, 0, len(task.Documents))
	for _, document := range task.Documents {
		documents = append(documents, &workerv1.DocumentSummary{
			Id:       document.ID,
			Name:     document.Name,
			Filename: document.Filename,
		})
	}
	return &workerv1.Task{
		Subtasks: subtasks,
		Id:       task.ID, Number: int32(task.Number),
		Name:      task.Name,
		Documents: documents,
		CreatedAt: timestamppb.New(task.CreatedAt),
		UpdatedAt: timestamppb.New(task.UpdatedAt),
		Status:    statusProto(task.Status), Priority: int32(task.Priority), AgentStatus: agentProto(task.AgentStatus), CurrentPhaseId: task.CurrentPhaseID, Revision: task.Revision, Phases: phasesProto(task.Phases),
	}
}

func documentToProto(document workspace.Document) *workerv1.Document {
	return &workerv1.Document{
		Id:       document.ID,
		TaskId:   document.TaskID,
		Name:     document.Name,
		Filename: document.Filename,
		Content:  document.Content,
		Revision: document.Revision,
	}
}

func rpcError(err error) error {
	switch {
	case errors.Is(err, workspace.ErrNotFound):
		return connect.NewError(connect.CodeNotFound, err)
	case errors.Is(err, workspace.ErrConflict):
		return connect.NewError(connect.CodeAborted, err)
	case errors.Is(err, workspace.ErrInvalidName):
		return connect.NewError(connect.CodeInvalidArgument, err)
	default:
		return connect.NewError(connect.CodeInternal, errors.New("internal workspace error"))
	}
}
