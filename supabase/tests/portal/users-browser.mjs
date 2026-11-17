import assert from 'node:assert/strict';
const {chromium}=await import(process.env.PLAYWRIGHT_MODULE||'playwright-core');
const browser=await chromium.launch({executablePath:process.env.CHROME_BIN,headless:true});
try{for(const width of [1440,375,320]){
 const page=await browser.newPage({viewport:{width,height:900}});
 const user={id:'00000000-0000-4000-8000-000000000001',email:'admin@example.invalid',role:'authenticated'};
 const exp=Math.floor(Date.now()/1000)+3600,token='e30.'+Buffer.from(JSON.stringify({sub:user.id,exp,role:user.role})).toString('base64url')+'.fixture';
 const session={access_token:token,refresh_token:'fixture',token_type:'bearer',expires_in:3600,expires_at:exp,user};
 const project={id:'00000000-0000-4000-8000-000000000002',workspace_id:'w',app_key:'social',name:'Proyecto de prueba',status:'active',priority:'normal'};
 const access={user_id:'client',name:'Cliente de prueba',contact_email:'cliente@example.invalid',login_email:'cliente-00000000-0000-4000-8000-000000000003@portal.invalid',active:true,invitation_state:'unconfigured'};
 await page.addInitScript(s=>localStorage.setItem('sb-wrkoskqfjuefgrwhymqu-auth-token',JSON.stringify(s)),session);
 await page.route('**/*',async route=>{
 const r=route.request(),u=new URL(r.url());if(u.hostname==='127.0.0.1')return route.continue();if(u.hostname!=='wrkoskqfjuefgrwhymqu.supabase.co')return route.abort();
 let data=[];
 if(u.pathname==='/auth/v1/user')data=user;
 else if(u.pathname==='/auth/v1/token')data=session;
 else if(u.pathname.endsWith('/kw_workspace_members'))data=[{workspace_id:'w',user_id:user.id,role:'owner',kw_workspaces:{name:'Karma'}}];
 else if(u.pathname.endsWith('/kw_apps'))data=[{key:'social',enabled:true}];
 else if(u.pathname.endsWith('/kw_projects'))data=r.headers().accept?.includes('object')?project:[project];
 else if(u.pathname.endsWith('/social-portal-admin')){const b=r.postDataJSON();assert.equal(b.projectId,project.id);data=b.action==='list'?{access:[access],history:[],credentials:[]}:{login:access.login_email,delivery:'unconfigured'};}
 await route.fulfill({json:data});});
 await page.goto('http://127.0.0.1:4275/#/social/projects/'+project.id);
 await page.getByRole('button',{name:'Usuarios',exact:true}).click();await page.getByText(access.contact_email).waitFor();
 assert.equal(await page.getByRole('heading',{name:'Credenciales',exact:true}).count(),0);
 const check=async()=>{assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth),width);const modal=page.locator('.social-dashboard-modal');assert(await modal.evaluate(e=>e.scrollWidth<=e.clientWidth),'modal overflow '+width)};
 await check();await page.getByRole('button',{name:'Nuevo usuario',exact:true}).click();await page.getByLabel('Nombre',{exact:true}).fill('Nuevo cliente');await page.getByLabel('Correo de contacto',{exact:true}).fill('nuevo@example.invalid');
 assert.equal(await page.getByLabel('Contraseña inicial').count(),0);await page.getByRole('button',{name:'Crear acceso',exact:true}).click();await page.getByRole('status').filter({hasText:'SMTP'}).waitFor();await check();
 await page.screenshot({path:'/private/tmp/karma-social-users-'+width+'.png',fullPage:true});
 console.log('Usuarios modal, fixed project, create and SMTP status verified:',width);await page.close();
}}finally{await browser.close()}
