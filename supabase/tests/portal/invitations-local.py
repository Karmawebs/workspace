"""Real local Auth + unmodified Edge handlers. Never uses production credentials."""
import base64, hashlib, hmac, json, os, secrets, subprocess, time, urllib.error, urllib.request, uuid
base='http://127.0.0.1:54321'
docker_env={**os.environ,'DOCKER_HOST':'unix://'+os.path.expanduser('~/.colima/karma-drive/docker.sock')}
def docker(*args,input=None):
    return subprocess.check_output(['docker',*args],env=docker_env,input=input,stderr=subprocess.DEVNULL)
config=json.loads(docker('inspect','supabase_auth_karma-drive-local'))[0]
env=dict(v.split('=',1) for v in config['Config']['Env'])
assert env.get('GOTRUE_API_HOST') in ('0.0.0.0',None)
def enc(x):return base64.urlsafe_b64encode(x).decode().rstrip('=')
def jwt(role):
    a=enc(json.dumps({'alg':'HS256','typ':'JWT'}).encode())+'.'+enc(json.dumps({'role':role,'iss':'supabase','exp':int(time.time())+3600}).encode())
    return a+'.'+enc(hmac.new(env['GOTRUE_JWT_SECRET'].encode(),a.encode(),hashlib.sha256).digest())
admin,anon=jwt('service_role'),jwt('anon')
def api(method,path,token,body=None):
    req=urllib.request.Request(base+path,method=method,data=json.dumps(body).encode() if body is not None else None,headers={'apikey':admin if token==admin else anon,'Authorization':'Bearer '+token,'Content-Type':'application/json'})
    try:
        with urllib.request.urlopen(req,timeout=15) as r:return r.status,json.loads(r.read() or b'{}')
    except urllib.error.HTTPError as e:return e.code,json.loads(e.read() or b'{}')
def ok(result):
    code,body=result
    assert code<300, ('HTTP failure',code,body.get('error_code',body.get('code')) if isinstance(body,dict) else None)
    return body
projects=ok(api('GET','/rest/v1/kw_projects?app_key=eq.social&select=id,workspace_id&limit=2',admin));assert len(projects)==2
p,other=projects[0]['id'],projects[1]['id'];workspace=projects[0]['workspace_id']
created=[];procs=[]
password=secrets.token_urlsafe(32)
def create(role='authenticated',**extra):
    u=ok(api('POST','/auth/v1/admin/users',admin,dict(email='qa-'+uuid.uuid4().hex+'@example.invalid',password=password,email_confirm=True,role=role,**extra)))
    created.append(u['id']);return u
def login(email,pw=password):return ok(api('POST','/auth/v1/token?grant_type=password',anon,dict(email=email,password=pw)))['access_token']
def edge(port,token,body):
    req=urllib.request.Request('http://127.0.0.1:'+str(port),method='POST',data=json.dumps(body).encode(),headers={'Authorization':'Bearer '+token,'Content-Type':'application/json'})
    try:
        with urllib.request.urlopen(req,timeout=15) as r:return r.status,json.load(r)
    except urllib.error.HTTPError as e:return e.code,json.load(e)
try:
    owner=create();ok(api('POST','/rest/v1/kw_workspace_members',admin,dict(user_id=owner['id'],workspace_id=workspace,role='owner')))
    owner_token=login(owner['email'])
    for name,port in [('social-portal-admin',18477),('social-client-portal',18478)]:
        runner="const serve=Deno.serve;Deno.serve=h=>serve({hostname:'127.0.0.1',port:"+str(port)+"},h);await import('./supabase/functions/"+name+"/index.ts');"
        proc=subprocess.Popen([os.environ['DENO_BIN'],'eval','--no-lock','--node-modules-dir=none',runner],env={**os.environ,'SUPABASE_URL':base,'SUPABASE_SERVICE_ROLE_KEY':admin,'PORTAL_SMTP_ENABLED':'false'},stdout=subprocess.DEVNULL,stderr=subprocess.DEVNULL);procs.append(proc)
        for _ in range(80):
            try:edge(port,anon,{});break
            except urllib.error.URLError:time.sleep(.1)
        else:raise RuntimeError('Local handler failed to start')
    contact='contact-'+uuid.uuid4().hex+'@example.invalid';request=str(uuid.uuid4());payload=dict(action='create',projectId=p,name='QA',email=contact,request=request)
    result=ok(edge(18477,owner_token,payload));assert result['delivery']=='unconfigured';alias=result['login'];assert alias.endswith('@portal.invalid')
    accesses=ok(api('GET','/rest/v1/kw_portal_access?project_id=eq.'+p+'&contact_email=eq.'+contact,admin));uid=accesses[0]['user_id'];created.append(uid)
    assert ok(edge(18477,owner_token,payload))['login']==alias
    assert edge(18477,owner_token,{**payload,'request':str(uuid.uuid4())})[0]==409
    second=ok(edge(18477,owner_token,{**payload,'email':'second-'+contact,'request':str(uuid.uuid4())}));assert second['login']!=alias
    third=ok(edge(18477,owner_token,{**payload,'projectId':other,'request':str(uuid.uuid4())}));assert third['login']!=alias
    for address in [second['login'],third['login']]:
        a=ok(api('GET','/rest/v1/kw_portal_access?login_email=eq.'+address,admin));created.append(a[0]['user_id'])
    # Recovery token is owned by GoTrue, not the application; no SMTP required.
    link=ok(api('POST','/auth/v1/admin/generate_link',admin,dict(type='recovery',email=alias)))
    session=ok(api('POST','/auth/v1/verify',anon,dict(type='recovery',token_hash=link['hashed_token'])))
    token=session['access_token'];assert session['user']['role']=='kw_portal_client'
    assert api('POST','/auth/v1/verify',anon,dict(type='recovery',token_hash=link['hashed_token']))[0]>=400
    newpassword=secrets.token_urlsafe(32);ok(api('PUT','/auth/v1/user',token,dict(password=newpassword)));token=login(alias,newpassword)
    assert edge(18477,token,payload)[0]==403
    assert api('GET','/rest/v1/kw_projects?select=id',token)[0]>=400
    assert api('GET','/storage/v1/object/list/social-media',token)[0]>=400
    snap=ok(edge(18478,token,dict(action='snapshot',projectId=other)));assert snap['name']=='QA'
    foreign=ok(api('GET','/rest/v1/kw_content_items?project_id=eq.'+other+'&select=id&limit=1',admin))
    if foreign:assert edge(18478,token,dict(action='preview',id=foreign[0]['id']))[0]==404
    # Expiry uses the real GoTrue clock. No credentials printed.
    expired=ok(api('POST','/auth/v1/admin/generate_link',admin,dict(type='recovery',email=alias)))
    docker('exec','supabase_db_karma-drive-local','psql','-U','postgres','-d','postgres','-c',"update auth.users set recovery_sent_at=now()-interval '2 days' where id='"+uid+"'")
    assert api('POST','/auth/v1/verify',anon,dict(type='recovery',token_hash=expired['hashed_token']))[0]>=400
    ok(edge(18477,owner_token,dict(action='active',projectId=p,id=uid,active=False)))
    assert edge(18478,token,dict(action='snapshot'))[0]==403
    ok(api('POST','/auth/v1/logout',token))
    assert edge(18478,token,dict(action='snapshot'))[0]==403
    ok(api('POST','/auth/v1/logout',owner_token))
    assert edge(18477,owner_token,dict(action='list',projectId=p))[0]==401
    print('LOCAL AUTH + EDGE PASS: create/idempotence, duplicate rejection, two users/project, same contact/two identities, invite single-use/expiry, set password, login/logout, admin denial, REST/foreign-content denial, deactivation. SMTP intentionally disabled.')
finally:
    # Collect partial creations even if a later assertion failed.
    if 'contact' in locals():
        for address in [contact,'second-'+contact]:
            for a in ok(api('GET','/rest/v1/kw_portal_access?contact_email=eq.'+address,admin)):
                if a['user_id'] not in created:created.append(a['user_id'])
    for proc in procs:proc.terminate();proc.wait(timeout=5)
    for uid in reversed(created):ok(api('DELETE','/auth/v1/admin/users/'+uid,admin))
