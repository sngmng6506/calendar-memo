# Calm Terminal Design Direction

## Goal

Daymark should feel like a quiet desktop terminal instrument, not a generic dark productivity app. The redesign may improve hierarchy, readability, spacing, and interaction clarity, but it must preserve the visual language users already recognize as Daymark.

Reference balance:

- Linear: hierarchy, restrained borders, selected-state clarity
- Raycast: desktop utility density and keyboard-first focus states
- Warp: operational feedback and command-oriented interaction
- Notion Calendar: calendar scanning and date-state distinction
- Apple materials: limited transparency and stable content surfaces

These references supply refinement techniques. They do not replace Daymark's terminal identity.

## Identity guardrails

The following elements are part of the product identity and should not be replaced with generic SaaS patterns without an explicit product decision:

- monospace typography for primary interface and task content
- literal `[ ]` and `[x]` task state markers
- functional command labels such as `DEL` and `CARRY OPEN`
- compact, angular controls and task rows
- a restrained technical grid or instrumentation texture
- thin borders, operational status text, and keyboard-visible focus states

The task renderer owns the literal `[ ]` and `[x]` text. Theme CSS may change its color, weight, or spacing, but must not replace it or prepend a second marker.

Terminal identity should come from typography, density, syntax, and structure—not decorative prompt cosplay. Analytics headings and other passive labels should not receive `$`, `>`, or similar prefixes unless they represent an actual command or input context.

Avoid:

- circular task bullets or standalone check icons replacing `[ ]` and `[x]`
- globally switching the product to a proportional sans-serif face
- rounded card stacks that make task rows resemble a generic mobile todo app
- decorative prompt symbols on passive headings
- softening every surface until the console structure disappears

## Principles

### 1. Accent is a signal

Mint is reserved for:

- the current date
- active selection edges
- successful or in-progress system state
- primary focus rings

Structural borders and inactive controls use neutral gray values.

### 2. Structure should be quieter, not removed

Panel hierarchy comes from surface values and spacing first. Thin borders and a very low-contrast grid preserve the console frame without making every element compete for attention.

The calendar uses a stable, nearly opaque surface. Blur is limited to the top bar and inspector so a bright or visually noisy wallpaper does not compete with daily content.

### 3. Calendar states use different visual languages

- Today: filled circular date badge
- Selected date: subtle cell surface and inset outline
- Keyboard focus: stronger accent focus ring
- Outside month: reduced opacity
- Open task: literal `[ ]`
- Completed task: literal `[x]` plus muted copy

These states may overlap without becoming ambiguous.

### 4. Monospace is the default voice

Monospace is used for:

- task content and descriptions
- headings
- dates and counts
- tabs and compact actions
- status metadata
- analytics labels

Readability is improved through size, contrast, spacing, and line height rather than replacing the primary typeface. Task copy uses 13px type, dates use 11px type, and supporting metadata generally stays at or above 10px.

### 5. Actions stay quiet but discoverable

Destructive controls remain visible at very low opacity and become fully visible on hover, selection, or keyboard focus. Daily content receives attention first without hiding available actions completely.

### 6. The top bar shows actionable state

The top bar keeps only:

- open tasks in the visible month
- open tasks on the selected date
- overdue tasks that can be carried forward

Total and completed counts belong in Analytics rather than competing with navigation.

## Theme scope

The `web/calm-terminal.css` layer changes presentation only:

- neutral color hierarchy
- readable minimum sizes while retaining monospace typography
- stable calendar material and limited blur
- tabs and concise top status metrics
- calendar date states and original bracket task markers
- angular task blocks, focus, hover, and delete behavior
- inspector spacing and settings controls
- restrained analytics panel separation without decorative prompt symbols
- sync, toast, and resize status treatment
- reduced-motion support

The functional layout remains in `web/styles.css`. Removing one stylesheet link restores the previous appearance.

## Review baseline

The design succeeds only when it remains recognizably Daymark before it resembles its references. The modernization target is a cleaner terminal tool, not a terminal-themed version of a generic todo app.

Evaluate the branch at normal desktop size and in Desktop Mode:

1. Can today and the selected date be identified independently within one second?
2. Does the interface read as a terminal tool before it reads as a todo app?
3. Are `[ ]`, `[x]`, `DEL`, monospace typography, and angular structure preserved?
4. Is each task shown with exactly one state marker?
5. Is task text easier to read than metadata and controls?
6. Does the eye go to content before borders and background effects?
7. Are hover, keyboard focus, selection, sync, success, and error distinguishable?
8. Does a bright wallpaper reduce readability?
9. Is the delete action discoverable without distracting from task content?
10. Do any rounded, decorative, icon-only, or fake-prompt choices feel imported or forced?

## Later passes

After visual review:

- tune compact versus comfortable density
- add shortcut hints only where they improve discovery
- revisit analytics information hierarchy without adding decorative syntax
- consider a command palette
- test light and visually noisy wallpapers
- consolidate the approved theme rules into the base stylesheet
