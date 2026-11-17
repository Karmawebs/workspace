import assert from 'node:assert/strict';
const {chromium,webkit,devices}=await import(process.env.PLAYWRIGHT_MODULE||'playwright-core');
for(const engine of ['chromium','webkit']){
 const browser=await (engine==='webkit'?webkit.launch():chromium.launch({executablePath:process.env.CHROME_BIN,headless:true}));
 try {for(const width of engine==='webkit'?[390,320]:[1440,390,320]){
 const page=await browser.newPage({...(width<600?devices['iPhone 13']:{}),viewport:{width,height:844}});let prefs=['new','modified'];
 const now=new Date(),month=new Date(now.getFullYear(),now.getMonth(),1),calendar=new Date(now.getFullYear(),now.getMonth(),4,12).toISOString();
 const user={id:crypto.randomUUID(),email:'qa@example.invalid',role:'kw_portal_client'},exp=Math.floor(Date.now()/1000)+3600;
 const token='e30.'+Buffer.from(JSON.stringify({sub:user.id,exp})).toString('base64url')+'.fixture';
 const rows=Array.from({length:15},(_,i)=>({id:'c'+i,title:'Publicación '+i,description:'Copy visible',content_type:['post','reel','story','carousel'][i%4],calendar_at:calendar,created_at:new Date(2026,0,1+i,12).toISOString(),status:i===14?'approved':'pending',revision:0}));rows.push({...rows[0],id:'undated',title:'Sin planificación',calendar_at:null});rows.push({...rows[0],id:'next',title:'Próximo mes',calendar_at:new Date(month.getFullYear(),month.getMonth()+1,2,12).toISOString()});
 await page.route('**/*',async route=>{
 const r=route.request(),url=new URL(r.url());if(url.hostname==='127.0.0.1')return route.continue();if(url.hostname!=='wrkoskqfjuefgrwhymqu.supabase.co')return route.abort();let body={};
 if(url.pathname==='/auth/v1/token')body={user,access_token:token,refresh_token:'fixture',expires_in:3600,expires_at:exp,token_type:'bearer'};
 else if(url.pathname.endsWith('social-client-portal')){
 const b=r.postDataJSON();if(b.action==='snapshot')body={name:'Dani',items:rows,preferences:prefs};else if(b.action==='meetings')body={items:[{title:'Reunión compartida'}]};else if(b.action==='preview')body={media:[],history:[]};else if(b.action==='preferences'){prefs=b.preferences;body={ok:true}}else if(b.action==='review'){rows.find(x=>x.id===b.id).status='approved';body={ok:true}}else body={items:[]};
 }else return route.abort();await route.fulfill({json:body});});
 page.on('dialog',d=>d.accept());
 await page.goto('http://127.0.0.1:4275/portal');await page.getByLabel('Correo de acceso').fill(user.email);await page.getByLabel('Contraseña',{exact:true}).fill('fixture');await page.getByRole('button',{name:'Entrar',exact:true}).click();await page.getByRole('heading',{name:'Hola, Dani 👋'}).waitFor();
 assert.equal(await page.getByRole('button',{name:'Calendario',exact:true}).getAttribute('aria-pressed'),'true');
 const check=async()=>assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth),width);
 await check();if(width<600){assert.equal(await page.locator('.portal-heading p').isVisible(),false);const align=await page.locator('.portal-heading').evaluate(e=>getComputedStyle(e).textAlign);assert.equal(align,'center')}
 await page.getByRole('button',{name:'Directorio',exact:true}).click();assert.equal(await page.locator('.portal-row').count(),12);assert.equal(await page.locator('.portal-row b').first().textContent(),'Publicación 14');assert(await page.getByRole('button',{name:'Aprobado: Publicación 14',exact:true}).isDisabled());
 if(width<600){const row=page.locator('.portal-row').first(),title=await row.locator('b').boundingBox(),type=await row.locator('.portal-type-tag').boundingBox();assert(title.y>type.y);assert.equal(await row.locator('.portal-directory-icon').first().isVisible(),true)}
 await page.getByRole('button',{name:'Mostrar más (3)'}).click();assert.equal(await page.locator('.portal-row').count(),15);
 await page.getByRole('button',{name:'Sin fecha (1)'}).click();await page.getByText('Sin planificación',{exact:true}).waitFor();assert.equal(await page.locator('.portal-row').count(),1);await page.getByRole('button',{name:'Mes siguiente del directorio'}).click();await page.getByText('Próximo mes',{exact:true}).waitFor();await page.getByRole('button',{name:'Mes anterior del directorio'}).click();
 await page.getByRole('button',{name:'Ver contenido: Publicación 13',exact:true}).click();await page.getByRole('button',{name:'Solicitar cambios',exact:true}).click();await page.getByLabel('Describe los cambios').fill('Cambios de prueba');await page.getByRole('button',{name:'Cerrar vista previa',exact:true}).click();await check();
 await page.screenshot({path:`/private/tmp/portal-directory-${engine}-${width}.png`,fullPage:true});
 await page.getByRole('button',{name:'Avisos por correo',exact:true}).click();await page.getByRole('button',{name:'Nuevo contenido',exact:true}).click();await page.getByRole('button',{name:'Respuestas',exact:true}).click();await page.screenshot({path:`/private/tmp/portal-preferences-${engine}-${width}.png`,fullPage:true});await page.getByRole('button',{name:'Guardar preferencias',exact:true}).click();await page.getByRole('dialog').waitFor({state:'hidden'});
 await page.getByRole('button',{name:'Avisos por correo',exact:true}).click();assert.equal(await page.getByRole('button',{name:'Nuevo contenido',exact:true}).getAttribute('aria-pressed'),'false');assert.equal(await page.getByRole('button',{name:'Respuestas',exact:true}).getAttribute('aria-pressed'),'true');await page.getByRole('button',{name:'Cerrar',exact:true}).click();
 await page.getByRole('button',{name:'Reuniones',exact:true}).click();await page.getByText('Reunión compartida',{exact:true}).waitFor();await check();await page.close();console.log(`${engine} ${width}: header, directory/month/order/paging/undated, actions, preferences and meetings PASS`);
 }}finally{await browser.close()}
}
