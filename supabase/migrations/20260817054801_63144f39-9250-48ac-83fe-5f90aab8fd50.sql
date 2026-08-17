update notification_templates
set body = replace(replace(replace(body, chr(92)||'r'||chr(92)||'n', chr(10)), chr(92)||'n', chr(10)), chr(92)||'t', ' ')
where body like '%'||chr(92)||'n%' or body like '%'||chr(92)||'t%';

update notification_templates
set subject = replace(replace(subject, chr(92)||'n', ' '), chr(92)||'t', ' ')
where subject like '%'||chr(92)||'n%' or subject like '%'||chr(92)||'t%';

drop policy if exists "secure_documents_read" on storage.objects;
create policy "secure_documents_read" on storage.objects for select
using (
  bucket_id = 'secure-documents' and (
    is_super_admin(auth.uid())
    or auth.uid()::text = (storage.foldername(name))[1]
    or has_permission(auth.uid(), 'licensee_management', 'view_all_entities')
    or has_permission(auth.uid(), 'audit_management', 'view')
    or has_permission(auth.uid(), 'application_management', 'view')
    or has_permission(auth.uid(), 'complaint_management', 'view')
    or has_permission(auth.uid(), 'returns_management', 'view')
  )
);