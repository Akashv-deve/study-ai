import { create } from 'zustand';
import { Project, ProjectFile } from '../types';

interface AppState {
  projects: Project[];
  currentProject: Project | null;
  files: ProjectFile[];
  activeFile: ProjectFile | null;
  activeFileContent: string;
  activeSelection: { code: string; startLine?: number; endLine?: number } | null;
  aiPanelOpen: boolean;
  setProjects: (projects: Project[]) => void;
  setCurrentProject: (project: Project | null) => void;
  setFiles: (files: ProjectFile[]) => void;
  setActiveFile: (file: ProjectFile | null, content?: string) => void;
  setActiveSelection: (selection: { code: string; startLine?: number; endLine?: number } | null) => void;
  setAiPanelOpen: (open: boolean) => void;
  resetWorkspace: () => void;
}

export const useAppStore = create<AppState>((set) => ({
  projects: [],
  currentProject: null,
  files: [],
  activeFile: null,
  activeFileContent: '',
  activeSelection: null,
  aiPanelOpen: true,
  setProjects: (projects) => set({ projects }),
  setCurrentProject: (currentProject) => set({ currentProject }),
  setFiles: (files) => set({ files }),
  setActiveFile: (activeFile, content = '') => set({ activeFile, activeFileContent: content }),
  setActiveSelection: (activeSelection) => set({ activeSelection }),
  setAiPanelOpen: (aiPanelOpen) => set({ aiPanelOpen }),
  resetWorkspace: () => set({ projects: [], currentProject: null, files: [], activeFile: null, activeFileContent: '', activeSelection: null, aiPanelOpen: true }),
}));
