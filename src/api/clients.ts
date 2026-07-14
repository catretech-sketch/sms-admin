import { request, listRequest } from './client'
import type { Client, CreateClientBody, ListEnvelope } from './ownerTypes'

export function listClients(params: { status?: string; tier?: string; q?: string } = {}): Promise<ListEnvelope<Client>> {
  return listRequest<ListEnvelope<Client>>('/clients', { query: params })
}

export function getClient(id: string): Promise<Client> {
  return request<Client>(`/clients/${id}`)
}

export function createClient(body: CreateClientBody): Promise<Client> {
  return request<Client>('/clients', { method: 'POST', body })
}

export function setClientStatus(id: string, status: string, reason?: string): Promise<Client> {
  return request<Client>(`/clients/${id}/status`, { method: 'POST', body: { status, reason } })
}
