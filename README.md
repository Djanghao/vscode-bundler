# Bundler
Concise file bundling for LLMs, with two views in Explorer:

- Tracked Files: workspace-scoped list, ordered by drag-and-drop
- Global Files: workspace-agnostic list, shared across all workspaces

Key actions
- Click an item: opens a single diff tab (left: file, right: live merged)
- Tracked title: Add Tracked Files, Clear All, Open Merged (Live), Link Merged File
- Global title: Add Global File, Clear Global, Open Global Merged (Live), Link Global Merged File
- Explorer context menu: Add to Bundler Track List, Add to Bundler Global (supports multi-select)

Merging behavior
- Adds a clean header per file, e.g.

<img width="130" height="54" alt="image" src="https://raw.githubusercontent.com/Djanghao/vscode-bundler/main/assets/title.png" />

- Strips blank lines; files that become empty are skipped
- Tracked and Global merged outputs are separate and live-update on edit/save

Usage
1) Right‑click files in Explorer → Add to Bundler Track List / Add to Bundler Global
2) Use "Add Tracked Files" or "Add Global File" buttons for multi-select file picker
3) Reorder by dragging in the view
4) Click an item to compare with its merged output (diff tab)
5) Use "Link Merged File" buttons to save merged content to disk with auto-updates
6) Use other title buttons to clear or open the live merged document

<img width="800" alt="image" src="https://raw.githubusercontent.com/Djanghao/vscode-bundler/main/assets/screenshot.png" />

Build / Install (VSIX)
```bash
npm i -g @vscode/vsce
vsce package
code --install-extension bundler-1.3.0.vsix
```

Requirements
- VS Code 1.60.0+

Author
- djanghao
