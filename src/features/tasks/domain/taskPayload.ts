import type { Priority, StoredTaskTuple, Task, TaskFormState, TaskListPayload } from '../types';

const EMPTY_TASKS_PAYLOAD: TaskListPayload = { version: 1, tasks: [] };

export function defaultTaskFormState(): TaskFormState {
  return {
    title: '',
    dueDate: '',
    priority: 'medium',
    category: '',
    tags: '',
  };
}

function normalizePriority(value: unknown): Priority {
  if (value === 'low' || value === 'medium' || value === 'high') {
    return value;
  }

  return 'medium';
}

function normalizeStringArray(value: unknown): string[] {
  if (!Array.isArray(value)) {
    return [];
  }

  return value
    .filter((entry): entry is string => typeof entry === 'string')
    .map((entry) => entry.trim())
    .filter(Boolean);
}

function normalizeTask(value: unknown, index: number): Task | null {
  if (!value || typeof value !== 'object') {
    return null;
  }

  const candidate = value as Partial<Task>;
  if (typeof candidate.title !== 'string' || !candidate.title.trim()) {
    return null;
  }

  return {
    id: typeof candidate.id === 'string' && candidate.id ? candidate.id : `task-${index + 1}`,
    title: candidate.title.trim(),
    completed: Boolean(candidate.completed),
    dueDate: typeof candidate.dueDate === 'string' && candidate.dueDate ? candidate.dueDate : null,
    priority: normalizePriority(candidate.priority),
    category: typeof candidate.category === 'string' && candidate.category.trim() ? candidate.category.trim() : null,
    tags: normalizeStringArray(candidate.tags),
  };
}

function priorityToCode(priority: Priority): 0 | 1 | 2 {
  if (priority === 'low') return 0;
  if (priority === 'high') return 2;
  return 1;
}

function codeToPriority(value: unknown): Priority {
  if (value === 0) return 'low';
  if (value === 2) return 'high';
  return 'medium';
}

function decodeCompactTask(task: unknown, index: number): Task | null {
  if (!Array.isArray(task) || task.length < 7) {
    return null;
  }

  const [id, title, completed, dueDate, priority, category, tags] = task as StoredTaskTuple;
  if (typeof title !== 'string' || !title.trim()) {
    return null;
  }

  return {
    id: typeof id === 'string' && id ? id : `task-${index + 1}`,
    title: title.trim(),
    completed: completed === 1,
    dueDate: typeof dueDate === 'string' && dueDate ? dueDate : null,
    priority: codeToPriority(priority),
    category: typeof category === 'string' && category.trim() ? category.trim() : null,
    tags: typeof tags === 'string' && tags ? tags.split('|').map((tag) => tag.trim()).filter(Boolean) : [],
  };
}

export function parseTaskPayload(rawValue: string): TaskListPayload {
  const payload = rawValue.trim();
  if (!payload) {
    return EMPTY_TASKS_PAYLOAD;
  }

  try {
    const parsed = JSON.parse(payload) as unknown;

    if (Array.isArray(parsed) && parsed[0] === 1 && Array.isArray(parsed[1])) {
      return {
        version: 1,
        tasks: parsed[1].map((task, index) => decodeCompactTask(task, index)).filter((task): task is Task => task !== null),
      };
    }

    if (!parsed || typeof parsed !== 'object') {
      throw new Error('Task payload shape mismatch.');
    }

    const legacyPayload = parsed as Partial<TaskListPayload>;
    if (legacyPayload.version !== 1 || !Array.isArray(legacyPayload.tasks)) {
      throw new Error('Task payload shape mismatch.');
    }

    return {
      version: 1,
      tasks: legacyPayload.tasks.map((task, index) => normalizeTask(task, index)).filter((task): task is Task => task !== null),
    };
  } catch {
    return {
      version: 1,
      tasks: [
        {
          id: 'legacy-task',
          title: payload,
          completed: false,
          dueDate: null,
          priority: 'medium',
          category: null,
          tags: [],
        },
      ],
    };
  }
}

export function serializeTaskPayload(tasks: Task[]): string {
  const compactTasks: StoredTaskTuple[] = tasks.map((task) => [
    task.id,
    task.title,
    task.completed ? 1 : 0,
    task.dueDate ?? '',
    priorityToCode(task.priority),
    task.category ?? '',
    task.tags.join('|'),
  ]);

  return JSON.stringify([1, compactTasks]);
}

export function parseTagsInput(value: string): string[] {
  return Array.from(new Set(value.split(',').map((tag) => tag.trim()).filter(Boolean)));
}

export function makeTaskId(): string {
  return `${Date.now().toString(36)}${Math.random().toString(36).slice(2, 8)}`;
}

export function toTaskSyncKey(task: Task): string {
  return JSON.stringify([task.id, task.title, task.completed, task.dueDate, task.priority, task.category, [...task.tags].sort()]);
}
