import {render,screen,fireEvent} from '@testing-library/react';
import {describe,it,expect,vi} from 'vitest';
import {directoryItems,PortalDirectory,type PortalItem} from '../src/portal/PortalDirectory';
const item=(id:string,date:string|null,created='2026-11-01T12:00:00Z'):PortalItem=>({id,title:id,calendar_at:date,created_at:created,description:'',content_type:'post',status:'pending',revision:0});
describe('directorio del portal',()=>{
 it('filtra con el mismo mes local del calendario y ordena por creación descendente',()=>{
 const items=[item('antiguo','2026-11-03T12:00:00Z'),item('nuevo','2026-11-01T12:00:00Z','2026-11-02T12:00:00Z'),item('diciembre','2026-12-01T12:00:00Z'),item('sin fecha',null)];
 expect(directoryItems(items,new Date(2026,10,1)).map(x=>x.id)).toEqual(['nuevo','antiguo']);expect(directoryItems(items,new Date(2026,10,1),true).map(x=>x.id)).toEqual(['sin fecha']);
 });
 it('pagina, conserva los contenidos sin fecha y ofrece acciones accesibles',()=>{
 const open=vi.fn(),approve=vi.fn(),setMonth=vi.fn(),items=[...Array.from({length:14},(_,i)=>item('Publicación '+i,'2026-11-02T12:00:00Z')),item('Sin fecha',null)];items[0].status='approved';
 render(<PortalDirectory items={items} month={new Date(2026,10,1)} setMonth={setMonth} open={open} approve={approve} busy={false}/>);
 expect(screen.getAllByRole('button',{name:/Ver contenido:/})).toHaveLength(12);fireEvent.click(screen.getByRole('button',{name:/Mostrar más/}));expect(screen.getAllByRole('button',{name:/Ver contenido:/})).toHaveLength(14);
 expect((screen.getByRole('button',{name:'Aprobado: Publicación 0'}) as HTMLButtonElement).disabled).toBe(true);
 fireEvent.click(screen.getByRole('button',{name:'Ver contenido: Publicación 1'}));expect(open).toHaveBeenCalledWith('Publicación 1');fireEvent.click(screen.getByRole('button',{name:'Aprobar: Publicación 1'}));expect(approve).toHaveBeenCalled();
 fireEvent.click(screen.getByRole('button',{name:'Sin fecha (1)'}));expect(screen.getByText('Sin fecha',{selector:'b'})).toBeTruthy();fireEvent.click(screen.getByRole('button',{name:'Mes siguiente del directorio'}));expect(setMonth).toHaveBeenCalledWith(new Date(2026,11,1));
 });
});
