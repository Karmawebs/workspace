import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { it, expect, vi } from "vitest";
import type { SupabaseClient } from "@supabase/supabase-js";
import { PortalInvitation } from "../src/portal/PortalInvitation";
it("espera un clic, verifica el enlace y permite reintentar contraseña sin consumirlo otra vez", async () => {
  const verifyOtp = vi
    .fn()
    .mockResolvedValue({
      data: { user: { role: "kw_portal_client" } },
      error: null,
    });
  const updateUser = vi
    .fn()
    .mockResolvedValueOnce({ error: { message: "retry" } })
    .mockResolvedValue({ error: null });
  const done = vi.fn();
  render(
    <PortalInvitation
      auth={{ auth: { verifyOtp, updateUser } } as unknown as SupabaseClient}
      token="fixture-token"
      done={done}
    />,
  );
  expect(verifyOtp).not.toHaveBeenCalled();
  fireEvent.change(screen.getByLabelText("Nueva contraseña"), {
    target: { value: "safe-fixture-1234" },
  });
  fireEvent.click(
    screen.getByRole("button", { name: "Establecer contraseña" }),
  );
  await screen.findByRole("alert");
  expect(done).not.toHaveBeenCalled();
  fireEvent.click(
    screen.getByRole("button", { name: "Establecer contraseña" }),
  );
  await waitFor(() => expect(done).toHaveBeenCalledOnce());
  expect(verifyOtp).toHaveBeenCalledOnce();
  expect(verifyOtp).toHaveBeenCalledWith({
    type: "recovery",
    token_hash: "fixture-token",
  });
});
it("rechaza enlaces caducados sin actualizar contraseñas", async () => {
  const updateUser = vi.fn();
  const auth = {
    auth: {
      verifyOtp: vi
        .fn()
        .mockResolvedValue({
          data: { user: null },
          error: { message: "expired" },
        }),
      updateUser,
    },
  };
  render(
    <PortalInvitation
      auth={auth as unknown as SupabaseClient}
      token="expired"
      done={vi.fn()}
    />,
  );
  fireEvent.change(screen.getByLabelText("Nueva contraseña"), {
    target: { value: "safe-fixture-1234" },
  });
  fireEvent.click(
    screen.getByRole("button", { name: "Establecer contraseña" }),
  );
  await screen.findByText(/El enlace ha caducado/);
  expect(updateUser).not.toHaveBeenCalled();
});
