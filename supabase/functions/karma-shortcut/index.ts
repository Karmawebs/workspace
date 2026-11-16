import { createClient } from 'npm:@supabase/supabase-js@2.118.0';
import { endpoint, reply } from './http.mjs';

// Fixed destination: callers cannot select another workspace, app or project.
const workspaceId = 'a2f2782b-0d3a-4d3e-8e5b-faadd94b756f';
const projectId = 'b4542e33-c58f-49b1-8e1f-44ac65035cc3';
Deno.serve(endpoint(Deno.env.get('KARMA_SHORTCUT_BACKEND_HASH'), async (title: string) => {
  const db = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
  const project = await db.from('kw_projects').select('id').eq('id', projectId)
    .eq('workspace_id', workspaceId).eq('app_key', 'karma').eq('archived', false)
    .contains('metadata', { internal_home: true }).single();
  if (project.error || !project.data) throw new Error('Destination unavailable');
  const { data, error } = await db.from('kw_tasks').insert({
    workspace_id: workspaceId, project_id: projectId, app_key: 'karma', title,
  }).select('id,status').single();
  if (error || !data) throw new Error('Insert failed');
  return reply(201, { ok: true, id: data.id, status: data.status });
}));
