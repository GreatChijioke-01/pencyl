import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { deletePath, movePath, readDirTree, renamePath } from "../../../services/fileService";
import { FileNode } from "./types";
import { findTreeNode, mergeTreeState, updateTreeNode } from "./treeUtils";
import getFileIcon from "./fileIcons";
import { Trash2, ChevronDown, ChevronRight, Folder, FileText, Pencil } from "lucide-react";
import "./fileTree.css";

interface FileTreeProps {
  rootPath: string;
  onFileOpen?: (path: string) => void;
  refreshToken?: number;
  selectedPath: string | null;
  creationTargetPath: string | null;
  isCreating: "file" | "folder" | null;
  newItemName: string;
  onSelectNode: (path: string | null, isDirectory: boolean) => void;
  onNewItemNameChange: (value: string) => void;
  onSubmitNewItem: () => void;
  onCancelCreate: () => void;
  onRequestRefresh: () => void;
}

type VisibleRow =
  | {
      kind: "node";
      node: FileNode;
      level: number;
    }
  | {
      kind: "create";
      path: string;
      level: number;
      isFolder: boolean;
    };

const ROW_HEIGHT = 32;
const OVERSCAN_ROWS = 8;

const TreeRow = React.memo(function TreeRow({
  row,
  rootPath,
  selectedPath,
  isCreating,
  newItemName,
  renamingPath,
  renameValue,
  loadingFolders,
  onSelectNode,
  onToggleOpen,
  onStartRename,
  onDeleteNode,
  onMoveNode,
  onRenameValueChange,
  onSubmitRename,
  onCancelRename,
  onNewItemNameChange,
  onSubmitNewItem,
  onCancelCreate,
  onFileOpen,
  onRequestRefresh,
}: {
  row: VisibleRow;
  rootPath: string;
  selectedPath: string | null;
  isCreating: "file" | "folder" | null;
  newItemName: string;
  renamingPath: string | null;
  renameValue: string;
  loadingFolders: Record<string, boolean>;
  onSelectNode: (path: string | null, isDirectory: boolean) => void;
  onToggleOpen: (path: string) => void;
  onStartRename: (node: FileNode) => void;
  onDeleteNode: (node: FileNode) => void;
  onMoveNode: (sourcePath: string, targetFolderPath: string) => void;
  onRenameValueChange: (value: string) => void;
  onSubmitRename: (node: FileNode) => void;
  onCancelRename: () => void;
  onNewItemNameChange: (value: string) => void;
  onSubmitNewItem: () => void;
  onCancelCreate: () => void;
  onFileOpen?: (path: string) => void;
  onRequestRefresh: () => void;
}) {
  if (row.kind === "create") {
    return (
      <div className="ft-row ft-create-row" style={{ paddingLeft: 12 + row.level * 16, height: ROW_HEIGHT }}>
        <div className="ft-icon">{row.isFolder ? <Folder size={14} /> : <FileText size={14} />}</div>
        <input
          className="ft-inline-input"
          value={newItemName}
          autoFocus
          placeholder={isCreating === "file" ? "new-file.ts" : "new-folder"}
          onChange={(event) => onNewItemNameChange(event.target.value)}
          onBlur={onCancelCreate}
          onKeyDown={(event) => {
            if (event.key === "Enter") {
              event.preventDefault();
              onSubmitNewItem();
            } else if (event.key === "Escape") {
              event.preventDefault();
              onCancelCreate();
            }
          }}
        />
      </div>
    );
  }

  const node = row.node;
  const isSelected = selectedPath === node.path;
  const isRenaming = renamingPath === node.path;
  const isRootNode = node.path === rootPath;
  const isFolder = node.is_directory;
  const isOpen = isFolder ? node.isOpen ?? false : false;
  const isLoadingChildren = Boolean(loadingFolders[node.path]);

  return (
    <div className="ft-item">
      <div
        className={`ft-row ${isFolder ? "ft-folder" : "ft-file"} ${isSelected ? "ft-selected" : ""}`}
        style={{ paddingLeft: 12 + row.level * 16, height: ROW_HEIGHT }}
        onClick={(event) => {
          event.stopPropagation();
          onSelectNode(node.path, isFolder);

          if (isFolder) {
            onToggleOpen(node.path);
            return;
          }

          onFileOpen?.(node.path);
        }}
        draggable
        onDragStart={(event) => {
          event.dataTransfer.setData("text/plain", node.path);
          event.dataTransfer.effectAllowed = "move";
        }}
        onDragOver={(event) => {
          if (isFolder) {
            event.preventDefault();
            event.dataTransfer.dropEffect = "move";
          }
        }}
        onDrop={(event) => {
          if (!isFolder) return;
          event.preventDefault();
          event.stopPropagation();
          const sourcePath = event.dataTransfer.getData("text/plain");
          if (!sourcePath || sourcePath === node.path) return;
          onMoveNode(sourcePath, node.path);
          onRequestRefresh();
        }}
      >
        <div className="ft-icon">{getFileIcon(node.name, isFolder)}</div>
        {isRenaming ? (
          <input
            className="ft-inline-input"
            value={renameValue}
            autoFocus
            onChange={(event) => onRenameValueChange(event.target.value)}
            onBlur={onCancelRename}
            onKeyDown={(event) => {
              if (event.key === "Enter") {
                event.preventDefault();
                onSubmitRename(node);
              } else if (event.key === "Escape") {
                event.preventDefault();
                onCancelRename();
              }
            }}
          />
        ) : (
          <div className="ft-name">{node.name}</div>
        )}
        <div className="ft-actions">
          {isFolder && (
            <button
              className="ft-action-button"
              onClick={(event) => {
                event.stopPropagation();
                onToggleOpen(node.path);
              }}
              title={isOpen ? "Collapse" : "Expand"}
            >
              {isLoadingChildren ? <span className="ft-spinner" /> : isOpen ? <ChevronDown size={14} /> : <ChevronRight size={14} />}
            </button>
          )}
          {!isRootNode && (
            <>
              <button className="ft-action-button" onClick={(event) => { event.stopPropagation(); onStartRename(node); }} title="Rename">
                <Pencil size={14} />
              </button>
              <button className="ft-action-button ft-danger" onClick={(event) => { event.stopPropagation(); onDeleteNode(node); }} title="Delete">
                <Trash2 size={14} />
              </button>
            </>
          )}
        </div>
      </div>
    </div>
  );
});

export default function FileTree({
  rootPath,
  onFileOpen,
  refreshToken,
  selectedPath,
  creationTargetPath,
  isCreating,
  newItemName,
  onSelectNode,
  onNewItemNameChange,
  onSubmitNewItem,
  onCancelCreate,
  onRequestRefresh,
}: FileTreeProps) {
  const [tree, setTree] = useState<FileNode | null>(null);
  const treeRef = useRef<FileNode | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [renamingPath, setRenamingPath] = useState<string | null>(null);
  const [renameValue, setRenameValue] = useState("");
  const [loadingFolders, setLoadingFolders] = useState<Record<string, boolean>>({});
  const [scrollTop, setScrollTop] = useState(0);
  const [viewportHeight, setViewportHeight] = useState(0);
  const viewportRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    treeRef.current = tree;
  }, [tree]);

  const setFolderLoading = useCallback((path: string, isLoading: boolean) => {
    setLoadingFolders((current) => {
      if (!isLoading) {
        if (!current[path]) return current;
        const next = { ...current };
        delete next[path];
        return next;
      }

      if (current[path]) return current;
      return { ...current, [path]: true };
    });
  }, []);

  const loadTreeSnapshot = useCallback(async (path: string) => {
    const snapshot = await readDirTree(path);
    setTree((previous) => mergeTreeState(snapshot as unknown as FileNode, previous));
  }, []);

  useEffect(() => {
    if (!rootPath) return;
    setLoading(true);
    loadTreeSnapshot(rootPath)
      .then(() => setError(null))
      .catch((err) => setError(String(err)))
      .finally(() => setLoading(false));
  }, [rootPath, refreshToken, loadTreeSnapshot]);

  useEffect(() => {
    if (!creationTargetPath) return;
    setTree((previous) => updateTreeNode(previous, creationTargetPath, (node) => ({ ...node, isOpen: true })));
  }, [creationTargetPath]);

  const handleStartRename = useCallback((node: FileNode) => {
    setRenamingPath(node.path);
    setRenameValue(node.name);
  }, []);

  const handleCancelRename = useCallback(() => {
    setRenamingPath(null);
    setRenameValue("");
  }, []);

  const handleSubmitRename = useCallback(async (node: FileNode) => {
    const nextName = renameValue.trim();
    if (!nextName) {
      handleCancelRename();
      return;
    }

    const separator = node.path.includes("\\") ? "\\" : "/";
    const parentPath = node.path.split(separator).slice(0, -1).join(separator);
    const nextPath = parentPath ? `${parentPath}${separator}${nextName}` : nextName;

    try {
      await renamePath(node.path, nextPath);
      if (selectedPath === node.path) {
        onSelectNode(nextPath, node.is_directory);
      }
      handleCancelRename();
      onRequestRefresh();
    } catch (err) {
      console.error("Failed to rename item:", err);
    }
  }, [handleCancelRename, onRequestRefresh, onSelectNode, renameValue, selectedPath]);

  const handleDeleteNode = useCallback(async (node: FileNode) => {
    try {
      await deletePath(node.path);
      if (selectedPath === node.path) {
        onSelectNode(rootPath, true);
      }
      onRequestRefresh();
    } catch (err) {
      console.error("Failed to delete item:", err);
    }
  }, [onRequestRefresh, onSelectNode, rootPath, selectedPath]);

  const handleMoveNode = useCallback(async (sourcePath: string, targetFolderPath: string) => {
    try {
      await movePath(sourcePath, targetFolderPath);
      onRequestRefresh();
    } catch (err) {
      console.error("Failed to move item:", err);
    }
  }, [onRequestRefresh]);

  const handleToggleOpen = useCallback(async (path: string) => {
    const currentTree = treeRef.current;
    const targetNode = findTreeNode(currentTree, path);
    if (!targetNode) return;

    if (targetNode.isOpen) {
      setTree((current) => updateTreeNode(current, path, (node) => ({ ...node, isOpen: false })));
      return;
    }

    if (targetNode.children == null) {
      setFolderLoading(path, true);
      try {
        const snapshot = await readDirTree(path);
        setTree((current) =>
          updateTreeNode(current, path, (node) => ({
            ...node,
            isOpen: true,
            children: (snapshot as unknown as FileNode).children ?? [],
          }))
        );
      } catch (err) {
        console.error("Failed to load folder children:", err);
      } finally {
        setFolderLoading(path, false);
      }
      return;
    }

    setTree((current) => updateTreeNode(current, path, (node) => ({ ...node, isOpen: true })));
  }, [setFolderLoading]);

  const visibleRows = useMemo(() => {
    const rows: VisibleRow[] = [];

    const walk = (node: FileNode, level: number) => {
      rows.push({ kind: "node", node, level });

      if (!node.is_directory || !node.isOpen) {
        return;
      }

      if (creationTargetPath === node.path && isCreating) {
        rows.push({ kind: "create", path: `create:${node.path}`, level: level + 1, isFolder: isCreating === "folder" });
      }

      for (const child of node.children ?? []) {
        walk(child, level + 1);
      }
    };

    if (tree) {
      walk(tree, 0);
    }

    return rows;
  }, [creationTargetPath, isCreating, tree]);

  const startIndex = Math.max(0, Math.floor(scrollTop / ROW_HEIGHT) - OVERSCAN_ROWS);
  const virtualizationEnabled = viewportHeight > 0;
  const endIndex = virtualizationEnabled
    ? Math.min(
        visibleRows.length,
        Math.ceil((scrollTop + viewportHeight) / ROW_HEIGHT) + OVERSCAN_ROWS
      )
    : visibleRows.length;
  const effectiveStartIndex = virtualizationEnabled ? startIndex : 0;
  const topSpacerHeight = startIndex * ROW_HEIGHT;
  const bottomSpacerHeight = Math.max(0, (visibleRows.length - endIndex) * ROW_HEIGHT);

  useEffect(() => {
    const element = viewportRef.current;
    if (!element) return;

    const updateViewportHeight = () => {
      setViewportHeight(element.clientHeight);
    };

    updateViewportHeight();
    const observer = new ResizeObserver(updateViewportHeight);
    observer.observe(element);

    return () => {
      observer.disconnect();
    };
  }, []);

  if (!rootPath) return <div className="ft-empty">No folder selected.</div>;
  if (loading) return <div className="ft-loading">Loading…</div>;
  if (error) return <div className="ft-error">{error}</div>;
  if (!tree) return <div className="ft-empty">Empty folder</div>;

  return (
    <div className="ft-root">
      <div
        className="ft-viewport"
        ref={viewportRef}
        onScroll={(event) => setScrollTop(event.currentTarget.scrollTop)}
      >
        <div style={{ height: virtualizationEnabled ? topSpacerHeight : 0 }} />
        {visibleRows.slice(effectiveStartIndex, endIndex).map((row) => (
          <TreeRow
            key={row.kind === "node" ? row.node.path : row.path}
            row={row}
            rootPath={rootPath}
            selectedPath={selectedPath}
            isCreating={isCreating}
            newItemName={newItemName}
            renamingPath={renamingPath}
            renameValue={renameValue}
            loadingFolders={loadingFolders}
            onSelectNode={onSelectNode}
            onToggleOpen={handleToggleOpen}
            onStartRename={handleStartRename}
            onDeleteNode={handleDeleteNode}
            onMoveNode={handleMoveNode}
            onRenameValueChange={setRenameValue}
            onSubmitRename={handleSubmitRename}
            onCancelRename={handleCancelRename}
            onNewItemNameChange={onNewItemNameChange}
            onSubmitNewItem={onSubmitNewItem}
            onCancelCreate={onCancelCreate}
            onFileOpen={onFileOpen}
            onRequestRefresh={onRequestRefresh}
          />
        ))}
        <div style={{ height: virtualizationEnabled ? bottomSpacerHeight : 0 }} />
      </div>
    </div>
  );
}
