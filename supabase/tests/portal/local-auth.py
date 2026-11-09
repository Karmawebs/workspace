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
email='portal-'+uuid.uuid4().hex+'@example.invalid'
pw=secrets.token_urlsafe(32)
code,row=api('POST','/auth/v1/admin/users',admin,dict(email=email,password=pw,email_confirm=True,role='kw_portal_client'),admin)
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
    print('Local Auth: role, session, verified user and raw Workspace query denial passed.')
finally:
    assert api('DELETE','/auth/v1/admin/users/'+uid,admin,apikey=admin)[0]<300
