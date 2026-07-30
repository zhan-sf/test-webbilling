import type {
  ApiResult,
  BillingOrder,
  CreateOrderRequest,
  CreatePaymentRequest,
  CreatePaymentResponse,
  CreditPointBalance,
  CreditPointOverview,
  GetCreditPointOverviewRequest,
  GetCreditPointStatisticsData,
  GetCreditPointStatisticsRequest,
  GetCreditPointBalanceRequest,
  GetListCreditPointsData,
  GetListCreditPointsRequest,
  GetPaymentOrderResponse,
  ListOrdersData,
  ListOrdersRequest,
  PaymentQuery,
} from './types'

export class ApiError extends Error {
  readonly status: number
  readonly code?: number
  constructor(message: string, status: number, code?: number) {
    super(message); this.name = 'ApiError'; this.status = status; this.code = code
  }
}

function validateAuthorization(authorization: string) {
  const normalized = authorization.trim()
  if (!/^md_pss_id\s+\S+$/.test(normalized)) throw new ApiError('Authorization 格式应为 md_pss_id {sessionId}。', 0)
  return normalized
}

async function request<T>(path: string, authorization: string, init: RequestInit): Promise<T> {
  const headers = new Headers(init.headers)
  headers.set('Accept', 'application/json')
  headers.set('Authorization', validateAuthorization(authorization))
  if (init.body) headers.set('Content-Type', 'application/json')
  let response: Response
  try { response = await fetch(path, { ...init, headers }) }
  catch (error) {
    if (error instanceof Error && error.name === 'AbortError') throw error
    throw new ApiError('无法连接 Billing API，请检查代理地址和后端服务。', 0)
  }
  let payload: ApiResult<T>
  try { payload = await response.json() as ApiResult<T> }
  catch { throw new ApiError(`Billing API 返回了无法解析的响应（HTTP ${response.status}）。`, response.status) }
  if (!response.ok || payload.code !== 1 || payload.data === undefined) {
    const fallback = response.status === 401 ? 'Authorization 无效或已过期。' : 'Billing API 请求失败。'
    throw new ApiError(payload.message?.trim() || fallback, response.status, payload.code)
  }
  return payload.data
}

export function getOrder(query: PaymentQuery, authorization: string, signal?: AbortSignal) {
  const params = new URLSearchParams({ tenantId: query.tenantId, orderId: query.orderId })
  return request<GetPaymentOrderResponse>(`/api/Payment/GetOrder?${params}`, authorization, { method: 'GET', signal })
}

export function createPayment(payload: CreatePaymentRequest, authorization: string, signal?: AbortSignal) {
  return request<CreatePaymentResponse>('/api/Payment/CreatePayment', authorization, {
    method: 'POST', body: JSON.stringify(payload), signal,
  })
}

export function listOrders(payload: ListOrdersRequest, authorization: string, signal?: AbortSignal) {
  return request<ListOrdersData>('/api/BillingTest/ListOrders', authorization, {
    method: 'POST', body: JSON.stringify(payload), signal,
  })
}

export function createOrder(payload: CreateOrderRequest, authorization: string, signal?: AbortSignal) {
  return request<BillingOrder>('/api/BillingTest/CreateOrder', authorization, {
    method: 'POST', body: JSON.stringify(payload), signal,
  })
}

export function getCreditPointBalance(
  payload: GetCreditPointBalanceRequest,
  authorization: string,
  signal?: AbortSignal,
) {
  return request<CreditPointBalance>('/api/Payment/GetCreditPointBalance', authorization, {
    method: 'POST', body: JSON.stringify(payload), signal,
  })
}

export function listCreditPoints(
  payload: GetListCreditPointsRequest,
  authorization: string,
  signal?: AbortSignal,
) {
  return request<GetListCreditPointsData>('/api/BillingTest/GetListCreditPoints', authorization, {
    method: 'POST', body: JSON.stringify(payload), signal,
  })
}

export function getCreditPointOverview(
  payload: GetCreditPointOverviewRequest,
  authorization: string,
  signal?: AbortSignal,
) {
  return request<CreditPointOverview>('/api/BillingTest/GetCreditPointOverview', authorization, {
    method: 'POST', body: JSON.stringify(payload), signal,
  })
}

export function getCreditPointStatistics(
  payload: GetCreditPointStatisticsRequest,
  authorization: string,
  signal?: AbortSignal,
) {
  return request<GetCreditPointStatisticsData>(
    '/api/BillingTest/GetCreditPointStatistics',
    authorization,
    { method: 'POST', body: JSON.stringify(payload), signal },
  )
}

export function getSafeRedirectUrl(value?: string) {
  if (!value) return null
  try { const url = new URL(value); return url.protocol === 'https:' || url.protocol === 'http:' ? url.toString() : null }
  catch { return null }
}
