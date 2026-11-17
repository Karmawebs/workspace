import {render,screen,fireEvent,waitFor} from '@testing-library/react';
import {it,expect,vi} from 'vitest';
import {PortalTools} from '../src/portal/PortalTools';
it('selecciona toda la superficie y guarda las preferencias exactas',async()=>{
 const call=vi.fn().mockResolvedValue({ok:true}),close=vi.fn();render(<PortalTools tool="Avisos por correo" initial={['new']} call={call} close={close}/>);
 const button=screen.getByRole('button',{name:'Nuevo contenido'});expect(button.getAttribute('aria-pressed')).toBe('true');fireEvent.click(button);fireEvent.click(screen.getByRole('button',{name:'Respuestas'}));
 fireEvent.click(screen.getByRole('button',{name:'Guardar preferencias'}));await waitFor(()=>expect(close).toHaveBeenCalledOnce());expect(call).toHaveBeenCalledWith({action:'preferences',preferences:['reply']});
});
it('conserva la selección y permite reintentar si falla el guardado',async()=>{
 const call=vi.fn().mockRejectedValueOnce(Error('Error de prueba')).mockResolvedValue({ok:true}),close=vi.fn();render(<PortalTools tool="Avisos por correo" initial={[]} call={call} close={close}/>);
 fireEvent.click(screen.getByRole('button',{name:'Programaciones'}));fireEvent.click(screen.getByRole('button',{name:'Guardar preferencias'}));await screen.findByText('Error de prueba');expect(close).not.toHaveBeenCalled();expect(screen.getByRole('button',{name:'Programaciones'}).getAttribute('aria-pressed')).toBe('true');
 fireEvent.click(screen.getByRole('button',{name:'Guardar preferencias'}));await waitFor(()=>expect(close).toHaveBeenCalledOnce());
});
