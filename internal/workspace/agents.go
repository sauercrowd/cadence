package workspace

import (
	"fmt"
	"strings"
	"time"

	"github.com/google/uuid"
	"gorm.io/gorm"
	"gorm.io/gorm/clause"
)

func (s *Store) UpsertAgentSession(taskID string, agent AgentSession, update string) (Task, error) {
	s.mu.Lock()
	defer s.mu.Unlock()
	task, err := s.readTask(taskID)
	if err != nil {
		return Task{}, err
	}
	if _, err := uuid.Parse(agent.SessionID); err != nil {
		return Task{}, fmt.Errorf("%w: invalid session id", ErrInvalidName)
	}
	agent.Name, agent.Scope, update = strings.TrimSpace(agent.Name), strings.TrimSpace(agent.Scope), strings.TrimSpace(update)
	if agent.Name == "" || len(agent.Name) > 120 || len(agent.Scope) > 500 || len(update) > 2000 {
		return Task{}, ErrInvalidName
	}
	if agent.Status == "" {
		agent.Status = "working"
	}
	if agent.Status != "working" && agent.Status != "waiting" && agent.Status != "done" {
		return Task{}, fmt.Errorf("%w: invalid agent status", ErrInvalidName)
	}
	if agent.PhaseID != "" {
		found := false
		for _, phase := range task.Phases {
			if phase.PhaseID == agent.PhaseID {
				found = true
			}
		}
		if !found {
			return Task{}, fmt.Errorf("%w: unknown phase", ErrInvalidName)
		}
	}
	if agent.SubphaseNumber != 0 {
		found := false
		for _, sub := range task.Subphases {
			if sub.Number == agent.SubphaseNumber && (agent.PhaseID == "" || sub.PhaseID == agent.PhaseID) {
				found, agent.PhaseID = true, sub.PhaseID
			}
		}
		if !found {
			return Task{}, fmt.Errorf("%w: unknown subphase", ErrInvalidName)
		}
	}
	now := time.Now().UTC()
	err = s.db.Transaction(func(tx *gorm.DB) error {
		record := agentSessionRecord{TaskID: taskID, SessionID: agent.SessionID, Name: agent.Name, Scope: agent.Scope, PhaseID: agent.PhaseID, SubphaseNumber: agent.SubphaseNumber, Status: agent.Status, LastSeen: now}
		if err := tx.Clauses(clause.OnConflict{Columns: []clause.Column{{Name: "task_id"}, {Name: "session_id"}}, DoUpdates: clause.AssignmentColumns([]string{"name", "scope", "phase_id", "subphase_number", "status", "last_seen"})}).Create(&record).Error; err != nil {
			return err
		}
		if update != "" {
			return tx.Create(&agentUpdateRecord{TaskID: taskID, SessionID: agent.SessionID, Body: update, CreatedAt: now}).Error
		}
		return nil
	})
	if err != nil {
		return Task{}, err
	}
	return s.readTask(taskID)
}
