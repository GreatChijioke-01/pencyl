import React from "react";
import type { FileNode } from "./types";
import getFileIcon from "./fileIcons";
import { Trash2, ChevronDown, ChevronRight, Folder, FileText, Pencil } from "lucide-react";
import "./fileTree.css";

interface FileItemProps {
  node: FileNode;
  level?: number;
  rootPath: string;
  selectedPath: string | null;
  isCreating: "file" | "folder" | null;
  creationTargetPath: string | null;
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
}

function FileItem({
  node,
  level = 0,
  rootPath,
  selectedPath,
  isCreating,
  creationTargetPath,
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
}: FileItemProps) {
  const isSelected = selectedPath === node.path;
  const isRenaming = renamingPath === node.path;
  const isRootNode = node.path === rootPath;
  const isFolder = node.is_directory;
  const isOpen = isFolder ? node.isOpen ?? false : false;
  const isLoadingChildren = Boolean(loadingFolders[node.path]);

  const handleClick = (event: React.MouseEvent) => {
    event.stopPropagation();
    onSelectNode(node.path, isFolder);

    if (isFolder) {
      onToggleOpen(node.path);
      return;
    }

    onFileOpen?.(node.path);
  };

  const handleDragStart = (event: React.DragEvent) => {
    event.dataTransfer.setData("text/plain", node.path);
    event.dataTransfer.effectAllowed = "move";
  };

  const handleDrop = (event: React.DragEvent) => {
    if (!isFolder) return;
    event.preventDefault();
    event.stopPropagation();
    const sourcePath = event.dataTransfer.getData("text/plain");
    if (!sourcePath || sourcePath === node.path) return;
    onMoveNode(sourcePath, node.path);
    onRequestRefresh();
  };

  const handleRenameSubmit = (event: React.KeyboardEvent<HTMLInputElement>) => {
    if (event.key === "Enter") {
      event.preventDefault();
      onSubmitRename(node);
    } else if (event.key === "Escape") {
      event.preventDefault();
      onCancelRename();
    }
  };

  const renderLabel = () => {
    if (isRenaming) {
      return (
        <input
          className="ft-inline-input"
          value={renameValue}
          autoFocus
          onChange={(event) => onRenameValueChange(event.target.value)}
          onBlur={onCancelRename}
          onKeyDown={handleRenameSubmit}
        />
      );
    }

    return <div className="ft-name">{node.name}</div>;
  };

  return (
    <div className="ft-item" key={node.path}>
      <div
        className={`ft-row ${isFolder ? "ft-folder" : "ft-file"} ${isSelected ? "ft-selected" : ""}`}
        style={{ paddingLeft: 12 + level * 16 }}
        onClick={handleClick}
        draggable
        onDragStart={handleDragStart}
        onDragOver={(event) => {
          if (isFolder) {
            event.preventDefault();
            event.dataTransfer.dropEffect = "move";
          }
        }}
        onDrop={handleDrop}
      >
        <div className="ft-icon">{getFileIcon(node.name, isFolder)}</div>
        {renderLabel()}
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

      {isFolder && isOpen && (
        <div className="ft-children">
          {creationTargetPath === node.path && isCreating && (
            <div className="ft-row ft-create-row" style={{ paddingLeft: 12 + (level + 1) * 16 }}>
              <div className="ft-icon">{isCreating === "folder" ? <Folder size={14} /> : <FileText size={14} />}</div>
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
          )}

          {node.children?.map((child) => (
            <FileItem
              key={child.path}
              node={child}
              level={level + 1}
              rootPath={rootPath}
              selectedPath={selectedPath}
              isCreating={isCreating}
              creationTargetPath={creationTargetPath}
              newItemName={newItemName}
              renamingPath={renamingPath}
              renameValue={renameValue}
              loadingFolders={loadingFolders}
              onSelectNode={onSelectNode}
              onToggleOpen={onToggleOpen}
              onStartRename={onStartRename}
              onDeleteNode={onDeleteNode}
              onMoveNode={onMoveNode}
              onRenameValueChange={onRenameValueChange}
              onSubmitRename={onSubmitRename}
              onCancelRename={onCancelRename}
              onNewItemNameChange={onNewItemNameChange}
              onSubmitNewItem={onSubmitNewItem}
              onCancelCreate={onCancelCreate}
              onFileOpen={onFileOpen}
              onRequestRefresh={onRequestRefresh}
            />
          ))}
        </div>
      )}
    </div>
  );
}

function areEqual(previousProps: FileItemProps, nextProps: FileItemProps) {
  return (
    previousProps.node === nextProps.node &&
    previousProps.level === nextProps.level &&
    previousProps.rootPath === nextProps.rootPath &&
    previousProps.selectedPath === nextProps.selectedPath &&
    previousProps.isCreating === nextProps.isCreating &&
    previousProps.creationTargetPath === nextProps.creationTargetPath &&
    previousProps.newItemName === nextProps.newItemName &&
    previousProps.renamingPath === nextProps.renamingPath &&
    previousProps.renameValue === nextProps.renameValue &&
    previousProps.loadingFolders[previousProps.node.path] === nextProps.loadingFolders[nextProps.node.path] &&
    previousProps.onSelectNode === nextProps.onSelectNode &&
    previousProps.onToggleOpen === nextProps.onToggleOpen &&
    previousProps.onStartRename === nextProps.onStartRename &&
    previousProps.onDeleteNode === nextProps.onDeleteNode &&
    previousProps.onMoveNode === nextProps.onMoveNode &&
    previousProps.onRenameValueChange === nextProps.onRenameValueChange &&
    previousProps.onSubmitRename === nextProps.onSubmitRename &&
    previousProps.onCancelRename === nextProps.onCancelRename &&
    previousProps.onNewItemNameChange === nextProps.onNewItemNameChange &&
    previousProps.onSubmitNewItem === nextProps.onSubmitNewItem &&
    previousProps.onCancelCreate === nextProps.onCancelCreate &&
    previousProps.onFileOpen === nextProps.onFileOpen &&
    previousProps.onRequestRefresh === nextProps.onRequestRefresh
  );
}

export default React.memo(FileItem, areEqual);
