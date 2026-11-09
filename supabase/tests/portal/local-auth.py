"""Test isolated GoTrue/PostgREST only. No production URL, persistent fixture or printed credentials."""
import base64, hashlib, hmac, json, secrets, subprocess, time, urllib.error, urllib.request, uuid
def enc(x):
    return base64.urlsafe_b64encode(x).decode().rstrip('=')
base='http://127.0.0.1:54321'
import os
local=os.environ['PORTAL_LOCAL_WORKDIR']
assert 'project_id = "karma-drive-local"' in open(local+'/supabase/config.toml').read()
out=subprocess.check_output([os.environ['SUPABASE_CLI'],'status','-o','env','--workdir',local],env={**os.environ,'DOCKER_HOST':'unix://'+os.path.expanduser('~/.colima/karma-drive/docker.sock')},stderr=subprocess.DEVNULL).decode()
env=dict((k,v.strip('"')) for k,v in (line.split('=',1) for line in out.splitlines() if '=' in line))
assert env['API_URL']==base
admin,anon=env['SERVICE_ROLE_KEY'],env['ANON_KEY']
def api(method,path,token,body=None,apikey=anon):
    req=urllib.request.Request(base+path,method=method,data=json.dumps(body).encode() if body else None,headers={'apikey':apikey,'Authorization':'Bearer '+token,'Content-Type':'application/json'})
    try:
        with urllib.request.urlopen(req,timeout=10) as r:return r.status,json.loads(r.read() or b'{}')
    except urllib.error.HTTPError as e:return e.code,json.loads(e.read() or b'{}')
code,projects=api('GET','/rest/v1/kw_projects?app_key=eq.social&select=id&limit=2',admin,apikey=admin)
assert code==200 and len(projects)==2
project=projects[0]['id']
email='portal-'+uuid.uuid4().hex+'@example.invalid'
pw=secrets.token_urlsafe(32)
code,row=api('POST','/auth/v1/admin/users',admin,dict(email=email,password=pw,email_confirm=True,role='kw_portal_client',app_metadata=dict(portal='social',project=project,name='QA',contact=email)),admin)
assert code<300,('Local user creation',code,row.get('error_code'));uid=row['id']
try:
    code,session=api('POST','/auth/v1/token?grant_type=password',anon,dict(email=email,password=pw))
    assert code==200,('Login',code)
    token=session['access_token'];payload=json.loads(base64.urlsafe_b64decode(token.split('.')[1]+'=='))
    assert payload['role']=='kw_portal_client' and payload['session_id']
    code,user=api('GET','/auth/v1/user',token)
    assert code==200 and user['role']=='kw_portal_client'
    code,data=api('GET','/rest/v1/kw_projects?select=id',token)
    assert code>=400 and data.get('code') in ('22023','42501','PGRST301','0P000'),('PostgREST denial',code,data.get('code'))
    def authorized():
        code,rows=api('POST','/rest/v1/rpc/kw_portal_authorize',admin,dict(p_user=uid,p_session=payload['session_id']),admin)
        assert code==200,('RPC',code,rows.get('code') if isinstance(rows,dict) else None)
        return [row['project_id'] for row in rows]
    assert authorized()==[project], 'Portal user not bound to expected project'
    # Exercise the unmodified Edge handler against local Auth and PostgREST.
    deno=os.environ.get('DENO_BIN','deno')
    port=18476
    runner="const serve=Deno.serve; Deno.serve=(handler)=>serve({hostname:'127.0.0.1',port:18476},handler);await import('./supabase/functions/social-client-portal/index.ts');"
    proc=subprocess.Popen([deno,'eval','--no-lock','--node-modules-dir=none',runner],env={**os.environ,'SUPABASE_URL':base,'SUPABASE_SERVICE_ROLE_KEY':admin},stdout=subprocess.DEVNULL,stderr=subprocess.DEVNULL)
    def edge(body):
        r=urllib.request.Request('http://127.0.0.1:18476',method='POST',data=json.dumps(body).encode(),headers={'Content-Type':'application/json','Authorization':'Bearer '+token})
        try:
            with urllib.request.urlopen(r,timeout=2) as resp:return resp.status,json.load(resp)
        except urllib.error.HTTPError as e:return e.code,json.load(e)
    try:
        for _ in range(50):
            try: status,body=edge(dict(action='snapshot',projectId=projects[1]['id']));break
            except urllib.error.URLError:time.sleep(.1)
        else:raise RuntimeError('Local Edge handler did not start')
        assert status==200 and body['name']=='QA',('Snapshot',status,body.get('error'))
        assert edge(dict(action='create',projectId=project))[0]==400
        code,result=api('PATCH','/rest/v1/kw_portal_access?user_id=eq.'+uid,admin,dict(active=False),admin)
        assert code<300 and edge(dict(action='snapshot'))[0]==403
    finally:
        proc.terminate();proc.wait(timeout=5)
    code,result=api('PATCH','/rest/v1/kw_portal_access?user_id=eq.'+uid,admin,dict(active=False),admin)
    assert code<300 and not authorized(), 'Disabled access remained authorized'
    print('Local Auth: role, session, verified user and raw Workspace query denial passed.')
finally:
    assert api('DELETE','/auth/v1/admin/users/'+uid,admin,apikey=admin)[0]<300
