import { useEffect, useState, useRef } from "react";
import { getCurrentWindow } from "@tauri-apps/api/window";
import { open, save } from "@tauri-apps/plugin-dialog";
import { writeFileContent, readFileContent, searchFiles } from "../../services/fileService";
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
  const [searchResults, setSearchResults] = useState<{ name: string; path: string; relativePath: string; isDirectory: boolean }[]>([]);
  const [selectedIndex, setSelectedIndex] = useState<number>(-1);
  const [isSearchOpen, setIsSearchOpen] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);
  const searchRef = useRef<HTMLDivElement>(null);
  const selectedItemRef = useRef<HTMLDivElement>(null);
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

  // Scroll selected search result into view during keyboard navigation
  useEffect(() => {
    if (selectedItemRef.current) {
      selectedItemRef.current.scrollIntoView({ block: "nearest" });
    }
  }, [selectedIndex]);

  // Search: debounced IPC call, preserves backend relevance order with rootPath fallbacks
  useEffect(() => {
    if (!searchQuery.trim()) {
      setSearchResults([]);
      setSelectedIndex(-1);
      return;
    }

    let rootPath = (globalThis as any).__PENCYL_PROJECT_ROOT_PATH;
    if (!rootPath) {
      try {
        rootPath = localStorage.getItem("pencyl.lastRoot");
      } catch (e) {
        // ignore
      }
    }
    if (!rootPath && files.length > 0) {
      const firstPath = files.find((f) => f.path)?.path;
      if (firstPath) {
        const parts = firstPath.replace(/\\/g, "/").split("/");
        parts.pop();
        rootPath = parts.join("/");
      }
    }

    let cancelled = false;

    const timer = setTimeout(async () => {
      try {
        let backendResults: any[] = [];
        if (rootPath) {
          backendResults = await searchFiles(rootPath, searchQuery, 50);
        }

        if (cancelled) return;

        let mapped = backendResults.map((r: any) => ({
          name: r.name,
          path: r.path,
          relativePath: r.relative_path || r.path,
          isDirectory: r.is_directory,
        }));

        // Supplement with matching open files
        const qLower = searchQuery.toLowerCase();
        files.forEach((file) => {
          if (file.kind === "file" && file.name) {
            const alreadyIncluded = mapped.some((m) => m.path === file.path);
            if (!alreadyIncluded) {
              const nameMatches = file.name.toLowerCase().includes(qLower);
              const pathMatches = file.path?.toLowerCase().includes(qLower);
              if (nameMatches || pathMatches) {
                let rel = file.name;
                if (rootPath && file.path.toLowerCase().startsWith(rootPath.toLowerCase())) {
                  rel = file.path.slice(rootPath.length).replace(/^[/\\]/, "");
                }
                mapped.push({
                  name: file.name,
                  path: file.path,
                  relativePath: rel || file.name,
                  isDirectory: false,
                });
              }
            }
          }
        });

        setSearchResults(mapped.slice(0, 50));
        setSelectedIndex(mapped.length > 0 ? 0 : -1);
      } catch (err) {
        console.error("Search failed:", err);
      }
    }, 150);

    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, [searchQuery, files]);

  const handleSearchKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (!isSearchOpen || searchResults.length === 0) {
      if (e.key === "Escape") {
        setIsSearchOpen(false);
      }
      return;
    }

    if (e.key === "ArrowDown") {
      e.preventDefault();
      setSelectedIndex((prev) => (prev < searchResults.length - 1 ? prev + 1 : 0));
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      setSelectedIndex((prev) => (prev > 0 ? prev - 1 : searchResults.length - 1));
    } else if (e.key === "Enter") {
      e.preventDefault();
      if (selectedIndex >= 0 && selectedIndex < searchResults.length) {
        handleSearchSelect(searchResults[selectedIndex]);
      }
    } else if (e.key === "Escape") {
      e.preventDefault();
      setIsSearchOpen(false);
    }
  };

  const handleSearchSelect = async (node: { name: string; path: string; relativePath: string; isDirectory: boolean }) => {
    setIsSearchOpen(false);
    setSearchQuery("");
    setSelectedIndex(-1);

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
            onKeyDown={handleSearchKeyDown}
          />
          {isSearchOpen && searchQuery.trim() !== "" && (
            <div className="titlebar-search-dropdown">
              {searchResults.length > 0 ? (
                searchResults.map((node, index) => {
                  const isSelected = index === selectedIndex;
                  return (
                    <div
                      key={node.path}
                      ref={isSelected ? selectedItemRef : null}
                      className={`titlebar-search-item ${isSelected ? "selected" : ""}`}
                      onClick={() => handleSearchSelect(node)}
                      onMouseEnter={() => setSelectedIndex(index)}
                    >
                      {getFileIcon(node.name, node.isDirectory)}
                      <span className="titlebar-search-item-name">{node.name}</span>
                      <span className="titlebar-search-item-path">{node.relativePath}</span>
                    </div>
                  );
                })
              ) : (
                <div className="titlebar-search-empty">No matching files</div>
              )}
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
