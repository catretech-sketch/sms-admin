import { useMutation, useQuery, useQueryClient, type UseMutationResult, type UseQueryResult } from '@tanstack/react-query'
import { getRoleTemplate, setRoleTemplate, type RoleTemplateOverride } from '../roleTemplates'
import { queryKeys } from '../queryKeys'

export function useRoleTemplate(): UseQueryResult<RoleTemplateOverride[]> {
  return useQuery({
    queryKey: queryKeys.roleTemplate.all,
    queryFn: getRoleTemplate,
  })
}

export function useSetRoleTemplate(): UseMutationResult<RoleTemplateOverride[], Error, RoleTemplateOverride[]> {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (overrides: RoleTemplateOverride[]) => setRoleTemplate(overrides),
    onSuccess: () => { qc.invalidateQueries({ queryKey: queryKeys.roleTemplate.all }) },
  })
}
