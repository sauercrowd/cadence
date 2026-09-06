package workspace

type PhaseDefinition struct {
	ID               string `json:"id"`
	Name             string `json:"name"`
	Mode             string `json:"mode"`
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

func agentInstructionsBlock(instructions string) string {
	return "<agent-instructions>\n" + instructions + "\n</agent-instructions>\n"
}

func defaultWorkflow() Workflow {
	return Workflow{Phases: []PhaseDefinition{
		{ID: "goal", Name: "Goal planning", Mode: "interactive", DocumentTemplate: "# Goal\n\n## Outcome\n\nWhat should this work achieve?\n\n## Scope\n\n## Acceptance criteria\n\n## Open questions\n\n" + agentInstructionsBlock("Work with me to define the outcome. Ask focused questions, make tradeoffs explicit, and refine this document into a coherent specification. Keep codebase implementation details for the next phase.")},
		{ID: "plan", Name: "Implementation planning", Mode: "interactive", DocumentTemplate: "# Implementation plan\n\n## Approach\n\n## Changes\n\n## Steps\n\n## Verification\n\n## Tradeoffs\n\n" + agentInstructionsBlock("Research the codebase and propose where the work belongs. Identify components, data models, dependencies, and verification. Define a reviewable breakdown and any appropriate PR structure. Iterate with me before implementation.")},
		{ID: "implement", Name: "Implementation", Mode: "async", DocumentTemplate: "# Implementation\n\n## Changes\n\n## Verification evidence\n\n## Review findings and resolution\n\n## Deviations and remaining questions\n\n## Links\n\n" + agentInstructionsBlock("Carry out the accepted implementation plan independently. Test the result, including browser checks where relevant. Review your changes for maintainability, performance, and security, resolve relevant findings, and repeat until ready for human review. Record deviations and outstanding decisions. Stop for an essential scope decision rather than silently changing the goal.")},
		{ID: "finalize", Name: "Finalize work", Mode: "interactive", DocumentTemplate: "# Finalize work\n\n## Review and decisions\n\n## Completion\n\n## Reflection\n\n" + agentInstructionsBlock("Help me review the output. Explain consequential decisions and respond to feedback. Merge only when explicitly authorized and applicable. Summarize lessons and propose any changes to future workflow instructions for my acceptance.")},
	}}
}
