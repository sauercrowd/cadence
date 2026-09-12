package workspace

import "time"

type PhaseDefinition struct {
	ID               string `json:"id"`
	Number           int    `json:"number"`
	Name             string `json:"name"`
	DocumentTemplate string `json:"documentTemplate"`
}

// TaskPhase links a task to a phase. Definition is resolved live from the
// current workflow on every read and is never persisted, so tasks always
// reflect the latest phase name, mode, and template.
type TaskPhase struct {
	PhaseID    string          `json:"phaseId"`
	DocumentID string          `json:"documentId"`
	Definition PhaseDefinition `json:"-"`
}

// PhaseLink is a bookmark attached to one of a task's phases. Number is a
// stable id; display order is the order the links are returned in.
type PhaseLink struct {
	Number  int    `json:"number"`
	PhaseID string `json:"phaseId"`
	URL     string `json:"url"`
	Title   string `json:"title,omitempty"`
}
type Subphase struct {
	Number     int    `json:"number"`
	PhaseID    string `json:"phaseId"`
	DocumentID string `json:"documentId"`
	Name       string `json:"name"`
	Done       bool   `json:"done"`
}
type Workflow struct {
	Phases   []PhaseDefinition `json:"phases"`
	Revision string            `json:"-"`
}
type WorkspaceInfo struct {
	ID   string `json:"id"`
	Name string `json:"name"`
	// LogoPath is a project-relative path to a workspace logo image,
	// resolved against the project root. Empty means no logo.
	LogoPath string `json:"logoPath,omitempty"`
}
type TaskUpdate struct {
	CurrentPhaseID string
	Name           string
	Status         string
	Priority       int
	AgentStatus    *string
	Fields         []string
}

type AgentSession struct {
	SessionID      string
	Name           string
	Scope          string
	PhaseID        string
	SubphaseNumber int
	Status         string
	LastSeen       time.Time
	Active         bool
}

type AgentUpdateEntry struct {
	Number    int
	SessionID string
	Body      string
	CreatedAt time.Time
}

func agentInstructionsBlock(instructions string) string {
	return "<agent-instructions>\n" + instructions + "\n</agent-instructions>\n"
}

func defaultWorkflow() Workflow {
	return Workflow{Phases: []PhaseDefinition{
		{ID: "goal", Number: 1, Name: "Goal planning", DocumentTemplate: "# Goal\n\n## Outcome\n\nWhat should this work achieve?\n\n## Scope\n\n## Acceptance criteria\n\n## Open questions\n\n" + agentInstructionsBlock("Work with me to define the outcome. Ask focused questions, make tradeoffs explicit, and refine this document into a coherent specification. Keep codebase implementation details for the next phase.")},
		{ID: "work", Number: 2, Name: "Work", DocumentTemplate: "# Work\n\n## Approach\n\n## Changes\n\n## Verification\n\n## Decisions\n\n" + agentInstructionsBlock("Plan and implement the agreed outcome. Keep this document current as the approach develops. Use subphases for independent or parallel work, register your session and scope, and publish concise progress updates. Test and review the result before handoff. Stop for an essential scope decision rather than silently changing the goal.")},
		{ID: "finalize", Number: 3, Name: "Finalize work", DocumentTemplate: "# Finalize work\n\n## Review and decisions\n\n## Completion\n\n## Reflection\n\n" + agentInstructionsBlock("Help me review the output. Explain consequential decisions and respond to feedback. Merge only when explicitly authorized and applicable. Summarize lessons and propose any changes to future workflow instructions for my acceptance.")},
	}}
}
