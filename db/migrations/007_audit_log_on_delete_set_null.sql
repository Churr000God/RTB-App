-- ==========================================
-- RTB Sistema — 007: audit_log.usuario_id ON DELETE SET NULL
--
-- Detectado al verificar RLS con usuarios de prueba: limpiar las cuentas de
-- prueba falló con "update or delete on table profiles violates foreign key
-- constraint audit_log_usuario_id_fkey" porque esa FK no tenía ON DELETE
-- SET NULL. audit_log es append-only y su función es sobrevivir a los
-- registros que describe — si alguna vez se borra una cuenta de
-- auth.users (p.ej. desde el Dashboard de Supabase, no la app, que nunca
-- borra perfiles), la cascada hasta profiles no debe bloquearse por su
-- propio historial de auditoría.
--
-- No se aplica el mismo cambio a created_by/updated_by/responsable_id/
-- vendedor_id/aprobada_por/etc. de las demás tablas de este submódulo:
-- ésas SÍ deben seguir bloqueando el borrado de un perfil con historial
-- operativo — es la misma decisión que ya documenta
-- contexto/AUDITORIA_MODULO_AUTH.md §Pendiente ("el borrado duro
-- destruiría historial en cuanto los módulos... referencien profiles(id)":
-- exactamente lo que ya pasa aquí, y por diseño).
--
-- Aplicado vía MCP apply_migration sobre RTB-App (dgafffpbhktxadiqmmwl).
-- ==========================================

alter table public.audit_log
  drop constraint audit_log_usuario_id_fkey,
  add constraint audit_log_usuario_id_fkey
    foreign key (usuario_id) references public.profiles(id) on delete set null;
