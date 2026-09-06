PLAN

## Goal
Building a tool to manage agents working on my projects, and making sure I'm maximalliy aligned with the output
Previously my LLM workflow was very adhoc and I had to reinvent the processes/workflow every single time, which is exhausting and ineiffcinet.
not to mention that huge gains can come from paralleilizing work.


## Hypothesis
I need to break down my work in two dimensions
- having N tasks instead of just a single task
- breaking down each task into a phase, where it's clear what's expected from me in that phase, from the agent, and if the task is a) interactive or b) async.

Generally, I'm envisioning three phase
- phase 1: planning goal phase (like this doc) describing the outcome. Completely unrelated to the codebase, first I might a few things myself into a doc, and then iterate with an agent. Agent can search codebase if needed, but the goal is really to sketch out the vision.
- phase 2: implementation phase: now research the codebase where things would go, where files would live, how components would be broken up, database models, and also breaking up the implementation into separate steps to not end up with 10k line PR.
- phase 3: implementation. that's fully async, aka the agent can spend as much time as needed as I'll be moving on to other things. If the agent finds any inconsistencies I want these to be highlighted at the end so I can tweak them, and we might iterate back into the phase 2 or phase 1 if somethings incompatible. Should include testing as much as possible, using e.g. puppeteer.
- phase 4: Agent review. have specific prompt templates to check for coding style, performance, security, ...., and keep looping until main agent decides no more relevant feedback
- phase 5: human review: I'll check the code on github, make sure that we didnt miss anything. Needs concise descriptions, and also sketch out potentially "controversial" sections. Iterate here until me/other reviewer are satisfied
- phase 6: Merge, and reflect on things to adjust for the next PR (aka coding style, performance problem, ....)


## Solution
A linear-style task tracker, where a task has a bunch of phases. there should be a place to define the phases and what prompts they equate to. A task should allow to add extra markdown docs. 
It should be rendered a bit like subtasks I guess. For each phase there should be a doc that tracks the current spec for that phase.
A task should have a priority (p0-p3), a title, and a "status" (open, in progress, done)

Ideally also want a kanban board overview. A task should also be archivable.

Later I'd like to add MCP so other agents can just track things there.