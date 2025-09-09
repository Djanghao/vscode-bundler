# Bundler

Concise file bundling for LLMs, with two views in Explorer:

- Tracked Files: workspace-scoped list, ordered by drag-and-drop
- Global Files: workspace-agnostic list, shared across all workspaces

Key actions
- Click an item: opens a single diff tab (left: file, right: live merged)
- Tracked title: Clear All, Open Merged (Live)
- Global title: Add Global File, Clear Global, Open Global Merged (Live)
- Explorer context menu: Add to Bundler Track List, Add to Bundler Global (supports multi-select)

Merging behavior
- Adds a clean header per file, e.g.

<img width="130" height="54" alt="image" src="https://github.com/user-attachments/assets/79ab240d-a065-4e47-8c21-af35b1caf542" />

- Strips blank lines; files that become empty are skipped
- Tracked and Global merged outputs are separate and live-update on edit/save

Usage
1) Right‑click files in Explorer → Add to Bundler Track List / Add to Bundler Global
2) Reorder by dragging in the view
3) Click an item to compare with its merged output (diff tab)
4) Use the title buttons to clear or open the live merged document

<img width="1280" height="695" alt="image" src="https://github.com/user-attachments/assets/713bcaa3-83b9-454b-b1c8-df5439784550" />


Build / Install (VSIX)
```bash
npm i -g @vscode/vsce
vsce package
code --install-extension bundler-1.0.2.vsix
```

Requirements
- VS Code 1.60.0+

Author
- djanghao
