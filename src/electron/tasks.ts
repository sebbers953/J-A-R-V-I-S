import type { Task } from '../shared';
export function validateTasks(value: unknown): Task[] {
  if (!Array.isArray(value) || value.length > 2000) throw new Error('Invalid task collection');
  const ids = new Set<string>();
  return value.map((item: unknown) => {
    if (!item || typeof item !== 'object') throw new Error('Invalid task');
    const t = item as Task;
    if (typeof t.id !== 'string' || !t.id || t.id.length > 100 || ids.has(t.id) || typeof t.text !== 'string' || !t.text.trim() || t.text.length > 300 || typeof t.done !== 'boolean' || !/^\d{4}-\d{2}-\d{2}$/.test(t.date)) throw new Error('Invalid task');
    ids.add(t.id); return { id: t.id, text: t.text.trim(), done: t.done, date: t.date };
  });
}
// Optimistic comparison prevents a stale HUD snapshot from overwriting a voice task.
export function applyTaskSnapshot(current: Task[], next: unknown, expected: unknown): Task[] {
  const clean=validateTasks(next), base=validateTasks(expected);
  if(JSON.stringify(validateTasks(current))!==JSON.stringify(base))throw new Error('Tasks changed. Reload and retry.');
  return clean;
}
