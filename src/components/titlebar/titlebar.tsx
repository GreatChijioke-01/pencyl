import { useEffect, useState, useRef } from "react";
import { getCurrentWindow } from "@tauri-apps/api/window";
import { open, save } from "@tauri-apps/plugin-dialog";
import { writeFileContent, readFileContent, readDirTree } from "../../services/fileService";
import { useFileStore } from "../../store/filestore";
import { X, Minus, Square, Maximize2, Circle, PanelLeft, FolderGit2, Menu, Search } from "lucide-react";
import getFileIcon from "../sidebar/fileTree/fileIcons";
import "./titlebar.css";

type TitleBarProps = {
  onOpenSettings: () => void;
};

export default function TitleBar({ onOpenSettings }: TitleBarProps) {
  const [isMaximized, setIsMaximized] = useState(false);
  const [appWindow, setAppWindow] = useState<any | null>(null);
  const files = useFileStore((state) => state.files);
  const activeFileId = useFileStore((state) => state.activeFileId);
  const addFile = useFileStore((state) => state.addFile);
  const removeFile = useFileStore((state) => state.removeFile);
  const updateActiveFile = useFileStore((state) => state.updateActiveFile);
  const reorderFiles = useFileStore((state) => state.reorderFiles);
  const [isMenuOpen, setIsMenuOpen] = useState(false);
  const [dragIndex, setDragIndex] = useState<number | null>(null);
  const [dragOverIndex, setDragOverIndex] = useState<number | null>(null);
  const [searchQuery, setSearchQuery] = useState("");
  const [searchResults, setSearchResults] = useState<{ name: string; path: string; isDirectory: boolean }[]>([]);
  const [isSearchOpen, setIsSearchOpen] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);
  const searchRef = useRef<HTMLDivElement>(null);
  const dragState = useRef({
    fromIndex: null as number | null,
    startX: 0,
    isDragging: false,
  });
  const dragOverIndexRef = useRef<number | null>(null);

  // Keep ref in sync with state
  dragOverIndexRef.current = dragOverIndex;

  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) {
        setIsMenuOpen(false);
      }
      if (searchRef.current && !searchRef.current.contains(e.target as Node)) {
        setIsSearchOpen(false);
      }
    };
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  // Search: flatten tree and filter by query
  useEffect(() => {
    if (!searchQuery.trim()) {
      setSearchResults([]);
      return;
    }

    const rootPath = (globalThis as any).__PENCYL_PROJECT_ROOT_PATH;
    if (!rootPath) return;

    const q = searchQuery.toLowerCase();
    let cancelled = false;

    const doSearch = async () => {
      try {
        const tree = await readDirTree(rootPath);
        if (cancelled) return;

        const results: { name: string; path: string; isDirectory: boolean }[] = [];

        const flatten = (node: any) => {
          if (node.name.toLowerCase().includes(q)) {
            results.push({ name: node.name, path: node.path, isDirectory: node.is_directory });
          }
          if (node.children) {
            node.children.forEach(flatten);
          }
        };

        flatten(tree);
        results.sort((a, b) => a.name.localeCompare(b.name));
        setSearchResults(results.slice(0, 50)); // limit to 50 results
      } catch (err) {
        console.error("Search failed:", err);
      }
    };

    doSearch();

    return () => { cancelled = true; };
  }, [searchQuery]);

  const handleSearchSelect = async (node: { name: string; path: string; isDirectory: boolean }) => {
    setIsSearchOpen(false);
    setSearchQuery("");

    if (node.isDirectory) {
      // Show in sidebar file tree
      const ev = new CustomEvent("pencyl:show-file-in-tree", { detail: node.path });
      window.dispatchEvent(ev);
      return;
    }

    // Open file
    const existingFile = files.find((f) => f.path === node.path);
    if (existingFile) {
      updateActiveFile(existingFile.id);
    } else {
      try {
        const content = await readFileContent(node.path);
        addFile({
          id: node.path,
          path: node.path,
          name: node.name,
          content,
          isDirty: false,
          kind: "file",
        });
      } catch (err) {
        console.error("Failed to open file from search:", err);
      }
    }
  };

  // Global drag handlers - attached once on mount, uses refs for state
  useEffect(() => {
    const handleGlobalMouseMove = (e: MouseEvent) => {
      if (dragState.current.fromIndex === null) return;
      
      const dx = Math.abs(e.clientX - dragState.current.startX);
      if (dx > 5) {
        dragState.current.isDragging = true;
      }
      
      if (dragState.current.isDragging) {
        const tabs = document.querySelectorAll('.titlebar-tab');
        let targetIndex = -1;
        tabs.forEach((tab, i) => {
          const rect = tab.getBoundingClientRect();
          if (e.clientX >= rect.left && e.clientX <= rect.right) {
            targetIndex = i;
          }
        });
        setDragOverIndex(targetIndex >= 0 ? targetIndex : null);
      }
    };

    const handleGlobalMouseUp = () => {
      if (dragState.current.isDragging && dragState.current.fromIndex !== null && dragOverIndexRef.current !== null && dragState.current.fromIndex !== dragOverIndexRef.current) {
        reorderFiles(dragState.current.fromIndex, dragOverIndexRef.current);
      }
      dragState.current.fromIndex = null;
      dragState.current.isDragging = false;
      setDragIndex(null);
      setDragOverIndex(null);
    };

    document.addEventListener("mousemove", handleGlobalMouseMove);
    document.addEventListener("mouseup", handleGlobalMouseUp);
    return () => {
      document.removeEventListener("mousemove", handleGlobalMouseMove);
      document.removeEventListener("mouseup", handleGlobalMouseUp);
    };
  }, [reorderFiles]);

  useEffect(() => {
    try {
      setAppWindow(getCurrentWindow());
    } catch (error) {
      console.warn("Tauri window API unavailable:", error);
    }
  }, []);

  useEffect(() => {
    if (!appWindow) return;
    appWindow.isMaximized().then(setIsMaximized);
  }, [appWindow]);

  const handleMinimize = () => appWindow?.minimize();
  const handleMaximize = async () => {
    if (!appWindow) return;
    await appWindow.toggleMaximize();
    setIsMaximized(await appWindow.isMaximized());
  };
  const handleClose = () => appWindow?.close();

  const handleOpenFile = async () => {
    try {
      const selectedPath = await open({
        multiple: false,
        title: "Open file",
      });
      const path = Array.isArray(selectedPath) ? selectedPath[0] : selectedPath;

      if (!path || typeof path !== "string") {
        return;
      }

      const existingFile = files.find((f) => f.path === path);

      if (existingFile) {
        updateActiveFile(existingFile.id);
        // request sidebar to show only this file in the file tree
        const ev = new CustomEvent("pencyl:show-file-in-tree", { detail: path });
        window.dispatchEvent(ev);
      } else {
        const content = await readFileContent(path);
        const fileName = path.split("\\").pop()?.split("/").pop() || "Untitled";

        addFile({
          id: path,
          path,
          name: fileName,
          content,
          isDirty: false,
          kind: "file",
        });
        // request sidebar to show only this file in the file tree
        const ev = new CustomEvent("pencyl:show-file-in-tree", { detail: path });
        window.dispatchEvent(ev);
      }
    } catch (error) {
      console.error("Failed to open file:", error);
    }
  };

  const handleOpenFolder = async () => {
    // Delegate to Sidebar's handler via a custom event so behavior is identical
    const ev = new CustomEvent("pencyl:open-folder");
    window.dispatchEvent(ev);
  };

  const handleOpenTerminal = () => {
    const existingTerminal = files.find((f) => f.kind === "terminal");
    if (existingTerminal) {
      updateActiveFile(existingTerminal.id);
    } else {
      const id = `terminal-${Date.now()}-${Math.floor(Math.random() * 100000)}`;
      addFile({
        id,
        path: "",
        name: "Terminal",
        content: "Welcome to the terminal. Type a command and press Enter or Run.\n",
        isDirty: false,
        kind: "terminal",
      });
    }
  };

  const handleSave = async () => {
    if (!activeFileId) return;
    const file = files.find((f) => f.id === activeFileId);
    if (!file) return;
    if (file.kind !== "file") return;

    try {
      if (file.path && file.path.length > 0) {
        await writeFileContent(file.path, file.content);
        // mark clean
        const markFileClean = useFileStore.getState().markFileClean;
        markFileClean(file.id);
      } else {
        // fallback to Save As
        await handleSaveAs();
      }
    } catch (err) {
      console.error("Failed to save file:", err);
    }
  };

  // Allow global Ctrl-S shortcut (wired via App/useKeyboardShortcuts) to call the same Save logic
  useEffect(() => {
    const onSaveShortcut = () => {
      void handleSave();
    };

    window.addEventListener("pencyl:titlebar-save", onSaveShortcut);
    return () => {
      window.removeEventListener("pencyl:titlebar-save", onSaveShortcut);
    };
    // Intentionally depend on handleSave via state/closure.
  }, [handleSave]);

  // Allow global terminal toggle shortcut to call the same Terminal open logic
  useEffect(() => {
    const handler = () => handleOpenTerminal();
    window.addEventListener("pencyl:open-terminal", handler);
    return () => window.removeEventListener("pencyl:open-terminal", handler);
  }, [handleOpenTerminal]);


  const handleSaveAs = async () => {
    if (!activeFileId) return;
    const file = files.find((f) => f.id === activeFileId);
    if (!file) return;
    if (file.kind !== "file") return;

    try {
      // Use a save dialog so users can pick a target filename/location
      const selectedPath = await save({ defaultPath: file.name, title: "Save file" });
      const path = Array.isArray(selectedPath) ? selectedPath[0] : selectedPath;

      if (!path || typeof path !== "string") {
        return;
      }

      await writeFileContent(path, file.content);
      const fileName = path.split("\\").pop()?.split("/").pop() || file.name;
      useFileStore.getState().saveAsFile(file.id, path, fileName);
    } catch (err) {
      console.error("Failed Save As:", err);
    }
  };


  return (
    <div className="titlebar">
      {/* Left: Panel left & Source control */}
      <div className="titlebar-left">
        <button className="titlebar-button" onClick={() => window.dispatchEvent(new CustomEvent("pencyl:toggle-sidebar"))} title="Toggle Sidebar">
          <PanelLeft size={16} />
        </button>
        <button className="titlebar-button" onClick={() => window.dispatchEvent(new CustomEvent("pencyl:open-source-control"))} title="Source Control">
          <FolderGit2 size={16} />
        </button>
      </div>

      {/* Center: Active File Name */}
      <div 
        className="titlebar-center" 
        style={{ overflowX: "auto", display: "flex", gap: "6px", alignItems: "center", padding: "0 12px" }}
      >
        {files.length === 0 ? (
          <span className="active-file">No file open</span>
        ) : (
          files.map((file, index) => {
            const isThisDragging = dragIndex === index;
            const isThisDragOver = dragOverIndex === index && dragIndex !== null && dragIndex !== index;
            let className = `titlebar-tab${activeFileId === file.id ? " active" : ""}`;
            if (isThisDragging) className += " dragging";
            if (isThisDragOver) className += " drag-over";

            return (
              <div
                key={file.id}
                className={className}
                onClick={() => updateActiveFile(file.id)}
                role="button"
                tabIndex={0}
                onMouseDown={(e) => {
                  // Only start drag on left click
                  if (e.button !== 0) return;
                  // Don't start drag if clicking the close button
                  const target = e.target as HTMLElement;
                  if (target.closest('.titlebar-tab-close')) return;
                  
                  dragState.current.fromIndex = index;
                  dragState.current.startX = e.clientX;
                  dragState.current.isDragging = false;
                  setDragIndex(index);
                }}
                onMouseLeave={() => {
                  if (dragState.current.isDragging && dragState.current.fromIndex === index) {
                    setDragOverIndex(null);
                  }
                }}
              >
                <span className="titlebar-tab-label">
                  {file.name}
                  {file.isDirty && <Circle size={8} className="titlebar-dirty-indicator" />}
                </span>
                <button
                  className="titlebar-tab-close"
                  onClick={(e) => {
                    e.stopPropagation();
                    removeFile(file.id);
                  }}
                  title="Close"
                >
                  <X size={12} />
                </button>
              </div>
            );
          })
        )}
      </div>

      {/* Right: Search + Hamburger Menu + Window Controls */}
      <div className="titlebar-right">
        {/* Search Bar */}
        <div className="titlebar-search-container" ref={searchRef}>
          <Search size={14} className="titlebar-search-icon" />
          <input
            type="text"
            className="titlebar-search-input"
            placeholder="Search files..."
            value={searchQuery}
            onChange={(e) => { setSearchQuery(e.target.value); setIsSearchOpen(true); }}
            onFocus={() => searchQuery && setIsSearchOpen(true)}
          />
          {isSearchOpen && searchResults.length > 0 && (
            <div className="titlebar-search-dropdown">
              {searchResults.map((node) => (
                <div
                  key={node.path}
                  className="titlebar-search-item"
                  onClick={() => handleSearchSelect(node)}
                >
                  {getFileIcon(node.name, node.isDirectory)}
                  <span className="titlebar-search-item-name">{node.name}</span>
                  <span className="titlebar-search-item-path">{node.path}</span>
                </div>
              ))}
            </div>
          )}
        </div>

        <div className="titlebar-menu-container" ref={menuRef}>
          <button className="titlebar-button" onClick={() => setIsMenuOpen(!isMenuOpen)} title="Menu">
            <Menu size={16} />
          </button>
          {isMenuOpen && (
            <div className="titlebar-dropdown">
              <button onClick={() => { handleOpenFile(); setIsMenuOpen(false); }}>Open File</button>
              <button onClick={() => { handleOpenFolder(); setIsMenuOpen(false); }}>Open Folder</button>
              <button onClick={() => { handleOpenTerminal(); setIsMenuOpen(false); }}>Terminal</button>
              <button onClick={() => { handleSave(); setIsMenuOpen(false); }}>Save</button>
              <button onClick={() => { handleSaveAs(); setIsMenuOpen(false); }}>Save As</button>
              <button onClick={() => { onOpenSettings(); setIsMenuOpen(false); }}>Settings</button>
            </div>
          )}
        </div>
        {/* Window Controls */}
        <div className="window-controls">
          <button
            className="window-button minimize"
            onClick={handleMinimize}
            title="Minimize"
          >
            <Minus size={12} />
          </button>
          <button
            className="window-button maximize"
            onClick={handleMaximize}
            title={isMaximized ? "Restore" : "Maximize"}
          >
            {isMaximized ? <Maximize2 size={12} /> : <Square size={12} />}
          </button>
          <button
            className="window-button close"
            onClick={handleClose}
            title="Close"
          >
            <X size={12} />
          </button>
        </div>
      </div>
    </div>
  );
}
