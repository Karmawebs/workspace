import assert from "node:assert/strict";
const {chromium}=await import(process.env.PLAYWRIGHT_MODULE||"playwright-core");
const browser=await chromium.launch({executablePath:process.env.CHROME_BIN,headless:true});
try{for(const width of [1440,768,375,320]){
 const page=await browser.newPage({viewport:{width,height:800}});
 const exp=Math.floor(Date.now()/1000)+3600,user={id:crypto.randomUUID(),email:"qa@example.invalid",role:"kw_portal_client"};
 const token=["e30",Buffer.from(JSON.stringify({sub:user.id,exp})).toString("base64url"),"ZmFrZQ"].join(".");
 const row={id:"fixture",title:"Nuestra cocina",content_type:"post",description:"Vista previa del menú",calendar_at:new Date().toISOString(),status:"pending",revision:0};
 await page.route("**/*",async r=>{
 const u=new URL(r.request().url());
 if(u.hostname==="127.0.0.1")return r.continue();
 if(u.hostname!=="wrkoskqfjuefgrwhymqu.supabase.co")return r.abort();
 let result;
 if(u.pathname==="/auth/v1/token")result={access_token:token,token_type:"bearer",refresh_token:"fixture",expires_in:3600,expires_at:exp,user};
 else if(u.pathname==="/functions/v1/social-client-portal"){const b=r.request().postDataJSON();result=b.action==="snapshot"?{name:"Proyecto de prueba",items:[row],preferences:[]}:b.action==="preview"?{media:[{type:"image/png",url:"/assets/karma-compact.png"}],history:[]}:b.action==="drive-list"?{files:[],nextPageToken:null}:{items:[]};}
 else return r.abort();await r.fulfill({json:result});});
 await page.goto("http://127.0.0.1:4275/portal");
 await page.getByLabel("Correo de acceso").fill(user.email);await page.getByLabel("Contraseña",{exact:true}).fill("qa-only");await page.getByRole("button",{name:"Entrar"}).click();
 await page.getByRole("button",{name:/Nuestra cocina/}).click();await page.locator("img.preview").waitFor();await page.getByRole("button",{name:"Solicitar cambios"}).click();await page.getByLabel("Describe los cambios").fill("QA");
 const layout=()=>page.evaluate(()=>({width:innerWidth,scroll:document.documentElement.scrollWidth,dark:getComputedStyle(document.querySelector(".client-portal")).colorScheme}));
 const check=async()=>{const l=await layout();assert.equal(l.scroll,l.width,"overflow at "+width);assert.equal(l.dark,"dark");};
 await check();await page.getByRole("button",{name:"Cerrar vista previa"}).click();
 await page.getByRole("button",{name:"Directorio"}).click();await page.getByRole("button",{name:"Ver contenido"}).click();await page.locator("img.preview").waitFor();await check();await page.getByRole("button",{name:"Cerrar vista previa"}).click();
 for(const name of ["Drive","Contraseñas","Avisos por correo"]){await page.getByRole("button",{name,exact:true}).click();await page.getByRole("dialog").waitFor();await check();await page.getByRole("button",{name:"Cerrar",exact:true}).click();}
 await page.close();console.log("Calendar, directory, preview, tools and dark theme verified:",width);
}}finally{await browser.close()}
