// Feeds app request helpers
// Uses getAppPath() + '/' as baseURL instead of getApiBasepath()
// This ensures feed IDs in URLs aren't doubled when on feed detail pages

import axios, { type AxiosRequestConfig } from 'axios'
import { getAppPath, getCookie, useAuthStore } from '@mochi/common'

// Create a feeds-specific axios instance that uses app path as baseURL
// The common apiClient interceptor overrides baseURL, so we need our own instance
const feedsClient = axios.create({
  timeout: 30000,
  withCredentials: true,
  headers: {
    'Accept': 'application/json',
    'Content-Type': 'application/json',
  },
})

feedsClient.interceptors.request.use((config) => {
  // Always use app path as baseURL (class context)
  // The feeds app doesn't use entity context - feed IDs are route params
  config.baseURL = getAppPath() + '/'

  // Remove Content-Type for FormData so axios can set the multipart boundary
  if (config.data instanceof FormData) {
    delete config.headers['Content-Type']
  }

  // Add auth token
  const storeToken = useAuthStore.getState().token
  const cookieToken = getCookie('token')
  const token = storeToken || cookieToken

  if (token) {
    config.headers.Authorization = token.startsWith('Bearer ') ? token : `Bearer ${token}`
  }

  return config
})

export const feedsRequest = {
  get: async <TResponse>(
    url: string,
    config?: Omit<AxiosRequestConfig, 'url' | 'method'>
  ): Promise<TResponse> => {
    const response = await feedsClient.get<TResponse>(url, config)
    return response.data
  },

  post: async <TResponse, TBody = unknown>(
    url: string,
    data?: TBody,
    config?: Omit<AxiosRequestConfig<TBody>, 'url' | 'method' | 'data'>
  ): Promise<TResponse> => {
    const response = await feedsClient.post<TResponse>(url, data, config)
    return response.data
  },
}

export default feedsRequest
