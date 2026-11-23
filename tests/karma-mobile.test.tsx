import {render,screen,waitFor,fireEvent,within} from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import {MemoryRouter} from 'react-router-dom';
import {vi,beforeEach,it,expect} from 'vitest';
vi.mock('../src/lib/supabase',async()=>({db:(await import('./fixtures/karmaBackend')).db}));
import {reset,tables,writes,workspace,project,failOnce} from './fixtures/karmaBackend';
import {KarmaInternal} from '../src/modules/KarmaInternal';
const scope={workspaceId:workspace,app:'karma' as const,userId:'user-test'};
beforeEach(reset);
function mount(){render(<MemoryRouter><div className="karma-mobile-page"><KarmaInternal scope={scope}/></div></MemoryRouter>);}
it('creates once on repeated submission, trims title, clears and refreshes',async()=>{
 mount();const input=await screen.findByRole('textbox',{name:'Nueva tarea'});
 fireEvent.change(input,{target:{value:'  Nueva tarea rápida  '}});
 const form=screen.getByRole('form',{name:'Creación rápida de tarea'});
 fireEvent.submit(form);fireEvent.submit(form);
 await screen.findByRole('button',{name:'Nueva tarea rápida',exact:true});
 expect(writes.filter(w=>w.table==='kw_tasks')).toHaveLength(1);
 expect(writes[0].payload).toMatchObject({title:'Nueva tarea rápida',workspace_id:workspace,app_key:'karma',project_id:project});
 expect((input as HTMLInputElement).value).toBe('');
});
it('retains title after failed save and permits retry',async()=>{
 mount();const input=await screen.findByRole('textbox',{name:'Nueva tarea'});
 fireEvent.change(input,{target:{value:'No perder'}});failOnce();
 fireEvent.submit(screen.getByRole('form',{name:'Creación rápida de tarea'}));
 expect(await screen.findByRole('alert')).toBeTruthy();expect((input as HTMLInputElement).value).toBe('No perder');
 await userEvent.click(screen.getByRole('button',{name:'Añadir tarea',exact:true}));
 expect(await screen.findByRole('button',{name:'No perder',exact:true})).toBeTruthy();
});
it('completes, opens archived editor and restores without losing attachments',async()=>{
 mount();await userEvent.click(await screen.findByRole('checkbox',{name:'Completar Preparar propuesta para el nuevo proyecto'}));
 await userEvent.click(await screen.findByRole('button',{name:'Tareas archivadas (2)'}));
 await userEvent.click(await screen.findByRole('button',{name:'Preparar propuesta para el nuevo proyecto',exact:true}));
 expect(await screen.findByRole('link',{name:'Documento de prueba.pdf'})).toBeTruthy();
 expect(screen.getByRole('textbox',{name:'Descripción'}).textContent).toBe('Notas conservadas de la tarea');
 await userEvent.click(screen.getByRole('button',{name:'Recuperar tarea'}));
 await waitFor(()=>expect(screen.queryByRole('button',{name:'Recuperar tarea'})).toBeNull());
 expect(tables.kw_tasks[0].status).toBe('pending');expect(tables.kw_task_attachments).toHaveLength(1);
});
it('opens and closes all three existing shortcuts',async()=>{
 mount();
 for(const label of ['Adjuntos','Credenciales','Contactos']){
  await userEvent.click(await screen.findByRole('button',{name:new RegExp(label)}));
  const dialog=await screen.findByRole('dialog');expect(within(dialog).getByRole('heading',{name:label})).toBeTruthy();
  await userEvent.click(within(dialog).getByRole('button',{name:'Cerrar',exact:true}));
  expect(screen.queryByRole('dialog')).toBeNull();
 }
});
