import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { freemem, totalmem } from 'node:os';
import type { MemoryStats } from '../shared';
const exec = promisify(execFile);
export function unknownMemory(total: number): MemoryStats {
  return { memoryTotal: total, memoryUsed: null, memoryCached: null, memoryCompressed: null, memoryWired: null, memorySwap: null, memoryPressure: null };
}
// XNU internal_page_count includes purgeable anonymous pages. Compressor *physical*
// pages are separate; "Pages stored in compressor" is logical size, never added.
export function parseVmStat(text: string, total: number): MemoryStats {
  const result = unknownMemory(total);
  const pageSize = Number(text.match(/page size of (\d+) bytes/)?.[1]);
  if (!Number.isSafeInteger(total) || total <= 0 || !Number.isSafeInteger(pageSize) || pageSize < 4096 || pageSize > 65536) return result;
  const pages = (label: string): number | null => {
    const value = text.split('\n').find(line => line.startsWith(label + ':'))?.split(':')[1]?.trim();
    if (!value || !/^\d+\.?$/.test(value)) return null;
    const bytes = Number(value.replace(/\.$/, '')) * pageSize;
    return Number.isSafeInteger(bytes) && bytes <= total ? bytes : null;
  };
  const anonymous = pages('Anonymous pages'), purgeable = pages('Pages purgeable');
  const wired = pages('Pages wired down'), compressed = pages('Pages occupied by compressor');
  const file = pages('File-backed pages');
  if (anonymous === null || purgeable === null || wired === null || compressed === null || file === null || purgeable > anonymous) return result;
  const used = anonymous - purgeable + wired + compressed;
  const cached = file + purgeable;
  // Reject inconsistent snapshots instead of clamping broken readings to 100%.
  if (used > total || used + cached > total) return result;
  return { ...result, memoryUsed: used, memoryCached: cached, memoryCompressed: compressed, memoryWired: wired };
}
export function parseSwap(text: string): number | null {
  const match = text.match(/\bused\s*=\s*(\d+(?:\.\d+)?)([KMGT])\b/i);
  if (!match) return null;
  const bytes = Number(match[1]) * 1024 ** ('KMGT'.indexOf(match[2].toUpperCase()) + 1);
  return Number.isFinite(bytes) && bytes >= 0 ? bytes : null;
}
export function parsePressure(text: string): MemoryStats['memoryPressure'] {
  return ({ '1': 'green', '2': 'yellow', '4': 'red' } as const)[text.trim() as '1' | '2' | '4'] ?? null;
}
export async function collectMemory(): Promise<MemoryStats> {
  const total = totalmem();
  if (process.platform !== 'darwin') return { ...unknownMemory(total), memoryUsed: total - freemem() };
  const read = async (binary: string, args: string[]) => {
    try { return (await exec(binary, args, { timeout: 1200, maxBuffer: 65536, env: { PATH: '/usr/bin:/usr/sbin', LC_ALL: 'C' } })).stdout; }
    catch { return ''; }
  };
  const [vm, swap, pressure] = await Promise.all([
    read('/usr/bin/vm_stat', []), read('/usr/sbin/sysctl', ['-n', 'vm.swapusage']),
    read('/usr/sbin/sysctl', ['-n', 'kern.memorystatus_vm_pressure_level'])
  ]);
  return { ...parseVmStat(vm, total), memorySwap: parseSwap(swap), memoryPressure: parsePressure(pressure) };
}
