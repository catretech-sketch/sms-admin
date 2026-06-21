import { request } from './client'

export async function inviteUser(email: string, role: string): Promise<void> {
  await request<unknown>('/users', { method: 'POST', body: { email, role } })
}
