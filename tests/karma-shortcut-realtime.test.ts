import { act, renderHook, waitFor } from '@testing-library/react';
import { beforeEach, expect, it, vi } from 'vitest';
const mocks = vi.hoisted(() => ({ list: vi.fn(), channel: vi.fn(), remove: vi.fn() }));
vi.mock('../src/core/data', () => ({ listRows: mocks.list, message: String }));
vi.mock('../src/lib/supabase', () => ({ db: { channel: mocks.channel, removeChannel: mocks.remove } }));
import { useRows } from '../src/core/useRows';
import { entity } from '../src/core/entities';
const scope = { app: 'karma' as const, workspaceId: 'workspace', userId: 'owner' };
let inserted: (event: {new: Record<string,string>}) => void;
let connected: (status: string) => void;
beforeEach(() => {
  vi.clearAllMocks(); mocks.list.mockResolvedValue([]);
  const channel = {
    on: vi.fn((_type, filter, callback) => { expect(filter.filter).toBe('workspace_id=eq.workspace'); inserted = callback; return channel; }),
    subscribe: vi.fn(callback => { connected = callback; return channel; }),
  };
  mocks.channel.mockReturnValue(channel);
});
it('refreshes only matching Karma inserts, reconnect and window focus; cleans up', async () => {
  const { unmount } = renderHook(() => useRows(entity('tasks'), scope, 'internal'));
  await waitFor(() => expect(mocks.list).toHaveBeenCalledTimes(1));
  act(() => inserted({new:{app_key:'work',project_id:'internal'}}));
  act(() => inserted({new:{app_key:'karma',project_id:'other'}}));
  expect(mocks.list).toHaveBeenCalledTimes(1);
  act(() => inserted({new:{app_key:'karma',project_id:'internal'}}));
  await waitFor(() => expect(mocks.list).toHaveBeenCalledTimes(2));
  act(() => connected('SUBSCRIBED'));
  await waitFor(() => expect(mocks.list).toHaveBeenCalledTimes(3));
  act(() => window.dispatchEvent(new Event('focus')));
  await waitFor(() => expect(mocks.list).toHaveBeenCalledTimes(4));
  unmount(); expect(mocks.remove).toHaveBeenCalledTimes(1);
  act(() => window.dispatchEvent(new Event('focus')));
  expect(mocks.list).toHaveBeenCalledTimes(4);
});
it('does not subscribe other apps or other entities', async () => {
  const first = renderHook(() => useRows(entity('tasks'), {...scope,app:'work'}, 'project'));
  const second = renderHook(() => useRows(entity('events'), scope, 'internal'));
  await waitFor(() => expect(mocks.list).toHaveBeenCalledTimes(2));
  expect(mocks.channel).not.toHaveBeenCalled(); first.unmount(); second.unmount();
});
