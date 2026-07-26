import { create } from "zustand";

interface FileData {
    id: string;
    path: string;
    name: string;
    content: string;
    isDirty: boolean;
    kind: "file" | "terminal";
}

interface FileStore {
    files: FileData[];
    activeFileId: string | null;

    addFile: (file: FileData) => void;
    removeFile: (fileId: string) => void;
    updateActiveFile: (fileId: string) => void;
    updateFileContent: (fileId: string, content: string) => void;
    appendFileContent: (fileId: string, content: string) => void;
    markFileDirty: (fileId: string, isDirty: boolean) => void;
    markFileClean: (fileId: string) => void;
    saveAsFile: (fileId: string, path: string, name: string) => void;
    reorderFiles: (fromIndex: number, toIndex: number) => void;
}

export const useFileStore = create<FileStore>((set) => ({
    files: [],
    activeFileId: null,

    addFile: (file) =>
        set((state) => ({
            files: [...state.files, file],
            activeFileId: file.id,
        })),

    removeFile: (fileId) =>
        set((state) => {
            const index = state.files.findIndex((f) => f.id === fileId);
            const remainingFiles = state.files.filter((f) => f.id !== fileId);
            const shouldClearActive = state.activeFileId === fileId;
            const nextActiveFileId = shouldClearActive
                ? remainingFiles[index - 1]?.id ?? remainingFiles[0]?.id ?? null
                : state.activeFileId;

            return {
                files: remainingFiles,
                activeFileId: nextActiveFileId,
            };
        }),

    updateActiveFile: (fileId) =>
        set(() => ({
            activeFileId: fileId,
        })),

    updateFileContent: (fileId, content) =>
        set((state) => ({
            files: state.files.map((f) =>
                f.id === fileId ? { ...f, content, isDirty: true } : f
            ),
        })),

    appendFileContent: (fileId, content) =>
        set((state) => ({
            files: state.files.map((f) =>
                f.id === fileId ? { ...f, content: `${f.content}${content}` } : f
            ),
        })),

    markFileDirty: (fileId, isDirty) =>
        set((state) => ({
            files: state.files.map((f) =>
                f.id === fileId ? { ...f, isDirty } : f
            ),
        })),

    markFileClean: (fileId) =>
        set((state) => ({
            files: state.files.map((f) =>
                f.id === fileId ? { ...f, isDirty: false } : f
            ),
        })),

    saveAsFile: (fileId, path, name) =>
        set((state) => ({
            files: state.files.map((f) =>
                f.id === fileId ? { ...f, path, name, isDirty: false } : f
            ),
        })),

    reorderFiles: (fromIndex: number, toIndex: number) =>
        set((state) => {
            const newFiles = [...state.files];
            const [movedFile] = newFiles.splice(fromIndex, 1);
            newFiles.splice(toIndex, 0, movedFile);
            return { files: newFiles };
        }),
}));
