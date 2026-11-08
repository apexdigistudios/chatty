-- Allow the existing seed-post RPCs to validate R2 URLs by their authenticated
-- uploader path instead of the former Supabase Storage URL prefix.
do $$
declare
  function_signature regprocedure;
  function_definition text;
  old_expression constant text :=
    $old$position('/storage/v1/object/public/letsgist-media/' || admin_id::text || '/seed-posts/' in item.url) = 0$old$;
  new_expression constant text :=
    $new$position('/' || admin_id::text || '/seed-posts/' in item.url) = 0$new$;
begin
  foreach function_signature in array array[
    'public.admin_create_post_as_seed(uuid, uuid, text, jsonb, boolean, boolean, text)'::regprocedure
  ] loop
    function_definition := pg_get_functiondef(function_signature);
    if position(old_expression in function_definition) > 0 then
      function_definition := replace(function_definition, old_expression, new_expression);
      execute function_definition;
    elsif position(new_expression in function_definition) = 0 then
      raise exception 'Could not safely update seed-media URL validation in %', function_signature;
    end if;
  end loop;
end;
$$;
