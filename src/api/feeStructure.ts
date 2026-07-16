import { request } from './client'

export type FeeStructureMatrix = Record<string, Record<string, number>>

export async function getFeeStructure(): Promise<FeeStructureMatrix> {
  return request<FeeStructureMatrix>('/fees/structure')
}

export async function saveFeeStructure(matrix: FeeStructureMatrix): Promise<FeeStructureMatrix> {
  return request<FeeStructureMatrix>('/fees/structure', { method: 'PUT', body: matrix })
}
