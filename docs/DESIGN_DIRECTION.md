# Calm Terminal Design Direction

## Goal

Daymark should feel like a quiet desktop instrument rather than a themed dashboard. It keeps the precision and compactness of a terminal, while using the hierarchy and restraint of modern developer tools.

Reference balance:

- Linear: hierarchy, restrained borders, selected-state clarity
- Raycast: desktop utility density, keyboard-first focus states
- Warp: block-oriented task rows and operational feedback
- Notion Calendar: calendar scanning and date-state distinction
- Apple materials: limited transparency and stable content surfaces

## Principles

### 1. Accent is a signal

Mint is reserved for:

- the current date
- active selection edges
- successful or in-progress system state
- primary focus rings

Structural borders and inactive controls use neutral gray values.

### 2. Structure should be felt before it is seen

Panel hierarchy comes from surface values and spacing first. One-pixel borders support the structure but should not outline every object with equal strength.

### 3. Calendar states use different visual languages

- Today: filled circular date badge
- Selected date: subtle cell surface and inset outline
- Keyboard focus: stronger accent focus ring
- Outside month: reduced opacity
- Completed task: muted copy plus a quiet completion dot

These states may overlap without becoming ambiguous.

### 4. Sans for reading, mono for instrumentation

Sans-serif:

- task content
- descriptions
- headings
- settings copy

Monospace:

- dates and counts
- tabs and compact actions
- status metadata
- analytics labels

This preserves the terminal identity without making long Korean task text tiring to read.

### 5. Actions stay quiet until needed

Destructive controls remain visually hidden until hover, selection, or keyboard focus. Primary daily content receives attention before management controls.

## First-pass scope

The `web/calm-terminal.css` layer changes presentation only:

- neutral color hierarchy
- typography roles
- panel material and elevation
- tabs and top status metrics
- calendar date states
- task block, focus, hover, and delete behavior
- inspector spacing and settings controls
- analytics panel separation
- sync, toast, and resize status treatment
- reduced-motion support

The functional layout remains in `web/styles.css`. Removing one stylesheet link restores the previous appearance.

## Review checklist

Evaluate the branch at normal desktop size and in Desktop Mode.

1. Can today and the selected date be identified independently within one second?
2. Is task text easier to read than metadata and controls?
3. Does the eye go to content before borders?
4. Are hover, keyboard focus, selection, sync, success, and error distinguishable?
5. Does a bright wallpaper reduce readability?
6. Do hidden delete controls remain discoverable by mouse and keyboard?
7. Does the interface still feel recognizably like Daymark rather than a generic SaaS dashboard?

## Later passes

After visual review:

- tune compact versus comfortable density
- add shortcut hints only where they improve discovery
- revisit analytics information hierarchy
- consider a command palette
- test light and visually noisy wallpapers
