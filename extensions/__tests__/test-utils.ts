import { vi } from "vitest";

export function createMockTheme() {
  return {
    fg: vi.fn((_color: string, text: string) => text),
    bg: vi.fn((_color: string, text: string) => text),
    bold: vi.fn((text: string) => text),
  };
}

export function createMockExtensionAPI() {
  const handlers = new Map<string, (...args: any[]) => any>();
  const activeTools: string[] = [];
  const allTools: any[] = [];

  return {
    on: vi.fn((event: string, handler: (...args: any[]) => any) => {
      handlers.set(event, handler);
    }),
    registerTool: vi.fn(),
    registerCommand: vi.fn(),
    registerProvider: vi.fn(),
    getActiveTools: vi.fn(() => [...activeTools]),
    setActiveTools: vi.fn((tools: string[]) => {
      activeTools.length = 0;
      activeTools.push(...tools);
    }),
    getAllTools: vi.fn(() => [...allTools]),
    sendUserMessage: vi.fn(),
    exec: vi.fn(),
    _handlers: handlers,
    _activeTools: activeTools,
    _allTools: allTools,
  };
}

export function createMockCommandContext(overrides: Record<string, any> = {}) {
  return {
    hasUI: true,
    ui: {
      notify: vi.fn(),
      setWorkingMessage: vi.fn(),
      custom: vi.fn(),
      onTerminalInput: vi.fn(),
      setEditorComponent: vi.fn(),
    },
    waitForIdle: vi.fn(),
    getSystemPrompt: vi.fn(() => ""),
    getContextUsage: vi.fn(() => undefined),
    sessionManager: {
      getBranch: vi.fn(() => []),
      getEntries: vi.fn(() => []),
      getLeafId: vi.fn(() => ""),
    },
    model: undefined,
    ...overrides,
  };
}

export function createMockKey() {
  return {
    escape: "\x1b",
    enter: "\r",
    backspace: "\x7f",
    tab: "\t",
    down: "\x1b[B",
    up: "\x1b[A",
    home: "\x1b[H",
    end: "\x1b[F",
    pageDown: "\x1b[6~",
    pageUp: "\x1b[5~",
    shift: (key: string) => `shift-${key}`,
    ctrl: (key: string) => `ctrl-${key}`,
  };
}

export function createMockMatchesKey() {
  return vi.fn((data: string, key: any) => {
    if (typeof key === "object" && key !== null) {
      if (key.escape !== undefined) return data === "\x1b";
      if (key.enter !== undefined) return data === "\r";
      if (key.backspace !== undefined) return data === "\x7f";
      if (key.tab !== undefined) return data === "\t";
      if (key.down !== undefined) return data === "\x1b[B";
      if (key.up !== undefined) return data === "\x1b[A";
      if (key.home !== undefined) return data === "\x1b[H";
      if (key.end !== undefined) return data === "\x1b[F";
      if (key.pageDown !== undefined) return data === "\x1b[6~";
      if (key.pageUp !== undefined) return data === "\x1b[5~";
    }
    return false;
  });
}
