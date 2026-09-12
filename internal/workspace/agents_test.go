package workspace

import (
	"errors"
	"testing"
	"time"

	"github.com/google/uuid"
)

func TestAgentSessionsAndUpdates(t *testing.T) {
	s, err := NewStore(t.TempDir())
	if err != nil {
		t.Fatal(err)
	}
	defer s.Close()
	task, _ := s.CreateTask("Parallel work")
	task, _ = s.CreateSubphase(task.ID, "work", "Storage", task.Revision)
	sessionID := uuid.NewString()
	task, err = s.UpsertAgentSession(task.ID, AgentSession{SessionID: sessionID, Name: "Codex", Scope: "Build storage", SubphaseNumber: task.Subphases[0].Number, Status: "working"}, "Started storage")
	if err != nil {
		t.Fatal(err)
	}
	if len(task.Agents) != 1 || !task.Agents[0].Active || task.Agents[0].PhaseID != "work" || len(task.AgentUpdates) != 1 {
		t.Fatalf("unexpected activity: %+v %+v", task.Agents, task.AgentUpdates)
	}
	revision := task.Revision
	task, err = s.UpsertAgentSession(task.ID, AgentSession{SessionID: sessionID, Name: "Codex", Scope: "Waiting for UI", PhaseID: "work", Status: "waiting"}, "Storage complete")
	if err != nil {
		t.Fatal(err)
	}
	if task.Revision != revision || len(task.AgentUpdates) != 2 || task.Agents[0].Status != "waiting" {
		t.Fatal("agent activity should update independently of task revisions")
	}
	if _, err := s.UpsertAgentSession(task.ID, AgentSession{SessionID: "bad", Name: "Codex"}, ""); !errors.Is(err, ErrInvalidName) {
		t.Fatalf("accepted invalid session: %v", err)
	}
	if err := s.db.Model(&agentSessionRecord{}).Where("task_id = ? AND session_id = ?", task.ID, sessionID).Update("last_seen", time.Now().UTC().Add(-25*time.Hour)).Error; err != nil {
		t.Fatal(err)
	}
	task, _ = s.GetTask(task.ID)
	if task.Agents[0].Active {
		t.Fatal("stale session remained active")
	}
}
