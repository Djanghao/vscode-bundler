"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.deactivate = exports.activate = void 0;
const vscode = require("vscode");
const fs = require("fs");
const path = require("path");
function activate(context) {
    const trackedProvider = new BundlerTrackedProvider(context);
    const mergedVirtualProvider = new MergedContentProvider(context);
    const globalProvider = new BundlerGlobalProvider(context);
    const globalMergedVirtualProvider = new GlobalMergedContentProvider(context);
    const dnd = new BundlerTrackedDnD(context, () => refreshAll());
    const trackedView = vscode.window.createTreeView('bundlerTracked', { treeDataProvider: trackedProvider, dragAndDropController: dnd, canSelectMany: true });
    const globalDnd = new BundlerGlobalDnD(context, () => refreshAll());
    const globalView = vscode.window.createTreeView('bundlerGlobal', { treeDataProvider: globalProvider, dragAndDropController: globalDnd, canSelectMany: true });
    context.subscriptions.push(trackedView, dnd, globalView, globalDnd);
    const updateLinkedFile = () => {
        const linkedFilePath = context.workspaceState.get('linkedMergedFile', '');
        if (linkedFilePath) {
            try {
                const tracked = context.workspaceState.get('trackedFiles', []);
                const mergedContent = computeMergedContent(context, tracked);
                fs.writeFileSync(linkedFilePath, mergedContent || '', 'utf8');
            }
            catch (e) {
                console.error('Failed to update linked file:', e);
            }
        }
    };
    const updateLinkedGlobalFile = () => {
        const linkedFilePath = context.globalState.get('linkedGlobalMergedFile', '');
        if (linkedFilePath) {
            try {
                const globalMergedContent = computeGlobalMergedContent(context);
                fs.writeFileSync(linkedFilePath, globalMergedContent || '', 'utf8');
            }
            catch (e) {
                console.error('Failed to update linked global file:', e);
            }
        }
    };
    const refreshAll = () => {
        trackedProvider.refresh();
        globalProvider.refresh();
        mergedVirtualProvider.refresh();
        globalMergedVirtualProvider.refresh();
        updateLinkedFile();
        updateLinkedGlobalFile();
        try {
            const trackedCount = context.workspaceState.get('trackedFiles', []).length;
            const globalCount = context.globalState.get('globalFiles', []).length;
            trackedView.description = trackedCount ? `${trackedCount}` : undefined;
            globalView.description = globalCount ? `${globalCount}` : undefined;
        }
        catch { }
    };
    // Register virtual document providers for merged content
    context.subscriptions.push(vscode.workspace.registerTextDocumentContentProvider('bundler', mergedVirtualProvider));
    context.subscriptions.push(vscode.workspace.registerTextDocumentContentProvider('bundler-global', globalMergedVirtualProvider));
    // Add current file or selected file from explorer
    context.subscriptions.push(vscode.commands.registerCommand('bundler.addToTrackList', async (uri, uris) => {
        const files = new Set();
        if (uris && Array.isArray(uris)) {
            for (const u of uris)
                if (u && u.scheme === 'file')
                    files.add(u.fsPath);
        }
        if (uri && uri.scheme === 'file')
            files.add(uri.fsPath);
        if (files.size === 0) {
            const editor = vscode.window.activeTextEditor;
            if (editor)
                files.add(editor.document.uri.fsPath);
        }
        if (files.size === 0)
            return;
        const list = context.workspaceState.get('trackedFiles', []);
        let changed = false;
        for (const fp of files) {
            const ws = vscode.workspace.getWorkspaceFolder(vscode.Uri.file(fp));
            if (!ws)
                continue;
            if (!list.includes(fp)) {
                list.push(fp);
                changed = true;
            }
        }
        if (changed) {
            await context.workspaceState.update('trackedFiles', list);
            refreshAll();
        }
    }));
    // Add tracked files (file picker)
    context.subscriptions.push(vscode.commands.registerCommand('bundler.addTrackedFiles', async () => {
        const workspaceFolder = vscode.workspace.workspaceFolders?.[0];
        if (!workspaceFolder) {
            vscode.window.showErrorMessage('No workspace folder is open');
            return;
        }
        const fileUris = await vscode.window.showOpenDialog({
            canSelectMany: true,
            canSelectFiles: true,
            canSelectFolders: false,
            defaultUri: workspaceFolder.uri,
            openLabel: 'Add to Tracked Files'
        });
        if (!fileUris || fileUris.length === 0)
            return;
        const list = context.workspaceState.get('trackedFiles', []);
        let changed = false;
        for (const fileUri of fileUris) {
            const fp = fileUri.fsPath;
            const ws = vscode.workspace.getWorkspaceFolder(fileUri);
            if (!ws)
                continue;
            if (!list.includes(fp)) {
                list.push(fp);
                changed = true;
            }
        }
        if (changed) {
            await context.workspaceState.update('trackedFiles', list);
            refreshAll();
            vscode.window.showInformationMessage(`Added ${fileUris.length} file(s) to tracked list`);
        }
        else {
            vscode.window.showInformationMessage('No new files were added (files already tracked)');
        }
    }));
    // Add to global from Explorer (multi-select supported)
    context.subscriptions.push(vscode.commands.registerCommand('bundler.addToGlobalList', async (uri, uris) => {
        const files = new Set();
        if (uris && Array.isArray(uris))
            for (const u of uris)
                if (u?.scheme === 'file')
                    files.add(u.fsPath);
        if (uri?.scheme === 'file')
            files.add(uri.fsPath);
        if (files.size === 0)
            return;
        const list = context.globalState.get('globalFiles', []);
        let changed = false;
        for (const fp of files)
            if (!list.includes(fp)) {
                list.push(fp);
                changed = true;
            }
        if (changed) {
            await context.globalState.update('globalFiles', list);
            refreshAll();
        }
    }));
    // Add Global File (create a new file under global storage and open it)
    context.subscriptions.push(vscode.commands.registerCommand('bundler.addGlobalFile', async () => {
        const name = await vscode.window.showInputBox({ prompt: 'Global file name (e.g. notes.md)', value: 'untitled.md' });
        if (!name)
            return;
        const dir = path.join(context.globalStorageUri.fsPath, 'global');
        try {
            fs.mkdirSync(dir, { recursive: true });
        }
        catch { }
        let base = name.trim();
        if (!base)
            base = 'untitled.md';
        let filePath = path.join(dir, base);
        if (fs.existsSync(filePath)) {
            const p = path.parse(base);
            let i = 1;
            while (fs.existsSync(filePath)) {
                filePath = path.join(dir, `${p.name}-${i}${p.ext}`);
                i++;
            }
        }
        fs.writeFileSync(filePath, '', 'utf8');
        const list = context.globalState.get('globalFiles', []);
        if (!list.includes(filePath))
            await context.globalState.update('globalFiles', [...list, filePath]);
        refreshAll();
        const doc = await vscode.workspace.openTextDocument(vscode.Uri.file(filePath));
        await vscode.window.showTextDocument(doc, { preview: false });
    }));
    // Removed: addFiles (use Explorer > context menu > Add to Bundler Track List)
    // Clear all tracked files and clear output file content
    context.subscriptions.push(vscode.commands.registerCommand('bundler.clearTrackList', async () => {
        await context.workspaceState.update('trackedFiles', []);
        const outputFile = context.workspaceState.get('outputFile', '');
        if (outputFile) {
            try {
                fs.writeFileSync(outputFile, '', 'utf8');
            }
            catch { }
        }
        refreshAll();
    }));
    // Removed: copyAll (Copy Merged)
    // Open merged virtual document in editor (from Tracked Files view title)
    context.subscriptions.push(vscode.commands.registerCommand('bundler.openMergedVirtual', async () => {
        const uri = mergedVirtualProvider.uri;
        const doc = await vscode.workspace.openTextDocument(uri);
        await vscode.window.showTextDocument(doc, { preview: false });
    }));
    // Open diff-style view: left = file, right = appropriate merged (tracked or global); reveal corresponding sections
    context.subscriptions.push(vscode.commands.registerCommand('bundler.openWithMerged', async (arg) => {
        const fp = getFilePathFromArg(arg);
        if (!fp)
            return;
        try {
            const globalList = context.globalState.get('globalFiles', []);
            const trackedList = context.workspaceState.get('trackedFiles', []);
            const linkedMergedFile = context.workspaceState.get('linkedMergedFile', '');
            const linkedGlobalMergedFile = context.globalState.get('linkedGlobalMergedFile', '');
            const useGlobal = globalList.includes(fp);
            const isTracked = trackedList.includes(fp);
            let rightUri;
            let rightTitle;
            // If it's a tracked file and we have a linked merged file, use the linked file
            if (isTracked && linkedMergedFile && fs.existsSync(linkedMergedFile)) {
                rightUri = vscode.Uri.file(linkedMergedFile);
                rightTitle = 'Linked Merged';
            }
            else if (useGlobal && linkedGlobalMergedFile && fs.existsSync(linkedGlobalMergedFile)) {
                // If it's a global file and we have a linked global merged file, use the linked file
                rightUri = vscode.Uri.file(linkedGlobalMergedFile);
                rightTitle = 'Linked Global';
            }
            else if (useGlobal) {
                rightUri = globalMergedVirtualProvider.uri;
                rightTitle = 'Global';
                globalMergedVirtualProvider.refresh();
            }
            else {
                rightUri = mergedVirtualProvider.uri;
                rightTitle = 'Merged';
                mergedVirtualProvider.refresh();
            }
            // Close any existing merged diff tabs to keep one at a time
            await closeExistingMergedDiffs([mergedVirtualProvider.uri, globalMergedVirtualProvider.uri, rightUri]);
            // Prepare merged content and compute target position on right
            const mergedDoc = await vscode.workspace.openTextDocument(rightUri);
            const rel = getRelativePath(fp);
            const marker = `│ @${rel} │`;
            const text = mergedDoc.getText();
            const idx = text.indexOf(marker);
            const targetLine = idx >= 0 ? mergedDoc.positionAt(idx).line : 0;
            const left = vscode.Uri.file(fp);
            const title = `${path.basename(fp)} ↔ ${rightTitle}`;
            await vscode.commands.executeCommand('vscode.diff', left, rightUri, title, { preview: false, preserveFocus: false });
            // Reveal both sides to their corresponding positions
            await delay(150);
            const leftEditor = vscode.window.visibleTextEditors.find(e => e.document.uri.toString() === left.toString());
            const rightEditor = vscode.window.visibleTextEditors.find(e => e.document.uri.toString() === rightUri.toString());
            if (rightEditor) {
                const posR = new vscode.Position(targetLine, 0);
                rightEditor.revealRange(new vscode.Range(posR, posR), vscode.TextEditorRevealType.AtTop);
            }
            if (leftEditor) {
                const posL = new vscode.Position(0, 0);
                leftEditor.revealRange(new vscode.Range(posL, posL), vscode.TextEditorRevealType.AtTop);
            }
        }
        catch (e) {
            console.error('Failed to open file with merged side-by-side:', e);
        }
    }));
    // Removed: copyFile (per-item)
    // Remove from tracked
    context.subscriptions.push(vscode.commands.registerCommand('bundler.removeTracked', async (arg) => {
        const fp = getFilePathFromArg(arg);
        if (!fp)
            return;
        const list = context.workspaceState.get('trackedFiles', []);
        const next = list.filter(f => f !== fp);
        await context.workspaceState.update('trackedFiles', next);
        refreshAll();
    }));
    // Move item up/down (reorder)
    // Up/Down commands removed — drag-and-drop sorting only
    // Remove from global
    context.subscriptions.push(vscode.commands.registerCommand('bundler.removeGlobal', async (arg) => {
        const fp = getFilePathFromArg(arg);
        if (!fp)
            return;
        const list = context.globalState.get('globalFiles', []);
        const next = list.filter(f => f !== fp);
        await context.globalState.update('globalFiles', next);
        refreshAll();
    }));
    // Clear all global files
    context.subscriptions.push(vscode.commands.registerCommand('bundler.clearGlobalList', async () => {
        await context.globalState.update('globalFiles', []);
        refreshAll();
    }));
    // Open global merged (live)
    context.subscriptions.push(vscode.commands.registerCommand('bundler.openGlobalMergedVirtual', async () => {
        const uri = globalMergedVirtualProvider.uri;
        const doc = await vscode.workspace.openTextDocument(uri);
        await vscode.window.showTextDocument(doc, { preview: false });
    }));
    // Link merged file
    context.subscriptions.push(vscode.commands.registerCommand('bundler.linkMergedFile', async () => {
        const currentLinkedFile = context.workspaceState.get('linkedMergedFile', '');
        let defaultPath = currentLinkedFile;
        if (!defaultPath) {
            const workspaceFolder = vscode.workspace.workspaceFolders?.[0];
            if (workspaceFolder) {
                defaultPath = path.join(workspaceFolder.uri.fsPath, 'merged-content.md');
            }
        }
        const uri = await vscode.window.showSaveDialog({
            filters: { 'Markdown': ['md'], 'Text': ['txt'], 'All Files': ['*'] },
            saveLabel: 'Link Merged File',
            defaultUri: defaultPath ? vscode.Uri.file(defaultPath) : undefined
        });
        if (!uri)
            return;
        const filePath = uri.fsPath;
        await context.workspaceState.update('linkedMergedFile', filePath);
        // Write current merged content to the file
        const tracked = context.workspaceState.get('trackedFiles', []);
        const mergedContent = computeMergedContent(context, tracked);
        try {
            fs.writeFileSync(filePath, mergedContent || '', 'utf8');
            vscode.window.showInformationMessage(`Merged file linked to: ${path.basename(filePath)}`);
        }
        catch (e) {
            vscode.window.showErrorMessage(`Failed to write to linked file: ${e}`);
        }
    }));
    // Link global merged file
    context.subscriptions.push(vscode.commands.registerCommand('bundler.linkGlobalMergedFile', async () => {
        const currentLinkedFile = context.globalState.get('linkedGlobalMergedFile', '');
        let defaultPath = currentLinkedFile;
        if (!defaultPath) {
            const workspaceFolder = vscode.workspace.workspaceFolders?.[0];
            if (workspaceFolder) {
                defaultPath = path.join(workspaceFolder.uri.fsPath, 'global-merged-content.md');
            }
            else {
                defaultPath = path.join(context.globalStorageUri.fsPath, 'global-merged-content.md');
            }
        }
        const uri = await vscode.window.showSaveDialog({
            filters: { 'Markdown': ['md'], 'Text': ['txt'], 'All Files': ['*'] },
            saveLabel: 'Link Global Merged File',
            defaultUri: defaultPath ? vscode.Uri.file(defaultPath) : undefined
        });
        if (!uri)
            return;
        const filePath = uri.fsPath;
        await context.globalState.update('linkedGlobalMergedFile', filePath);
        // Write current global merged content to the file
        const globalMergedContent = computeGlobalMergedContent(context);
        try {
            fs.writeFileSync(filePath, globalMergedContent || '', 'utf8');
            vscode.window.showInformationMessage(`Global merged file linked to: ${path.basename(filePath)}`);
        }
        catch (e) {
            vscode.window.showErrorMessage(`Failed to write to global linked file: ${e}`);
        }
    }));
    // Unlink merged file
    context.subscriptions.push(vscode.commands.registerCommand('bundler.unlinkMergedFile', async () => {
        const linkedFile = context.workspaceState.get('linkedMergedFile', '');
        if (!linkedFile) {
            vscode.window.showInformationMessage('No merged file is currently linked');
            return;
        }
        const result = await vscode.window.showWarningMessage(`Unlink merged file: ${path.basename(linkedFile)}?`, { modal: true }, 'Unlink');
        if (result === 'Unlink') {
            await context.workspaceState.update('linkedMergedFile', '');
            vscode.window.showInformationMessage(`Merged file unlinked: ${path.basename(linkedFile)}`);
        }
    }));
    // Unlink global merged file
    context.subscriptions.push(vscode.commands.registerCommand('bundler.unlinkGlobalMergedFile', async () => {
        const linkedFile = context.globalState.get('linkedGlobalMergedFile', '');
        if (!linkedFile) {
            vscode.window.showInformationMessage('No global merged file is currently linked');
            return;
        }
        const result = await vscode.window.showWarningMessage(`Unlink global merged file: ${path.basename(linkedFile)}?`, { modal: true }, 'Unlink');
        if (result === 'Unlink') {
            await context.globalState.update('linkedGlobalMergedFile', '');
            vscode.window.showInformationMessage(`Global merged file unlinked: ${path.basename(linkedFile)}`);
        }
    }));
    // Live updates when tracked/global files change in editor
    context.subscriptions.push(vscode.workspace.onDidChangeTextDocument(e => {
        const tracked = context.workspaceState.get('trackedFiles', []);
        const global = context.globalState.get('globalFiles', []);
        const fp = e.document.uri.fsPath;
        if (tracked.includes(fp)) {
            mergedVirtualProvider.refresh();
            updateLinkedFile();
        }
        if (global.includes(fp)) {
            globalMergedVirtualProvider.refresh();
            updateLinkedGlobalFile();
        }
    }), vscode.workspace.onDidSaveTextDocument(doc => {
        const tracked = context.workspaceState.get('trackedFiles', []);
        const global = context.globalState.get('globalFiles', []);
        const fp = doc.uri.fsPath;
        if (tracked.includes(fp)) {
            mergedVirtualProvider.refresh();
            updateLinkedFile();
        }
        if (global.includes(fp)) {
            globalMergedVirtualProvider.refresh();
            updateLinkedGlobalFile();
        }
    }));
}
exports.activate = activate;
class TrackedTreeItem extends vscode.TreeItem {
    constructor(filePath) {
        super(path.basename(filePath));
        this.filePath = filePath;
        this.resourceUri = vscode.Uri.file(filePath);
        this.description = getRelativePath(filePath);
        this.tooltip = filePath;
        this.contextValue = 'bundlerTrackedItem';
        // Default click opens diff view (left: file, right: merged)
        this.command = { command: 'bundler.openWithMerged', title: 'Open With Merged', arguments: [filePath] };
        this.iconPath = vscode.ThemeIcon.File;
    }
}
class BundlerTrackedProvider {
    constructor(_context) {
        this._context = _context;
        this._emitter = new vscode.EventEmitter();
        this.onDidChangeTreeData = this._emitter.event;
    }
    refresh() { this._emitter.fire(); }
    getTreeItem(e) { return e; }
    getChildren() {
        const list = this._context.workspaceState.get('trackedFiles', []);
        return Promise.resolve(list.map(f => new TrackedTreeItem(f)));
    }
}
class GlobalTreeItem extends vscode.TreeItem {
    constructor(filePath) {
        super(path.basename(filePath));
        this.filePath = filePath;
        this.resourceUri = vscode.Uri.file(filePath);
        this.description = getRelativePath(filePath);
        this.tooltip = filePath;
        this.contextValue = 'bundlerGlobalItem';
        this.command = { command: 'bundler.openWithMerged', title: 'Open With Merged', arguments: [filePath] };
        this.iconPath = vscode.ThemeIcon.File;
    }
}
class BundlerGlobalProvider {
    constructor(_context) {
        this._context = _context;
        this._emitter = new vscode.EventEmitter();
        this.onDidChangeTreeData = this._emitter.event;
    }
    refresh() { this._emitter.fire(); }
    getTreeItem(e) { return e; }
    getChildren() {
        const list = this._context.globalState.get('globalFiles', []);
        return Promise.resolve(list.map(f => new GlobalTreeItem(f)));
    }
}
class BundlerTrackedDnD {
    constructor(_context, _refresh) {
        this._context = _context;
        this._refresh = _refresh;
        this.dropMimeTypes = [
            `application/vnd.code.tree.bundlerTracked`
        ];
        this.dragMimeTypes = [
            `application/vnd.code.tree.bundlerTracked`
        ];
    }
    dispose() { }
    handleDrag(source, dataTransfer, _token) {
        dataTransfer.set('application/vnd.code.tree.bundlerTracked', new vscode.DataTransferItem(source));
    }
    async handleDrop(target, dataTransfer, _token) {
        const item = dataTransfer.get('application/vnd.code.tree.bundlerTracked');
        if (!item)
            return;
        const dragged = item.value;
        if (!dragged || dragged.length === 0)
            return;
        const list = this._context.workspaceState.get('trackedFiles', []);
        const draggedPaths = dragged.map(d => d.filePath);
        // Remove dragged from list (preserve order of remaining)
        const remaining = list.filter(p => !draggedPaths.includes(p));
        let insertIndex = typeof target?.filePath === 'string' ? remaining.indexOf(target.filePath) : remaining.length;
        if (insertIndex < 0)
            insertIndex = remaining.length;
        // Insert dragged in their current order
        const next = [
            ...remaining.slice(0, insertIndex),
            ...draggedPaths,
            ...remaining.slice(insertIndex)
        ];
        await this._context.workspaceState.update('trackedFiles', next);
        this._refresh();
    }
}
class BundlerGlobalDnD {
    constructor(_context, _refresh) {
        this._context = _context;
        this._refresh = _refresh;
        this.dropMimeTypes = [`application/vnd.code.tree.bundlerGlobal`];
        this.dragMimeTypes = [`application/vnd.code.tree.bundlerGlobal`];
    }
    dispose() { }
    handleDrag(source, dataTransfer) {
        dataTransfer.set('application/vnd.code.tree.bundlerGlobal', new vscode.DataTransferItem(source));
    }
    async handleDrop(target, dataTransfer) {
        const item = dataTransfer.get('application/vnd.code.tree.bundlerGlobal');
        if (!item)
            return;
        const dragged = item.value;
        if (!dragged || dragged.length === 0)
            return;
        const list = this._context.globalState.get('globalFiles', []);
        const draggedPaths = dragged.map(d => d.filePath);
        const remaining = list.filter(p => !draggedPaths.includes(p));
        let insertIndex = typeof target?.filePath === 'string' ? remaining.indexOf(target.filePath) : remaining.length;
        if (insertIndex < 0)
            insertIndex = remaining.length;
        const next = [...remaining.slice(0, insertIndex), ...draggedPaths, ...remaining.slice(insertIndex)];
        await this._context.globalState.update('globalFiles', next);
        this._refresh();
    }
}
// Merged tree removed per design; merged content is shown via virtual document only.
class MergedContentProvider {
    constructor(_context) {
        this._context = _context;
        this._emitter = new vscode.EventEmitter();
        this.onDidChange = this._emitter.event;
        this.uri = vscode.Uri.parse('bundler:/Merged%20Content.md');
    }
    provideTextDocumentContent() {
        const tracked = this._context.workspaceState.get('trackedFiles', []);
        return computeMergedContent(this._context, tracked);
    }
    refresh() { this._emitter.fire(this.uri); }
}
class GlobalMergedContentProvider {
    constructor(_context) {
        this._context = _context;
        this._emitter = new vscode.EventEmitter();
        this.onDidChange = this._emitter.event;
        this.uri = vscode.Uri.parse('bundler-global:/Global%20Merged.md');
    }
    provideTextDocumentContent() {
        return computeGlobalMergedContent(this._context);
    }
    refresh() { this._emitter.fire(this.uri); }
}
function getRelativePath(filePath) {
    const ws = vscode.workspace.workspaceFolders;
    if (ws) {
        for (const folder of ws) {
            if (filePath.startsWith(folder.uri.fsPath)) {
                return path.relative(folder.uri.fsPath, filePath);
            }
        }
    }
    return path.basename(filePath);
}
function getFilePathFromArg(arg) {
    if (!arg)
        return undefined;
    if (typeof arg === 'string')
        return arg;
    const maybeUri = arg;
    if (maybeUri && typeof maybeUri.fsPath === 'string' && typeof maybeUri.scheme === 'string') {
        return maybeUri.fsPath;
    }
    const anyArg = arg;
    if (anyArg.filePath && typeof anyArg.filePath === 'string')
        return anyArg.filePath;
    if (anyArg.resourceUri && anyArg.resourceUri.fsPath)
        return anyArg.resourceUri.fsPath;
    return undefined;
}
function makeBoxHeader(title) {
    // Build middle first with exactly one space on each side, then size top/bottom by length
    const innerTitle = String(title).trim();
    const inner = ` ${innerTitle} `;
    const top = '╭' + '─'.repeat(inner.length) + '╮';
    const middle = '│' + inner + '│';
    const bottom = '╰' + '─'.repeat(inner.length) + '╯';
    return `${top}\n${middle}\n${bottom}\n`;
}
function computeMergedContent(context, trackedFiles) {
    let merged = '';
    const validTracked = [];
    for (const f of trackedFiles) {
        if (fs.existsSync(f)) {
            if (trackedFiles.includes(f))
                validTracked.push(f);
            const content = fs.readFileSync(f, 'utf8');
            const cleaned = stripEmptyLines(content);
            if (!cleaned) {
                continue; // skip empty-after-clean files entirely (no header)
            }
            const rel = getRelativePath(f);
            merged += makeBoxHeader(`@${rel}`);
            merged += cleaned + '\n';
        }
    }
    if (validTracked.length !== trackedFiles.length) {
        context.workspaceState.update('trackedFiles', validTracked);
    }
    return merged;
}
function computeGlobalMergedContent(context) {
    let merged = '';
    const list = context.globalState.get('globalFiles', []);
    for (const f of list) {
        if (!fs.existsSync(f))
            continue;
        const content = fs.readFileSync(f, 'utf8');
        const cleaned = stripEmptyLines(content);
        if (!cleaned)
            continue;
        const rel = getRelativePath(f);
        merged += makeBoxHeader(`@${rel}`);
        merged += cleaned + '\n';
    }
    return merged;
}
function stripEmptyLines(text) {
    return text
        .split(/\r?\n/)
        .filter(line => line.trim() !== '')
        .join('\n');
}
function delay(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
}
async function closeExistingMergedDiffs(mergedUris) {
    const arr = Array.isArray(mergedUris) ? mergedUris : [mergedUris];
    const set = new Set(arr.map(u => u.toString()));
    const editors = vscode.window.visibleTextEditors.filter(e => set.has(e.document.uri.toString()));
    for (const ed of editors) {
        try {
            await vscode.window.showTextDocument(ed.document, { viewColumn: ed.viewColumn, preview: false, preserveFocus: false });
            await vscode.commands.executeCommand('workbench.action.closeActiveEditor');
        }
        catch { }
    }
}
async function openOutputFile(context) {
    const tracked = context.workspaceState.get('trackedFiles', []);
    const merged = computeMergedContent(context, tracked);
    let target = context.workspaceState.get('outputFile', '');
    if (!target) {
        const uri = await vscode.window.showSaveDialog({
            filters: { 'Markdown': ['md'], 'Text': ['txt'], 'All Files': ['*'] },
            saveLabel: 'Save Merged Content As'
        });
        if (!uri)
            return;
        target = uri.fsPath;
        await context.workspaceState.update('outputFile', target);
    }
    try {
        fs.writeFileSync(target, merged || '', 'utf8');
    }
    catch (e) {
        console.error('Failed to write merged content:', e);
    }
    try {
        const doc = await vscode.workspace.openTextDocument(target);
        await vscode.window.showTextDocument(doc);
    }
    catch (e) {
        console.error('Failed to open merged file:', e);
    }
}
function deactivate() { }
exports.deactivate = deactivate;
//# sourceMappingURL=extension.js.map