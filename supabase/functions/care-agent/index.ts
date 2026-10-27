import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
const cors = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Content-Type": "application/json",
};
Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });
  if (req.method !== "POST")
    return new Response(JSON.stringify({ error: "Método no permitido" }), {
      status: 405,
      headers: cors,
    });
  try {
    const body = await req.json();
    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
    );
    if (body.action === "pair") {
      const { data, error } = await supabase.rpc("pair_installation", {
        p_pairing_code: body.code,
        p_installation_uuid: body.installation_uuid,
        p_plugin_version: body.plugin_version,
        p_home_url: body.home_url,
      });
      if (error) throw error;
      const paired = data?.[0];
      if (paired?.site_id && body.home_url) {
        let domain = String(body.home_url)
          .replace(/^https?:\/\//i, "")
          .replace(/\/+$/, "");
        await Promise.all([
          supabase.from("sites").update({ domain }).eq("id", paired.site_id),
          supabase
            .from("kw_care_sites")
            .update({
              domain,
              status: "connected",
              updated_at: new Date().toISOString(),
            })
            .eq("legacy_site_id", paired.site_id),
        ]);
      }
      return new Response(JSON.stringify({ ok: true, ...paired }), {
        headers: cors,
      });
    }
    if (body.action === "diagnostic") {
      const { data, error } = await supabase.rpc("ingest_diagnostic", {
        p_api_token: body.token,
        p_payload: body.payload,
      });
      if (error) throw error;
      return new Response(JSON.stringify({ ok: true, stored: data }), {
        headers: cors,
      });
    }
    if (body.action === "next_action") {
      const { data, error } = await supabase.rpc("agent_next_action", {
        p_api_token: body.token,
      });
      if (error) throw error;
      return new Response(
        JSON.stringify({ ok: true, job: data?.[0] || null }),
        { headers: cors },
      );
    }
    if (body.action === "start_action") {
      const { data, error } = await supabase.rpc("agent_start_action", {
        p_api_token: body.token,
        p_action_id: body.action_id,
      });
      if (error) throw error;
      return new Response(JSON.stringify({ ok: true, claimed: data }), {
        headers: cors,
      });
    }
    if (body.action === "progress_action") {
      const { data, error } = await supabase.rpc("agent_progress_action", {
        p_api_token: body.token,
        p_action_id: body.action_id,
        p_stage: body.stage || "working",
        p_message: body.message || "",
      });
      if (error) throw error;
      return new Response(JSON.stringify({ ok: true, stored: data }), {
        headers: cors,
      });
    }
    if (body.action === "finish_action") {
      const { data, error } = await supabase.rpc("agent_finish_action", {
        p_api_token: body.token,
        p_action_id: body.action_id,
        p_ok: !!body.success,
        p_result: body.result || {},
      });
      if (error) throw error;
      return new Response(JSON.stringify({ ok: true, stored: data }), {
        headers: cors,
      });
    }
    if (body.action === "wake_site") {
      const jwt = req.headers
        .get("Authorization")
        ?.match(/^Bearer (.+)$/i)?.[1];
      if (!jwt)
        return new Response(
          JSON.stringify({ error: "Autenticación requerida" }),
          { status: 401, headers: cors },
        );
      const { data: identity, error: authError } =
        await supabase.auth.getUser(jwt);
      if (authError || !identity.user)
        return new Response(JSON.stringify({ error: "Sesión no válida" }), {
          status: 401,
          headers: cors,
        });
      const { data: site, error: siteError } = await supabase
        .from("kw_care_sites")
        .select("workspace_id,project_id")
        .eq("legacy_site_id", body.site_id)
        .maybeSingle();
      if (siteError) throw siteError;
      const { data: project } = site
        ? await supabase
            .from("kw_projects")
            .select("id")
            .eq("id", site.project_id)
            .eq("workspace_id", site.workspace_id)
            .eq("app_key", "care")
            .maybeSingle()
        : { data: null };
      const { data: member } = site
        ? await supabase
            .from("kw_workspace_members")
            .select("user_id")
            .eq("workspace_id", site.workspace_id)
            .eq("user_id", identity.user.id)
            .maybeSingle()
        : { data: null };
      if (!project || !member)
        return new Response(JSON.stringify({ error: "Sitio no autorizado" }), {
          status: 403,
          headers: cors,
        });
      const { data: pending, error: pendingError } = await supabase
        .from("action_jobs")
        .select("id")
        .eq("site_id", body.site_id)
        .eq("status", "pending")
        .limit(1);
      if (pendingError) throw pendingError;
      if (!pending?.length)
        return new Response(JSON.stringify({ ok: true, accepted: false }), {
          headers: cors,
        });
      const { data, error } = await supabase
        .from("installations")
        .select("api_token,sites!inner(domain)")
        .eq("site_id", body.site_id)
        .maybeSingle();
      if (error) throw error;
      if (!data?.api_token) throw new Error("Instalación no conectada");
      const domain = (data as any).sites.domain;
      const base = /^https?:\/\//i.test(domain) ? domain : "https://" + domain;
      const url = new URL(
        base.replace(/\/$/, "") + "/wp-json/karma-care/v1/wake",
      );
      if (
        url.protocol !== "https:" ||
        url.username ||
        url.password ||
        (url.port && url.port !== "443") ||
        !url.hostname.includes(".") ||
        /[:\[\]]/.test(url.hostname)
      )
        throw new Error("Wake requiere un dominio HTTPS público");
      const addresses = await Deno.resolveDns(url.hostname, "A");
      if (
        !addresses.length ||
        addresses.some((ip) => {
          const [a, b] = ip.split(".").map(Number);
          return (
            a === 0 ||
            a === 10 ||
            a === 127 ||
            a >= 224 ||
            (a === 169 && b === 254) ||
            (a === 172 && b >= 16 && b <= 31) ||
            (a === 192 && b === 168) ||
            (a === 100 && b >= 64 && b <= 127)
          );
        })
      )
        throw new Error("Wake requiere una dirección pública");
      const ctrl = new AbortController();
      const t = setTimeout(() => ctrl.abort(), 8000);
      try {
        const r = await fetch(url, {
          method: "POST",
          headers: {
            "X-Karma-Care-Token": data.api_token,
            "Content-Type": "application/json",
          },
          body: "{}",
          redirect: "error",
          signal: ctrl.signal,
        });
        await r.body?.cancel();
        return new Response(
          JSON.stringify({
            ok: r.ok,
            status: r.status,
            accepted: r.ok,
          }),
          { status: r.ok ? 200 : 502, headers: cors },
        );
      } finally {
        clearTimeout(t);
      }
    }
    return new Response(JSON.stringify({ error: "Acción no válida" }), {
      status: 400,
      headers: cors,
    });
  } catch (e) {
    return new Response(
      JSON.stringify({ ok: false, error: e?.message || "Error" }),
      { status: 400, headers: cors },
    );
  }
});
